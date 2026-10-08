/**
 * Learning the behavioural patterns that precede churn, per business.
 *
 * ── What this is ───────────────────────────────────────────────────────────
 *
 * The catalogue's watchers are rules somebody wrote: Gone Quiet, No Show,
 * Renewal Due. They are right for most businesses and wrong for some, and
 * none of them is learned from THIS business. This file learns from it:
 *
 *   1. Who left. A customer counts as lost by the business's own definition
 *      (written by Svarg at delivery from the kind of business it is, and
 *      changeable by the owner): no activity for so many days, no return
 *      within so many times their usual gap, or a last record whose status
 *      says they cancelled.
 *   2. What came before. For every customer who left, the 30 days before
 *      they left; for every customer who stayed, the 30 days before a point
 *      they were followed past. The same signals are read from both:
 *      fewer records than usual in a dataset, a rare status (No Show,
 *      Failed), a longer gap than usual, and the watchers that flagged them.
 *   3. What is different. A signal, or a pair, seen far more often before
 *      leaving than before staying is a candidate pattern, carried with its
 *      own numbers: seen before 23 of 31 who left, 4.1 times as likely.
 *
 * A candidate does nothing until the owner approves it. Approved, it becomes
 * an agent of kind 'pattern', run on the same schedule as every other agent
 * by runPattern() below, in code, and its findings flow through Explain,
 * Recommend, Act, Measure and Learn exactly like a catalogue watcher's.
 *
 * ── The rules this file keeps ──────────────────────────────────────────────
 *
 * Nothing here is a model. Every number is a count over the customer's own
 * rows, and no customer record leaves this application.
 *
 * Correlation, not cause: a pattern says "this came before leaving here",
 * and the screen says so. It never claims a probability for one customer.
 *
 * The outcome is never its own predictor. A status that defines leaving
 * (Cancelled, Not renewed) is excluded from the signals, or every pattern
 * would "predict" churn by reading the churn itself.
 *
 * A cancelled appointment is not a lost customer. A status only marks
 * someone as gone when it is the LAST thing on their record.
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import { columnsFor } from './agentCatalogue.js';
import { readIndex, readAllRows } from './connectorService.js';
import { buildPhoneBook, personFor, looksLikePhone, personForFinding } from './peopleService.js';
import { parseDate } from './reasoning.js';

const DAY = 86400000;

/** The window read before leaving, and the stretch before it that says "usual". */
export const WINDOW_DAYS = 30;
export const BASELINE_DAYS = 90;
/** Below this many customers who left, nothing is proposed: too few to learn from. */
export const MIN_CHURNED = 20;
/** A pattern must have come before at least this many of them. */
export const MIN_SUPPORT = 8;
/** And they must have left at least this many times as often as those without it. */
export const MIN_STRENGTH = 2;
/** At most this many suggestions at once; an owner reads a short list. */
export const MAX_CANDIDATES = 5;
/** Re-learned this often, so patterns follow the business as it changes. */
export const RELEARN_DAYS = 7;

/** The watcherId every learned-pattern agent and finding carries. */
export const PATTERN_WATCHER = 'learned-pattern';

/**
 * What "lost" means when nobody has said. Return within three times their own
 * usual gap, or at least 30 days; a cancellation that is their last record.
 */
export const DEFAULT_DEFINITION = {
  businessType: 'general',
  label: 'General',
  inactiveDays: null,
  gapMultiple: 3,
  minDays: 30,
  statusWords: ['cancelled', 'canceled', 'unsubscribed', 'not renewed', 'churned', 'closed lost', 'withdrawn'],
};

// ── Small helpers ───────────────────────────────────────────────────────────

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
const STAFF = /owner|assign|responsible|manager|created|modified|(^|_)by$/i;
const PHONE_COLUMN = /phone|mobile|whatsapp|contact.?no|cell/i;

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The definition with every field present and sane. */
export function normalizeDefinition(def) {
  const d = { ...DEFAULT_DEFINITION, ...(def || {}) };
  const num = (v, lo, hi) => (Number.isFinite(+v) && +v > 0 ? Math.min(Math.max(+v, lo), hi) : null);
  return {
    businessType: String(d.businessType || 'general'),
    label: String(d.label || 'General'),
    inactiveDays: num(d.inactiveDays, 7, 1095),
    gapMultiple: num(d.gapMultiple, 1.5, 10),
    minDays: num(d.minDays, 7, 1095) || 30,
    statusWords: (Array.isArray(d.statusWords) ? d.statusWords : String(d.statusWords || '').split(','))
      .map(norm).filter(Boolean).slice(0, 12),
  };
}

