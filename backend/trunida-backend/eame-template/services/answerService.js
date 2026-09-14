/**
 * The answer, end to end.
 *
 * ── Why this is not one prompt ─────────────────────────────────────────────
 *
 * It used to be. The application's generated service read some records, put
 * them in a prompt, and whatever came back was the answer. That produces the
 * failure a customer notices in one glance: prose saying "4 players missed
 * practice" above six cards, one of them the same student twice. The sentence
 * was written by a model that was counting, and the cards were built by code
 * that was filtering — two different lists, and nothing checking they agreed.
 *
 * A model cannot be asked to count reliably, and it must not be the thing that
 * decides whether two rows are the same person. So the work is split:
 *
 *   PLAN        the model reads the question and the dataset catalogue and
 *               says WHICH rows matter — dataset, filters, category, and what
 *               identifies a person. It chooses; it does not count.
 *   GATHER      code runs those filters over the real rows, groups them,
 *               resolves entities by key, and counts. Every number the
 *               customer sees is produced here.
 *   SAY         the model writes the sentence, and is given the numbers rather
 *               than asked for them.
 *   CHECK       every number in that sentence must be one code computed. A
 *               sentence that invents a figure is replaced by one built from
 *               the facts, because a wrong number is worse than a plain one.
 *
 * ── What it reads ──────────────────────────────────────────────────────────
 *
 * The generic data layer (connectorService), which every application has: the
 * dataset index, its columns, its key, and its rows — the owner's and the
 * simulated ones, kept apart. Nothing here knows what a roll call is, which is
 * exactly why it works in every application without being written again.
 */

import { readIndex, findDataset, readAllRows, datasetKey, keyColumns } from './connectorService.js';
import { generate, generateRaw } from './llmService.js';

/** Rows read per dataset for one question. Beyond this the model gets counts, not rows. */
const SCAN_LIMIT = 4000;
/** Rows shown as evidence, and rows handed to the model to write from. */
const EVIDENCE_LIMIT = 40;
const SAMPLE_FOR_MODEL = 25;

/** The categories a group may carry. Kept apart so a count never merges two of them. */
export const CATEGORIES = {
  absent:       { label: 'Absent',            tone: 'bad' },
  excused:      { label: 'Excused',           tone: 'warn' },
  unconfirmed:  { label: 'Not confirmed',     tone: 'warn' },
  discrepancy:  { label: 'Needs review',      tone: 'warn' },
  overdue:      { label: 'Overdue',           tone: 'bad' },
  due:          { label: 'Due',               tone: 'warn' },
  present:      { label: 'Present',           tone: 'ok' },
  info:         { label: '',                  tone: 'ok' },
};
const CATEGORY_KEYS = Object.keys(CATEGORIES);

const norm = (s) => String(s ?? '').trim().toLowerCase();

// ── What the application holds, as the model is told it ─────────────────────

/**
 * The catalogue: every dataset, its columns, its key, how many rows it holds,
 * and a few real values per column so the model can write a filter that
 * matches the data rather than one that matches its expectations. Values are
 * the customer's, so only a handful of distinct ones go, and only from short
 * columns — a free-text note is not a value to filter on.
 */
export async function catalogue(kind = 'own') {
  const out = [];
  for (const d of readIndex()) {
    const all = await readAllRows(d, kind);
    const columns = all.columns;
    const values = columns.map((_, i) => {
      const seen = new Set();
      for (const r of all.rows) {
        const v = String(r.cells[i] ?? '').trim();
        if (v && v.length <= 32) seen.add(v);
        if (seen.size >= 6) break;
      }
      return [...seen];
    });
    out.push({ name: d.name, columns, key: datasetKey(d), rows: all.rows.length, values });
  }
  return out;
}

function catalogueText(cat) {
  if (!cat.length) return '(this application holds no datasets yet)';
  return cat.map(d => {
    const cols = d.columns.map((c, i) => {
      const v = d.values[i];
      return v && v.length ? `${c} (e.g. ${v.slice(0, 4).join(', ')})` : c;
    }).join('; ');
    return `- "${d.name}" — ${d.rows} rows, identified by ${d.key || 'no key'}\n  columns: ${cols}`;
  }).join('\n');
}

