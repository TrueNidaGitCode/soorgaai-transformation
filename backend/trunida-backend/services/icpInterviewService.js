/**
 * ICP interviews: four answers in, the ten-step playbook and the wedge out.
 *
 * ── What the owner asked for (6 October 2026) ──────────────────────────────
 *
 * Four questions, the same in every interview. The answers are typed as
 * notes; the playbook's rows fill themselves from them; and across a
 * vertical's companies the wedge is found rather than written. Decisions:
 * the AI fills and a person confirms; the AI groups companies by the SAME
 * problem; the three hand-written companies are re-filed under the four
 * questions, word for word.
 *
 * ── The rule the AI is held to ─────────────────────────────────────────────
 *
 * A tick is evidence, so a tick must point at words somebody said. Every cell
 * marked evidenced or stated carries a quote, and the quote must appear in
 * the answers; a cell whose quote does not is downgraded to "asked, not
 * established" rather than trusted. A row the four questions do not reach —
 * whether a pilot was agreed — is never filled by the AI at all.
 */
import crypto from 'crypto';
import IcpInterview from '../models/IcpInterview.js';
import IcpWedge from '../models/IcpWedge.js';
import { generate } from './llmService.js';

/** The four questions, asked word for word in every interview. */
export const QUESTIONS = [
  ['problem', 'What is one customer problem that happens repeatedly, but your team usually notices too late?'],
  ['example', 'Take the most recent example. What happened before you noticed it, and where was that information?'],
  ['detection', 'Who notices it today, how do they notice it, and what do they do once they know?'],
  ['value', 'If you had known about it earlier, what would you have done—and what would it have saved or earned you?'],
];

export const STATES = ['yes', 'open', 'claim', ''];

/**
 * Every row the answers can fill, with what it asks — the AI's instructions,
 * one line each. Keys are the Target Audience table's, so a filled cell lands
 * in the row the page already draws.
 *
 * q1–q4 are the summary table: one cell per question, saying what that
 * answer established.
 */
export const ROWS = [
  ['q1', 'Summary of answer 1: is there a recurring customer problem found too late?'],
  ['q2', 'Summary of answer 2: did information exist before they noticed, and where?'],
  ['q3', 'Summary of answer 3: who notices, how, and what they do.'],
  ['q4', 'Summary of answer 4: what they would have done earlier, and what it is worth.'],
  ['kind', 'Problem type: retention (a customer drifting away), growth (a customer ready to buy more, or work delivered and never billed), or outside (acquiring new customers, internal operations). Text starts with the type.'],
  ['frequency', 'It happens frequently: how often, in their words.'],
  ['signals', 'Warning signals already existed before they noticed.'],
  ['spread', 'Those signals are spread across more than one system or place.'],
  ['manual', 'Someone currently connects the dots by hand.'],
  ['late', 'The problem is discovered too late: when they notice compared with when it started.'],
  ['cost', 'Late discovery has a measurable cost.'],
  ['action', 'There is a clear action once it is detected.'],
  ['measurable', 'Whether the action worked could be measured.'],
  ['icpline', 'One line in the order: who · workflow · problem · why too late · cost · action. Use "not asked" for parts not covered.'],
  ['bucket', 'Acute, Adjacent or Vanity, and why. Acute only if the problem is frequent AND has a cost they gave.'],
  ['reverse', 'How the problem is found today, as far as they described the workflow. "open" unless they walked through it step by step.'],
  ['economics', 'The before-and-after arithmetic they gave, if any. "claim" if a figure was stated but not counted.'],
  ['same', 'The problem in one plain sentence, so it can be compared with other companies.'],
  ['buyer', 'Who owns the problem.'],
  ['workflow', 'The workflow it happens in, as a chain with arrows.'],
  ['simsignals', 'The signals and the systems they sit in.'],
  ['simaction', 'The action they take, or would take.'],
  ['roi', 'What it is worth, as they stated it.'],
];
const KEYS = new Set(ROWS.map(([k]) => k));

/**
 * Rows only a person can fill: nothing in four answers says a pilot was
 * agreed, or that Svarg caught a real incident before the customer did.
 */
export const MANUAL_ONLY = ['pilot', 'earlier'];

const norm = (s) => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

export function answersText(answers = {}) {
  return QUESTIONS.map(([k, q], i) => `Q${i + 1}. ${q}\nA${i + 1}. ${String(answers[k] || '').trim() || '(not answered)'}`).join('\n\n');
}

export function answersHash(answers = {}) {
  return crypto.createHash('sha1').update(QUESTIONS.map(([k]) => String(answers[k] || '').trim()).join('\u0000')).digest('hex').slice(0, 16);
}

