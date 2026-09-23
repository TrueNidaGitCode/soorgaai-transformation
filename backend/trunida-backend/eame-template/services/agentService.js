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
import { allowedSchedule } from './coverage.js';
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

    // The plan's frequency, applied here as well as at creation: a watcher
    // created under an hourly plan keeps 'hourly' on its record after the
    // account moves to a daily one, and would otherwise outrun the downgrade.
    const spec = SCHEDULES[allowedSchedule(a.schedule)];
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
    // This item's own rows, and how many of them there were in total.
    source:   String(item?.source || ''),
    lines:    Array.isArray(item?.lines) ? item.lines : [],
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

export async function createAgent({
  name, question, schedule = 'daily', atHour = 7, tz = 'UTC', condition = null,
  // Which catalogue entry this came from, and how much it matters. Both are
  // Svarg's own vocabulary rather than anything the customer typed: watcherId
  // is what telemetry reports and severity is what the board sorts by. A
  // hand-written watcher has no catalogue entry and is medium, which is the
  // honest answer for a question nobody has graded.
  watcherId = '', severity = 'medium',
}) {
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
    watcherId: String(watcherId || '').slice(0, 64),
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
    // A watcher giving up is worth knowing centrally: one customer's broken
    // watcher is a support ticket, the same watcher breaking everywhere is a
    // defect in the catalogue.
    if (failures >= MAX_FAILURES) sendSignal('watcher_degraded', { watcherId: agent.watcherId || '' });
    return { ran: false, error: String(err.message || err) };
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
 * Returns the catalogue entries to create and the category names being
 * filled, so the caller can record both.
 */
export function watchersToStart({ catalogue = [], categories = [], live = [], seeds = [], covered = null } = {}) {
  const running = new Set(live.map((a) => a.watcherId).filter(Boolean));
  const takenNames = new Set(live.map((a) => a.name));
  const seededWatchers = new Set(seeds.filter((s) => s.kind === 'watcher').map((s) => s.key));
  const seededCategories = new Set(seeds.filter((s) => s.kind === 'category').map((s) => s.key));

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
    // A category the owner has already emptied stays empty: they have seen
    // everything under it once and said no.
    if (name && seededCategories.has(name)) continue;
    add(c);
  }
  for (const c of wanted) {
    const name = categoryNameOf(categories, c.id);
    if (name && !filled.includes(name) && !seededCategories.has(name)) filled.push(name);
  }

  return { wanted, filled };
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
  const { wanted, filled } = watchersToStart({ catalogue, categories, live, seeds, covered });
  if (!wanted.length) return { started: [], skipped: 'nothing new to start' };

  const started = [];
  for (const c of wanted) {
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
    ...wanted.map((c) => ({ kind: 'watcher', key: c.id })),
    ...filled.map((name) => ({ kind: 'category', key: name })),
  ]);

  if (started.length) console.log(`[agents] watching from delivery: ${started.join(', ')}`);
  return { started, skipped: started.length ? '' : 'nothing could be started' };
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
