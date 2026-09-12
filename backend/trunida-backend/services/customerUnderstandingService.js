/**
 * Svarg — the Learner
 *
 * Reads what the customer has said since the last time it looked, works out
 * what that says about their business, and folds it into a picture that grows
 * rather than gets rewritten.
 *
 * This phase only notices and remembers. It does not plan, build or notify;
 * needs are recorded with status 'noticed' and nothing acts on them yet.
 *
 * ── The three rules this file exists to keep ──────────────────────────────
 *
 * 1. Never re-read. Each thread carries a watermark, so a conversation costs
 *    one extraction over its new turns and never the whole history again.
 *    Without this, every message would re-bill the entire conversation.
 *
 * 2. Never lose. Extraction merges; it does not replace. A model having a bad
 *    day and returning two fields must not be able to erase a month of
 *    learning. Everything that is not mentioned again simply stays as it was.
 *
 * 3. Never break chatting. Every entry point swallows its own failures. This
 *    runs unawaited behind a reply that has already been sent, so a rejection
 *    here would surface as an unhandled rejection somewhere no caller could
 *    catch it.
 */

import CustomerUnderstanding from '../models/CustomerUnderstanding.js';
import { threadsForBlueprint } from './conversationMemoryService.js';
import { generate } from './llmService.js';
import { signalsSince, summariseSignals, signalsToText } from './tenantSignalService.js';

/** Turns that must accumulate before an extraction is worth its cost. A
 *  customer typing three short messages should not buy three model calls. */
export const LEARN_THRESHOLD = 4;

/** Turns handed to one extraction. Beyond this the watermark still advances,
 *  so a long backlog is caught up over several passes instead of one huge
 *  prompt. */
const MAX_TURNS_PER_PASS = 40;

/** Ceilings per list. Without them a chatty customer grows a document toward
 *  the 16MB limit one observation at a time. Lowest-signal entries go first:
 *  fewest mentions, then oldest. */
const MAX_OBSERVATIONS = 60;
const MAX_NEEDS = 40;

/** A single observation's length. The model is asked for short phrases; this
 *  is what happens when it is not in the mood. */
const MAX_TEXT = 400;

// ── Pure helpers ──────────────────────────────────────────────────────────
// Exported for testing: the merge is the part that must not lose anything, and
// proving that should not require a database or a model.

/** Comparison form: case and punctuation are not differences of meaning. */
export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words that carry no requirement. Kept short on purpose: this is here to
 *  stop "to", "all" and "the" deciding whether two needs are the same, not to
 *  do linguistics. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'on', 'in', 'at', 'by',
  'with', 'from', 'my', 'our', 'their', 'his', 'her', 'its', 'this', 'that',
  'these', 'those', 'all', 'any', 'some', 'every', 'is', 'are', 'was', 'were',
  'be', 'been', 'do', 'does', 'did', 'want', 'need', 'like', 'would', 'should',
  'can', 'could', 'will', 'i', 'we', 'you', 'they', 'it', 's', 'them', 'me',
]);

/** The words that actually say what is wanted. */
function significantTokens(text) {
  return new Set(
    normalise(text).split(' ').filter(w => w.length >= 3 && !STOPWORDS.has(w))
  );
}

/** Share of the smaller set's words that appear in the larger one. */
const OVERLAP_THRESHOLD = 0.8;

/**
 * Is this the same observation we already hold?
 *
 * A customer restates a need in different words every time they raise it.
 * "Send class timings on WhatsApp" and "send today's class timings to all
 * students on WhatsApp" are one requirement, and recording both would make a
 * standing request look like two passing ones — which is precisely the signal
 * the mention count exists to carry.
 *
 * Substring containment does not catch that: neither phrase contains the
 * other. So the test is on the words that carry meaning — if nearly all of
 * the shorter phrase's significant words appear in the longer, it is the same
 * request said at different lengths.
 *
 * The threshold is high, and both sides must say something. "Send class
 * timings" against "send class recordings" shares two words of three and is
 * correctly kept apart; over-merging two real requests would lose one
 * silently, which is far worse than carrying a duplicate that a later phase
 * can reconcile.
 */
export function sameObservation(a, b) {
  const x = normalise(a);
  const y = normalise(b);
  if (!x || !y) return false;
  if (x === y) return true;

  const xs = significantTokens(x);
  const ys = significantTokens(y);
  const [small, large] = xs.size <= ys.size ? [xs, ys] : [ys, xs];

  // One word is not enough to claim two phrases mean the same thing.
  if (small.size < 2) return false;

  let shared = 0;
  for (const w of small) if (large.has(w)) shared += 1;
  return shared / small.size >= OVERLAP_THRESHOLD;
}