// ── 1. PLAN ─────────────────────────────────────────────────────────────────

const PLAN_RULES = [
  'You are choosing which records answer a question. You do not answer it and you do not count.',
  '',
  'Return ONLY JSON, no prose and no code fence:',
  '{"groups":[{"label":"...","dataset":"...","category":"absent|excused|unconfirmed|discrepancy|overdue|due|present|info",',
  '  "where":[["column","is|is not|contains|is any of|empty|not empty|before|after",": value"]],"entity":"column or null"}],',
  ' "intent":"question|action","act":"what the customer wants done, or null","reason":"one short line"}',
  '',
  'RULES',
  '- Use dataset and column names EXACTLY as given. A name you invent returns nothing.',
  '- ONE GROUP PER CATEGORY. "Absent" and "attendance looks wrong" are two different things',
  '  and must never share a group: the customer acts on them differently. If the question asks',
  '  who missed practice, the confirmed absences are one group and anything ambiguous is a',
  '  second group with category "discrepancy".',
  '- "entity" is the column naming the PERSON or THING the question is about (a student name or',
  '  id), so two rows for the same person count once. Null only when the rows are not about a',
  '  person or thing that can repeat.',
  '- Prefer few groups. Two or three is a good answer; eight is a data dump.',
  '- If the question spans several datasets (attendance AND fees), give a group for each.',
  '- NARROWING A PREVIOUS ANSWER: when the customer says "their", "them", "those" or names a',
  '  subset of what you just listed, filter to exactly those with "is any of" and a list',
  '  separated by | — for example ["player_name","is any of","Arjun Bose|Rohan Sharma"]. The',
  '  names are in the conversation above. Do not start again from the whole dataset.',
  '- DATES: today\'s date is given below. Work out the range the question asks for and express',
  '  it with before/after against the date column, written in the SAME SHAPE as that column\'s',
  '  example values — if they read 12/09/2026 do not write 2026-09-12. If the column\'s shape',
  '  cannot express the range, leave the filter out rather than inventing one.',
  '- If nothing in the catalogue can answer it, return {"groups":[],"intent":"question","act":null,',
  '  "reason":"why not"}. Do not invent a dataset to be helpful.',
].join('\n');

/** What the planner needs to turn "today" or "this week" into a filter. */
function today() {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const fmt = (x) => x.toISOString().slice(0, 10);
  return [
    `TODAY is ${iso} (${d.toLocaleDateString('en-GB', { weekday: 'long' })}).`,
    `This week began ${fmt(monday)}. Last week ran ${fmt(lastMonday)} to ${fmt(new Date(monday.getTime() - 86400000))}.`,
    `This month began ${iso.slice(0, 8)}01.`,
  ].join(' ');
}

const OPS = new Set(['is', 'is not', 'contains', 'is any of', 'empty', 'not empty', 'before', 'after']);
/** "is any of" carries a list: Arjun Bose | Rohan Sharma | Tanvi Reddy. */
const ANY_SEP = '|';

/** The model's plan, made safe: unknown datasets, columns, categories and operators are dropped. */
export function sanitisePlan(raw, cat) {
  const byName = new Map(cat.map(d => [d.name, d]));
  const groups = [];
  for (const g of Array.isArray(raw?.groups) ? raw.groups : []) {
    const d = byName.get(String(g?.dataset || ''));
    if (!d) continue;
    const cols = new Set(d.columns);
    const where = (Array.isArray(g.where) ? g.where : [])
      .filter(w => Array.isArray(w) && cols.has(String(w[0])) && OPS.has(String(w[1])))
      .map(w => [String(w[0]), String(w[1]), String(w[2] ?? '').replace(/^:\s*/, '')]);
    groups.push({
      label: String(g.label || d.name).slice(0, 60),
      dataset: d.name,
      category: CATEGORY_KEYS.includes(String(g.category)) ? String(g.category) : 'info',
      where,
      entity: cols.has(String(g.entity)) ? String(g.entity) : null,
    });
    if (groups.length >= 6) break;
  }
  return {
    groups,
    intent: raw?.intent === 'action' ? 'action' : 'question',
    act: raw?.act ? String(raw.act).slice(0, 200) : null,
    reason: String(raw?.reason || '').slice(0, 200),
  };
}

