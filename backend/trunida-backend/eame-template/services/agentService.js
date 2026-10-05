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
import { SEVERITY_RANK } from './agentCatalogue.js';
import { allowedSchedule, watcherLimit, evaluationLimit } from './coverage.js';
import { sendSignal } from './tenantSignals.js';

/** How often an agent may run, and how often the scheduler looks. */
export const SCHEDULES = {
  hourly:   { every: 60 * 60 * 1000 },
  daily:    { every: 24 * 60 * 60 * 1000, atHour: true },
  weekdays: { every: 24 * 60 * 60 * 1000, atHour: true, weekdaysOnly: true },
};

export const TICK_MS = 5 * 60 * 1000;

/** Stops itself after this many failures in a row. */
export const MAX_FAILURES = 3;

/**
 * How long to leave an outage above this application alone before trying
 * again. Four times an hour: often enough that nobody is sitting waiting for
 * it, rare enough that a provider that is down is not being hammered by every
 * watcher in every delivered application.
 */
export const RETRY_AFTER_MS = 15 * 60 * 1000;

export function agentsCollection() {
  return mongoose.connection.collection('svarg_agents');
}

export function findingsCollection() {
  return mongoose.connection.collection('svarg_findings');
}

/**
 * What this application has already been offered, and so will never be
 * offered again: one row per watcher auto-started, one per category filled.
 *
 * It is the reason auto-start can run on every boot instead of only on an
 * empty application. Without it, the only way to avoid resurrecting what an
 * owner switched off was to never look again -- which meant an application
 * delivered before a rule changed never got the benefit of the change.
 */
