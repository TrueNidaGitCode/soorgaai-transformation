/**
 * Explain, Recommend, Act, Measure and Learn — written by the model, per customer.
 *
 * ── What changed, and what did not ─────────────────────────────────────────
 *
 * The first version wrote every stage from a playbook in code: the same
 * sentence for every patient who stopped coming. The owner's direction
 * (6 October 2026) was that all five stages are the AI's to monitor and
 * write, about THIS customer, rather than the application printing stock
 * suggestions. So the model now reads one customer's open findings, the
 * records behind them, what the team has already done, and what has worked
 * in this business before — and writes all five.
 *
 * Three things stay in code, because they are checks, not writing:
 *
 *   1. The facts. The model is handed a closed list built from the findings'
 *      stored evidence, and any number it writes that is not in that list
 *      rejects the analysis. A wrong figure in a message sent over the
 *      customer's name costs more than no message.
 *   2. Whether a step worked. The model writes what "worked" will look like;
 *      the watcher run decides whether it happened, from the records
 *      (owner's choice: "AI writes, records verify").
 *   3. The fallback. When the model cannot answer — an outage, the spend cap
 *      — the card shows the written playbook, labelled as standard guidance,
 *      so nobody is left without a next step.
 *
 * Not counted against the monthly evaluation allowance (owner's choice): one
 * call per customer, and only when that customer's findings change.
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import { generateRaw } from './llmService.js';
import { findingsCollection, switchedOffIds } from './agentService.js';
import { phoneBook, personForFinding } from './peopleService.js';
import { ACTIONS, DO, learnFrom, playbookFor } from './customerSpine.js';

/** Re-read a customer at least this often even if nothing changed. */
export const STALE_DAYS = 7;
/** At most this many customers written per refresh, worst first. */
export const PER_REFRESH = 15;
const DAY = 86400000;

export function analysesCollection() {
  return mongoose.connection.collection('svarg_customer_analyses');
}

/**
 * What the analysis was written from. When this changes — a finding opened
 * or resolved, a step marked, an outcome recorded — the analysis is out of
 * date and is written again. Evidence rows are left out on purpose: they
 * move on every run, and re-writing a customer every hour for a row that
 * aged a day would be paying for nothing.
 */
