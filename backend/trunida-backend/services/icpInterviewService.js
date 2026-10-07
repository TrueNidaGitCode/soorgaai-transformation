/**
 * ICP interviews: four answers in, the ten-step playbook and the wedge out.
 *
 * ── How it is filled (since 7 October 2026) ────────────────────────────────
 *
 * Four questions, the same in every interview. On 6 October the AI filled the
 * playbook from answers typed on the Target Audience tab. On 7 October the
 * owner changed it: the questions and answers are shared in the Claude chat,
 * the playbook is filled there from an understanding of the conversation,
 * and scripts/icp_record.mjs writes it. The tab only displays. No model is
 * called from here.
 *
 * ── The rule the filling is held to ────────────────────────────────────────
 *
 * A tick is evidence, so a tick must point at words somebody said. Every cell
 * marked evidenced or stated carries a quote, and the quote must appear in
 * the answers; a cell whose quote does not is downgraded to "asked, not
 * established" rather than trusted — whoever wrote it. And the wedge is ready
 * only when two companies share one evidenced problem, decided here.
 */
import crypto from 'crypto';
import IcpInterview from '../models/IcpInterview.js';
import IcpWedge from '../models/IcpWedge.js';

/** The four questions, asked word for word in every interview. */
export const QUESTIONS = [
  ['problem', 'What is one customer problem that happens repeatedly, but your team usually notices too late?'],
  ['example', 'Take the most recent example. What happened before you noticed it, and where was that information?'],
  ['detection', 'Who notices it today, how do they notice it, and what do they do once they know?'],
  ['value', 'If you had known about it earlier, what would you have done—and what would it have saved or earned you?'],
];

export const STATES = ['yes', 'open', 'claim', ''];

/**
 * Every row the answers can fill, with what it asks. Keys are the Target
 * Audience table's, so a filled cell lands in the row the page already draws.
 * q1–q4 are the summary table: one cell per question.
 */
export const ROWS = [
  ['q1', 'Summary of answer 1: is there a recurring customer problem found too late?'],
  ['q2', 'Summary of answer 2: did information exist before they noticed, and where?'],
  ['q3', 'Summary of answer 3: who notices, how, and what they do.'],
  ['q4', 'Summary of answer 4: what they would have done earlier, and what it is worth.'],
  ['kind', 'Problem type: retention, growth (including work delivered and never billed), or outside.'],
  ['frequency', 'It happens frequently: how often, in their words.'],
  ['signals', 'Warning signals already existed before they noticed.'],
  ['spread', 'Those signals are spread across more than one system or place.'],
  ['manual', 'Someone currently connects the dots by hand.'],
  ['late', 'The problem is discovered too late.'],
  ['cost', 'Late discovery has a measurable cost.'],
  ['action', 'There is a clear action once it is detected.'],
  ['measurable', 'Whether the action worked could be measured.'],
  ['icpline', 'who · workflow · problem · why too late · cost · action.'],
  ['bucket', 'Acute, Adjacent or Vanity, and why.'],
  ['reverse', 'How the problem is found today, as far as they described it.'],
  ['economics', 'The before-and-after arithmetic they gave, if any.'],
  ['same', 'The problem in one plain sentence, to compare across companies.'],
  ['buyer', 'Who owns the problem.'],
  ['workflow', 'The workflow it happens in.'],
  ['simsignals', 'The signals and the systems they sit in.'],
  ['simaction', 'The action they take, or would take.'],
  ['roi', 'What it is worth, as they stated it.'],
];

/**
 * Rows four answers never reach: whether a pilot was agreed, and whether
 * Svarg caught a real incident before the customer did. Filled only when
 * that has actually happened.
 */
export const MANUAL_ONLY = ['pilot', 'earlier'];
const KEYS = new Set([...ROWS.map(([k]) => k), ...MANUAL_ONLY]);

const norm = (s) => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

export function answersHash(answers = {}) {
  return crypto.createHash('sha1').update(QUESTIONS.map(([k]) => String(answers[k] || '').trim()).join('\u0000')).digest('hex').slice(0, 16);
}

/**
 * Cells, checked against the answers. A tick or a claim whose quote is not in
 * the answers is downgraded to open: it may be right, but nothing said
 * supports it, and this table is only worth something if every tick can be
 * traced. Returns the cells and the keys that were downgraded.
 */
export function checkCells(raw, answers) {
  const pool = norm(Object.values(answers || {}).join(' \n '));
  const out = {};
  const downgraded = [];
  for (const [key, c] of Object.entries(raw || {})) {
    if (!KEYS.has(key) || !c || typeof c !== 'object') continue;
    let state = STATES.includes(c.state) ? c.state : '';
    const quote = String(c.quote || '').trim().slice(0, 400);
    let text = String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if ((state === 'yes' || state === 'claim') && !MANUAL_ONLY.includes(key) && (!quote || !pool.includes(norm(quote)))) {
      state = 'open';
      text = text ? `${text} (Not traced to the answers — check it.)` : 'Not traced to the answers.';
      downgraded.push(key);
    }
    if (!text) text = state ? '' : 'Not asked';
    out[key] = { state, text, quote: state === 'yes' || state === 'claim' ? quote : '' };
  }
  return { cells: out, downgraded };
}

