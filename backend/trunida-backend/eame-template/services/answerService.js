/**
 * The answer, end to end.
 *
 * ── What went wrong with the version before this ──────────────────────────
 *
 * It could do exactly one thing: select rows where a column equals a value.
 * Everything it could not express came back as "I cannot tell that from the
 * connected data" — and that sentence was a lie about the data. The roll calls
 * DO say who was absent this week. The roster DOES say who is overdue. What
 * was missing was the reasoning between the question and the rows, so the
 * refusal was about the pipeline while sounding like it was about the records.
 *
 * The words a customer uses are now work to be done, not filters to match.
 * "This week" is a range computed here and matched against dates written five
 * different ways. "Poor attendance" is a count per person and a threshold.
 * "Both X and Y" is a join on the person. "Needs attention" is several of
 * those, ranked. Each is a typed STEP; the model chooses which steps to run,
 * and code runs them.
 *
 *   UNDERSTAND   the question, the conversation before it, and what the
 *                datasets hold -> a plan of steps, and a reading to say aloud
 *   EXECUTE      retrieve -> join -> calculate -> deduplicate -> classify
 *   VALIDATE     counts, entities, duplicates, contradictions, categories,
 *                time windows, sources -> one of five states
 *   ANSWER       the model writes the sentence from validated facts, and every
 *                number in it must be one code computed
 *
 * The model never counts, never joins, and never decides whether two rows are
 * the same person.
 *
 * ── Before refusing ───────────────────────────────────────────────────────
 *
 * A plan that comes back empty is asked again, once, with the datasets spelled
 * out and derivation demanded. Only if that is empty too does the answer say
 * the data cannot support the question — and then it says what is missing.
 */

import { readIndex, findDataset, readAllRows, datasetKey, dataVersion } from './connectorService.js';
import { generate, generateRaw } from './llmService.js';
import {
  parseDate, windowRange, inWindow, dateCoverage, deriveByEntity,
  matchesAll, joinOnEntity, validate, OPS,
} from './reasoning.js';

const SCAN_LIMIT = 5000;
const EVIDENCE_LIMIT = 40;
const SAMPLE_FOR_MODEL = 25;

/** The categories a group may carry. Kept apart so a count never merges two. */
export const CATEGORIES = {
  absent:       { label: 'Absent',        tone: 'bad' },
  excused:      { label: 'Excused',       tone: 'warn' },
  unconfirmed:  { label: 'Not confirmed', tone: 'warn' },
  discrepancy:  { label: 'Needs review',  tone: 'warn' },
  overdue:      { label: 'Overdue',       tone: 'bad' },
  due:          { label: 'Due',           tone: 'warn' },
  present:      { label: 'Present',       tone: 'ok' },
  info:         { label: '',              tone: 'ok' },
};
const CATEGORY_KEYS = Object.keys(CATEGORIES);
const norm = (s) => String(s ?? '').trim().toLowerCase();
const DATEISH = /date|day|on$|when|session|due|paid/i;

// ── What the application holds ──────────────────────────────────────────────

/*
 * The catalogue is what the datasets ARE, not what this question needs.
 *
 * Building it reads every row of every dataset out of the database — to count
 * them, and to collect six example values per column for the prompt. That was
 * being done again from scratch on every single question, and the answer was
 * identical every time until somebody imported something. Measured on the
 * academy's data it was most of the 0.8 seconds this application spent around
 * the two model calls.
 *
 * Keyed on dataVersion(), so an import is visible on the very next question
 * rather than after a timeout: there is no staleness window to reason about,
 * because the key changes at the moment the rows do.
 */
const _catalogue = new Map();

export async function catalogue(kind = 'own') {
  const version = dataVersion();
  const hit = _catalogue.get(kind);
  if (hit && hit.version === version) return hit.value;
  const value = await buildCatalogue(kind);
  _catalogue.set(kind, { version, value });
  return value;
}

async function buildCatalogue(kind) {
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
    // Which column carries a date, so a window can be applied without the
    // model having to guess at it.
    const dateColumn = columns.find((c, i) =>
      DATEISH.test(c) && all.rows.slice(0, 20).some(r => parseDate(r.cells[i]))) || '';
    out.push({ name: d.name, columns, key: datasetKey(d), rows: all.rows.length, values, dateColumn });
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
    return `- "${d.name}" — ${d.rows} rows, identified by ${d.key || 'no key'}`
      + (d.dateColumn ? `, dated by "${d.dateColumn}"` : ', undated')
      + `\n  columns: ${cols}`;
  }).join('\n');
}

// ── UNDERSTAND ──────────────────────────────────────────────────────────────