/**
 * Fold freshly observed texts into the list we already hold.
 *
 * Returns a new list; never mutates the input. An existing entry that is seen
 * again keeps its firstSeenAt — that date is how long the customer has wanted
 * this — and advances mentions and lastSeenAt.
 */
export function mergeObservations(existing = [], observed = [], { now = new Date(), cap = MAX_OBSERVATIONS, extra = {} } = {}) {
  const out = existing.map(e => ({ ...e }));

  for (const raw of observed) {
    const text = String(raw ?? '').trim().slice(0, MAX_TEXT);
    if (!text) continue;

    const hit = out.find(e => sameObservation(e.text, text));
    if (hit) {
      hit.mentions = (hit.mentions || 1) + 1;
      hit.lastSeenAt = now;
      // The longer phrasing usually carries more of the requirement.
      if (text.length > String(hit.text).length) hit.text = text;
      continue;
    }
    out.push({ text, mentions: 1, firstSeenAt: now, lastSeenAt: now, ...extra });
  }

  if (out.length <= cap) return out;
  // Drop the weakest signal, not the oldest: something mentioned once and
  // never again matters less than a standing request first heard in March.
  return [...out]
    .sort((a, b) => (b.mentions || 1) - (a.mentions || 1)
      || new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0))
    .slice(0, cap);
}

/**
 * The turns in each thread that have not been learned from yet.
 *
 * Returns the threads that have something new, each with its new turns and the
 * count the watermark should become once they are folded in.
 */
export function unreadTurns(threads = [], watermarks = []) {
  const seen = new Map(watermarks.map(w => [w.threadId, w.turnsSeen || 0]));
  const out = [];

  for (const t of threads) {
    const turns = t.turns || [];
    const already = seen.get(t.domainId) || 0;

    // A capped thread can shrink: turns fall off the front once it passes its
    // limit, so a watermark can end up beyond the length. Treat that as
    // caught up rather than reading the whole thread again.
    if (turns.length <= already) continue;

    out.push({
      threadId: t.domainId,
      turns:    turns.slice(already, already + MAX_TURNS_PER_PASS),
      turnsSeen: Math.min(turns.length, already + MAX_TURNS_PER_PASS),
    });
  }
  return out;
}

/** Watermarks updated for the threads just read, leaving the rest alone. */
export function advanceWatermarks(watermarks = [], read = []) {
  const out = watermarks.map(w => ({ ...w }));
  for (const r of read) {
    const hit = out.find(w => w.threadId === r.threadId);
    if (hit) hit.turnsSeen = r.turnsSeen;
    else out.push({ threadId: r.threadId, turnsSeen: r.turnsSeen });
  }
  return out;
}

/**
 * Read the model's answer without trusting its manners.
 *
 * Accepts a bare object or one wrapped in prose or a fenced block, and returns
 * empty lists for anything missing or the wrong shape. A malformed extraction
 * must cost us nothing — merging empty lists changes nothing, which is the
 * correct outcome for "the model did not answer properly".
 */
export function parseExtraction(text) {
  const empty = { business: '', recurringTasks: [], preferences: [], needs: [] };
  if (!text) return empty;

  let raw = String(text).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  else {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first === -1 || last <= first) return empty;
    raw = raw.slice(first, last + 1);
  }

  let obj;
  try { obj = JSON.parse(raw); } catch { return empty; }
  if (!obj || typeof obj !== 'object') return empty;

  const list = (v) => (Array.isArray(v) ? v : [])
    .map(x => (typeof x === 'string' ? x : x?.text))
    .map(x => String(x ?? '').trim())
    .filter(Boolean);

  return {
    business:       typeof obj.business === 'string' ? obj.business.trim() : '',
    recurringTasks: list(obj.recurringTasks),
    preferences:    list(obj.preferences),
    needs:          list(obj.needs),
  };
}

// ── Extraction ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the part of Svarg that learns what a customer's business needs.

You read a customer's conversation with the product and report what it tells you
about their business. You are not replying to them and not offering help.

Return ONLY a JSON object:
{
  "business": "one or two sentences on what this business is and who it serves, or \\"\\" if the conversation does not say",
  "recurringTasks": ["work this customer does regularly, in their own words, short phrases"],
  "preferences": ["how they want things done — tone, timing, channel, format"],
  "needs": ["things they want that the application does not appear to do yet"]
}

Rules:
- Report only what the conversation supports. Never infer an industry, a tool or
  a scale that was not mentioned. An empty list is a correct answer.
- A need is something they want to DO. "I want to send class timings on WhatsApp"
  is a need. "How do I connect Jira?" is a question about the product, not a need.