export function fingerprint(open = [], won = []) {
  const parts = [
    ...open.map(f => `${f.id}:${f.severity}:${f.acted?.action || ''}`).sort(),
    ...won.map(f => `w${f.id}:${(f.outcomes || []).length}`).sort(),
  ];
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

function daysSince(at, now) {
  const t = at ? new Date(at).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
}

/** The closed list of facts, in lines the model may use and may not exceed. */
export function factsFor(person, open = [], won = [], stats = {}, now = Date.now()) {
  const lines = [`Customer: ${person}`];
  open.forEach((f, i) => {
    const ev = f.evidence || {};
    lines.push(`Finding ${i + 1}: ${f.watcher || f.watcherId} (${f.severity || 'medium'} priority)`);
    if (ev.rule) lines.push(`  Flagged because: ${ev.rule}`);
    if (ev.dataset) lines.push(`  Source: ${ev.dataset}`);
    const open4 = daysSince(f.since, now);
    if (open4 !== null) lines.push(`  Open for: ${open4} days`);
    if (ev.columns && ev.columns.length) lines.push(`  Columns: ${ev.columns.join(' | ')}`);
    for (const row of (ev.lines || []).slice(0, 6)) lines.push(`  Record: ${(row || []).join(' | ')}`);
    if (f.acted?.action) {
      const d = daysSince(f.acted.at, now);
      lines.push(`  Team already did: ${ACTIONS[f.acted.action]}${d !== null ? `, ${d} days ago` : ''}`);
    }
  });
  if (won.length) {
    lines.push('Resolved for this customer after the team acted:');
    for (const f of won.slice(0, 5)) {
      for (const o of f.outcomes || []) lines.push(`  ${f.watcher || f.watcherId}: ${ACTIONS[o.action] || o.action} worked`);
    }
  }
  const watchers = [...new Set(open.map(f => f.watcherId))];
  const hist = [];
  for (const w of watchers) {
    for (const [a, s] of Object.entries(stats[w] || {})) {
      hist.push(`  ${w} / ${a}: tried ${s.tried}, worked ${s.worked}`);
    }
  }
  lines.push(hist.length ? 'What has worked in this business for these kinds of finding:' : 'This business has no recorded outcomes for these kinds of finding yet.');
  lines.push(...hist);
  return lines;
}

const SYSTEM = `You are the analyst for a small business. You read one customer's
findings and write what the team should know and do. Return JSON only:

{
  "kind": "retention" | "growth" | "both",
  "explain": "Why this matters for THIS customer, in the business's terms. 1-2 sentences.",
  "recommend": { "action": one of ${JSON.stringify(Object.keys(ACTIONS))}, "step": "The specific next step for this customer, as an instruction. 1 sentence.", "why": "Why this step, citing what has worked here if the facts show it. 1 sentence." },
  "act": "A short message the team could send this customer. Plain and warm, at most 4 sentences, no subject line, no signature.",
  "measure": "What would show in the business's records if the step worked, e.g. a new visit, a payment, a reply. 1 sentence.",
  "learn": "What this business's own outcomes suggest, or that there are none yet. 1 sentence."
}

Rules, in order:
1. Use only the FACTS. Do not write any number, date or name that is not in them.
2. Retention means keeping a customer who may leave; growth means more revenue
   from one who stays, including work delivered but never billed.
3. Do not promise discounts, refunds or anything the facts do not support.
4. If the team already did something, build on it rather than repeating it.
5. No marketing language, no exclamation marks, no emoji.`;

/** Every number the model wrote that the facts do not contain. */
export function inventedNumbers(text, facts) {
  const pool = facts.join('\n');
  const out = [];
  for (const m of String(text || '').matchAll(/\d+(?:[.,]\d+)?/g)) {
    if (!pool.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/** The model's reply, checked. Null when it cannot be used. */
export function checkAnalysis(raw, facts) {
  if (!raw || typeof raw !== 'object') return null;
  const s = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const r = raw.recommend || {};
  const out = {
    kind: ['retention', 'growth', 'both'].includes(raw.kind) ? raw.kind : '',
    explain: s(raw.explain, 400),
    recommend: {
      action: ACTIONS[r.action] ? r.action : '',
      step: s(r.step, 240),
      why: s(r.why, 300),
    },
    act: String(raw.act || '').trim().slice(0, 900),
    measure: s(raw.measure, 300),
    learn: s(raw.learn, 300),
  };
  if (!out.explain || !out.recommend.action || !out.recommend.step || !out.act || !out.measure) return null;
  const all = [out.explain, out.recommend.step, out.recommend.why, out.act, out.measure, out.learn].join('\n');
  if (inventedNumbers(all, facts).length) return null;
  return out;
}

/** Ask the model about one customer. Null when it cannot answer usably. */
export async function analyseCustomer(person, open, won, stats, now = Date.now()) {
  const facts = factsFor(person, open, won, stats, now);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateRaw({
      systemPrompt: SYSTEM,
      userMessage: `FACTS\n${facts.join('\n')}`,
      maxTokens: 900,
      // Writing from facts already computed; reasoning is billed as output.
      thinking: false,
      label: 'customer-analysis',
    });
    let parsed = null;
    try {
      const t = String(res?.text || '').replace(/```json|```/g, '').trim();
      parsed = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    } catch { parsed = null; }
    const ok = checkAnalysis(parsed, facts);
    if (ok) return ok;
  }
  return null;
}

/**
 * The playbook's version of the same five lines, for when the model has not
 * answered. Shown labelled, never passed off as the AI's.
 */
export function standardFor(open = [], rec = null) {
  const top = open[0];
  const pb = playbookFor(top?.watcherId);
  const action = rec?.action || pb.steps[0];
  return {
    kind: '',
    explain: pb.why,
    recommend: { action, step: DO[action], why: '' },
    act: '',
    measure: `It counts as worked once ${pb.won}.`,
    learn: '',
  };
}

/** A finding as the analysis reads it: the board's shape, without the HTTP. */
function view(f) {
  return {
    id: String(f._id), title: f.title || f.key, watcher: f.agentName || '', watcherId: f.watcherId || '',
    severity: f.severity || 'medium', since: f.firstSeenAt || null, evidence: f.evidence || null,
    acted: f.acted || null, outcomes: f.outcomes || [], state: f.state,
  };
}

const SEV = { high: 0, medium: 1, low: 2 };
let running = null;
let again = false;

/**
 * Write the analysis for every customer whose findings changed.
 *
 * One at a time and at most PER_REFRESH per pass, worst first, so a board
 * that suddenly holds sixty people does not fire sixty calls at once. Called
 * after a watcher run that changed something and when somebody opens the
 * board; overlapping calls fold into one follow-up pass.
 */
export function refreshAnalyses(opts = {}) {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do { again = false; await refreshOnce(opts); } while (again);
    } finally { running = null; }
  })().catch((err) => { console.warn('[analysis] refresh failed:', err.message); });
  return running;
}