const PLAN_RULES = [
  'You turn a question into STEPS over the datasets below. You never count, never join and',
  'never decide whether two rows are the same person — code does all three. You decide what',
  'to look at and what rule to apply.',
  '',
  'Return ONLY JSON:',
  '{"reading":"what you took the question to mean, one line",',
  ' "intent":"lookup|summary|compare|action|revalidate",',
  ' "act":"what the customer wants done, or null",',
  ' "ambiguous":false,',
  ' "steps":[',
  '   {"id":"a","op":"select","dataset":"...","label":"Absent this week","category":"absent",',
  '    "entity":"player_name","where":[["status","matches","absent|no show"]],"window":"this week"},',
  '   {"id":"b","op":"derive","from":"a","entity":"player_name","where":[["status","matches","absent"]],',
  '    "metric":"count","having":[">=","2"],"label":"Missed twice or more","category":"absent"},',
  '   {"id":"c","op":"join","left":"a","right":"b","mode":"both","label":"Both","category":"discrepancy"}',
  ' ]}',
  '',
  'THE OPERATIONS',
  '- select: rows from one dataset. "where" is [column, operator, value]; operators are',
  '  is, is not, contains, is any of, matches, empty, not empty, before, after. "is any of" and',
  '  "matches" take several values separated by |. "window" is a phrase like today, this week,',
  '  last week, this month, recently, last 30 days — the range is computed for you and applied',
  '  to that dataset\'s date column, so NEVER write a date into "where".',
  '- derive: a fact computed per person from another step — count the rows matching "where",',
  '  then keep those whose count passes "having". This is how a phrase that is not a column',
  '  becomes an answer: "poor attendance" is a count of absences with having [">=","2"];',
  '  "consistently missing" is the same with a larger number.',
  '- join: the people in both of two steps (mode "both"), or in the first and not the second',
  '  (mode "leftOnly"). This is the ONLY way to answer "students with X and Y".',
  '',
  'RULES',
  '- Use dataset and column names EXACTLY as given.',
  '- ONE GROUP PER CATEGORY. Confirmed absence and "the record looks wrong" are different',
  '  things the customer acts on differently, so they are different steps.',
  '- "entity" names the column holding the PERSON, so two rows for one person count once.',
  '- NARROWING: when the customer says "them", "those", "their" or names a subset of what you',
  '  just listed, filter with ["<name column>","is any of","Arjun Bose|Rohan Sharma"] using the',
  '  names from the conversation. Keep the previous window and filters unless they change one.',
  '- BROAD QUESTIONS ("what needs my attention", "is everything running smoothly"): give one',
  '  step per thing that could be wrong, across DIFFERENT datasets — unconfirmed attendance,',
  '  absences, overdue fees, records that contradict — and order steps most urgent first.',
  '- DO NOT REFUSE because the question\'s words are not column names. Work out what would have',
  '  to be true and derive it. Return no steps only when nothing here is about the subject at',
  '  all (a refund policy, opening hours) — then say so in "reading".',
  '- Set "ambiguous" true only when two readings would give genuinely different answers, and',
  '  put the one you took in "reading".',
].join('\n');

function timeText(now = new Date()) {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const w = windowRange('this week', now);
  return `TODAY is ${iso(now)} (${now.toLocaleDateString('en-GB', { weekday: 'long' })}). This week began ${iso(w.from)}.`;
}

function historyText(history) {
  if (!history.length) return '';
  return '\nTHE CONVERSATION SO FAR (resolve "them", "their", "those" against it):\n'
    + history.map(h => `${h.role === 'user' ? 'Customer' : 'You'}: ${h.text}`).join('\n') + '\n';
}

function contextText(ctx) {
  if (!ctx || !Array.isArray(ctx.entities) || !ctx.entities.length) return '';
  return `\nTHE PEOPLE IN YOUR LAST ANSWER (use these for "them"/"those"): ${ctx.entities.slice(0, 40).join(' | ')}`
    + (ctx.window ? `\nTHE PERIOD IN YOUR LAST ANSWER: ${ctx.window}` : '') + '\n';
}