const SYSTEM = `You fill a sales validation table from one customer interview.

You are given the four questions and the interviewer's notes of the answers,
and a list of ROWS. For each row return a cell:

{ "state": "yes" | "open" | "claim" | "", "text": "...", "quote": "..." }

- "yes": the answers clearly establish it. "quote" is the exact words from the
  answers that establish it, copied character for character.
- "claim": a figure or outcome was stated but not counted. Quote it too.
- "open": the answers touch it but do not establish it. Say what is missing.
- "": the answers do not cover it. text is "Not asked".
- text: one or two short plain sentences, in the business's own terms.
- Never invent a number, name or system that is not in the answers.
- A wish or a guess is not evidence; mark it "open".

Return JSON only: { "cells": { "<row key>": { ... }, ... } }`;

/**
 * The model's cells, checked. A tick or a claim whose quote is not in the
 * answers is downgraded to open: it may be right, but nothing said supports
 * it, and this table is only worth something if every tick can be traced.
 */
export function checkCells(raw, answers) {
  const pool = norm(Object.values(answers || {}).join(' \n '));
  const out = {};
  const cells = raw && typeof raw === 'object' ? (raw.cells || raw) : {};
  for (const [key, c] of Object.entries(cells || {})) {
    if (!KEYS.has(key) || !c || typeof c !== 'object') continue;
    let state = STATES.includes(c.state) ? c.state : '';
    const quote = String(c.quote || '').trim().slice(0, 400);
    let text = String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if ((state === 'yes' || state === 'claim') && (!quote || !pool.includes(norm(quote)))) {
      state = 'open';
      text = text ? `${text} (Not traced to the answers — check it.)` : 'Not traced to the answers.';
    }
    if (!text) text = state ? '' : 'Not asked';
    out[key] = { state, text, quote: state === 'yes' || state === 'claim' ? quote : '' };
  }
  return out;
}

/** Ask the model to fill one interview. Throws a readable error when it cannot. */
export async function fillCells(answers) {
  const answered = QUESTIONS.filter(([k]) => String(answers?.[k] || '').trim()).length;
  if (!answered) throw new Error('Write at least one answer first.');
  const { text } = await generate({
    systemPrompt: SYSTEM,
    userMessage: `${answersText(answers)}\n\nROWS\n${ROWS.map(([k, d]) => `${k}: ${d}`).join('\n')}`,
    maxTokens: 3500,
    thinking: false,
    label: 'icp-fill',
  });
  let parsed = null;
  try {
    const t = String(text || '').replace(/```json|```/g, '').trim();
    parsed = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch { parsed = null; }
  const cells = checkCells(parsed, answers);
  if (!Object.keys(cells).length) throw new Error('The reply could not be read. Try again.');
  return cells;
}

/** Merge a fill into the stored cells, keeping every cell a person edited. */
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
  const cells = plainCells(doc);
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
    cells,
    legacy: !!doc.legacy,
    filledAt: doc.filledAt || null,
    fillError: doc.fillError || '',
    // The answers moved on since the playbook was filled from them.
    stale: !!doc.filledFrom && doc.filledFrom !== answersHash(doc.answers || {}),
    unfilled: !doc.filledFrom && !doc.legacy,
  };
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export async function listInterviews(vertical) {
  const docs = await IcpInterview.find({ vertical }).sort({ order: 1, createdAt: 1 }).lean(false);
  return docs.map((d, i) => view(d, LETTERS[i] || String(i + 1)));
}

const clean = (s, n) => String(s || '').trim().slice(0, n);

function cleanAnswers(a = {}) {
  return {
    problem: clean(a.problem, 4000), example: clean(a.example, 4000),
    detection: clean(a.detection, 4000), value: clean(a.value, 4000),
  };
}

export async function createInterview({ vertical, company, met, when, answers }) {
  if (!clean(vertical, 40)) throw new Error('Which vertical is this interview in?');
  if (!clean(company, 120)) throw new Error('Name the company.');
  const last = await IcpInterview.findOne({ vertical }).sort({ order: -1 }).lean();
  const doc = await IcpInterview.create({
    vertical: clean(vertical, 40), company: clean(company, 120), met: clean(met, 120), when: clean(when, 60),
    answers: cleanAnswers(answers), order: (last?.order || 0) + 1,
  });
  return doc;
}

export async function updateInterview(id, { company, met, when, answers }) {
  const doc = await IcpInterview.findById(id);
  if (!doc) throw new Error('No such interview.');
  if (company !== undefined) doc.company = clean(company, 120) || doc.company;
  if (met !== undefined) doc.met = clean(met, 120);
  if (when !== undefined) doc.when = clean(when, 60);
  if (answers !== undefined) doc.answers = { ...cleanAnswers({ ...doc.answers?.toObject?.() || doc.answers, ...answers }) };
  await doc.save();
  return doc;
}

/** Fill the playbook from the answers, keeping cells a person edited. */
export async function fillInterview(id) {
  const doc = await IcpInterview.findById(id);
  if (!doc) throw new Error('No such interview.');
  const answers = doc.answers?.toObject ? doc.answers.toObject() : (doc.answers || {});
  try {
    const filled = await fillCells(answers);
    doc.cells = mergeCells(plainCells(doc), filled);
    doc.filledFrom = answersHash(answers);
    doc.filledAt = new Date();
    doc.fillError = '';
  } catch (err) {
    doc.fillError = String(err.message || err).slice(0, 300);
    await doc.save();
    throw err;
  }
  await doc.save();
  return doc;
}