- Do not repeat something as a need if it is plainly already working for them.
- Short phrases, not sentences. No commentary outside the JSON.`;

function buildUserMessage(current, passes, liveText = '') {
  const lines = [];

  if (current?.business) {
    lines.push('WHAT WE ALREADY BELIEVE ABOUT THIS BUSINESS');
    lines.push(current.business);
    lines.push('');
    lines.push('Confirm, sharpen or correct this if the new conversation speaks to it.');
    lines.push('');
  }

  if (passes.length) {
    lines.push('NEW CONVERSATION');
    for (const p of passes) {
      const stage = p.threadId.split(':').pop();
      lines.push(`\n[${stage}]`);
      for (const t of p.turns) {
        lines.push(`${t.role === 'user' ? 'Customer' : 'Svarg'}: ${t.content}`);
      }
    }
  }
  // Once the application is live, the conversation that matters happens
  // inside it and stays there. What reaches us is counts, votes and the
  // corrections the customer chose to write (tenantSignalService.js).
  if (liveText) {
    if (passes.length) lines.push('');
    lines.push(liveText);
  }
  return lines.join('\n');
}

// ── Entry points ──────────────────────────────────────────────────────────

/** What the Learner currently believes. Null when it has learned nothing. */
export async function getUnderstanding(userId) {
  if (!userId) return null;
  return CustomerUnderstanding.findOne({ userId }).lean();
}

/**
 * Learn from whatever has been said since the last pass.
 *
 * Returns a small report of what it did, so a caller or a test can see the
 * decision rather than infer it: { learned, reason, counts }.
 *
 * `force` skips the "enough new turns" check. Nothing in this phase uses it;
 * it exists so a later phase can learn on demand at a moment that matters,
 * such as immediately before deciding whether to build something.
 */
export async function learnFromConversation({ userId, blueprintId, force = false }) {
  if (!userId || !blueprintId) return { learned: false, reason: 'missing-ids' };

  try {
    const [threads, current] = await Promise.all([
      threadsForBlueprint({ userId, blueprintId }),
      CustomerUnderstanding.findOne({ userId }).lean(),
    ]);

    // Signals from the live application, since the last pass. A correction
    // is a turn in every sense that matters here; counts are context.
    const live = await signalsSince({ blueprintId, since: current?.signalsReadAt || null });
    const liveSummary = summariseSignals(live.rows);
    const liveText = signalsToText(liveSummary);
    const liveTurns = liveSummary.corrections.length + liveSummary.votes.down;

    if (!threads.length && !live.rows.length) return { learned: false, reason: 'no-conversation' };

    const passes = unreadTurns(threads, current?.watermarks || []);
    const newTurns = passes.reduce((n, p) => n + p.turns.length, 0) + liveTurns;
    if (!newTurns) return { learned: false, reason: 'nothing-new' };
    if (!force && newTurns < LEARN_THRESHOLD) {
      return { learned: false, reason: 'below-threshold', newTurns };
    }

    const { text } = await generate({
      systemPrompt: SYSTEM_PROMPT,
      userMessage:  buildUserMessage(current, passes, liveText),
      maxTokens:    700,
      label:        'learn:understanding',
    });

    const found = parseExtraction(text);
    const now = new Date();

    // The watermark advances even when the extraction came back empty. The
    // turns WERE read; paying to read them again would not make the model
    // more forthcoming, and a thread that keeps failing to yield anything
    // would otherwise be re-billed on every message forever.
    const update = {
      $set: {
        recurringTasks: mergeObservations(current?.recurringTasks, found.recurringTasks, { now }),
        preferences:    mergeObservations(current?.preferences,    found.preferences,    { now }),
        needs: mergeObservations(current?.needs, found.needs, {
          now, cap: MAX_NEEDS, extra: { blueprintId: String(blueprintId), status: 'noticed' },
        }),
        watermarks:    advanceWatermarks(current?.watermarks || [], passes),
        lastLearnedAt: now,
        ...(live.newest ? { signalsReadAt: live.newest } : {}),
      },
      $inc: { learnCount: 1 },
    };
    // Only overwrite the summary when there is something to overwrite it with.
    if (found.business) update.$set.business = found.business.slice(0, 2000);

    await CustomerUnderstanding.updateOne({ userId }, update, { upsert: true });

    return {
      learned: true,
      reason:  'ok',
      newTurns,
      counts: {
        recurringTasks: found.recurringTasks.length,
        preferences:    found.preferences.length,
        needs:          found.needs.length,
      },
    };
  } catch (err) {
    // Runs unawaited behind a reply the customer already has. Losing a pass
    // costs one round of learning; throwing here costs nothing less than an
    // unhandled rejection in the chat path.
    console.error('[learner] pass failed:', err.message);
    return { learned: false, reason: 'error', error: err.message };
  }
}