/** The model's plan, made safe: anything that does not exist is dropped. */
export function sanitisePlan(raw, cat) {
  const byName = new Map(cat.map(d => [d.name, d]));
  const steps = [];
  const seen = new Set();
  for (const s of Array.isArray(raw?.steps) ? raw.steps : []) {
    const op = String(s?.op || 'select');
    const id = String(s?.id || `s${steps.length}`);
    if (seen.has(id)) continue;
    const base = {
      id,
      label: String(s?.label || '').slice(0, 60),
      category: CATEGORY_KEYS.includes(String(s?.category)) ? String(s.category) : 'info',
    };
    if (op === 'select') {
      const d = byName.get(String(s?.dataset || ''));
      if (!d) continue;
      const cols = new Set(d.columns);
      steps.push({
        ...base, op: 'select', dataset: d.name,
        label: base.label || d.name,
        entity: cols.has(String(s?.entity)) ? String(s.entity) : null,
        where: (Array.isArray(s?.where) ? s.where : [])
          .filter(w => Array.isArray(w) && cols.has(String(w[0])) && OPS.has(String(w[1])))
          .map(w => [String(w[0]), String(w[1]), String(w[2] ?? '').replace(/^:\s*/, '')]),
        window: s?.window ? String(s.window).slice(0, 40) : null,
      });
    } else if (op === 'derive') {
      const from = steps.find(x => x.id === String(s?.from));
      if (!from) continue;
      const d = byName.get(from.dataset);
      const cols = new Set(d ? d.columns : []);
      steps.push({
        ...base, op: 'derive', from: from.id, dataset: from.dataset,
        label: base.label || 'Derived',
        entity: cols.has(String(s?.entity)) ? String(s.entity) : from.entity,
        where: (Array.isArray(s?.where) ? s.where : [])
          .filter(w => Array.isArray(w) && cols.has(String(w[0])) && OPS.has(String(w[1])))
          .map(w => [String(w[0]), String(w[1]), String(w[2] ?? '')]),
        metric: s?.metric === 'rate' ? 'rate' : 'count',
        having: Array.isArray(s?.having) && ['>=', '>', '<=', '<', '=='].includes(String(s.having[0]))
          ? [String(s.having[0]), Number(s.having[1]) || 0] : null,
      });
    } else if (op === 'join') {
      const left = steps.find(x => x.id === String(s?.left));
      const right = steps.find(x => x.id === String(s?.right));
      if (!left || !right) continue;
      steps.push({
        ...base, op: 'join', left: left.id, right: right.id,
        label: base.label || 'In both',
        mode: s?.mode === 'leftOnly' ? 'leftOnly' : 'both',
      });
    } else continue;
    seen.add(id);
    if (steps.length >= 8) break;
  }
  return {
    steps,
    reading: String(raw?.reading || '').slice(0, 240),
    intent: ['lookup', 'summary', 'compare', 'action', 'revalidate'].includes(String(raw?.intent)) ? String(raw.intent) : 'lookup',
    act: raw?.act ? String(raw.act).slice(0, 200) : null,
    ambiguous: raw?.ambiguous === true,
  };
}