/** A person's correction to one cell. It is kept through every later fill. */
export async function editCell(id, key, { state, text }) {
  if (!KEYS.has(key) && !MANUAL_ONLY.includes(key)) throw new Error('That is not a row of the playbook.');
  if (!STATES.includes(state)) throw new Error('Choose evidenced, asked, stated or not asked.');
  const doc = await IcpInterview.findById(id);
  if (!doc) throw new Error('No such interview.');
  const cells = plainCells(doc);
  cells[key] = { state, text: clean(text, 600), quote: cells[key]?.quote || '', edited: true };
  doc.cells = cells;
  await doc.save();
  return doc;
}

export async function removeInterview(id) {
  await IcpInterview.deleteOne({ _id: id });
}

// ── The wedge ────────────────────────────────────────────────────────────────

const WEDGE_SYSTEM = `You find the product wedge in a set of customer interviews.

Group the companies by the SAME customer problem — the same thing going wrong,
in the same workflow, noticed too late for the same reason. Same category is
not enough: "a customer drifting" and "a bill never raised" are different
problems even if both cost revenue.

Then draft one wedge sentence for the strongest group:
"Svarg helps [segment] identify [problem] before [costly outcome], using
signals already available across their existing systems."
Use the companies' own words. Invent nothing.

Return JSON only:
{
  "groups": [ { "problem": "...", "kind": "retention|growth|outside", "companies": ["A","C"], "why": "what makes it the same problem" } ],
  "draft": { "segment": "...", "problem": "...", "outcome": "...", "sentence": "..." },
  "reason": "one sentence: why this group, and what is still missing"
}`;

export function wedgeInput(interviews) {
  return interviews.map((iv) => {
    const c = iv.cells || {};
    const cell = (k) => (c[k] ? `${c[k].state || 'not asked'}: ${c[k].text || ''}` : 'not asked');
    return [
      `Company ${iv.letter}: ${iv.company}${iv.met ? ` (met: ${iv.met})` : ''}`,
      `  Problem (their words): ${iv.answers.problem || '(not answered)'}`,
      `  Problem, one line: ${cell('same')}`,
      `  Type: ${cell('kind')}`,
      `  Frequency: ${cell('frequency')}`,
      `  Cost: ${cell('cost')}`,
      `  Action: ${cell('action')}`,
    ].join('\n');
  }).join('\n\n');
}

/**
 * The model's grouping, checked: only real company letters, and "ready" is
 * decided here, not by the model — two or more companies in one group whose
 * problem is evidenced (a tick on the problem or its frequency).
 */
export function checkWedge(raw, interviews) {
  const letters = new Set(interviews.map((i) => i.letter));
  const evidenced = (letter) => {
    const iv = interviews.find((i) => i.letter === letter);
    const c = iv?.cells || {};
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

export function interviewsHash(interviews) {
  return crypto.createHash('sha1').update(interviews.map((i) => `${i.id}:${JSON.stringify(i.cells)}:${answersHash(i.answers)}`).join('|')).digest('hex').slice(0, 16);
}

export async function getWedge(vertical, interviews = null) {
  const doc = await IcpWedge.findOne({ vertical }).lean();
  if (!doc) return null;
  const list = interviews || await listInterviews(vertical);
  return { ...doc, _id: undefined, stale: !!doc.foundFrom && doc.foundFrom !== interviewsHash(list) };
}

export async function findWedge(vertical) {
  const interviews = await listInterviews(vertical);
  if (interviews.length < 1) throw new Error('No interviews in this vertical yet.');
  let result;
  try {
    const { text } = await generate({
      systemPrompt: WEDGE_SYSTEM,
      userMessage: wedgeInput(interviews),
      maxTokens: 1500,
      thinking: false,
      label: 'icp-wedge',
    });
    const t = String(text || '').replace(/```json|```/g, '').trim();
    result = checkWedge(JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)), interviews);
  } catch (err) {
    await IcpWedge.updateOne({ vertical }, { $set: { error: String(err.message || err).slice(0, 300) } }, { upsert: true });
    throw err;
  }
  await IcpWedge.updateOne({ vertical }, {
    $set: { ...result, foundFrom: interviewsHash(interviews), foundAt: new Date(), error: '' },
  }, { upsert: true });
  return getWedge(vertical, interviews);
}

/**
 * Lock the wedge, or unlock it with empty text. It locks only once two
 * companies share one evidenced problem: one company's problem is a
 * customer, not a market — the playbook's step 9, enforced.
 */
export async function lockWedge(vertical, text) {
  const t = clean(text, 600);
  if (t) {
    const w = await IcpWedge.findOne({ vertical }).lean();
    if (!w?.ready) throw new Error('It locks once two companies share one evidenced problem.');
  }
  await IcpWedge.updateOne({ vertical }, { $set: { locked: t, lockedAt: t ? new Date() : null } }, { upsert: true });
  return getWedge(vertical);
}