/** The definition as one sentence an owner can read and argue with. */
export function definitionSentence(def) {
  const d = normalizeDefinition(def);
  const quiet = d.inactiveDays
    ? `have had no activity for ${d.inactiveDays} days`
    : `have not come back within ${d.gapMultiple} times their usual gap (at least ${d.minDays} days)`;
  const words = d.statusWords.length ? `, or their last record says ${d.statusWords.slice(0, 4).map((w) => `“${w}”`).join(' or ')}` : '';
  return `A customer counts as lost when they ${quiet}${words}.`;
}

// ── 1. Timelines ────────────────────────────────────────────────────────────

/**
 * Which column names the person, which dates the record, and which carries a
 * status, in one dataset. Staff columns are skipped: on a CRM's meetings the
 * owner is the physiotherapist, not the patient.
 */
export function rolesOf(columns = []) {
  const who = columnsFor('who', columns).filter((c) => !STAFF.test(c));
  const phone = columns.filter((c) => PHONE_COLUMN.test(c));
  const when = columnsFor('when', columns).filter((c) => !/created|modified|updated/i.test(c));
  const whenAll = when.length ? when : columnsFor('when', columns);
  const status = columnsFor('status', columns);
  const person = who[0] || phone[0] || '';
  const date = whenAll.find((c) => c !== person) || '';
  return {
    person, date,
    status: status.find((c) => c !== person && c !== date) || '',
  };
}

/**
 * Every dated record about a person, across every dataset, as one list.
 *
 * `datasets` is [{ name, columns, rows: [cells] }]. People are joined across
 * datasets by name, and a phone number standing where a name should be is
 * resolved through the phone book the rest of the application already uses.
 */
export function buildEvents(datasets = [], book = new Map()) {
  const events = [];
  for (const d of datasets) {
    const columns = d.columns || [];
    const r = rolesOf(columns);
    if (!r.person || !r.date) continue;
    const pi = columns.indexOf(r.person);
    const di = columns.indexOf(r.date);
    const si = r.status ? columns.indexOf(r.status) : -1;
    for (const row of d.rows || []) {
      const raw = String(row[pi] == null ? '' : row[pi]).trim();
      if (!raw) continue;
      const name = looksLikePhone(raw) ? personFor(raw, book) : raw;
      if (!name || looksLikePhone(name)) continue;
      const at = parseDate(row[di]);
      if (!at) continue;
      events.push({
        person: norm(name), name,
        at: at.getTime(),
        dataset: d.name,
        status: si >= 0 ? String(row[si] == null ? '' : row[si]).trim() : '',
      });
    }
  }
  return events;
}

/** Events grouped per person, oldest first. */
export function byPerson(events = []) {
  const m = new Map();
  for (const e of events) {
    if (!m.has(e.person)) m.set(e.person, { key: e.person, name: e.name, events: [] });
    m.get(e.person).events.push(e);
  }
  for (const p of m.values()) p.events.sort((a, b) => a.at - b.at);
  return m;
}

// ── 2. Who left ─────────────────────────────────────────────────────────────

/** A person's usual gap between records, from the gaps they have had. */
export function usualGap(events, before = Infinity) {
  const ts = events.filter((e) => e.at < before).map((e) => e.at);
  const gaps = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) gaps.push(ts[i] - ts[i - 1]);
  return gaps.length >= 2 ? median(gaps) : 0;
}

/** How long a silence counts as leaving, for this person. */
export function silenceThreshold(events, def) {
  const d = normalizeDefinition(def);
  if (d.inactiveDays) return d.inactiveDays * DAY;
  const gap = usualGap(events);
  return Math.max(d.minDays * DAY, gap * (d.gapMultiple || 3));
}