async function askForPlan({ question, history, ctx, cat, insist }) {
  const res = await generateRaw({
    systemPrompt: `${PLAN_RULES}\n\n${timeText()}\n\nTHE DATASETS\n${catalogueText(cat)}`
      + (insist ? [
        '',
        '',
        'YOUR LAST ATTEMPT RETURNED NO STEPS, AND THAT IS ALMOST CERTAINLY WRONG.',
        'A dataset does not have to use the customer\'s words to be about their question.',
        '"Who is attending practice today?" is the roll call logs, filtered to today —',
        'even though no column says "attending" and none says "practice". "Who has not',
        'confirmed attendance?" is the same rows where the reply is empty.',
        '',
        'Finding no rows is NOT a reason to return no steps: a count of zero is an answer,',
        'and refusing instead tells the customer the application does not hold something it',
        'plainly holds.',
        '',
        'Return no steps ONLY for a subject no dataset above is about at all — an opening',
        'time, a refund policy, a person who is not in any of these rows.',
      ].join('\n') : ''),
    userMessage: `${historyText(history)}${contextText(ctx)}\nQuestion: ${question}`,
    maxTokens: 1100,
    // Extraction, not reasoning: thinking is billed as output and this call
    // does not need any.
    thinking: false,
  });
  let parsed = null;
  try {
    const t = String(res?.text || '').replace(/```json|```/g, '').trim();
    parsed = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch { parsed = null; }
  return sanitisePlan(parsed, cat);
}

/** Ask once; if nothing came back, insist before refusing. */
async function plan(args) {
  const first = await askForPlan({ ...args, insist: false });
  if (first.steps.length) return first;
  const second = await askForPlan({ ...args, insist: true });
  return second.steps.length ? second : first;
}

// ── EXECUTE ─────────────────────────────────────────────────────────────────

function groupFrom({ step, columns, dataset, items, records, window, coverage, opaque }) {
  return {
    id: step.id, label: step.label, category: step.category, dataset, columns,
    entity: step.entity || null, window: window || null, coverage: coverage || null,
    records, entities: items.length,
    // Whether these "names" are identifiers nothing could resolve to a person.
    // Destructured explicitly like everything else here, which is why it was
    // silently dropped the first time and SES-2609021 kept reaching the page.
    opaque: !!opaque,
    items: items.slice(0, EVIDENCE_LIMIT),
  };
}

/*
 * Who SCA-26-001 actually is.
 *
 * The roll call keys every line by a student id, because that is how the
 * academy's system writes it. Nothing looked the id up, so the answer came
 * back "SCA-26-001, SCA-26-008 and 17 others are absent" — which is not an
 * answer, it is a lookup task handed back to the coach. It only became
 * visible once answers started naming people instead of counting them; the
 * count was hiding it.
 *
 * The roster maps the id to Tejas Hegde, so this reads that map. Not by
 * knowing about rosters — a tenant's datasets are whatever they imported —
 * but by looking for a dataset whose key column holds these same values, and
 * taking the human-readable columns beside it.
 *
 * Presentational only. Grouping, counting and validation stay keyed on the
 * id, so a resolved name can never change a number; it only changes what the
 * customer reads.
 */
const IDENTIFIER = /^[A-Z]{2,5}[-_/]?\d{2,}([-_/]\d+)*$/i;
const NAMEISH_COLUMN = /(^|_)(name|first|last|given|surname|full)(_|$)/i;
const NOT_A_NAME = /(id|code|ref|number|phone|mobile|email|date|amount|status|batch)/i;
/*
 * Somebody else's name in the same row.
 *
 * A roster carries the coach and the guardian beside the student, and every
 * one of those columns is called something_name. Taking them all produced
 * "Tejas Hegde Coach Balaji R" — two people presented as one, which is worse
 * than the identifier it replaced because it reads as though it is true.
 */
const SOMEONE_ELSE = /(coach|guardian|parent|instructor|teacher|staff|manager|owner|emergency|contact|referr|next_of_kin|trainer|admin)/i;

/** Do these values look like identifiers rather than like people? */
function looksLikeIds(values) {
  const seen = values.filter(Boolean).slice(0, 40);
  if (seen.length < 2) return false;
  const hits = seen.filter(v => IDENTIFIER.test(String(v).trim())).length;
  return hits / seen.length >= 0.8;
}

/**
 * id -> "Tejas Hegde", built from whichever dataset carries both.
 *
 * Returns an empty map when nothing matches, and the caller then shows the id,
 * which is what it did before and is better than showing nothing.
 */
async function identityMap(values, kind) {
  const want = new Set(values.map(v => norm(v)).filter(Boolean));
  if (!want.size) return new Map();

  for (const d of readIndex()) {
    let all;
    try { all = await readAllRows(d, kind); } catch { continue; }
    if (!all.rows.length) continue;

    // The column that holds these identifiers, if this dataset has one.
    let idIdx = -1;
    for (let i = 0; i < all.columns.length; i++) {
      let hit = 0;
      for (const r of all.rows) if (want.has(norm(r.cells[i]))) { hit++; if (hit >= 2) break; }
      if (hit >= 2) { idIdx = i; break; }
    }
    if (idIdx < 0) continue;

    // The columns beside it that name THIS person — not the coach standing
    // next to them in the same row.
    const candidates = all.columns
      .map((c, i) => [c, i])
      .filter(([c, i]) => i !== idIdx && NAMEISH_COLUMN.test(c) && !NOT_A_NAME.test(c) && !SOMEONE_ELSE.test(c));

    // A first/last pair is one person's name split in two, and is preferred
    // over anything else. Otherwise a single column, never a handful joined.
    const first = candidates.find(([c]) => /(^|_)(first|given)(_|$)/i.test(c));
    const last  = candidates.find(([c]) => /(^|_)(last|surname)(_|$)/i.test(c));
    const nameIdx = (first && last)
      ? [first[1], last[1]]
      : candidates.slice(0, 1).map(([, i]) => i);
    if (!nameIdx.length) continue;

    const map = new Map();
    for (const r of all.rows) {
      const key = norm(r.cells[idIdx]);
      if (!key || map.has(key)) continue;
      const parts = nameIdx.map(i => String(r.cells[i] ?? '').trim()).filter(Boolean);
      if (parts.length) map.set(key, parts.join(' '));
    }
    if (map.size) return map;
  }
  return new Map();
}

/**
 * Show the person, keep the identifier. Counts never see this.
 *
 * Returns opaque when the values are identifiers that nothing in the
 * application maps to a person — SES-2609021 is a session, not somebody, and
 * listing three of them as though they were people makes an answer worse. The
 * group still carries its rows and its count; it just stops pretending the
 * identifiers are names.
 */
async function nameTheItems(items, kind) {
  const values = items.map(i => i.name).filter(Boolean);
  if (!looksLikeIds(values)) return { items, opaque: false };
  const map = await identityMap(values, kind);
  if (!map.size) return { items, opaque: true };
  let resolved = 0;
  for (const it of items) {
    const who = map.get(norm(it.name));
    if (who) { it.id = it.name; it.name = who; resolved++; }
  }
  // A map that named almost none of them is not a map for these.
  return { items, opaque: resolved < Math.ceil(items.length / 2) };
}

function asItems(rows, columns, entity) {
  const idx = entity ? columns.indexOf(entity) : -1;
  if (idx < 0) return rows.map(r => ({ name: '', records: [r] }));
  const by = new Map();
  for (const r of rows) {
    const name = String(r.cells[idx] ?? '').trim();
    const k = norm(name) || `#${by.size}`;
    if (!by.has(k)) by.set(k, { name, records: [] });
    by.get(k).records.push(r);
  }
  return [...by.values()];
}

async function execute(planned, kind, now = new Date()) {
  const groups = [];
  const byId = new Map();

  for (const step of planned.steps) {
    if (step.op === 'select') {
      const d = findDataset(step.dataset);
      if (!d) continue;
      const all = await readAllRows(d, kind);
      const dateIdx = all.columns.findIndex(c => DATEISH.test(c));
      const range = step.window ? windowRange(step.window, now) : null;
      const scanned = all.rows.slice(0, SCAN_LIMIT);
      const rows = scanned.filter(r =>
        matchesAll(r.cells, all.columns, step.where) && (!range || inWindow(r.cells[dateIdx], range, now)));
      const named = await nameTheItems(asItems(rows, all.columns, step.entity), kind);
      const items = named.items;
      const g = groupFrom({
        step, columns: all.columns, dataset: d.name, items, opaque: named.opaque, records: rows.length,
        window: range ? range.label : null,
        coverage: range ? dateCoverage(scanned, dateIdx, now) : null,
      });
      byId.set(step.id, { group: g, columns: all.columns, rows, dataset: d.name });
      groups.push(g);
    } else if (step.op === 'derive') {
      const src = byId.get(step.from);
      if (!src) continue;
      const found = deriveByEntity(src.rows, src.columns, {
        entity: step.entity || src.group.entity,
        where: step.where, metric: step.metric, having: step.having,
      });
      const named = await nameTheItems(found.map(f => ({ name: f.name, records: f.records, value: f.value })), kind);
      const items = named.items;
      const g = groupFrom({
        step, columns: src.columns, dataset: src.dataset, items, opaque: named.opaque,
        records: items.reduce((n, i) => n + i.records.length, 0),
        window: src.group.window, coverage: src.group.coverage,
      });
      // A derivation is a rule, and the reader is owed it.
      g.rule = step.having ? `${step.metric === 'rate' ? 'share' : 'count'} ${step.having[0]} ${step.having[1]}` : '';
      byId.set(step.id, { group: g, columns: src.columns, rows: src.rows, dataset: src.dataset });
      groups.push(g);
    } else if (step.op === 'join') {
      const l = byId.get(step.left);
      const r = byId.get(step.right);
      if (!l || !r) continue;
      const items = joinOnEntity(l.group.items, r.group.items, step.mode);
      const g = groupFrom({
        step, columns: l.columns, dataset: `${l.dataset} + ${r.dataset}`, items,
        // The join carries whatever the sides carried: matching two lists of
        // identifiers yields a list of identifiers.
        opaque: l.group.opaque || r.group.opaque,
        records: items.reduce((n, i) => n + i.records.length, 0),
        window: l.group.window || r.group.window,
      });
      byId.set(step.id, { group: g, columns: l.columns, rows: l.rows, dataset: g.dataset });
      groups.push(g);
    }
  }

  // A join's whole point is the people in both, and a derivation's is the ones
  // that passed: their inputs are working, not the answer, so they stop being
  // groups of their own.
  const consumed = new Set();
  for (const s of planned.steps) {
    if (s.op === 'join') { consumed.add(s.left); consumed.add(s.right); }
    if (s.op === 'derive') consumed.add(s.from);
  }
  const shown = groups.filter(g => !consumed.has(g.id));
  return { groups: shown.length ? shown : groups, all: groups };
}

// ── The people across all of it ─────────────────────────────────────────────

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

// ── ANSWER ──────────────────────────────────────────────────────────────────

function factsText(groups, cross) {
  if (!groups.length) return 'Nothing in the connected data matches this question.';
  const lines = groups.map(g =>
    `- ${g.label}${g.window ? ` (${g.window})` : ''}: ${g.records} records, ${g.entities} distinct`
    + (g.rule ? `, kept where ${g.rule}` : '')
    // An opaque group's "names" are identifiers nothing could resolve. Giving
    // them to the writer only invites it to print SES-2609021 at a coach.
    + (g.items.length && !g.opaque
      ? `\n  ${g.items.slice(0, SAMPLE_FOR_MODEL).map(i => i.name || i.records[0].cells.slice(0, 3).join(' · ')).join('; ')}`
      : ''));
  if (cross.both.length) {
    lines.push(`- in more than one of the above: ${cross.both.length} (${cross.both.slice(0, 10).map(p => p.name).join(', ')})`);
    lines.push(`- across all groups: ${cross.issues} records, ${cross.people} distinct people`);
  }
  return lines.join('\n');
}

const SAY_RULES = [
  'Write the answer. One sentence first, then at most two more if they add something.',
  '',
  'NAME PEOPLE. The names are in the facts and the customer asked about people, not about',
  'rows. "Arjun Bose, Rohan Sharma and Tanvi Reddy" is an answer; "3 distinct trainees" is a',
  'receipt. Name up to six and say "and N others" for the rest. The application also lists',
  'them under your sentence, and that is fine — a sentence that can only be understood by',
  'reading a table underneath it has not answered anything.',
  '',
  'WRITE LIKE A COLLEAGUE, NOT LIKE A DATABASE. Never say "records", "rows", "distinct",',
  '"entries" or "data points" — say students, sessions, payments, people. "Ten students need',
  'attention", never "20 records across 10 distinct students".',
  '',
  'THE NUMBERS ARE GIVEN TO YOU. Use only figures from the facts. Never add, total or estimate.',
  '',
  'If a figure was DERIVED rather than read — "kept where count >= 2" — say the rule in plain',
  'words once ("missed two or more sessions"), because the customer cannot see it otherwise.',
  '',
  'Keep categories apart. Absences and records needing review are different and must not be',
  'merged into one count.',
  '',
  'If the facts are empty, say plainly what the data does not carry, and what would answer it.',
  '',
  'OFFER THE OBVIOUS NEXT STEP when there plainly is one — a message to send, a list to',
  'prepare — as a short question at the end: "Want me to draft a reminder to those six?"',
  'One, only when it follows from the answer, and never as a menu of what you can do. Never',
  'say or imply anything was sent, prepared or changed: you are offering, not reporting.',
].join('\n');

/*
 * What SHAPE of answer the question is asking for.
 *
 * "Which students are enrolled in U16?" was answered "U-16 Students: 9." — the
 * question said which and the answer said how many, as a fragment. Nothing in
 * the pipeline had ever asked what the person wanted BACK; the planner decides
 * what to retrieve and nothing decided what to say.
 *
 * Decided in code rather than by the model: it is a property of the words the
 * customer used, it costs nothing, and a wrong guess here is visible and
 * cheap to correct, unlike another field for the planner to get wrong.
 */
function answerShape(question, intent) {
  const q = String(question || '').trim().toLowerCase();
  if (intent === 'summary')  return 'assessment';
  if (/^(how many|how much|what (is|was) the (number|count|total))/.test(q)) return 'count';
  if (/^(who|which|name |list |show me (which|who)|tell me who)/.test(q) || /\bwho\b/.test(q)) return 'names';
  return 'default';
}

const SHAPE_RULES = {
  names: [
    '',
    'THEY ASKED WHO. Lead with the names, not with a total. If there are more than six, name',
    'the six that matter most and say how many others there are.',
  ].join('\n'),

  count: [
    '',
    'THEY ASKED HOW MANY. Lead with the number, in a sentence. Names are optional here and',
    'belong after the number, not instead of it.',
  ].join('\n'),

  assessment: [
    '',
    'THIS IS A BROAD QUESTION: the customer wants what matters, not everything there is. They',
    'are asking you to judge, so judge — open with what you would tell them if you had one',
    'sentence, not with a tally. Then each thing in order of urgency, one short line with its',
    'number and the people it concerns. End with the one action worth offering, if there is one.',
  ].join('\n'),

  default: '',
};

/*
 * How much room the answer needs, by what was asked.
 *
 * A lookup is a sentence. A broad question is a judgement, a line per thing
 * that is wrong, and the people in each — and at 700 tokens it stopped
 * mid-word: "...but 3 scheduled sessions need notifications sent and 6
 * students have overdue fees.\n\n3 sessions are". A cut sentence reads as
 * the application breaking, which is worse than the terse answer it replaced.
 *
 * Unused room costs nothing: output is billed as produced, not as budgeted.
 */
const ROOM = { assessment: 1400, names: 900, count: 500, default: 700 };

async function say({ question, groups, cross, planned, issues }) {
  const shape = answerShape(question, planned.intent);
  const res = await generate({
    systemPrompt: SAY_RULES + (SHAPE_RULES[shape] || ''),
    userMessage: `Question: ${question}\n`
      + (planned.reading ? `You read this as: ${planned.reading}\n` : '')
      + `\nFACTS (the only numbers you may use)\n${factsText(groups, cross)}`
      + (issues.length ? `\n\nWORTH SAYING\n${issues.join('\n')}` : ''),
    /*
     * 700, not 400.
     *
     * Naming people costs words that a count did not, and at 400 the answer
     * to "Which batches are performing better than others?" stopped mid-word:
     * "I cannot tell that from the connected data, as there". A truncated
     * sentence reads as the application breaking, which is worse than the
     * terse answer it replaced. Thinking is off, so this budget buys only
     * visible text.
     */
    maxTokens: ROOM[shape] || ROOM.default,
    // Sentences from facts already computed. No reasoning required, and it is
    // charged for whether it helps or not.
    thinking: false,
  });
  return String(res?.text || '').trim();
}

export function allowedNumbers(groups, cross) {
  const ok = new Set([0, 1]);
  for (const g of groups) {
    ok.add(g.records); ok.add(g.entities);
    if (g.rule) { const n = Number(String(g.rule).split(' ').pop()); if (!Number.isNaN(n)) ok.add(n); }
  }
  ok.add(cross.issues); ok.add(cross.people); ok.add(cross.both.length);
  return ok;
}

export function unsupportedNumbers(text, allowed) {
  const bad = [];
  for (const m of String(text).matchAll(/(?<![\w₹$£€.,])(\d{1,4})(?![\w.,%])/g)) {
    const n = Number(m[1]);
    if (n >= 1900 && n <= 2100) continue;
    if (!allowed.has(n)) bad.push(n);
  }
  return [...new Set(bad)];
}

/*
 * A label mid-sentence is lowercased, unless lowercasing would damage it.
 *
 * "U-16 trainees" became "u-16 trainees" — the batch is called U-16 and the
 * sentence should say so. Anything carrying a digit or a run of capitals is a
 * name of something, not a description of it.
 */
const midSentence = (label) => (/[A-Z]{2,}|[0-9]/.test(label) ? label : label.toLowerCase());

/** "Arjun Bose, Rohan Sharma and Tanvi Reddy", and "and 20 others" past the cap. */
function nameList(items, cap = 6) {
  const names = [...new Set(items.map(i => i && i.name).filter(Boolean))];
  if (!names.length) return '';
  const shown = names.slice(0, cap);
  const rest = names.length - shown.length;
  const joined = shown.length === 1
    ? shown[0]
    : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${joined}, and ${rest} ${rest === 1 ? 'other' : 'others'}` : joined;
}

/**
 * The sentence when the model's own could not be trusted.
 *
 * This is a safety net, and a safety net that lands badly is still a fall:
 * the first version printed "4 in u-16 trainees." and the second, asked
 * "Which students are enrolled in U16?", answered "U-16 Students: 9." — a
 * label, a colon and a number, where the question had asked WHICH. A customer
 * reading that sees the application break, not the application being careful.
 *
 * So it names people, like the model is now asked to, and it reads as English
 * whether or not anyone ever looks at the table underneath.
 */
export function composeAnswer(groups, cross) {
  if (!groups.length) return 'I cannot answer that from the connected data.';

  const count = (g) => (g.entity ? g.entities : g.records);
  const noun = (g, n) => (g.entity ? (n === 1 ? 'person' : 'people') : (n === 1 ? 'record' : 'records'));

  const one = (g) => {
    const n = count(g);
    if (n === 0) return `Nothing matched ${midSentence(g.label)}.`;
    const who = g.opaque ? '' : nameList(g.items);
    const label = midSentence(g.label);
    // Names when there are names; the count carries it when there are not.
    return who
      ? `${who} ${n === 1 ? 'is' : 'are'} ${label}${g.rule ? ` (${g.rule})` : ''}.`
      : `${n} ${noun(g, n)} ${n === 1 ? 'is' : 'are'} ${label}.`;
  };

  if (groups.length === 1 && !cross.both.length) return one(groups[0]);

  const head = groups.length === 1
    ? one(groups[0])
    : groups.map(g => `${count(g)} ${midSentence(g.label)}`).join(', ') + '.';
  if (!cross.both.length) return head;
  const n = cross.both.length;
  const who = nameList(cross.both, 4);
  return `${head} ${n === 1 ? 'One person appears' : `${n} people appear`} in more than one of these`
    + `${who ? ` (${who})` : ''}, so this is ${cross.issues} in total across ${cross.people} people.`;
}

// ── The envelope ────────────────────────────────────────────────────────────

function envelope({ answer, groups, cross, notes, planned, kind, checked, state, issues }) {
  const people = [];
  for (const g of groups) for (const it of g.items) if (it.name && !people.includes(it.name)) people.push(it.name);
  return {
    answer,
    state,
    reading: planned.reading || '',
    groups: groups.map(g => ({
      label: g.label, category: g.category,
      categoryLabel: CATEGORIES[g.category].label, tone: CATEGORIES[g.category].tone,
      records: g.records, entities: g.entities, dataset: g.dataset, columns: g.columns,
      opaque: !!g.opaque,
      window: g.window || '', rule: g.rule || '', note: g.note || '',
      items: g.items.map(i => ({
        name: i.name,
        id: i.id || '',
        lines: i.records.slice(0, 6).map(r => r.cells),
        records: i.records.length,
        source: i.records[0]?.source || '',
      })),
    })),
    overlap: cross.both.length ? { people: cross.people, issues: cross.issues, both: cross.both.slice(0, 12) } : null,
    sources: groups.map(g => ({ dataset: g.dataset, records: g.records })),
    simulated: kind === 'sample',
    notes: [...notes, ...issues],
    intent: planned.intent,
    act: planned.act,
    checked,
    // What a follow-up needs so "them" and "those" mean something.
    context: { entities: people.slice(0, 60), window: groups.find(g => g.window)?.window || '', intent: planned.intent },
  };
}

const EMPTY_CROSS = { people: 0, both: [], issues: 0 };
const BLANK_PLAN = { steps: [], reading: '', intent: 'lookup', act: null, ambiguous: false };

/** "Are you sure?" — a challenge to the last answer, not a new question. */
const CHALLENGE = /^\s*(are you sure|really\??|is that right|are you certain|you sure|how do you know)\b/i;

/**
 * The answer to one question.
 *
 * `history` is the turns before it and `ctx` what the last answer found, so a
 * follow-up narrows rather than starting again.
 */
/*
 * `onStage` — what is happening, and the evidence as soon as it is certain.
 *
 * A question takes about eight seconds: roughly two to plan, a moment to read
 * and check the records, and five for the model to write the sentence. All of
 * it used to arrive at once, so the customer watched nothing happen for eight
 * seconds and then got everything.
 *
 * But the ANSWER is finished long before the sentence is. Who was absent, how
 * many, from which dataset — that is computed by code and validated by code,
 * and by the time the writing starts none of it can change. Holding it back
 * to arrive with the prose is a choice, and it was the wrong one.
 *
 * So the evidence goes out at 'evidence', final and never rewritten, and the
 * sentence follows when it is ready. Callers that pass no onStage get exactly
 * what they got before.
 */
export async function answer({ question, history = [], ctx = null, kind = 'own', onStage = null } = {}) {
  const stage = (name, payload) => { try { if (onStage) onStage(name, payload); } catch { /* a watcher must not break the answer */ } };
  const notes = [];
  const q = String(question || '').trim();
  if (!q) {
    return envelope({ answer: '', groups: [], cross: EMPTY_CROSS, notes, planned: BLANK_PLAN, kind, checked: true, state: 'unknown', issues: [] });
  }

  // The customer's records if there are any, the simulated ones if not.
  let used = kind;
  let cat = await catalogue(used);
  const bare = (c) => !c.length || c.every(d => d.rows === 0);
  if (bare(cat) && kind === 'own') {
    const simulated = await catalogue('sample');
    if (!bare(simulated)) { used = 'sample'; cat = simulated; }
  }
  if (bare(cat)) {
    return envelope({
      answer: 'There are no records connected to this application yet, so I cannot answer from data. Connect a source on the Data page and ask again.',
      groups: [], cross: EMPTY_CROSS, notes: ['No records have been connected yet.'],
      planned: BLANK_PLAN, kind: used, checked: true, state: 'unknown', issues: [],
    });
  }

  /*
   * Being challenged is not being asked again.
   *
   * "Are you sure?" about a list of absences is a request to re-examine THAT
   * list, so the previous question is re-run and the answer says what it rests
   * on. Read as a fresh question it produced "I cannot tell that from the
   * connected data", which reads as the application caving.
   */
  const lastQuestion = [...history].reverse().find(h => h.role === 'user')?.text || '';
  const challenged = CHALLENGE.test(q) && !!lastQuestion;
  const asked = challenged ? lastQuestion : q;

  stage('planning');
  const planned = await plan({ question: asked, history: history.slice(-8), ctx, cat });
  stage('reading', { reading: planned.reading || '' });
  const { groups } = await execute(planned, used);
  stage('checking');
  const cross = overlap(groups);
  const { state, issues } = validate({ groups, plan: planned });

  if (!groups.length) {
    /*
     * A refusal has to leave the customer somewhere.
     *
     * "I don't have that in the connected data" full stop is the worst version
     * of being right: it is sometimes wrong, and even when it is correct the
     * person cannot tell what to ask instead. Naming what the application does
     * hold fixes both — they can see immediately whether the refusal is fair,
     * and rephrase against a real dataset if it is not.
     */
    const holds = cat.filter(d => d.rows > 0).map(d => d.name);
    const what = holds.length
      ? ` This application holds ${holds.slice(0, 4).join(', ')}${holds.length > 4 ? ' and more' : ''} — ask me about any of those.`
      : '';
    // The model writes "reading" as a phrase and does not always end it with a
    // full stop, so the reason ran straight into the next sentence: "...not
    // recorded per batch This application holds Master Student Roster".
    const reason = String(planned.reading || '').trim();
    const why = reason ? ` ${/[.!?]$/.test(reason) ? reason : reason + '.'}` : '';
    return envelope({
      answer: (state === 'unknown'
        ? `I don't have that in the connected data.${why}${what}`
        : `I can't answer that from what is connected.${why}${what}`).trim(),
      groups: [], cross, notes, planned, kind: used, checked: true, state, issues,
    });
  }

  for (const g of groups) {
    if (g.records === 0) notes.push(`Nothing in ${g.dataset} matched ${g.label.toLowerCase()}${g.window ? ` for ${g.window}` : ''}.`);
  }

  // Everything except the sentence, and none of it can change from here.
  stage('evidence', envelope({
    answer: '', groups, cross, notes, planned, kind: used, checked: true, state, issues,
  }));

  stage('writing');
  let text = await say({ question: asked, groups, cross, planned, issues });
  if (challenged) {
    const basis = groups.map(g => `${g.records} from ${g.dataset}`).join(' and ');
    text = `Yes. That rests on ${basis}. ${text}`;
  }

  /*
   * A sentence that stops mid-word is not an answer.
   *
   * Running out of budget leaves the last sentence unfinished, and a customer
   * reading "...and 6 students have overdue fees. 3 sessions are" sees the
   * application break. The composed sentence is plainer and complete, and
   * complete is the part that matters.
   */
  if (text && !/[.!?:]["')\]]?$/.test(text.trim())) {
    notes.push('The written answer was cut short, so this is the summary built from the records.');
    text = composeAnswer(groups, cross);
  }

  const allowed = allowedNumbers(groups, cross);
  let checked = true;
  if (unsupportedNumbers(text, allowed).length) {
    const retry = await say({
      question: `${asked}\n\n(Your previous answer used a number that is not in the facts. Use only the numbers given.)`,
      groups, cross, planned, issues,
    });
    if (unsupportedNumbers(retry, allowed).length) { text = composeAnswer(groups, cross); checked = false; }
    else text = retry;
  }

  return envelope({ answer: text, groups, cross, notes, planned, kind: used, checked, state, issues });
}
