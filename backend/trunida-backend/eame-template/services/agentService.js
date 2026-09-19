/**
 * Agents — the application noticing something without being asked.
 *
 * Everything this application does today happens because somebody opened it
 * and typed a question. The person it is built for does not want to go and
 * ask; they want to be told. An agent is that: a question this application
 * already knows how to answer, asked on a schedule, with a rule for when the
 * answer is worth saying out loud.
 *
 * ── Built as a mirror of connectors ────────────────────────────────────────
 *
 * A connector brings data IN on a schedule, with a status, a lastError and a
 * card on the Data page. An agent watches on the same terms. So this file
 * follows connectorService deliberately — the same tick, the same shape of
 * status, the same pure due() function that can be tested without a clock —
 * rather than inventing a second way to do the same thing.
 *
 * ── Three rules that decide whether this is used or switched off ───────────
 *
 *   The condition is evaluated in CODE, never judged by a model. The answer
 *   pipeline's whole strength is that the model never counts; an agent that
 *   asked a model "is this worth mentioning?" would produce a false alarm at
 *   3am and a customer who turns it off.
 *
 *   A finding is remembered. An agent that spots a forty-day-overdue invoice
 *   and reports it every morning for a year is how alerting dies. Findings
 *   carry identity and state: new, still true, resolved.
 *
 *   An agent that keeps failing stops itself, visibly. Three consecutive
 *   failures marks it degraded and it stops running — because an agent that
 *   silently errors forever is worse than one that is plainly broken.
 *
 * Nothing here sends anything. Recording what was found, and telling somebody
 * about it, are deliberately separate steps.
 */
import mongoose from 'mongoose';
import { sendDigest } from './notifyService.js';

/** How often an agent may run, and how often the scheduler looks. */
export const SCHEDULES = {
  hourly:   { every: 60 * 60 * 1000 },
  daily:    { every: 24 * 60 * 60 * 1000, atHour: true },
  weekdays: { every: 24 * 60 * 60 * 1000, atHour: true, weekdaysOnly: true },
};

export const TICK_MS = 5 * 60 * 1000;

/** Stops itself after this many failures in a row. */
export const MAX_FAILURES = 3;

export function agentsCollection() {
  return mongoose.connection.collection('svarg_agents');
}

export function findingsCollection() {
  return mongoose.connection.collection('svarg_findings');
}

// ── When an agent is due ────────────────────────────────────────────────────

/**
 * The local wall-clock parts of an instant, in the tenant's own timezone.
 *
 * This application runs in UTC on a container and the person reading its
 * messages does not. "Every weekday at 7am" firing at 07:00 UTC reaches an
 * Indian office at half past twelve, which is not a morning briefing — it is
 * an interruption in the middle of the day. For an agent whose entire value is
 * arriving at the right moment, the timezone is not a detail.
 */
export function localParts(at, tz) {
  const d = at instanceof Date ? at : new Date(at);
  try {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC',
      hour12: false,
      weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    });
    const got = {};
    for (const p of f.formatToParts(d)) got[p.type] = p.value;
    return {
      // "24" is midnight in some locales' 2-digit hour formatting.
      hour: Number(got.hour) % 24,
      weekday: got.weekday,
      day: `${got.year}-${got.month}-${got.day}`,
      isWeekend: got.weekday === 'Sat' || got.weekday === 'Sun',
    };
  } catch {
    // An unknown timezone must not stop every agent in the application.
    const iso = d.toISOString();
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    return { hour: d.getUTCHours(), weekday: wd, day: iso.slice(0, 10), isWeekend: wd === 'Sat' || wd === 'Sun' };
  }
}

/**
 * Which agents are due, as of `now`. Pure, so it can be tested without waiting.
 *
 * An hourly agent is due on elapsed time. A daily one is due on the local
 * calendar: at or past its hour, and not already run today where the tenant
 * lives. Elapsed time alone would drift — a run at 07:04 makes the next one
 * 07:04 tomorrow, then 07:09, and a week later the morning briefing arrives
 * at lunch.
 */
export function dueAgents(docs, now = Date.now()) {
  return (docs || []).filter((a) => {
    if (!a || a.enabled === false) return false;
    if (a.status === 'degraded' || a.status === 'paused') return false;

    const spec = SCHEDULES[a.schedule];
    if (!spec) return false;

    const last = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;

    if (!spec.atHour) return now - last >= spec.every;

    const here = localParts(now, a.tz);
    if (spec.weekdaysOnly && here.isWeekend) return false;

    const wanted = Number.isInteger(a.atHour) ? a.atHour : 7;
    if (here.hour < wanted) return false;

    // Already run today, where they are.
    if (!last) return true;
    return localParts(last, a.tz).day !== here.day;
  });
}