/**
 * Whether this person has left, and when, as of `now`.
 *
 * Two ways: a last record whose status says they left, or a silence longer
 * than their threshold. The moment of leaving is their last record either
 * way — what came before it is what the learning reads.
 */
export function churnOutcome(person, def, now) {
  const d = normalizeDefinition(def);
  const evs = person.events;
  if (!evs.length) return { churned: false };
  const last = evs[evs.length - 1];
  const threshold = silenceThreshold(evs, d);

  const st = norm(last.status);
  if (st && d.statusWords.some((w) => st.includes(w))) {
    return { churned: true, at: last.at, how: 'status', threshold };
  }
  if (now - last.at > threshold) return { churned: true, at: last.at, how: 'silence', threshold };
  return { churned: false, threshold };
}

// ── 3. What came before ─────────────────────────────────────────────────────

/**
 * How often each status occurs in each dataset. A status counts as a signal
 * only when it is uncommon there: "Attended" on every row says nothing,
 * "No Show" on one row in ten does.
 */
export function statusRarity(events = []) {
  const by = new Map();
  for (const e of events) {
    const v = norm(e.status);
    if (!v) continue;
    if (!by.has(e.dataset)) by.set(e.dataset, { total: 0, counts: new Map() });
    const s = by.get(e.dataset);
    s.total += 1;
    s.counts.set(v, (s.counts.get(v) || 0) + 1);
  }
  const rare = new Map();
  for (const [ds, s] of by) {
    const set = new Set();
    for (const [v, n] of s.counts) if (n >= 3 && n / s.total < 0.35) set.add(v);
    rare.set(ds, set);
  }
  return rare;
}

/**
 * The signals true for one person in one window, each with the record that
 * shows it. `trailing` counts the silence from their last record up to the
 * end of the window — right when watching the present, wrong when reading
 * the past of somebody whose last record IS the end of the window.
 */
export function signalsIn(person, from, to, ctx) {
  const { rare = new Map(), def, flags = [], trailing = false } = ctx || {};
  const d = normalizeDefinition(def);
  const out = new Map();
  const add = (id, label, at, dataset) => { if (!out.has(id)) out.set(id, { id, label, at, dataset }); };

  const evs = person.events;
  const inWin = evs.filter((e) => e.at >= from && e.at <= to);

  // Fewer than usual, per dataset they used to appear in.
  const datasets = new Set(evs.map((e) => e.dataset));
  for (const ds of datasets) {
    const base = evs.filter((e) => e.dataset === ds && e.at >= from - BASELINE_DAYS * DAY && e.at < from).length;
    const perWindow = base / (BASELINE_DAYS / WINDOW_DAYS);
    if (perWindow < 1) continue;
    const now = inWin.filter((e) => e.dataset === ds).length;
    if (now < perWindow * 0.5) {
      const lastSeen = evs.filter((e) => e.dataset === ds && e.at <= to).pop();
      add(`fewer|${ds}`, `Fewer ${ds} than usual`, lastSeen ? lastSeen.at : to, ds);
    }
  }

  // A status that is uncommon in its dataset — and is not leaving itself.
  for (const e of inWin) {
    const v = norm(e.status);
    if (!v || !rare.get(e.dataset)?.has(v)) continue;
    if (d.statusWords.some((w) => v.includes(w))) continue;
    add(`status|${e.dataset}|${v}`, `${e.status} in ${e.dataset}`, e.at, e.dataset);
  }

  // A longer gap than this person's usual one.
  const usual = usualGap(evs, from);
  if (usual > 0) {
    const ts = evs.filter((e) => e.at <= to).map((e) => e.at);
    let longest = 0;
    let at = to;
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] < from) continue;
      if (ts[i] - ts[i - 1] > longest) { longest = ts[i] - ts[i - 1]; at = ts[i]; }
    }
    if (trailing && ts.length && to - ts[ts.length - 1] > longest) { longest = to - ts[ts.length - 1]; at = ts[ts.length - 1]; }
    if (longest > usual * 2) add('gap|longer', 'A longer gap than usual between visits', at, '');
  }

  // What the application's own watchers flagged about them in the window.
  for (const f of flags) {
    if (f.watcherId === PATTERN_WATCHER) continue;
    if (f.at < from || f.at > to) continue;
    add(`flag|${f.watcherId || f.agentName}`, `Flagged by ${f.agentName || f.watcherId}`, f.at, '');
  }

  return out;
}