async function plan({ question, history, cat }) {
  const prior = history.length
    ? `\nEARLIER IN THIS CONVERSATION (resolve "them", "their", "those" against it):\n${history.map(h => `${h.role === 'user' ? 'Customer' : 'You'}: ${h.text}`).join('\n')}\n`
    : '';
  // generateRaw: this is a classification, not an answer to a person, so the
  // conduct written for a reader would only get in its way.
  const res = await generateRaw({
    systemPrompt: `${PLAN_RULES}\n\n${today()}\n\nTHE DATASETS\n${catalogueText(cat)}`,
    userMessage: `${prior}\nQuestion: ${question}`,
    maxTokens: 700,
  });
  let parsed = null;
  try {
    const t = String(res?.text || '').replace(/```json|```/g, '').trim();
    parsed = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch { parsed = null; }
  return sanitisePlan(parsed, cat);
}

// ── 2. GATHER ───────────────────────────────────────────────────────────────

function matches(cells, columns, where) {
  return where.every(([col, op, val]) => {
    const cell = norm(cells[columns.indexOf(col)]);
    const v = norm(val);
    switch (op) {
      case 'is':         return cell === v;
      case 'is not':     return cell !== v;
      case 'contains':   return v ? cell.includes(v) : false;
      // Narrowing to the people just named: the only way a follow-up like
      // "what about their fees?" can become a filter over the same set.
      case 'is any of':  return String(val).split(ANY_SEP).map(x => norm(x)).filter(Boolean).includes(cell);
      case 'empty':      return cell === '';
      case 'not empty':  return cell !== '';
      case 'before':     return cell !== '' && cell < v;
      case 'after':      return cell !== '' && cell > v;
      default:           return false;
    }
  });
}

/**
 * One group's rows, with entities resolved.
 *
 * `records` is how many rows matched. `entities` is how many distinct people
 * or things those rows are about. They differ whenever someone appears twice
 * — in two batches, on two days — and the difference is the whole point: a
 * sentence that says "6 students" over 6 rows covering 5 people is wrong, and
 * only code can tell.
 */
export function resolveGroup(group, columns, rows) {
  const idx = group.entity ? columns.indexOf(group.entity) : -1;
  const items = [];
  const byEntity = new Map();
  for (const r of rows) {
    const name = idx >= 0 ? String(r.cells[idx] ?? '').trim() : '';
    const key = idx >= 0 ? norm(name) : null;
    const record = { cells: r.cells, source: r.source };
    if (key) {
      if (!byEntity.has(key)) byEntity.set(key, { name, records: [] });
      byEntity.get(key).records.push(record);
    } else {
      items.push({ name: '', records: [record] });
    }
  }
  const entities = [...byEntity.values(), ...items];
  return {
    ...group,
    columns,
    records: rows.length,
    entities: entities.length,
    // One entry per person, carrying every row they appear in: a student in
    // two batches is one line with two notes, never two students.
    items: entities.slice(0, EVIDENCE_LIMIT),
  };
}

async function gather(planned, kind) {
  const groups = [];
  for (const g of planned.groups) {
    const d = findDataset(g.dataset);
    if (!d) continue;
    const all = await readAllRows(d, kind);
    const rows = all.rows.slice(0, SCAN_LIMIT).filter(r => matches(r.cells, all.columns, g.where));
    groups.push(resolveGroup(g, all.columns, rows));
  }
  return groups;
}

/**
 * The people who appear in more than one group.
 *
 * "6 haven't confirmed and 7 are overdue" is 13 issues, and it is NOT 13
 * students — some of them are the same person twice, and telling a customer to
 * chase 13 people when there are 9 is a bill they did not owe.
 */
export function overlap(groups) {
  const seen = new Map();
  for (const g of groups) {
    for (const it of g.items) {
      if (!it.name) continue;
      const k = norm(it.name);
      if (!seen.has(k)) seen.set(k, { name: it.name, groups: [] });
      if (!seen.get(k).groups.includes(g.label)) seen.get(k).groups.push(g.label);
    }
  }
  const people = [...seen.values()];
  return {
    people: people.length,
    both: people.filter(p => p.groups.length > 1),
    issues: groups.reduce((n, g) => n + g.records, 0),
  };
}

// ── 3. SAY ──────────────────────────────────────────────────────────────────

function factsText(groups, cross) {
  if (!groups.length) return 'Nothing in the connected data matches this question.';
  const lines = groups.map(g =>
    `- ${g.label} (${CATEGORIES[g.category].label || g.category}): ${g.records} records, ${g.entities} distinct ${g.entity ? g.entity : 'rows'}`
    + (g.items.length ? `\n  ${g.items.slice(0, SAMPLE_FOR_MODEL).map(i => i.name || i.records[0].cells.slice(0, 3).join(' · ')).join('; ')}` : ''));
  if (cross.both.length) {
    lines.push(`- ${cross.both.length} of them appear in more than one of the groups above: ${cross.both.slice(0, 10).map(p => p.name).join(', ')}`);
    lines.push(`- across all groups: ${cross.issues} records, ${cross.people} distinct people`);
  }
  return lines.join('\n');
}

const SAY_RULES = [
  'Write the answer to the question. One sentence first, then at most two more if they add',
  'something. The records themselves are listed under your sentence by the application, so do',
  'not list them again.',
  '',
  'THE NUMBERS ARE GIVEN TO YOU. Use only figures that appear in the facts below. Do not add,',
  'total or estimate — if you want a number that is not there, do not use one.',
  '',
  'Keep categories apart. If the facts have absences and things needing review, they are',
  'different and the sentence must not merge them into one count.',
  '',
  'If the facts are empty, say plainly that the connected data does not answer this, name what',
  'is missing, and stop.',
].join('\n');

async function say({ question, groups, cross, notes, appName }) {
  const res = await generate({
    systemPrompt: SAY_RULES,
    userMessage: `Question: ${question}\n\nFACTS (the only numbers you may use)\n${factsText(groups, cross)}`
      + (notes.length ? `\n\nLIMITS\n${notes.join('\n')}` : ''),
    maxTokens: 320,
  });
  return String(res?.text || '').trim();
}

// ── 4. CHECK ────────────────────────────────────────────────────────────────

/** Every integer a sentence may contain: the ones code computed. */
export function allowedNumbers(groups, cross) {
  const ok = new Set([0, 1]);
  for (const g of groups) { ok.add(g.records); ok.add(g.entities); }
  ok.add(cross.issues); ok.add(cross.people); ok.add(cross.both.length);
  return ok;
}

/**
 * A number in the prose that code cannot explain is a number the model made
 * up, and the customer has no way to tell. Years and money are left alone —
 * they come from the records, not from counting.
 */
export function unsupportedNumbers(text, allowed) {
  const bad = [];
  for (const m of String(text).matchAll(/(?<![\w₹$£€.,])(\d{1,4})(?![\w.,%])/g)) {
    const n = Number(m[1]);
    if (n >= 1900 && n <= 2100) continue;
    if (!allowed.has(n)) bad.push(n);
  }
  return [...new Set(bad)];
}

/** What to say when the model's sentence cannot be trusted: the facts, plainly. */
export function composeAnswer(groups, cross) {
  if (!groups.length) return 'I cannot answer that from the connected data.';
  const parts = groups.map(g => {
    const what = g.entity ? `${g.entities} ${g.entities === 1 ? 'record' : 'records'}` : `${g.records} rows`;
    return `${g.label}: ${g.entity ? g.entities : g.records}`;
  });
  const head = groups.length === 1
    ? `${groups[0].entity ? groups[0].entities : groups[0].records} in ${groups[0].label.toLowerCase()}.`
    : `${parts.join('; ')}.`;
  return cross.both.length
    ? `${head} ${cross.both.length} appear in more than one of these, so this is ${cross.issues} items across ${cross.people} people.`
    : head;
}

// ── The envelope ────────────────────────────────────────────────────────────

/** What the page draws. Nothing here is prose the renderer has to parse. */
function envelope({ answer, groups, cross, notes, planned, kind, checked }) {
  return {
    answer,
    groups: groups.map(g => ({
      label: g.label,
      category: g.category,
      categoryLabel: CATEGORIES[g.category].label,
      tone: CATEGORIES[g.category].tone,
      records: g.records,
      entities: g.entities,
      dataset: g.dataset,
      columns: g.columns,
      items: g.items.map(i => ({
        name: i.name,
        // A person in two batches: one entry, one line per row they are in.
        lines: i.records.slice(0, 6).map(r => r.cells),
        records: i.records.length,
        source: i.records[0]?.source || '',
      })),
    })),
    overlap: cross.both.length ? { people: cross.people, issues: cross.issues, both: cross.both.slice(0, 12) } : null,
    sources: groups.map(g => ({ dataset: g.dataset, records: g.records })),
    simulated: kind === 'sample',
    notes,
    intent: planned.intent,
    act: planned.act,
    checked,
  };
}

/**
 * The answer to one question.
 *
 * `history` is the turns before this one, so "what about their fees?" resolves
 * against the students just named rather than asking the customer to say them
 * again.
 */
export async function answer({ question, history = [], kind = 'own', appName = '' }) {
  const notes = [];
  const q = String(question || '').trim();
  if (!q) return envelope({ answer: '', groups: [], cross: { people: 0, both: [], issues: 0 }, notes, planned: { intent: 'question', act: null }, kind, checked: true });

  /*
   * The customer's records if there are any, the simulated ones if not.
   *
   * An application goes live with the rows it was built on and no rows of its
   * own, and in that state every question was being answered "there are no
   * records connected to this application yet" — while the application sat on
   * a full set of simulated ones and the Data page listed them. That reads as
   * broken, not as careful. So it answers from what it has and says which it
   * used; the page carries that as a standing mark rather than a sentence
   * repeated on every reply.
   */
  let used = kind;
  let cat = await catalogue(used);
  const bare = (c) => !c.length || c.every(d => d.rows === 0);
  if (bare(cat) && kind === 'own') {
    const simulated = await catalogue('sample');
    if (!bare(simulated)) {
      used = 'sample';
      cat = simulated;
      // Deliberately NOT a note: notes are given to the model and come back
      // restated in the answer. The envelope flag simulated carries this instead,
      // and the page shows it once, standing, beside the application's name.
    }
  }
  if (bare(cat)) {
    notes.push('No records have been connected yet.');
    return envelope({
      answer: 'There are no records connected to this application yet, so I cannot answer from data. Connect a source on the Data page and ask again.',
      groups: [], cross: { people: 0, both: [], issues: 0 }, notes,
      planned: { intent: 'question', act: null }, kind: used, checked: true,
    });
  }

  const planned = await plan({ question: q, history: history.slice(-6), cat });
  const groups = await gather(planned, used);
  const cross = overlap(groups);

  if (!groups.length) {
    notes.push(planned.reason || 'Nothing in the connected data matches this question.');
    return envelope({
      answer: `I cannot tell that from the connected data. ${planned.reason || ''}`.trim(),
      groups: [], cross, notes, planned, kind: used, checked: true,
    });
  }

  // A group the plan asked for that matched nothing is worth saying: it is the
  // difference between "nobody is overdue" and "we hold nothing about fees".
  for (const g of groups) {
    if (g.records === 0) notes.push(`No rows in ${g.dataset} matched ${g.label.toLowerCase()}.`);
  }

  let text = await say({ question: q, groups, cross, notes, appName });
  const allowed = allowedNumbers(groups, cross);
  let checked = true;
  const bad = unsupportedNumbers(text, allowed);
  if (bad.length) {
    // Once more, told exactly which figure was not ours. If it happens again
    // the sentence is built from the facts instead: a plain answer beats a
    // confident wrong one.
    const retry = await say({
      question: `${q}\n\n(Your previous answer used ${bad.join(', ')}, which is not in the facts. Use only the numbers given.)`,
      groups, cross, notes, appName,
    });
    if (unsupportedNumbers(retry, allowed).length) { text = composeAnswer(groups, cross); checked = false; }
    else text = retry;
  }

  return envelope({ answer: text, groups, cross, notes, planned, kind: used, checked });
}