// ── Whether the answer is worth saying ──────────────────────────────────────

const OPS = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
};

/**
 * The condition, in code.
 *
 * Compiled once when the agent is created and evaluated deterministically for
 * ever after — so the owner can read the rule, and so the same data always
 * produces the same decision.
 *
 * A malformed or unknown condition is silence, not noise: an agent nobody can
 * evaluate must not default to messaging somebody every five minutes.
 */
export function evaluateCondition(condition, result) {
  if (!condition || !OPS[condition.op]) return false;

  const rows = countRows(result);
  const over = condition.over === 'rows' ? rows
    : condition.over === 'state' ? String(result?.state || '')
    : null;
  if (over === null) return false;

  // Never speak from an answer the pipeline could not stand behind. `checked:
  // false` means validation did not run, and a finding built on it would be
  // an assertion the application itself declined to make.
  if (result && result.checked === false) return false;

  return !!OPS[condition.op](over, condition.value);
}

/** How many things the answer actually found. */
export function countRows(result) {
  const groups = Array.isArray(result?.groups) ? result.groups : [];
  let n = 0;
  for (const g of groups) n += Array.isArray(g.items) ? g.items.length : 0;
  return n;
}

// ── What it already said ────────────────────────────────────────────────────

/**
 * The stable identity of one thing an agent found.
 *
 * A finding is about a student, an invoice, a supplier — not about a run. The
 * id when there is one, because names repeat and get corrected; the name only
 * as a fallback.
 */
export function findingKey(item) {
  const id = String(item?.id || '').trim();
  if (id) return id;
  return String(item?.name || '').trim().toLowerCase();
}

/**
 * What changed since last time: what is new, what is still true, what has
 * resolved. Pure — given the keys found now and the findings held from before.
 *
 * Only `new` and `resolved` are worth a person's attention. "Still true" is
 * the state an agent spends most of its life in, and saying it out loud every
 * morning is precisely how somebody learns to ignore the messages.
 */
export function diffFindings(previous, currentKeys) {
  const open = new Map();
  for (const p of previous || []) if (p.state !== 'resolved') open.set(p.key, p);

  const now = new Set(currentKeys.filter(Boolean));
  const fresh = [];
  const stillTrue = [];
  for (const k of now) (open.has(k) ? stillTrue : fresh).push(k);

  const resolved = [];
  for (const k of open.keys()) if (!now.has(k)) resolved.push(k);

  return { new: fresh, stillTrue, resolved };
}

// ── Records ─────────────────────────────────────────────────────────────────

export function publicView(a) {
  return {
    id: String(a._id),
    name: a.name || '',
    question: a.question || '',
    schedule: a.schedule || 'daily',
    atHour: Number.isInteger(a.atHour) ? a.atHour : 7,
    tz: a.tz || 'UTC',
    condition: a.condition || null,
    enabled: a.enabled !== false,
    status: a.status || 'active',
    lastRunAt: a.lastRunAt || null,
    lastFoundAt: a.lastFoundAt || null,
    lastError: a.lastError || '',
    failures: a.failures || 0,
    createdAt: a.createdAt || null,
  };
}

export async function listAgents() {
  if (mongoose.connection.readyState !== 1) return [];
  const docs = await agentsCollection().find({}).sort({ createdAt: 1 }).toArray();
  return docs.map(publicView);
}

export async function createAgent({ name, question, schedule = 'daily', atHour = 7, tz = 'UTC', condition = null }) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('An agent needs a name.');
  if (!String(question || '').trim()) throw new Error('An agent needs a question to ask.');
  if (!SCHEDULES[schedule]) throw new Error(`Unknown schedule "${schedule}".`);
  if (condition && !OPS[condition.op]) throw new Error(`Unknown condition operator "${condition.op}".`);

  const doc = {
    name: clean.slice(0, 80),
    question: String(question).trim().slice(0, 600),
    schedule,
    atHour: Number.isInteger(atHour) ? Math.min(Math.max(0, atHour), 23) : 7,
    tz: String(tz || 'UTC').slice(0, 64),
    // No condition means "tell me whenever there is anything at all", which is
    // the rule somebody means when they do not state one.
    condition: condition || { over: 'rows', op: 'gt', value: 0 },
    enabled: true,
    status: 'active',
    lastRunAt: null, lastFoundAt: null, lastError: '', failures: 0,
    createdAt: new Date(),
  };
  const r = await agentsCollection().insertOne(doc);
  return publicView({ ...doc, _id: r.insertedId });
}

