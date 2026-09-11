/**
 * Svarg — deciding to build something nobody asked for out loud
 *
 * Phase 2 notices what a customer needs. This decides which of those needs the
 * system will actually act on, and plans what to build. It does not build —
 * that is the next stage — but everything it writes is a commitment, because
 * building happens unattended once a request reaches 'planned'.
 *
 * ── The guards are the feature ────────────────────────────────────────────
 *
 * Detection is the easy half. The hard half is that a wrong decision here
 * spends money and changes an application the customer is relying on, with
 * nobody watching. Four rails, in the order they are applied:
 *
 *  1. ALREADY DECIDED. One request per requirement per application, enforced
 *     by a unique index rather than by remembering to check. A customer who
 *     mentions WhatsApp in four messages gets one build.
 *
 *  2. ONE AT A TIME. While a build is running for an application, nothing new
 *     starts. Two generations racing to rewrite the same authored tree is a
 *     corrupted application, not two features.
 *
 *  3. A BUDGET. A tenant gets a bounded number of automatic builds per month.
 *     This is the backstop for a detector that turns out to be too eager: the
 *     damage is capped at a number somebody chose, rather than at whatever
 *     the conversation happens to produce.
 *
 *  4. A PLANNER THAT MAY REFUSE. "I wish students were more punctual" is a
 *     real sentence about a real frustration and not a capability. The plan
 *     step can return actionable:false, and the refusal is recorded so the
 *     same need is not re-planned on every pass.
 */

import CapabilityRequest from '../models/CapabilityRequest.js';
import CustomerUnderstanding from '../models/CustomerUnderstanding.js';
import { normalise } from './customerUnderstandingService.js';
import { generate } from './llmService.js';

/** Mentions before a need may be acted on.
 *
 *  One, deliberately. The brief's example is a teacher saying once that they
 *  want to message students, and getting it — waiting for a second mention
 *  would make the product feel deaf. The protection against acting on a
 *  passing remark is the planner's veto and the budget, not a wait. */
export const MIN_MENTIONS = 1;

/** Automatic builds allowed per application per calendar month. */
export const MONTHLY_BUILD_BUDGET = 3;

/** Statuses that mean a build is in flight. */
const IN_FLIGHT = ['planned', 'building'];

/** Statuses that mean this requirement is settled and must not be re-decided. */
const SETTLED = ['planned', 'building', 'ready', 'live', 'dismissed'];

// ── Pure helpers ──────────────────────────────────────────────────────────

/** The dedup key. Same normalisation the Learner uses to merge observations,
 *  so the two agree on what counts as the same requirement. */
export function needKeyOf(text) {
  return normalise(text).slice(0, 300);
}

/**
 * Which needs are eligible to be decided on.
 *
 * Pure, so the rule can be read and tested without a database. Ordered by
 * weight — most-mentioned first, then most recently raised — because when a
 * budget only allows one more build this month, it should go to the thing the
 * customer keeps asking for.
 */
export function selectActionableNeeds(needs = [], { decidedKeys = new Set(), minMentions = MIN_MENTIONS } = {}) {
  return needs
    .filter(n => n && n.text)
    .filter(n => (n.status || 'noticed') === 'noticed')
    .filter(n => (n.mentions || 1) >= minMentions)
    .filter(n => !decidedKeys.has(needKeyOf(n.text)))
    .sort((a, b) => (b.mentions || 1) - (a.mentions || 1)
      || new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
}

/** First and last instant of the month containing `when`. */
export function monthWindow(when = new Date()) {
  const start = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1));
  const end = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * Read a plan without trusting the model's manners.
 *
 * Anything malformed becomes a refusal rather than an empty plan. Under
 * unattended building, "I could not read the plan" must not be able to become
 * "build whatever this empty object describes".
 */
export function parsePlan(text) {
  const refuse = (reason) => ({
    actionable: false, reason, title: '', summary: '',
    steps: [], dataNeeded: [], connectorsNeeded: [],
  });
  if (!text) return refuse('the planner returned nothing');

  let raw = String(text).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  else {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first === -1 || last <= first) return refuse('the planner did not return a plan');
    raw = raw.slice(first, last + 1);
  }

  let obj;
  try { obj = JSON.parse(raw); } catch { return refuse('the planner returned something unreadable'); }
  if (!obj || typeof obj !== 'object') return refuse('the planner returned something unreadable');

  const list = (v) => (Array.isArray(v) ? v : [])
    .map(x => String(typeof x === 'string' ? x : x?.text ?? '').trim())
    .filter(Boolean)
    .slice(0, 12);

  if (obj.actionable !== true) {
    return refuse(String(obj.reason || '').trim() || 'the planner judged this not something to build');
  }

  const title = String(obj.title || '').trim();
  const summary = String(obj.summary || '').trim();
  const steps = list(obj.steps);

  // A plan with nothing in it is not a plan, whatever the flag says.
  if (!title || !steps.length) {
    return refuse('the plan had no title or no steps');
  }

  return {
    actionable: true,
    reason: '',
    title: title.slice(0, 200),
    summary: summary.slice(0, 1000),
    steps,
    dataNeeded: list(obj.dataNeeded),
    connectorsNeeded: list(obj.connectorsNeeded),
  };
}

// ── Planning ──────────────────────────────────────────────────────────────