export function seedsCollection() {
  return mongoose.connection.collection('svarg_agent_seeds');
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
 * Somebody opened the board. Cheap, throttled, and never worth failing over.
 *
 * Called from the screens a person actually looks at rather than from the auth
 * middleware. That middleware carries no database write by design — it was
 * shipped one once, against a model the delivered application does not have,
 * and three builds failed over it. This is also the more honest signal: a
 * token being valid says nothing about whether anybody read anything.
 *
 * At most one write an hour per person; the clock only has to be accurate to
 * the day for the fortnight below to mean anything.
 */
export async function noteLooked(userId, now = new Date()) {
  if (!userId) return false;
  const users = mongoose.connection.collection('svarg_users');
  const r = await users.updateOne(
    {
      _id: typeof userId === 'string' && /^[0-9a-f]{24}$/i.test(userId)
        ? new mongoose.Types.ObjectId(userId) : userId,
      $or: [{ lastSeenAt: null }, { lastSeenAt: { $lt: new Date(now.getTime() - 60 * 60 * 1000) } }],
    },
    { $set: { lastSeenAt: now } },
  ).catch(() => null);
  return !!r?.modifiedCount;
}

/**
 * How long an application keeps watching for somebody who has stopped coming.
 *
 * Fourteen days: two weeks of a daily digest nobody opened is not a signal
 * that needs a third week to confirm.
 */
export const IDLE_DAYS = Math.max(1, Number(process.env.APP_IDLE_DAYS || 14));

/**
 * Has everybody stopped looking?
 *
 * ── Why an application stops watching at all ───────────────────────────────
 *
 * This product's promise is that it watches while nobody is looking, so
 * pausing it needs a better reason than saving money — and there is one. A
 * watcher run costs a model call whether or not a person ever sees what it
 * found. One delivered application sat for nine days with nobody signed in,
 * fifteen findings open and not one of them opened, still running every
 * morning. That is not watching a business. It is talking to an empty room.
 *
 * So the rule is narrow, and it is about attention rather than about spend:
 * when nobody has opened the application for a fortnight, the watchers stop.
 * Nothing is disabled, nothing is deleted, no finding is lost. The next time
 * anybody signs in, the sweep picks them all up again within five minutes and
 * the board is current by the time they have finished reading it.
 *
 * An application nobody has EVER signed into counts from the day it was
 * delivered, so a new one watches through its first fortnight and has
 * something to show whoever arrives. It does not keep watching for a year for
 * somebody who never came.
 */
export function wentQuiet(lookedAt, now = Date.now()) {
  const at = lookedAt ? new Date(lookedAt).getTime() : 0;
  if (!at || Number.isNaN(at)) return false;   // unknown is not idle
  return now - at > IDLE_DAYS * 24 * 60 * 60 * 1000;
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
export function dueAgents(docs, now = Date.now(), { lookedAt = null } = {}) {
  // Nobody has been here in a fortnight. Watching costs money on every run,
  // and a finding nobody opens is not a finding — see wentQuiet().
  if (wentQuiet(lookedAt, now)) return [];

  return (docs || []).filter((a) => {
    if (!a || a.enabled === false) return false;
    if (a.status === 'degraded' || a.status === 'paused') return false;

    // The plan's frequency, applied here as well as at creation: a watcher
    // created under an hourly plan keeps 'hourly' on its record after the
    // account moves to a daily one, and would otherwise outrun the downgrade.
    const spec = SCHEDULES[allowedSchedule(a.schedule)];
    if (!spec) return false;

    /*
     * A run that never reached a model is not a look.
     *
     * Svarg's provider ran out of credit at 05:46. Every watcher recorded a
     * run, none of them answered anything, and because the record said they
     * had run today the next look was 07:00 the following morning — so the
     * account was topped up at eleven and the product's answer to "is it
     * working now" was still "wait until tomorrow".
     *
     * retryAfter is the brake. Without it this retries on every tick for as
     * long as the outage lasts; with it, four times an hour, which is often
     * enough that nobody is waiting and rare enough that nobody notices.
     *
     * The hour and the weekday still apply below. A watcher catching up on a
     * failed morning should do it during the day it was meant to run, not at
     * three in the morning because that is when the provider came back.
     */
    const failedAbove = notTheWatchersFault(a.lastError);
    if (failedAbove && a.retryAfter && new Date(a.retryAfter).getTime() > now) return false;

    const last = failedAbove || !a.lastRunAt ? 0 : new Date(a.lastRunAt).getTime();

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
 * The evidence behind one thing an agent found.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * A finding used to be stored as a single string: the key, and nothing else.
 * Everything a person needs in order to believe it — which dataset, which
 * columns, over what window, under what rule, and the actual rows — was
 * computed by the answer pipeline on every single run and then dropped on the
 * floor, because the only question being asked of the result was "how many".
 *
 * So this takes nothing new from anywhere. It reads what the envelope already
 * carries and keeps the part that belongs to THIS item. Nothing is derived,
 * nothing is summarised by a model, and no number is computed here: if a
 * figure appears on the screen later it was counted by the pipeline, in code,
 * before this function ever saw it.
 *
 * `lines` are real cells from the customer's own rows, capped by the pipeline
 * at six. That cap is the reason this is safe to store: a finding carries a
 * sample big enough to believe and too small to become a second copy of the
 * data.
 */
export function evidenceFor(item, group, result) {
  return {
    dataset:  String(group?.dataset || ''),
    columns:  Array.isArray(group?.columns) ? group.columns.slice(0, 12) : [],
    window:   String(group?.window || ''),
    rule:     String(group?.rule || ''),
    label:    String(group?.label || ''),
    // The two counts the pipeline computed for the group this item sits in.
    records:  Number(group?.records || 0),
    entities: Number(group?.entities || 0),
    // Both datasets, when the finding came from comparing two of them. The
    // rows below are from two different shapes and `columns` describes only
    // the first, so a screen drawing them needs this and leftCount.
    sides:    Array.isArray(group?.sides) ? group.sides : null,
    // This item's own rows, and how many of them there were in total.
    source:   String(item?.source || ''),
    lines:    Array.isArray(item?.lines) ? item.lines : [],
    leftCount: Number.isInteger(item?.leftCount) ? item.leftCount : null,
    rows:     Number(item?.records || 0),
    // Whether the pipeline stood behind the answer, and whether the rows were
    // the customer's or the sample the application shipped with. Both travel
    // with the finding so the screen can say so rather than imply otherwise.
    checked:   result?.checked !== false,
    simulated: !!result?.simulated,
  };
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

/**
 * When this agent is expected to run next.
 *
 * ── Why a screen needs this ────────────────────────────────────────────────
 *
 * The scheduler is state-based, which makes it robust: it compares lastRunAt
 * against the schedule, so a restart or a missed tick heals on the next one
 * and nothing is lost. But robustness is invisible. When a container sleeps
 * through a morning the customer sees no digest, and "no digest" looks exactly
 * like "nothing was wrong" — the one confusion this product cannot afford.
 *
 * So the screen shows when the next check is due. Silence that carries a time
 * beside it is legible; silence on its own is not.
 *
 * Computed, never stored: a stored copy would be one more thing to keep true.
 */
export function nextDueAt(a, now = Date.now()) {
  // Same clamp as dueAgents, so the time a screen shows is the time it runs.
  const spec = SCHEDULES[allowedSchedule(a?.schedule)];
  if (!spec) return null;
  if (a?.enabled === false || a?.status === 'degraded' || a?.status === 'paused') return null;

  const last = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
  if (!spec.atHour) return new Date(Math.max(now, last + spec.every));

  // A daily agent is due at its hour, in its own timezone. Walk forward a day
  // at a time from now rather than doing timezone arithmetic by hand — at most
  // three steps, and it cannot drift the way an offset calculation can.
  const wanted = Number.isInteger(a.atHour) ? a.atHour : 7;
  const today = localParts(now, a.tz);
  const ranToday = last && localParts(last, a.tz).day === today.day;

  for (let ahead = 0; ahead <= 4; ahead++) {
    const at = now + ahead * 24 * 60 * 60 * 1000;
    const there = localParts(at, a.tz);
    if (spec.weekdaysOnly && there.isWeekend) continue;
    if (ahead === 0) {
      if (ranToday) continue;          // already done, look at tomorrow
      if (there.hour >= wanted) return new Date(now); // due right now
    }
    /*
     * The wanted hour on that day, to the hour.
     *
     * localParts deliberately reports only the hour — it exists to answer "is
     * it past 7am where they are", which never needed minutes. So this lands
     * on the hour boundary, which is the right precision for a line that reads
     * "next check 10:00". Claiming minutes would be claiming accuracy the
     * five-minute tick does not have anyway.
     */
    return new Date(at + (wanted - there.hour) * 60 * 60 * 1000);
  }
  return null;
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
    watcherId: a.watcherId || '',
    severity: a.severity || 'medium',
    enabled: a.enabled !== false,
    status: a.status || 'active',
    // What the health line on the watchers screen needs, so silence is
    // legible: a container that slept produces no digest, and "next check"
    // is what tells somebody that rather than leaving them guessing.
    nextDueAt: nextDueAt(a),
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

/*
 * ── The plan's two counts ──────────────────────────────────────────────────
 *
 * Active watchers: how many may be switched on at once. A watcher refused for
 * room says so, with the plan's own number, rather than quietly not starting
 * -- a missing watcher reads as "nothing to find", which is the one thing this
 * product must never let anybody believe by accident.
 *
 * Monitoring evaluations: one per scheduled watcher run, counted by calendar
 * month in UTC. When the month's allowance is spent, runs wait until the
 * first of the next; nothing already found is touched.
 *
 * Both are absent on an application delivered before they existed, which
 * means unlimited -- see coverage.js.
 */
export function activeWatcherCount() {
  return agentsCollection().countDocuments({ enabled: { $ne: false } });
}

export class WatcherLimitError extends Error {
  constructor(limit) {
    const plan = process.env.APP_PLAN_LABEL ? `The ${process.env.APP_PLAN_LABEL} plan` : 'Your plan';
    super(`${plan} runs up to ${limit} watchers at once, and ${limit} are on. Switch one off to start this one, or move to a plan that runs more.`);
    this.code = 'WATCHER_LIMIT';
    this.limit = limit;
  }
}

/** How many more watchers may be switched on. Infinity when the plan has no cap. */
export async function watcherRoom() {
  const limit = watcherLimit();
  if (!limit) return Infinity;
  return Math.max(0, limit - await activeWatcherCount());
}

async function assertWatcherRoom() {
  if ((await watcherRoom()) <= 0) throw new WatcherLimitError(watcherLimit());
}

export function evaluationMonth(now = new Date()) {
  return `evaluations:${now.toISOString().slice(0, 7)}`;
}

export async function evaluationsUsed(now = new Date()) {
  const doc = await mongoose.connection.collection('svarg_meta').findOne({ _id: evaluationMonth(now) }).catch(() => null);
  return Number(doc?.n) || 0;
}

/**
 * Take one evaluation from this month's allowance, or refuse.
 *
 * Atomic: the increment only happens while the count is under the limit, so
 * two ticks racing at the edge cannot both spend the last one.
 */
export async function takeEvaluation(now = new Date()) {
  const meta = mongoose.connection.collection('svarg_meta');
  const _id = evaluationMonth(now);
  const limit = evaluationLimit();
  if (!limit) {
    await meta.updateOne({ _id }, { $inc: { n: 1 } }, { upsert: true }).catch(() => {});
    return true;
  }
  await meta.updateOne({ _id }, { $setOnInsert: { n: 0 } }, { upsert: true }).catch(() => {});
  const r = await meta.updateOne({ _id, n: { $lt: limit } }, { $inc: { n: 1 } });
  return r.modifiedCount === 1;
}

/** What the Watchers page says about both counts. */
export async function usageSummary(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    watchers: { active: await activeWatcherCount(), limit: watcherLimit() },
    evaluations: { used: await evaluationsUsed(now), limit: evaluationLimit(), resumes: next.toISOString().slice(0, 10) },
  };
}

export async function createAgent({
  name, question, schedule = 'daily', atHour = 7, tz = 'UTC', condition = null,
  // Which catalogue entry this came from, and how much it matters. Both are
  // Svarg's own vocabulary rather than anything the customer typed: watcherId
  // is what telemetry reports and severity is what the board sorts by. A
  // hand-written watcher has no catalogue entry and is medium, which is the
  // honest answer for a question nobody has graded.
  watcherId = '', severity = 'medium',
  /*
   * Which dataset the catalogue matched this to.
   *
   * Set here as well as on a rebind, because a watcher started when the
   * records were already the right ones is never rebound and so never gained
   * one — and without it a change in those records cannot find its way back
   * to the watcher reading them. See wakeWatchersFor().
   */
  boundTo = '',
}) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('An agent needs a name.');
  if (!String(question || '').trim()) throw new Error('An agent needs a question to ask.');
  if (!SCHEDULES[schedule]) throw new Error(`Unknown schedule "${schedule}".`);
  if (condition && !OPS[condition.op]) throw new Error(`Unknown condition operator "${condition.op}".`);

  await assertWatcherRoom();

  const doc = {
    name: clean.slice(0, 80),
    question: String(question).trim().slice(0, 600),
    schedule,
    atHour: Number.isInteger(atHour) ? Math.min(Math.max(0, atHour), 23) : 7,
    tz: String(tz || 'UTC').slice(0, 64),
    watcherId: String(watcherId || '').slice(0, 64),
    boundTo: String(boundTo || '').slice(0, 120),
    severity: SEVERITY_RANK[severity] === undefined ? 'medium' : severity,
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

/**
 * The watchers somebody has switched off, as the ids their findings carry.
 *
 * Read by the board and the reports so that a switched-off watcher's findings
 * leave both — see listFindingsHandler for why they are hidden rather than
 * resolved or deleted.
 */
export async function switchedOffIds() {
  if (mongoose.connection.readyState !== 1) return [];
  const off = await agentsCollection()
    .find({ enabled: false }, { projection: { _id: 1 } }).toArray().catch(() => []);
  return off.map((a) => a._id);
}

export async function setAgentEnabled(id, enabled) {
  const _id = new mongoose.Types.ObjectId(String(id));
  if (enabled) {
    const now = await agentsCollection().findOne({ _id }, { projection: { enabled: 1 } });
    if (now && now.enabled === false) await assertWatcherRoom();
  }
  // Switching one back on clears the failures that stopped it — otherwise the
  // next single error would degrade it again immediately.
  const $set = enabled
    ? { enabled: true, status: 'active', failures: 0, lastError: '' }
    : { enabled: false, status: 'paused' };
  /*
   * And it forgets the plan it was using.
   *
   * A watcher that stopped itself after three failures usually stopped
   * because the plan it had pinned no longer fits the data — a column
   * renamed, a dataset replaced. "Start it again" should mean try afresh,
   * not run the same broken thing three more times and stop again.
   */
  const $unset = enabled ? { plan: '' } : undefined;
  await agentsCollection().updateOne({ _id }, $unset ? { $set, $unset } : { $set });
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
/**
 * Was this failure the watcher's, or something above it?
 *
 * Two signals, and both are Svarg's own words rather than a provider's. The
 * gateway answers a tenant with an HTTP status and a sentence it chose: 5xx
 * for the model plane, 429 for rate limiting, and prose that says plainly
 * whose problem it is. The OpenAI-compatible client the application uses puts
 * that status at the front of the message, which is why the code is read from
 * there — it is the one part of the text that is not prose.
 *
 * Deliberately narrow. Anything unrecognised counts against the watcher,
 * because a watcher that can never degrade is a watcher that fails silently
 * for ever, which is the thing MAX_FAILURES exists to prevent.
 */
export function notTheWatchersFault(message = '') {
  const m = String(message);
  if (/^\s*(408|429|5\d\d)\b/.test(m)) return true;
  return /on Svarg to resolve|rate limiting requests|upstream model provider could not be reached/i.test(m);
}

export async function runAgent(agent, ask) {
  const _id = agent._id;
  try {
    /*
     * The plan this watcher used last time, if it has one.
     *
     * A watcher asks the same sentence every morning, and planning it again
     * each run made the answer depend on what the model returned that day.
     * Findings appeared and "resolved themselves" while the customer's data
     * sat unchanged -- which is the worst thing this product can say, because
     * the whole promise is that a change in the findings means a change in
     * the business.
     *
     * The pipeline re-validates it against today's datasets and plans afresh
     * if it no longer fits, so a renamed column repairs itself on the next
     * run rather than wedging.
     */
    const result = await ask({ question: agent.question, usePlan: agent.plan || null });
    const fired = evaluateCondition(agent.condition, result);

    const keys = [];
    // Keyed by finding key so the upsert below can write the evidence for the
    // very item it is writing, rather than the last one seen.
    const detail = new Map();
    if (fired) {
      for (const g of (result.groups || [])) {
        for (const it of (g.items || [])) {
          const k = findingKey(it);
          if (!k) continue;
          keys.push(k);
          if (!detail.has(k)) {
            detail.set(k, { title: String(it.name || k), evidence: evidenceFor(it, g, result) });
          }
        }
      }
    }

    /*
     * Remembered only when the run produced something to work from: a plan
     * that read no datasets is not one to repeat every morning for ever.
     * Written before the diff so a crash below still leaves it pinned.
     */
    if (!agent.plan && result?.planned?.steps?.length) {
      await agentsCollection().updateOne({ _id }, { $set: { plan: result.planned } }).catch(() => {});
    }

    const previous = await findingsCollection().find({ agentId: _id }).toArray();
    const change = diffFindings(previous, keys);
    const at = new Date();

    /*
     * Evidence is refreshed on every run, for new and still-true alike.
     *
     * A finding that has been open for a fortnight is about the same student,
     * but the rows behind it have moved on — a day more overdue, another
     * session missed. Writing the evidence only once, at first sight, would
     * make the detail screen quietly older than the digest that points at it.
     */
    const carry = (k) => {
      const d = detail.get(k);
      if (!d) return { lastSeenAt: at };
      return {
        lastSeenAt: at, title: d.title, evidence: d.evidence,
        severity: agent.severity || 'medium',
        watcherId: agent.watcherId || '',
        agentName: agent.name || '',
      };
    };

    for (const k of change.new) {
      await findingsCollection().updateOne(
        { agentId: _id, key: k },
        { $set: { state: 'open', ...carry(k) }, $setOnInsert: { firstSeenAt: at } },
        { upsert: true },
      );
    }
    for (const k of change.stillTrue) {
      await findingsCollection().updateOne({ agentId: _id, key: k }, { $set: carry(k) });
    }
    for (const k of change.resolved) {
      await findingsCollection().updateOne({ agentId: _id, key: k }, { $set: { state: 'resolved', resolvedAt: at } });
      // Which watcher stopped being true, never which finding.
      sendSignal('finding_resolved', { watcherId: agent.watcherId || '' });
    }

    await agentsCollection().updateOne({ _id }, {
      $set: {
        lastRunAt: at, lastError: '', failures: 0, status: 'active',
        ...(change.new.length || change.resolved.length ? { lastFoundAt: at } : {}),
      },
    });

    /*
     * Whether this run read the customer's records or the samples the
     * application shipped with.
     *
     * It travels because the digest must not carry a sample. The answer
     * pipeline falls back to the sample data when no real records are
     * connected, which is right for somebody exploring the Ask tab and wrong
     * for an email: one delivered application sent its owner two morning
     * briefings about patients who do not exist. Nothing about the finding
     * was wrong — the finding was about a made-up person, correctly.
     */
    return { ran: true, fired, simulated: !!result?.simulated, ...change };
  } catch (err) {
    const message = String(err.message || err);
    /*
     * A watcher stops itself after three failures because a watcher that
     * errors quietly for ever is worse than one that says it gave up. That
     * counts failures of the WATCHER — a question that cannot be planned, a
     * dataset that went away.
     *
     * It was counting Svarg's failures too. Measured live: Svarg's model
     * provider ran out of credit, every watcher in the application failed on
     * the same tick with "this is on Svarg to resolve, not your application",
     * and twelve of them were two strikes from switching themselves off. Top
     * the account up and the customer still has a dead board, and the repair
     * is to go and re-enable each one by hand — for an outage that was never
     * theirs.
     *
     * So it is recorded, and shown, and not held against them.
     */
    const ours = notTheWatchersFault(message);
    const failures = ours ? (agent.failures || 0) : (agent.failures || 0) + 1;
    const degraded = !ours && failures >= MAX_FAILURES;
    await agentsCollection().updateOne({ _id }, {
      $set: {
        // Recorded either way, so the board can say when it last tried.
        // dueAgents is what decides whether that counted as a look.
        lastRunAt: new Date(),
        lastError: message.slice(0, 500),
        // The brake on retrying an outage. Only meaningful while lastError
        // is one of Svarg's; a run that answers clears it.
        ...(ours ? { retryAfter: new Date(Date.now() + RETRY_AFTER_MS) } : {}),
        failures,
        // Stops itself rather than erroring quietly for ever. Visible on the
        // board, and switching it back on clears the count.
        ...(degraded ? { status: 'degraded' } : {}),
      },
    }).catch(() => {});
    // A watcher giving up is worth knowing centrally: one customer's broken
    // watcher is a support ticket, the same watcher breaking everywhere is a
    // defect in the catalogue.
    if (degraded) sendSignal('watcher_degraded', { watcherId: agent.watcherId || '' });
    return { ran: false, error: message };
  }
}

// ── Starting without being asked ─────────────────────────────────────────────

/**
 * Who should start, given what is already here.
 *
 * Pure, and exported, because the interesting part of auto-start is this
 * decision and not the writing. Reading it off the database and reasoning
 * about it are separate jobs, and only one of them can be tested without a
 * database.
 *
 * Returns the catalogue entries to create, the category names being filled,
 * and every entry the data could support at all, so the caller can record all
 * three.
 *
 * ── Connecting a source has to do something ────────────────────────────────
 *
 * A category is recorded as worked through once something under it starts,
 * and was then never revisited. That is right for a watcher the owner was
 * shown and did not want, and wrong for one they were never shown.
 *
 * Measured on the live physiotherapy application. A Zoho CRM was connected on
 * day one and fourteen watchers started, filling all five categories. A phone
 * system was connected months later, a patient's call was transcribed, the
 * promise a member of staff made was read out of it correctly — and nothing
 * happened, because Promise Not Kept belongs to Growth and Growth had been
 * filled by the CRM before a phone system existed. The owner's words were
 * "there is no evidence of Exotel recording", and they were right: connecting
 * a whole new system had silently changed nothing.
 *
 * So what is remembered is not "this category has been done" but "this
 * watcher was possible, and offered". A watcher that could not run then,
 * because the records it needs had not arrived, was never offered — and gets
 * offered when they do.
 */
export function watchersToStart({ catalogue = [], categories = [], live = [], seeds = [], covered = null } = {}) {
  const running = new Set(live.map((a) => a.watcherId).filter(Boolean));
  const takenNames = new Set(live.map((a) => a.name));
  const seededWatchers = new Set(seeds.filter((s) => s.kind === 'watcher').map((s) => s.key));
  const seededCategories = new Set(seeds.filter((s) => s.kind === 'category').map((s) => s.key));
  /*
   * Everything this application could have run before now, whether it did or
   * not. Absent on an application delivered before this existed, which is
   * what the backfill in autoStartWatchers is for.
   */
  const seenWatchers = new Set(seeds.filter((s) => s.kind === 'seen').map((s) => s.key));

  /*
   * Coverage first, and it is a filter on CATEGORIES, never on how many
   * watchers a category turns out to hold. A customer who bought Retention
   * gets every Retention watcher their data supports, whether that is three
   * or thirteen.
   *
   * null means no coverage limit at all -- an application delivered before
   * plans carried coverage, which keeps watching everything it already did.
   */
  const inCoverage = (c) => {
    if (!covered) return true;
    const name = categoryNameOf(categories, c.id);
    // A watcher no table names is covered: the knowledge base can lag the
    // catalogue, and a customer cannot see or fix that.
    return !name || covered.includes(name);
  };
  const ready = catalogue.filter((c) => c.ready && c.question && inCoverage(c));
  const fresh = (c) => !!c && !running.has(c.id) && !takenNames.has(c.name) && !seededWatchers.has(c.id);

  const wanted = [];
  const add = (c) => {
    if (!fresh(c) || wanted.some((w) => w.id === c.id)) return false;
    wanted.push(c);
    return true;
  };

  // What the customer's own words asked for, first.
  for (const c of ready) if (c.startHere) add(c);

  /*
   * Then everything else the data supports, worst first so the order the
   * owner reads on the first morning is the order that matters. A category
   * is recorded as filled when something under it starts, so an industry
   * with no table still works -- there is simply nothing to record.
   */
  const filled = [];
  const rest = ready
    .filter((c) => !c.startHere)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 1) - (SEVERITY_RANK[b.severity] ?? 1));
  for (const c of rest) {
    const name = categoryNameOf(categories, c.id);
    /*
     * A category the owner has worked through stays worked through — for the
     * watchers that were in it at the time.
     *
     * The second half is the whole point. One that has never been possible
     * has never been offered, so there is nothing for the owner to have said
     * no to, and a category filled before its records existed must not bury
     * it for ever.
     */
    if (name && seededCategories.has(name) && seenWatchers.has(c.id)) continue;
    add(c);
  }
  for (const c of wanted) {
    const name = categoryNameOf(categories, c.id);
    if (name && !filled.includes(name) && !seededCategories.has(name)) filled.push(name);
  }

  /*
   * Everything the data supports today, recorded whether or not it started.
   *
   * This is what makes "never offered" a fact rather than an inference: a
   * watcher absent from here on a later run is one that became possible in
   * between, which is precisely the one worth offering.
   */
  return { wanted, filled, seen: ready.map((c) => c.id) };
}

/** Which category claims a watcher, by the industry's own table. */
export function categoryNameOf(categories, watcherId) {
  if (!watcherId || !Array.isArray(categories)) return '';
  for (const c of categories) if ((c.watchers || []).includes(watcherId)) return c.name;
  return '';
}

/**
 * Start the watchers this application's data already supports.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 *
 * A delivered application used to arrive with zero watchers. Nothing was
 * watching until somebody found the third item in the sidebar and pressed
 * start — so a product whose entire promise is "we will tell you before you
 * have to look" opened on an empty board, which is indistinguishable from a
 * product that does nothing.
 *
 * ── The two conditions, and why both ───────────────────────────────────────
 *
 * `startHere` is Cob's judgement, written by Eame into data/agents.json from
 * the customer's own objective: of the catalogue, these are the ones this
 * business actually asked about.
 *
 * `ready` is the matcher's answer: the columns this watcher needs exist in a
 * dataset that is really here.
 *
 * Only the intersection starts. Cob wanting something the data cannot support
 * would produce a watcher that fails three times and stops itself, and the
 * customer's first experience of the product would be a broken thing telling
 * them so. Wanting is not enough; possible is not enough either.
 *
 * ── And then everything else the data supports ─────────────────────────────
 *
 * The objective is a paragraph. Vesoma's mentioned attendance and slots, so
 * two watchers started and twenty-six did not -- meaning nothing at all was
 * watching their cash or their compliance, and nothing on any screen said so
 * until the map put an empty column in front of them.
 *
 * It was capped at one per category for a while, and the cap was measured
 * afterwards rather than before: fifteen of the twenty-eight are ready on
 * one of Vesoma's six datasets alone. Leaving thirteen of those idle was not
 * caution, it was the product doing less than it could for no stated reason.
 *
 * So every watcher whose data is really here starts. `ready` is the only
 * gate, and it is a real one -- a watcher whose columns are absent would
 * fail three times and stop itself, and the customer's first experience of
 * the product would be it reporting that it is broken.
 *
 * ── What changed to make that safe ─────────────────────────────────────────
 *
 * The old cap reasoned that watchers which start themselves also send mail,
 * and that five findings on the first morning is a product where twenty is
 * an inbox problem. That was right when the alternative was switching the
 * whole thing off, because coverage was invisible and the only control was
 * all-or-nothing. The map changed both: what is watching is now on a screen,
 * and any one of them can be paused from it. And the digest only ever
 * reports what CHANGED, so the noisy morning is the first one, not every
 * one.
 *
 * ── Why it is safe to run this on every boot ───────────────────────────────
 *
 * It used to bail whenever any watcher existed, so an application delivered
 * before a rule changed never got the benefit of it. Now it seeds instead:
 * every watcher it starts, and every category it fills, is written down and
 * never considered again. An owner who removes a watcher, or switches the lot
 * off, stays switched off -- not because nothing has run since, but because
 * the seed says this application has already been offered that one.
 */
export async function autoStartWatchers(catalogue, { tz = 'UTC', categories = [], covered = null } = {}) {
  if (mongoose.connection.readyState !== 1) return { started: [], skipped: 'no database' };

  const live = await agentsCollection().find({}, { projection: { watcherId: 1, name: 1 } }).toArray();
  const seeds = await seedsCollection().find({}).toArray().catch(() => []);

  /*
   * An application delivered before 'seen' existed has none of it, and every
   * watcher it ever passed over would look newly possible.
   *
   * So the first run under this rule records what the data supports today and
   * starts nothing extra. Everything it could run now is something it could
   * have run before — this rule is new, the data is not — and a customer
   * whose board grew by nine watchers overnight because their supplier
   * shipped a change would be right to be alarmed.
   *
   * From the next run on, 'seen' means what it says: a watcher missing from
   * it became possible in between.
   */
  const first = !seeds.some((s) => s.kind === 'seen');
  const { wanted, filled, seen } = watchersToStart({ catalogue, categories, live, seeds, covered });

  if (first) {
    await rememberSeeds(seen.map((id) => ({ kind: 'seen', key: id })));
    console.log(`[agents] recorded ${seen.length} watchers this application could already run`);
    return { started: [], skipped: 'recorded what was already possible' };
  }

  if (!wanted.length) {
    // Recorded even on a quiet run, so a watcher that becomes possible and is
    // then switched off does not come back on the run after.
    await rememberSeeds(seen.map((id) => ({ kind: 'seen', key: id })));
    return { started: [], skipped: 'nothing new to start' };
  }

  /*
   * Only as many as the plan has room for, most severe first (wanted is
   * already in that order). The rest are not recorded as offered, so they
   * start on a later boot once there is room -- after an upgrade, or after
   * the owner switches one off.
   */
  const room = await watcherRoom();
  const deferred = wanted.slice(Number.isFinite(room) ? room : wanted.length);
  const deferredIds = new Set(deferred.map((c) => c.id));
  const toStart = wanted.filter((c) => !deferredIds.has(c.id));
  if (deferred.length) {
    console.log(`[agents] plan allows ${watcherLimit()} watchers at once; ${deferred.length} wait for room: ${deferred.map((c) => c.id).join(', ')}`);
  }

  const started = [];
  for (const c of toStart) {
    try {
      await createAgent({
        name: c.name,
        question: c.question,
        schedule: allowedSchedule(c.schedule),
        atHour: c.atHour,
        tz,
        condition: c.condition || null,
        watcherId: c.id,
        severity: c.severity || 'medium',
        boundTo: c.using || '',
      });
      started.push(c.id);
      sendSignal('watcher_started', { watcherId: c.id });
    } catch (err) {
      // One bad entry must not stop the rest: an application with four of five
      // watchers running is the product; an application with none is not.
      console.warn(`[agents] could not auto-start "${c.id}":`, err.message);
    }
  }

  /*
   * Seeded for everything OFFERED, not everything started, and that is
   * deliberate: a watcher this application could not create is not one to
   * try again on every restart for the rest of its life.
   */
  await rememberSeeds([
    ...toStart.map((c) => ({ kind: 'watcher', key: c.id })),
    // A category counts as filled only by a watcher that actually started in it.
    ...filled
      .filter((name) => !deferred.length || toStart.some((c) => categoryNameOf(categories, c.id) === name))
      .map((name) => ({ kind: 'category', key: name })),
    // And everything the data supports, so what is possible today cannot be
    // mistaken for newly possible tomorrow -- except what is waiting for room.
    ...seen.filter((id) => !deferredIds.has(id)).map((id) => ({ kind: 'seen', key: id })),
  ]);

  if (started.length) console.log(`[agents] watching from delivery: ${started.join(', ')}`);
  return { started, skipped: started.length ? '' : 'nothing could be started' };
}

/**
 * A watcher follows the data, rather than the data it was started on.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 *
 * A watcher's question is written when it is created and never again. That is
 * right for one somebody typed, and quietly wrong for one this application
 * started from the catalogue: the question is a BINDING — a dataset and its
 * columns, chosen from whatever happened to be connected that morning.
 *
 * Measured on a live physiotherapy application. Fourteen watchers, all started
 * on the sample data delivered with it. A Zoho CRM was then connected, nine
 * modules of real records, a real appointment marked No Show against a real
 * patient. The No Show watcher went on asking:
 *
 *     practitioner_name in Appointment Booking Diary booked but marked absent
 *
 * — the sample diary, week after week, while the answer sat in Meetings. The
 * customer's word for what they expected was "zero user intervention", and
 * the only way to get it was to delete each watcher and start it again.
 *
 * ── What this does, and what it refuses to do ──────────────────────────────
 *
 * Only watchers that came from the catalogue, and only where the catalogue
 * now binds that same entry somewhere better. A hand-written question is the
 * customer's sentence and is never touched. Nothing is created, deleted,
 * enabled or disabled here — a watcher somebody switched off stays off.
 *
 * The pinned plan goes with the question, because a plan names the datasets
 * it reads; keeping it would send the new question at the old records.
 *
 * And the findings go too. They are evidence about the old question, and
 * leaving them makes the next run report every one of them as RESOLVED — a
 * digest announcing that eleven things were fixed overnight, on a morning
 * when nothing happened at all. Cleared rather than resolved, so the count
 * starts again from what is true.
 */
/*
 * Compared the way it is STORED, not the way it is built.
 *
 * createAgent trims a question and cuts it at 600 characters, and a binding at
 * 120. Comparing the catalogue's raw string against the stored one therefore
 * finds a difference that no change caused — and because a rebind writes the
 * raw string while creation writes the cut one, a question longer than the
 * limit would differ on every single tick, for ever, deleting the watcher's
 * findings every five minutes. Both sides go through the same door.
 */
const asStored = {
  question: (q) => String(q || '').trim().slice(0, 600),
  binding: (b) => String(b || '').slice(0, 120),
};

/**
 * Watchers that have MOVED — onto a different dataset than they were watching.
 *
 * ── Why this asks about the binding and not the wording ────────────────────
 *
 * It used to compare question text, on the reasoning that a catalogue
 * watcher's question IS its binding. That is true of what the question means
 * and false of how it is written, and the difference cost a customer their
 * board twice in one hour.
 *
 * Measured on Vesoma. A phone call was read, a promise found, and a Promise
 * Not Kept finding written at 07:48:59. At 07:50:05 the watcher was "rebound"
 * and the finding deleted. It had not moved: it was watching
 * "Calls (Exotel) + Contacts (Zoho CRM)" before and after. What changed was
 * the sentence, because the connector had grown two columns on its 07:28 sync
 * and then declared them internal when new code booted — so businessColumns
 * offered a different column for a role, and the question came out worded
 * differently about exactly the same rows.
 *
 * A connector growing its shape is routine. Deleting a customer's findings
 * every time one does is not, so a move is now what it says: the data being
 * watched is different.
 *
 * A record with no binding stored is from before boundTo existed; there the
 * wording is the only evidence there is, so it is used.
 */
export function watchersToRebind(live = [], catalogue = []) {
  const byId = new Map(
    (catalogue || []).filter((c) => c?.ready && c.question).map((c) => [c.id, c]),
  );
  if (!byId.size) return [];
  return (live || []).filter((a) => {
    // A question somebody typed is theirs. Only a watcher this application
    // started from the catalogue is one the catalogue may move.
    if (!a?.watcherId) return false;
    const c = byId.get(a.watcherId);
    if (!c || !c.question) return false;

    const was = asStored.binding(a.boundTo);
    if (!was) return asStored.question(c.question) !== asStored.question(a.question);
    if (asStored.binding(c.using) === was) return false;

    /*
     * ── And a better binding has to be CLEARLY better ─────────────────────
     *
     * The catalogue picks the highest-scoring binding, and scores are close by
     * nature — nine CRM modules look alike. Measured on a clinic: Promise Not
     * Kept could bind its follow-up side to Contacts (14), Meetings (14) or
     * Tasks (12, and 16 whenever Zoho happened to hold a single task). So the
     * watcher moved to Tasks when a task appeared and back to Contacts when it
     * was completed, and every move was a real move — which clears findings,
     * for the reason given in rebindWatchers. The owner's best finding vanished
     * three times, on noise.
     *
     * So a running watcher stays where it is unless where it is has stopped
     * working, or the challenger is better by at least STICK. STICK is the
     * weight fitOf gives a dataset for holding the business's own records,
     * which is exactly the move rebinding exists to make: off the sample data
     * an application ships with and onto the customer's real records. That
     * still happens. A two-point wobble between three real datasets does not.
     *
     * No scores at all — a catalogue from before they were recorded — means
     * the old rule, so nothing that used to follow the data stops following it.
     */
    const scores = c.candidates && typeof c.candidates === 'object' ? c.candidates : null;
    if (!scores || c.fit == null) return true;
    let incumbent;
    for (const [binding, fit] of Object.entries(scores)) {
      if (asStored.binding(binding) === was) incumbent = Number(fit);
    }
    // Where it is no longer works at all: it has to move.
    if (incumbent === undefined || Number.isNaN(incumbent)) return true;
    return Number(c.fit) - incumbent >= STICK;
  });
}

/**
 * How much better a new binding must score before a running watcher moves.
 *
 * Four, because that is what fitOf awards a dataset for holding the business's
 * own records — the one difference that should always move a watcher.
 */
export const STICK = 4;

/**
 * Watchers watching the same data, described differently.
 *
 * The record should say what is actually being asked, so the wording is
 * brought up to date — and nothing else is. No reboundAt, no clearing of
 * lastRunAt, and above all no deleting of findings: the watcher is looking at
 * the same rows it was looking at a minute ago, and what it found there is
 * still true.
 *
 * The pinned plan does go, because it was compiled against the old sentence
 * and the next run should compile one for the new. That costs one planning
 * call at the watcher's normal hour and changes nothing a reader sees.
 */
export function watchersToReword(live = [], catalogue = []) {
  const byId = new Map(
    (catalogue || []).filter((c) => c?.ready && c.question).map((c) => [c.id, c]),
  );
  if (!byId.size) return [];
  return (live || []).filter((a) => {
    if (!a?.watcherId) return false;
    const c = byId.get(a.watcherId);
    if (!c || !c.question) return false;

    const was = asStored.binding(a.boundTo);
    // No binding stored: watchersToRebind is already treating wording as the
    // binding, and one watcher must not be in both lists.
    if (!was) return false;
    if (asStored.binding(c.using) !== was) return false;
    return asStored.question(c.question) !== asStored.question(a.question);
  });
}

export async function rebindWatchers(catalogue) {
  if (mongoose.connection.readyState !== 1) return { rebound: [] };
  const byId = new Map((catalogue || []).filter((c) => c.ready && c.question).map((c) => [c.id, c]));
  if (!byId.size) return { rebound: [] };

  const live = await agentsCollection().find({ watcherId: { $nin: ['', null] } }).toArray();
  const rebound = [];

  for (const a of watchersToRebind(live, catalogue)) {
    const c = byId.get(a.watcherId);
    try {
      await agentsCollection().updateOne(
        { _id: a._id },
        {
          $set: {
            question: asStored.question(c.question),
            reboundAt: new Date(),
            boundTo: asStored.binding(c.using),
            /*
             * And it is due again.
             *
             * `lastRunAt` means "this question has been asked today". After a
             * rebind it has not — a different question was. Left standing, a
             * watcher moved onto a newly connected CRM at nine in the morning
             * would next look at seven the following day, and the board would
             * sit empty until then. Which is what happened: the CRM was
             * connected, the watcher moved, the front page said nothing, and
             * the honest explanation was "wait until tomorrow".
             *
             * dueAgents treats no last run as due, so the next tick picks it
             * up — inside five minutes, and still no earlier than the hour
             * the owner chose.
             */
            lastRunAt: null,
          },
          // The plan named the old dataset; the findings were about it.
          $unset: { plan: '' },
        },
      );
      await findingsCollection().deleteMany({ agentId: a._id });
      rebound.push({ watcherId: a.watcherId, name: a.name, from: a.question, to: c.question });
      sendSignal('watcher_rebound', { watcherId: a.watcherId, using: c.using || '' });
    } catch (err) {
      // One that will not move must not stop the rest.
      console.warn(`[agents] could not rebind "${a.watcherId}":`, err.message);
    }
  }

  /*
   * And the ones that only changed their wording.
   *
   * Brought up to date in place: the record says what is being asked, the
   * findings stay, the schedule stays, and nobody watching the board sees
   * anything happen — which is the correct amount of drama for a connector
   * having grown a column.
   */
  const reworded = [];
  for (const a of watchersToReword(live, catalogue)) {
    const c = byId.get(a.watcherId);
    try {
      await agentsCollection().updateOne(
        { _id: a._id },
        { $set: { question: asStored.question(c.question) }, $unset: { plan: '' } },
      );
      reworded.push(a.watcherId);
    } catch (err) {
      console.warn(`[agents] could not reword "${a.watcherId}":`, err.message);
    }
  }

  /*
   * And any watcher that moved but has not looked since.
   *
   * The rule is the same one, stated over the record rather than over this
   * run: a watcher rebound after its last run has not yet asked the question
   * it is now asking. It catches the case the loop above cannot — a rebind
   * that happened before this clearing existed, or one whose run then failed
   * — and it settles by itself, because a run puts lastRunAt past reboundAt.
   */
  const waiting = live.filter((a) => a.reboundAt && a.lastRunAt
    && new Date(a.reboundAt).getTime() > new Date(a.lastRunAt).getTime());
  for (const a of waiting) {
    await agentsCollection().updateOne({ _id: a._id }, { $set: { lastRunAt: null } }).catch(() => {});
  }

  if (rebound.length) {
    console.log(`[agents] followed the data: ${rebound.map((r) => r.watcherId).join(', ')}`);
  }
  if (reworded.length) {
    // Said separately from a move, because the two have very different
    // consequences and a log that calls both "followed the data" is how a
    // fortnight of deleted findings went unnoticed.
    console.log(`[agents] same data, new wording: ${reworded.join(', ')}`);
  }
  if (waiting.length) {
    console.log(`[agents] due again after moving: ${waiting.map((a) => a.watcherId).join(', ')}`);
  }
  return { rebound, reworded, due: waiting.map((a) => a.watcherId) };
}

/**
 * The soonest a change in the records may wake a watcher that has already run
 * today. One hour.
 *
 * A watcher on a daily schedule costs one model call a day, and that is the
 * number the plan, the spend cap and the owner's inbox are all sized for.
 * Waking on change is worth real money, so it is bounded: a source somebody
 * is editing all afternoon wakes its watchers once an hour, not once a
 * keystroke. In steady state it costs nothing at all, because a source that
 * has not changed wakes nothing.
 */
export const WAKE_FLOOR_MS = 60 * 60 * 1000;

/**
 * Which watchers read a dataset that has just changed. Pure.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * A finding is a claim about records. When the records change the claim is
 * not wrong — it is unverified, which is worse, because the board goes on
 * stating it in the present tense.
 *
 * Measured on the live physiotherapy application. Nine Zoho modules were
 * connected and the owner then deleted the sample records out of the CRM.
 * The Data page caught up within seconds and was correct. The front page was
 * not: eighteen findings, seventeen of them naming leads, deals and tasks
 * that no longer existed anywhere — "Promise Overdue: Kris Marrier (Sample)"
 * about a contact deleted an hour earlier. Every watcher had already run that
 * morning, so the record said the question had been asked today and the next
 * look was seven o'clock tomorrow. The owner's words were "the home page
 * still shows old data, is it possible to run it quickly".
 *
 * There is no quickly. There is only a watcher that knows its evidence moved.
 *
 * ── What this refuses to do ────────────────────────────────────────────────
 *
 * It does not decide which findings are stale. A finding's key is whatever
 * the pipeline called the thing — a name here, a record id there — and
 * guessing whether that row is still present would quietly resolve findings
 * that are still true. Instead the watcher looks again, in code, through the
 * pipeline that counted them in the first place, and diffFindings resolves
 * what has genuinely gone. Slower by one tick, and right.
 *
 * It also does not overrule the hour the owner chose. This makes a watcher
 * DUE; dueAgents still decides, so a change at three in the morning is picked
 * up at seven with everything else.
 */
/**
 * Does this watcher read that dataset?
 *
 * A watcher reading one names it. A watcher reading two carries both, joined
 * the way matchPair writes them — "Calls (Exotel) + Tasks (Zoho CRM)" — so
 * membership is the question, not equality.
 */
export function readsDataset(boundTo, datasetName) {
  const name = String(datasetName || '').trim();
  if (!name) return false;
  return String(boundTo || '').split(' + ').map((s) => s.trim()).includes(name);
}

export function watchersToWake(live = [], datasetName = '', now = Date.now()) {
  const name = String(datasetName || '').trim();
  if (!name) return [];
  return (live || []).filter((a) => {
    if (!a || a.enabled === false) return false;
    if (a.status === 'degraded' || a.status === 'paused') return false;
    /*
     * Either side, for a watcher that reads two.
     *
     * matchPair records both as "Left + Right", so an exact comparison never
     * matched one of them and the most valuable watchers in the catalogue —
     * the ones joining a call to a CRM, an order to a delivery — would never
     * have woken when either side changed. They would have run on the
     * schedule and no sooner, which is the slow version of not working.
     */
    if (!readsDataset(a.boundTo, name)) return false;
    // Never run, or already waiting: it is due without any help from here.
    if (!a.lastRunAt) return false;
    return now - new Date(a.lastRunAt).getTime() >= WAKE_FLOOR_MS;
  });
}

/** The records behind these watchers moved, so they are due again. */
export async function wakeWatchersFor(datasetName, { now = Date.now() } = {}) {
  if (mongoose.connection.readyState !== 1) return { woken: [] };
  /*
   * Read back everything bound to anything, and let readsDataset decide.
   *
   * The query used to ask for an exact boundTo, which cannot find a watcher
   * that reads two datasets — those are stored as "Left + Right". Filtering
   * in the database would mean teaching a query that format; a board holds
   * tens of watchers, not thousands, so it is read and filtered here where
   * one function owns the rule.
   */
  const live = await agentsCollection()
    .find({ boundTo: { $nin: ['', null] } }).toArray().catch(() => []);
  const wake = watchersToWake(live, datasetName, now);
  for (const a of wake) {
    await agentsCollection().updateOne({ _id: a._id }, { $set: { lastRunAt: null } }).catch(() => {});
  }
  if (wake.length) {
    console.log(`[agents] ${datasetName} changed — looking again: ${wake.map((a) => a.watcherId || a.name).join(', ')}`);
  }
  return { woken: wake.map((a) => a.watcherId || a.name) };
}

/** What this application has already been offered, so it is offered once. */
async function rememberSeeds(entries) {
  if (!entries.length) return;
  try {
    await seedsCollection().bulkWrite(entries.map((e) => ({
      updateOne: {
        filter: { kind: e.kind, key: e.key },
        update: { $setOnInsert: { kind: e.kind, key: e.key, at: new Date() } },
        upsert: true,
      },
    })), { ordered: false });
  } catch (err) {
    console.warn('[agents] could not record what was auto-started:', err.message);
  }
}

/**
 * Move watchers that have never run onto the owner's own clock.
 *
 * ── The defect this repairs ────────────────────────────────────────────────
 *
 * A watcher somebody creates by hand takes the timezone from their browser,
 * which is right. A watcher that starts itself at delivery has no browser to
 * ask and falls back to UTC — so "every weekday at 7am" fired at 07:00 UTC,
 * which reaches an Indian academy at half past twelve. For a feature whose
 * entire value is being a morning briefing, that is not a small inaccuracy;
 * it is the feature not working.
 *
 * The application cannot know the owner's timezone until somebody opens it.
 * When they do, it learns it once and moves the watchers that are still on the
 * default across.
 *
 * Deliberately narrow. Only watchers that are still UTC and have NEVER run:
 * a watcher that has already reported is one the owner has seen arrive, and
 * silently shifting when it fires would be changing something behind them.
 * Anything they set by hand is theirs and is never touched.
 */
export async function adoptTimezone(tz) {
  const clean = String(tz || '').trim();
  if (!clean || clean === 'UTC') return { moved: 0 };
  if (mongoose.connection.readyState !== 1) return { moved: 0 };

  const r = await agentsCollection().updateMany(
    { tz: 'UTC', lastRunAt: null },
    { $set: { tz: clean.slice(0, 64) } },
  );
  const moved = r.modifiedCount || 0;
  if (moved) console.log(`[agents] ${moved} watcher(s) moved to ${clean}`);
  return { moved };
}

// ── The schedule ────────────────────────────────────────────────────────────

let timer = null;
let quiet = false;

/**
 * When anybody last opened this application.
 *
 * The most recent sign-in across everyone with access, not the owner's alone:
 * a practice manager reading the board every morning while the owner never
 * logs in is somebody looking.
 *
 * An application nobody has ever signed into falls back to the day it was
 * prepared, so a new one watches through its first fortnight rather than
 * being quiet before anyone has had the chance to arrive.
 */
export async function lastLookedAt() {
  const users = mongoose.connection.collection('svarg_users');
  const seen = await users.find({ lastSeenAt: { $ne: null } }, { projection: { lastSeenAt: 1 } })
    .sort({ lastSeenAt: -1 }).limit(1).toArray().catch(() => []);
  if (seen[0]?.lastSeenAt) return seen[0].lastSeenAt;

  const meta = await mongoose.connection.collection('svarg_meta')
    .findOne({ _id: 'tenant' }).catch(() => null);
  return meta?.preparedAt || meta?.createdAt || null;
}

/**
 * Runs from this application's own process, beside the connector scheduler.
 * Looks every five minutes and runs whatever is due.
 */
/**
 * `catalogue` is injected for the same reason `ask` is: this file decides
 * when a watcher runs, and knows nothing about where datasets come from.
 *
 * It is read on every tick rather than once, because that is the point —
 * connecting a CRM at eleven o'clock must reach the watchers without a
 * restart and without anybody pressing anything. The work is a handful of
 * regular expressions over a handful of column names, and it writes only
 * when a binding has actually moved.
 */
export function startAgentScheduler(ask, { catalogue = null } = {}) {
  if (timer) return timer;
  const tick = async () => {
    try {
      if (mongoose.connection.readyState !== 1) return;

      const lookedAt = await lastLookedAt();
      if (wentQuiet(lookedAt)) {
        // Once, not every five minutes: this is the state, not an event.
        if (!quiet) {
          quiet = true;
          console.log(`[agents] nobody has opened this in ${IDLE_DAYS} days — watching paused`
            + ' until somebody signs in');
        }
        return;
      }
      if (quiet) {
        quiet = false;
        console.log('[agents] somebody is back — watching resumed');
      }

      // Before anything is due, so a watcher that runs this tick runs the
      // question that fits today's data rather than yesterday's.
      if (typeof catalogue === 'function') {
        try {
          await rebindWatchers(await catalogue());
        } catch (err) {
          console.warn('[agents] rebind skipped:', err.message);
        }
      }

      const due = dueAgents(await agentsCollection().find({}).toArray(), Date.now(), { lookedAt });
      if (!due.length) return;

      // Collected, not sent one by one. Six agents firing on a Monday must
      // reach the owner as one message; that is the difference between a
      // product somebody keeps and one they filter to a folder.
      const results = [];
      for (const a of due) {
        if (!(await takeEvaluation())) {
          console.log(`[agents] this month's ${evaluationLimit()} monitoring evaluations are used; ${due.length - results.length} watcher run(s) wait for next month`);
          break;
        }
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
  // One tick at a time, whether it came from the clock or from a connection.
  let ticking = false;
  const guarded = async () => {
    if (ticking) return;
    ticking = true;
    try { await tick(); } finally { ticking = false; }
  };
  tickNow = guarded;
  timer = setInterval(guarded, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

/*
 * ── Looking now, not at the next restart ──────────────────────────────────
 *
 * Watchers that become possible when a source connects used to start only
 * when the application booted -- a deploy, or the six-hourly update -- so an
 * owner who connected their clinic system saw nothing for hours, and the
 * moment they were most curious was the moment the product said least.
 *
 * Now a connection asks for a look: newly possible watchers start (the boot
 * path's own function, registered by server.js) and the scheduler ticks at
 * once, so they run. Debounced, because one connect is several parts landing
 * a few seconds apart, and one look should follow the last of them.
 */
let tickNow = null;
let startNewlyPossible = null;
let lookTimer = null;

export function onLookNow(fn) { startNewlyPossible = fn; }

export function requestLookNow({ delayMs = 15000 } = {}) {
  if (lookTimer) clearTimeout(lookTimer);
  lookTimer = setTimeout(async () => {
    lookTimer = null;
    try { if (startNewlyPossible) await startNewlyPossible(); } catch (err) { console.warn('[agents] look-now start skipped:', err.message); }
    try { if (tickNow) await tickNow(); } catch (err) { console.warn('[agents] look-now tick failed:', err.message); }
  }, delayMs);
  if (typeof lookTimer.unref === 'function') lookTimer.unref();
  return true;
}

export function stopAgentScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