/** Merge new cells into the stored ones, keeping every cell written by hand earlier. */
export function mergeCells(existing = {}, filled = {}) {
  const out = { ...existing };
  for (const [k, c] of Object.entries(filled)) {
    if (out[k]?.edited) continue;
    out[k] = { ...c, edited: false };
  }
  return out;
}

const plainCells = (doc) => {
  const m = doc?.cells;
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries([...m.entries()].map(([k, v]) => [k, v?.toObject ? v.toObject() : v]));
  return { ...m };
};

export function view(doc, letter = '') {
  return {
    id: String(doc._id),
    letter,
    vertical: doc.vertical,
    company: doc.company,
    met: doc.met || '',
    when: doc.when || '',
    answers: {
      problem: doc.answers?.problem || '', example: doc.answers?.example || '',
      detection: doc.answers?.detection || '', value: doc.answers?.value || '',
    },
    cells: plainCells(doc),
    legacy: !!doc.legacy,
    filledAt: doc.filledAt || null,
  };
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export async function listInterviews(vertical) {
  const docs = await IcpInterview.find({ vertical }).sort({ order: 1, createdAt: 1 });
  return docs.map((d, i) => view(d, LETTERS[i] || String(i + 1)));
}

const clean = (s, n) => String(s || '').trim().slice(0, n);

/**
 * Record one interview: its four answers and the cells filled from them.
 * Upserted by vertical and company. Cells written by hand before (the
 * re-filed table) are kept unless `replace` is set.
 */
export async function recordInterview({ vertical, company, met, when, answers = {}, cells = {}, replace = false }) {
  if (!clean(vertical, 40)) throw new Error('Which vertical is this interview in?');
  if (!clean(company, 120)) throw new Error('Name the company.');
  const a = {
    problem: clean(answers.problem, 6000), example: clean(answers.example, 6000),
    detection: clean(answers.detection, 6000), value: clean(answers.value, 6000),
  };
  const checked = checkCells(cells, a);
  let doc = await IcpInterview.findOne({ vertical, company: clean(company, 120) });
  if (!doc) {
    const last = await IcpInterview.findOne({ vertical }).sort({ order: -1 }).lean();
    doc = new IcpInterview({ vertical, company: clean(company, 120), order: (last?.order || 0) + 1 });
  }
  if (met !== undefined) doc.met = clean(met, 120);
  if (when !== undefined) doc.when = clean(when, 60);
  doc.answers = a;
  doc.cells = replace ? mergeCells({}, checked.cells) : mergeCells(plainCells(doc), checked.cells);
  doc.filledFrom = answersHash(a);
  doc.filledAt = new Date();
  await doc.save();
  return { doc, downgraded: checked.downgraded };
}

// ── The wedge ────────────────────────────────────────────────────────────────

/**
 * Groups, checked: only real company letters, and "ready" is decided here —
 * two or more companies in one group whose problem is evidenced (a tick on
 * the problem summary, the one-line problem or its frequency).
 */
export function checkWedge(raw, interviews) {
  const letters = new Set(interviews.map((i) => i.letter));
  const evidenced = (letter) => {
    const c = interviews.find((i) => i.letter === letter)?.cells || {};
    return ['q1', 'same', 'frequency'].some((k) => c[k]?.state === 'yes');
  };
  const groups = (Array.isArray(raw?.groups) ? raw.groups : []).map((g) => {
    const companies = [...new Set((g.companies || []).map(String).filter((l) => letters.has(l)))];
    return {
      problem: clean(g.problem, 300), kind: clean(g.kind, 20), why: clean(g.why, 300),
      companies, evidenced: companies.filter(evidenced),
    };
  }).filter((g) => g.problem && g.companies.length)
    .sort((a, b) => b.evidenced.length - a.evidenced.length || b.companies.length - a.companies.length);
  const d = raw?.draft || {};
  return {
    groups,
    draft: { segment: clean(d.segment, 200), problem: clean(d.problem, 300), outcome: clean(d.outcome, 200), sentence: clean(d.sentence, 600) },
    ready: groups.some((g) => g.evidenced.length >= 2),
    reason: clean(raw?.reason, 400),
  };
}

export async function getWedge(vertical) {
  const doc = await IcpWedge.findOne({ vertical }).lean();
  return doc ? { ...doc, _id: undefined } : null;
}

/**
 * Record the wedge for a vertical. Companies may be named by letter or by
 * name. It locks only if asked AND ready: one company's problem is a
 * customer, not a market — the playbook's step 9, enforced.
 */
export async function recordWedge(vertical, { groups = [], draft = {}, reason = '', lock = false } = {}) {
  const interviews = await listInterviews(vertical);
  const letterOf = (x) => interviews.find((i) => i.letter === x || i.company.toLowerCase() === String(x).toLowerCase())?.letter || x;
  const result = checkWedge({ groups: groups.map((g) => ({ ...g, companies: (g.companies || []).map(letterOf) })), draft, reason }, interviews);
  if (lock && !result.ready) throw new Error('It locks once two companies share one evidenced problem.');
  await IcpWedge.updateOne({ vertical }, {
    $set: { ...result, foundAt: new Date(), error: '', locked: lock ? result.draft.sentence : '', lockedAt: lock ? new Date() : null },
  }, { upsert: true });
  return getWedge(vertical);
}