// ── 4. What is different ────────────────────────────────────────────────────

/** How many times as often people with the pattern left as people without it. */
export function strength(withChurned, withStayed, churned, stayed) {
  const withAll = withChurned + withStayed;
  const withoutChurned = churned - withChurned;
  const withoutAll = (churned + stayed) - withAll;
  const rateWith = (withChurned + 0.5) / (withAll + 1);
  const rateWithout = (withoutChurned + 0.5) / (withoutAll + 1);
  return rateWith / rateWithout;
}

export function patternId(signalIds) {
  const key = [...signalIds].sort().join('+');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/**
 * Learn, from everyone's history, which signals came before leaving.
 *
 * Pure: give it the events, the flags, the definition and a clock. Returns
 * how many left and stayed, whether there is enough to learn from, and the
 * candidate patterns with their numbers.
 */
export function learnPatterns({ events = [], flags = [], def, now = Date.now() } = {}) {
  const people = byPerson(events);
  const rare = statusRarity(events);
  const flagsBy = new Map();
  for (const f of flags) {
    if (!f.person) continue;
    if (!flagsBy.has(f.person)) flagsBy.set(f.person, []);
    flagsBy.get(f.person).push(f);
  }

  const rows = []; // { churned: bool, signals: Map }
  let churned = 0;
  let stayed = 0;
  for (const p of people.values()) {
    if (p.events.length < 2) continue;
    const out = churnOutcome(p, def, now);
    const first = p.events[0].at;
    const ctx = { rare, def, flags: flagsBy.get(p.key) || [] };
    if (out.churned) {
      if (out.at - first < WINDOW_DAYS * DAY) continue; // no history before leaving
      rows.push({ churned: true, signals: signalsIn(p, out.at - WINDOW_DAYS * DAY, out.at, ctx) });
      churned += 1;
    } else {
      // Followed past this point and still here: what they looked like then.
      const ref = now - out.threshold;
      if (ref - first < WINDOW_DAYS * DAY) continue;
      rows.push({ churned: false, signals: signalsIn(p, ref - WINDOW_DAYS * DAY, ref, ctx) });
      stayed += 1;
    }
  }

  const status = { churned, stayed, enough: churned >= MIN_CHURNED && stayed >= MIN_SUPPORT };
  if (!status.enough) return { ...status, candidates: [] };

  // Every single signal, counted.
  const labels = new Map();
  const count = (ids) => {
    let c = 0; let s = 0;
    for (const r of rows) if (ids.every((id) => r.signals.has(id))) { if (r.churned) c++; else s++; }
    return [c, s];
  };
  for (const r of rows) for (const sig of r.signals.values()) labels.set(sig.id, sig.label);

  const scored = (ids) => {
    const [c, s] = count(ids);
    return { ids, withChurned: c, withStayed: s, strength: strength(c, s, churned, stayed) };
  };
  const singles = [...labels.keys()].map((id) => scored([id]))
    .filter((x) => x.withChurned >= MIN_SUPPORT);

  // Pairs of the strongest singles: a combination that beats both its parts.
  const top = [...singles].sort((a, b) => b.strength - a.strength).slice(0, 10);
  const pairs = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const p = scored([top[i].ids[0], top[j].ids[0]]);
      if (p.withChurned >= MIN_SUPPORT && p.strength > Math.max(top[i].strength, top[j].strength) * 1.1) pairs.push(p);
    }
  }

  const candidates = [...singles, ...pairs]
    .filter((x) => x.strength >= MIN_STRENGTH)
    .sort((a, b) => b.strength - a.strength || b.withChurned - a.withChurned)
    .slice(0, MAX_CANDIDATES)
    .map((x) => ({
      id: patternId(x.ids),
      signals: x.ids.map((id) => ({ id, label: labels.get(id) })),
      label: x.ids.map((id) => labels.get(id)).join(' + '),
      withChurned: x.withChurned,
      withStayed: x.withStayed,
      churned,
      stayed,
      strength: Math.round(x.strength * 10) / 10,
    }));

  return { ...status, candidates };
}