async function refreshOnce({ now = Date.now() } = {}) {
  if (mongoose.connection.readyState !== 1) return { written: 0 };
  let written = 0;
  for (const simulated of [false, true]) {
    const kind = { 'evidence.simulated': simulated ? true : { $ne: true } };
    const notOff = { agentId: { $nin: await switchedOffIds() } };
    const open = (await findingsCollection().find({ state: 'open', ...kind, ...notOff }).limit(300).toArray()).map(view);
    if (!open.length) continue;
    const won = (await findingsCollection().find({
      state: 'resolved', 'outcomes.0': { $exists: true }, resolvedAt: { $gte: new Date(now - 90 * DAY) }, ...kind, ...notOff,
    }).limit(300).toArray()).map(view);
    const acted = await findingsCollection().find(
      { ...kind, $or: [{ acted: { $exists: true } }, { 'outcomes.0': { $exists: true } }] },
      { projection: { watcherId: 1, state: 1, acted: 1, outcomes: 1 } },
    ).limit(2000).toArray();
    const stats = learnFrom(acted, now);
    const book = await phoneBook().catch(() => new Map());

    const by = new Map();
    const add = (f, list) => {
      const p = String(personForFinding(f, book) || '').trim();
      if (!p) return;
      if (!by.has(p)) by.set(p, { open: [], won: [] });
      by.get(p)[list].push(f);
    };
    open.forEach(f => add(f, 'open'));
    won.forEach(f => add(f, 'won'));

    const people = [...by.entries()].filter(([, g]) => g.open.length)
      .map(([person, g]) => ({ person, ...g, sev: Math.min(...g.open.map(f => SEV[f.severity] ?? 1)) }))
      .sort((a, b) => a.sev - b.sev || b.open.length - a.open.length);

    for (const p of people) {
      if (written >= PER_REFRESH) return { written };
      p.open.sort((a, b) => (SEV[a.severity] ?? 1) - (SEV[b.severity] ?? 1));
      const fp = fingerprint(p.open, p.won);
      const _id = `${simulated ? 'eg' : 'own'}|${p.person}`;
      const have = await analysesCollection().findOne({ _id });
      const fresh = have && have.fingerprint === fp && have.analysis
        && now - new Date(have.at).getTime() < STALE_DAYS * DAY;
      // A failure is retried on the next pass, but not more than hourly.
      const cooling = have && have.failedFingerprint === fp && have.failedAt
        && now - new Date(have.failedAt).getTime() < 3600000;
      if (fresh || cooling) continue;

      let analysis = null;
      let error = '';
      try { analysis = await analyseCustomer(p.person, p.open, p.won, stats, now); }
      catch (err) { error = String(err.message || err).slice(0, 300); }
      /*
       * A failure never erases the last good reading. An outage would
       * otherwise wipe every customer's analysis at once, on the morning the
       * model is down; the earlier reading stays, marked as earlier, and the
       * failure is recorded beside it.
       */
      await analysesCollection().updateOne({ _id }, {
        $set: analysis
          ? { person: p.person, simulated, fingerprint: fp, analysis, at: new Date(now), error: '', failedAt: null, failedFingerprint: null }
          : { person: p.person, simulated, error: error || 'The reply could not be used.', failedAt: new Date(now), failedFingerprint: fp },
      }, { upsert: true });
      written += 1;
    }
  }
  return { written };
}

/**
 * The stored analyses for a board, keyed by person, with whether each still
 * matches what is open. A stale one is still shown — it is the AI's latest
 * reading — but marked so the screen can say it is being re-read.
 */
export async function analysesFor(simulated, customers = []) {
  if (!customers.length) return new Map();
  const ids = customers.map(c => `${simulated ? 'eg' : 'own'}|${c.person}`);
  const docs = await analysesCollection().find({ _id: { $in: ids } }).toArray().catch(() => []);
  return new Map(docs.map(d => [d.person, d]));
}