export async function setAgentEnabled(id, enabled) {
  const _id = new mongoose.Types.ObjectId(String(id));
  // Switching one back on clears the failures that stopped it — otherwise the
  // next single error would degrade it again immediately.
  const $set = enabled
    ? { enabled: true, status: 'active', failures: 0, lastError: '' }
    : { enabled: false, status: 'paused' };
  await agentsCollection().updateOne({ _id }, { $set });
  return agentsCollection().findOne({ _id }).then(publicView);
}

export async function deleteAgent(id) {
  const _id = new mongoose.Types.ObjectId(String(id));
  await findingsCollection().deleteMany({ agentId: _id });
  const r = await agentsCollection().deleteOne({ _id });
  if (!r.deletedCount) throw new Error('Agent not found.');
  return true;
}

// ── Running one ─────────────────────────────────────────────────────────────

/**
 * Ask the question, decide in code, remember what was found.
 *
 * `ask` is injected rather than imported so this can be tested without a model
 * and without a database full of rows — and so the one place that spends money
 * is visible in the signature.
 *
 * Returns what changed. It sends nothing: telling somebody is a separate step,
 * with its own rails.
 */
export async function runAgent(agent, ask) {
  const _id = agent._id;
  try {
    const result = await ask({ question: agent.question });
    const fired = evaluateCondition(agent.condition, result);

    const keys = [];
    if (fired) {
      for (const g of (result.groups || [])) {
        for (const it of (g.items || [])) {
          const k = findingKey(it);
          if (k) keys.push(k);
        }
      }
    }

    const previous = await findingsCollection().find({ agentId: _id }).toArray();
    const change = diffFindings(previous, keys);
    const at = new Date();

    for (const k of change.new) {
      await findingsCollection().updateOne(
        { agentId: _id, key: k },
        { $set: { state: 'open', lastSeenAt: at }, $setOnInsert: { firstSeenAt: at } },
        { upsert: true },
      );
    }
    for (const k of change.stillTrue) {
      await findingsCollection().updateOne({ agentId: _id, key: k }, { $set: { lastSeenAt: at } });
    }
    for (const k of change.resolved) {
      await findingsCollection().updateOne({ agentId: _id, key: k }, { $set: { state: 'resolved', resolvedAt: at } });
    }

    await agentsCollection().updateOne({ _id }, {
      $set: {
        lastRunAt: at, lastError: '', failures: 0, status: 'active',
        ...(change.new.length || change.resolved.length ? { lastFoundAt: at } : {}),
      },
    });

    return { ran: true, fired, ...change };
  } catch (err) {
    const failures = (agent.failures || 0) + 1;
    await agentsCollection().updateOne({ _id }, {
      $set: {
        lastRunAt: new Date(),
        lastError: String(err.message || err).slice(0, 500),
        failures,
        // Stops itself rather than erroring quietly for ever. Visible on the
        // board, and switching it back on clears the count.
        ...(failures >= MAX_FAILURES ? { status: 'degraded' } : {}),
      },
    }).catch(() => {});
    return { ran: false, error: String(err.message || err) };
  }
}

// ── The schedule ────────────────────────────────────────────────────────────

let timer = null;

/**
 * Runs from this application's own process, beside the connector scheduler.
 * Looks every five minutes and runs whatever is due.
 */
export function startAgentScheduler(ask) {
  if (timer) return timer;
  const tick = async () => {
    try {
      if (mongoose.connection.readyState !== 1) return;
      const due = dueAgents(await agentsCollection().find({}).toArray());
      if (!due.length) return;

      // Collected, not sent one by one. Six agents firing on a Monday must
      // reach the owner as one message; that is the difference between a
      // product somebody keeps and one they filter to a folder.
      const results = [];
      for (const a of due) {
        const r = await runAgent(a, ask);
        results.push({ ...r, name: a.name });
        if (r.ran) console.log(`[agents] ${a.name}: ${r.fired ? `${r.new.length} new, ${r.resolved.length} resolved` : 'nothing'}`);
        else console.error(`[agents] ${a.name} failed — ${r.error}`);
      }

      const out = await sendDigest(results);
      if (out.sent) console.log('[agents] digest sent to the owner');
    } catch (err) {
      console.error('[agents] tick failed —', err.message);
    }
  };
  timer = setInterval(tick, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

export function stopAgentScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