/** The pattern as one sentence, with its numbers. */
export function patternSentence(p) {
  // Above 20 the number stops meaning anything a person can use, and on a
  // small history it is mostly the smoothing talking.
  const times = p.strength > 20 ? 'more than 20×' : `${p.strength}×`;
  return `Seen before ${p.withChurned} of the ${p.churned} customers who left; customers showing it left ${times} as often as those who did not.`;
}

/**
 * Who shows this pattern now: everyone not already gone, over the last 30
 * days, silences counted up to today. One item per person, with the records
 * that show each part of the pattern.
 */
export function matchPattern(pattern, { events = [], flags = [], def, now = Date.now() } = {}) {
  const people = byPerson(events);
  const rare = statusRarity(events);
  const flagsBy = new Map();
  for (const f of flags) {
    if (!f.person) continue;
    if (!flagsBy.has(f.person)) flagsBy.set(f.person, []);
    flagsBy.get(f.person).push(f);
  }
  const want = (pattern.signals || []).map((s) => s.id);
  const items = [];
  for (const p of people.values()) {
    if (churnOutcome(p, def, now).churned) continue;
    const sig = signalsIn(p, now - WINDOW_DAYS * DAY, now, { rare, def, flags: flagsBy.get(p.key) || [], trailing: true });
    if (!want.length || !want.every((id) => sig.has(id))) continue;
    const lines = want.map((id) => {
      const s = sig.get(id);
      return [s.label, new Date(s.at).toISOString().slice(0, 10), s.dataset || '—'];
    });
    items.push({ id: p.key, name: p.name, lines, records: lines.length, source: 'learned' });
  }
  return items;
}

// ── The application's side: reading its data, storing what was learned ─────

export function patternsCollection() {
  return mongoose.connection.collection('svarg_churn_patterns');
}
function settingsCollection() {
  return mongoose.connection.collection('svarg_churn_settings');
}

/**
 * The definition in force: the owner's, if they changed it; otherwise the one
 * Svarg wrote at delivery; otherwise the general default.
 */
export async function currentDefinition(planned = null) {
  try {
    const own = await settingsCollection().findOne({ _id: 'definition' });
    if (own?.definition) return { ...normalizeDefinition(own.definition), source: 'owner' };
  } catch { /* none saved */ }
  if (planned) return { ...normalizeDefinition(planned), source: 'svarg' };
  return { ...normalizeDefinition(DEFAULT_DEFINITION), source: 'default' };
}

export async function saveDefinition(definition) {
  const clean = normalizeDefinition(definition);
  await settingsCollection().updateOne(
    { _id: 'definition' },
    { $set: { definition: clean, savedAt: new Date() } },
    { upsert: true },
  );
  return clean;
}

/**
 * Everything the learning reads, from this application's own database.
 *
 * The owner's own rows when there are any; the sample the application shipped
 * with otherwise, and then everything learned from it is marked as sample, so
 * a screen never presents a pattern in invented data as one in theirs.
 */
export async function loadInputs(findings = []) {
  const readAll = async (kind) => {
    const out = [];
    for (const d of readIndex()) {
      try {
        const all = await readAllRows(d, kind);
        if (all.rows.length) out.push({ name: d.name, columns: all.columns, rows: all.rows.map((r) => r.cells) });
      } catch { /* one unreadable dataset must not cost the rest */ }
    }
    return out;
  };
  let datasets = await readAll('own');
  let simulated = false;
  if (!datasets.length) { datasets = await readAll('sample'); simulated = true; }

  const book = buildPhoneBook(datasets.map((d) => ({ columns: d.columns, rows: d.rows })));
  const events = buildEvents(datasets, book);
  const flags = [];
  for (const f of findings) {
    const who = personForFinding({ watcherId: f.watcherId, title: f.title, evidence: f.evidence }, book);
    const at = f.firstSeenAt ? new Date(f.firstSeenAt).getTime() : NaN;
    if (!who || !Number.isFinite(at)) continue;
    flags.push({ person: norm(who), watcherId: f.watcherId || '', agentName: f.agentName || '', at });
  }
  const latest = events.reduce((m, e) => Math.max(m, e.at), 0);
  // The clock is the newest record, never a day past today: a sample written
  // last year is read as of its own last day, not as everyone having left.
  const now = latest ? Math.min(Date.now(), latest + DAY) : Date.now();
  return { events, flags, now, simulated };
}