const PLANNER_PROMPT = `You are Cob, planning one new capability for an application Svarg already built.

You are given what the customer's business is, what their application already
does, and one thing they have said they want. Decide whether it is something to
build, and if so describe it.

Return ONLY a JSON object:
{
  "actionable": true or false,
  "reason": "if actionable is false, one short sentence saying why",
  "title": "what to call this capability, in the customer's terms",
  "summary": "one or two sentences on what it will do for them",
  "steps": ["what the application will do, in order, as a person would describe it"],
  "dataNeeded": ["information this needs that the application may not hold yet"],
  "connectorsNeeded": ["outside services the customer must connect, e.g. WhatsApp Business"]
}

Set actionable to false when:
- it is a wish or a complaint rather than something software can do
  ("I wish students were more punctual")
- it is a question about how the product works
- the application plainly does it already
- it is too vague to build without guessing what they meant

Be concrete and small. One capability, not a roadmap. Name a connector only
when the capability genuinely cannot work without it.`;

function planPrompt({ need, understanding, blueprint }) {
  const lines = [];

  if (understanding?.business) {
    lines.push('THE BUSINESS');
    lines.push(understanding.business);
    lines.push('');
  }

  const objective = String(blueprint?.businessObjective || '').trim();
  if (objective) {
    lines.push('WHAT THE APPLICATION WAS BUILT TO DO');
    lines.push(objective);
    lines.push('');
  }

  const tasks = (understanding?.recurringTasks || []).slice(0, 10).map(t => `- ${t.text}`);
  if (tasks.length) {
    lines.push('WORK THEY DO REGULARLY');
    lines.push(...tasks);
    lines.push('');
  }

  const prefs = (understanding?.preferences || []).slice(0, 8).map(p => `- ${p.text}`);
  if (prefs.length) {
    lines.push('HOW THEY LIKE THINGS DONE');
    lines.push(...prefs);
    lines.push('');
  }

  lines.push('WHAT THEY HAVE ASKED FOR');
  lines.push(need);
  return lines.join('\n');
}

/** Plan one capability. Never throws: a planning failure is a refusal. */
export async function planCapability({ need, understanding, blueprint }) {
  try {
    const { text } = await generate({
      systemPrompt: PLANNER_PROMPT,
      userMessage:  planPrompt({ need, understanding, blueprint }),
      maxTokens:    800,
      label:        'learn:plan-capability',
    });
    return parsePlan(text);
  } catch (err) {
    console.error('[capability] planning failed:', err.message);
    return {
      actionable: false, reason: `planning failed: ${err.message}`,
      title: '', summary: '', steps: [], dataNeeded: [], connectorsNeeded: [],
    };
  }
}

// ── Entry point ───────────────────────────────────────────────────────────

/**
 * Decide whether there is anything worth building, and plan the best candidate.
 *
 * Plans at most one capability per call. The budget is per month and builds are
 * serialised anyway, so there is nothing to gain from planning a queue — and a
 * queue planned against today's understanding would be acted on days later
 * against a different one.
 *
 * Returns a report rather than throwing, for the same reason as the Learner:
 * it is fired from a path that has already answered the customer.
 */
export async function considerCapabilities({ userId, blueprintId, blueprint = null, now = new Date() }) {
  if (!userId || !blueprintId) return { decided: false, reason: 'missing-ids' };

  try {
    const understanding = await CustomerUnderstanding.findOne({ userId }).lean();
    if (!understanding?.needs?.length) return { decided: false, reason: 'nothing-learned' };

    // Guard 2: one build at a time for an application.
    const inFlight = await CapabilityRequest.countDocuments({ blueprintId, status: { $in: IN_FLIGHT } });
    if (inFlight > 0) return { decided: false, reason: 'build-in-flight' };

    // Guard 3: the monthly budget. Counted from decisions actually taken, not
    // from builds that succeeded — a run that failed still cost its generation.
    const { start, end } = monthWindow(now);
    const thisMonth = await CapabilityRequest.countDocuments({
      blueprintId,
      status: { $ne: 'dismissed' },
      createdAt: { $gte: start, $lt: end },
    });
    if (thisMonth >= MONTHLY_BUILD_BUDGET) {
      return { decided: false, reason: 'budget-spent', budget: MONTHLY_BUILD_BUDGET };
    }

    // Guard 1: anything already settled is not decided again. Dismissed needs
    // are included, so a refusal is remembered rather than re-planned hourly.
    const settled = await CapabilityRequest
      .find({ userId, blueprintId, status: { $in: SETTLED } })
      .select('needKey').lean();
    const decidedKeys = new Set(settled.map(r => r.needKey));

    const candidates = selectActionableNeeds(understanding.needs, { decidedKeys });
    if (!candidates.length) return { decided: false, reason: 'no-candidate' };

    const candidate = candidates[0];
    const plan = await planCapability({ need: candidate.text, understanding, blueprint });

    // Guard 4: the planner's veto. Recorded as dismissed rather than dropped,
    // so this need does not come back round on the next message.
    const status = plan.actionable ? 'planned' : 'dismissed';

    try {
      await CapabilityRequest.create({
        userId,
        blueprintId: String(blueprintId),
        need:    candidate.text,
        needKey: needKeyOf(candidate.text),
        status,
        plan,
        mentionsAtDecision: candidate.mentions || 1,
      });
    } catch (err) {
      // The unique index did its job: something decided this requirement
      // between our read and our write. Not an error — the outcome we wanted.
      if (err?.code === 11000) return { decided: false, reason: 'already-decided' };
      throw err;
    }

    // Mirror the outcome onto the need so the Learner stops offering it and
    // the customer-facing picture agrees with the decision record.
    await CustomerUnderstanding.updateOne(
      { userId, 'needs.text': candidate.text },
      { $set: { 'needs.$.status': status === 'planned' ? 'planned' : 'dismissed' } }
    );

    return {
      decided: plan.actionable,
      reason: plan.actionable ? 'planned' : 'not-actionable',
      need: candidate.text,
      plan,
    };
  } catch (err) {
    console.error('[capability] decision pass failed:', err.message);
    return { decided: false, reason: 'error', error: err.message };
  }
}