/**
 * Learn again and store the result.
 *
 * Candidates are upserted by their stable id. A dismissed pattern stays
 * dismissed. An approved one that no longer clears the bar is marked fading
 * rather than switched off: the owner chose it, and the owner decides.
 */
export async function relearn({ planned = null, findings = [] } = {}) {
  const def = await currentDefinition(planned);
  const input = await loadInputs(findings);
  const learned = learnPatterns({ ...input, def });
  const at = new Date();

  const fresh = new Set(learned.candidates.map((c) => c.id));
  for (const c of learned.candidates) {
    await patternsCollection().updateOne(
      { _id: c.id },
      {
        $set: { ...c, simulated: input.simulated, learnedAt: at },
        $setOnInsert: { state: 'candidate', firstLearnedAt: at },
      },
      { upsert: true },
    );
    await patternsCollection().updateOne({ _id: c.id, state: 'fading' }, { $set: { state: 'approved' } });
  }
  const held = await patternsCollection().find({}).toArray();
  for (const p of held) {
    if (fresh.has(p._id)) continue;
    if (p.state === 'approved') await patternsCollection().updateOne({ _id: p._id }, { $set: { state: 'fading' } });
    else if (p.state === 'candidate') await patternsCollection().deleteOne({ _id: p._id });
  }

  const status = {
    churned: learned.churned, stayed: learned.stayed, enough: learned.enough,
    simulated: input.simulated, learnedAt: at, minChurned: MIN_CHURNED,
  };
  await settingsCollection().updateOne({ _id: 'status' }, { $set: status }, { upsert: true });
  return { ...status, candidates: learned.candidates.length };
}

export async function learningStatus() {
  try { return (await settingsCollection().findOne({ _id: 'status' })) || null; } catch { return null; }
}

export async function listPatterns(openCounts = {}) {
  const all = await patternsCollection().find({ state: { $ne: 'dismissed' } }).toArray();
  return all
    .sort((a, b) => (b.strength || 0) - (a.strength || 0))
    .map((p) => ({
      id: p._id, label: p.label, signals: p.signals || [], state: p.state,
      withChurned: p.withChurned, withStayed: p.withStayed, churned: p.churned, stayed: p.stayed,
      strength: p.strength, sentence: patternSentence(p), simulated: !!p.simulated,
      agentId: p.agentId || null, learnedAt: p.learnedAt || null,
      // How many customers show it right now, once it is being watched.
      openNow: p.agentId ? (openCounts[String(p.agentId)] || 0) : null,
    }));
}

export async function dismissPattern(id) {
  const r = await patternsCollection().updateOne({ _id: String(id) }, { $set: { state: 'dismissed' } });
  if (!r.matchedCount) throw new Error('No such pattern.');
}

/**
 * The runner the scheduler uses for an agent of kind 'pattern': the same
 * envelope the answer pipeline returns, so findings, evidence, the customer
 * cards and the digest need nothing new.
 */
export function patternRunner({ planned = null, findings = async () => [] } = {}) {
  return async function runPattern({ agent }) {
    const p = agent?.patternId ? await patternsCollection().findOne({ _id: agent.patternId }) : null;
    if (!p) return { checked: false, groups: [] };
    const def = await currentDefinition(typeof planned === 'function' ? planned() : planned);
    const input = await loadInputs(await findings());
    const items = matchPattern(p, { ...input, def });
    return {
      checked: true,
      simulated: input.simulated,
      groups: [{
        dataset: 'Learned pattern',
        label: p.label,
        rule: patternSentence(p),
        window: `the last ${WINDOW_DAYS} days`,
        columns: ['Signal', 'Last seen', 'Where'],
        records: items.reduce((n, i) => n + i.records, 0),
        entities: items.length,
        items,
      }],
    };
  };
}
