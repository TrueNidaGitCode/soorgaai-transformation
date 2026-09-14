/**
 * Reasoning: time, derivation, joining, validation.
 *
 * The answer pipeline used to be able to do one thing — select rows where a
 * column equals a value — and everything it could not express became "I
 * cannot tell that from the connected data". That refusal was a lie about the
 * data: the academy's roll calls DO say who was absent this week, and the
 * roster DOES say who is overdue. What was missing was the reasoning between
 * the question and the rows.
 *
 * So the words a customer actually uses are treated as work to be done, not as
 * filters to be matched:
 *
 *   "this week"          a range, computed here, matched against dates that
 *                        may be written five different ways
 *   "poor attendance"    a count per person, then a threshold — a derivation,
 *                        not a column
 *   "both X and Y"       a join on the person, not two separate answers
 *   "needs attention"    several of the above, ranked
 *
 * Every one of these is executed by code. The model decides WHICH to run; it
 * never counts, never joins and never decides whether two rows are one person.
 */

const norm = (s) => String(s ?? '').trim().toLowerCase();

// ── Time ────────────────────────────────────────────────────────────────────

/**
 * A date cell as a day.
 *
 * The customer's spreadsheets write dates however their spreadsheet wrote
 * them: 12/09/2026, 2026-09-12, 12-09-2026, 12 Sep 2026, and 12/09 with the
 * year left off because everyone knew which year it was. A range that only
 * understood one of these would silently answer about no rows at all, which
 * looks exactly like "there is nothing this week".
 *
 * Day-first is assumed for the ambiguous ones: these are Indian academy
 * sheets, and 12/09 there is the twelfth of September.
 */
export function parseDate(cell, now = new Date()) {
  const s = String(cell ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return day(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = +m[3];
    return day(y < 100 ? 2000 + y : y, +m[2], +m[1]);
  }

  // No year: the one that makes the date most recent without being in the
  // future, because a roll call sheet is about days that have happened.
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const guess = day(now.getFullYear(), +m[2], +m[1]);
    if (guess && guess > now) return day(now.getFullYear() - 1, +m[2], +m[1]);
    return guess;
  }

  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s*(\d{4})?/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mon >= 0) return day(m[3] ? +m[3] : now.getFullYear(), mon + 1, +m[1]);
  }

  const t = Date.parse(s);
  return Number.isNaN(t) ? null : startOfDay(new Date(t));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
function day(y, mo, d) {
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const out = new Date(y, mo - 1, d);
  return out.getMonth() === mo - 1 ? out : null;
}

/** The windows a person names, as real ranges. `to` is exclusive. */
export function windowRange(label, now = new Date()) {
  const today = startOfDay(now);
  const at = (offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  const mondayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const l = norm(label);

  if (/^today$/.test(l))                       return { from: today, to: at(1), label: 'today' };
  if (/^tomorrow$/.test(l))                    return { from: at(1), to: at(2), label: 'tomorrow' };
  if (/^yesterday$/.test(l))                   return { from: at(-1), to: today, label: 'yesterday' };
  if (/this ?week/.test(l))                    return { from: mondayOf(today), to: at(1), label: 'this week' };
  if (/last ?week/.test(l)) {
    const m = mondayOf(today);
    return { from: new Date(m.getFullYear(), m.getMonth(), m.getDate() - 7), to: m, label: 'last week' };
  }
  if (/this ?month/.test(l))                   return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: at(1), label: 'this month' };
  if (/last ?month/.test(l)) {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: new Date(first.getFullYear(), first.getMonth() - 1, 1), to: first, label: 'last month' };
  }
  // "Recently" is not a week and not a month; it is "lately", and a fortnight
  // is what a coach means by it.
  if (/recent|lately|these days/.test(l))      return { from: at(-14), to: at(1), label: 'the last two weeks' };
  const days = l.match(/last (\d{1,3}) days?/);
  if (days)                                    return { from: at(-Number(days[1])), to: at(1), label: `the last ${days[1]} days` };
  return null;
}

/** Is this row inside the window? A row whose date cannot be read is not. */
export function inWindow(cell, range, now = new Date()) {
  if (!range) return true;
  const d = parseDate(cell, now);
  if (!d) return false;
  return d >= range.from && d < range.to;
}

/**
 * How many of a dataset's dates could be read at all.
 *
 * A window over a column nothing can be parsed from would answer "nobody",
 * which reads as good news. Better to know the column was unreadable and say
 * so, which is what the validator does with this.
 */
export function dateCoverage(rows, index, now = new Date()) {
  if (index < 0) return { readable: 0, total: rows.length };
  let readable = 0;
  for (const r of rows) if (parseDate(r.cells[index], now)) readable++;
  return { readable, total: rows.length };
}

// ── Derivation ──────────────────────────────────────────────────────────────

/**
 * A fact computed per person rather than read off a row.
 *
 * "Poor attendance" is not a column in anybody's spreadsheet. It is: count the
 * sessions this person missed, and compare that count with a number. The model
 * chooses the column, the condition and the threshold; the arithmetic is here,
 * where it can be checked.
 */
export function deriveByEntity(rows, columns, { entity, where = [], metric = 'count', having = null }) {
  const idx = columns.indexOf(entity);
  if (idx < 0) return [];
  const per = new Map();
  for (const r of rows) {
    const name = String(r.cells[idx] ?? '').trim();
    if (!name) continue;
    const k = norm(name);
    if (!per.has(k)) per.set(k, { name, total: 0, hits: 0, records: [] });
    const e = per.get(k);
    e.total++;
    e.records.push(r);
    if (!where.length || matchesAll(r.cells, columns, where)) e.hits++;
  }
  const out = [];
  for (const e of per.values()) {
    const value = metric === 'rate' ? (e.total ? e.hits / e.total : 0) : e.hits;
    if (!having || compare(value, having[0], Number(having[1]))) {
      out.push({ name: e.name, value, hits: e.hits, total: e.total, records: e.records });
    }
  }
  // The worst first: a list nobody ordered is a list nobody reads.
  return out.sort((a, b) => b.value - a.value);
}

function compare(v, op, n) {
  switch (op) {
    case '>=': return v >= n;
    case '>':  return v > n;
    case '<=': return v <= n;
    case '<':  return v < n;
    case '==': return v === n;
    default:   return true;
  }
}

// ── Filtering ───────────────────────────────────────────────────────────────

export const OPS = new Set(['is', 'is not', 'contains', 'is any of', 'empty', 'not empty', 'before', 'after', 'matches']);
const ANY_SEP = '|';

export function matchesAll(cells, columns, where) {
  return where.every(([col, op, val]) => {
    const i = columns.indexOf(col);
    const cell = norm(cells[i]);
    const v = norm(val);
    switch (op) {
      case 'is':        return cell === v;
      case 'is not':    return cell !== v;
      case 'contains':  return v ? cell.includes(v) : false;
      case 'is any of': return String(val).split(ANY_SEP).map(norm).filter(Boolean).includes(cell);
      // Several values, any of which may appear inside the cell: how a status
      // column that reads "no response (2nd time)" is caught by "no response".
      case 'matches':   return String(val).split(ANY_SEP).map(norm).filter(Boolean).some(x => cell.includes(x));
      case 'empty':     return cell === '';
      case 'not empty': return cell !== '';
      case 'before':    return cell !== '' && cell < v;
      case 'after':     return cell !== '' && cell > v;
      default:          return false;
    }
  });
}

// ── Joining ─────────────────────────────────────────────────────────────────

/**
 * The same person in two results.
 *
 * "Students with both poor attendance and overdue fees" is not two answers put
 * next to each other; it is the people in both. Names are matched loosely
 * because one sheet writes "Arjun Bose" and another " arjun  bose".
 */
export function joinOnEntity(left, right, mode = 'both') {
  const key = (n) => norm(n).replace(/\s+/g, ' ');
  const rightBy = new Map(right.map(i => [key(i.name), i]));
  const out = [];
  for (const l of left) {
    const r = rightBy.get(key(l.name));
    if (mode === 'both' && r) out.push({ name: l.name, records: [...l.records, ...r.records], sides: 2 });
    else if (mode === 'leftOnly' && !r) out.push({ name: l.name, records: l.records, sides: 1 });
  }
  return out;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * What a person may safely be told, and what has to be said alongside it.
 *
 * The states are deliberately about the ANSWER, not about the code:
 *
 *   answerable    the rows say it outright
 *   derivable     the rows do not say it, but it was computed from them, and
 *                 the reader should know which rule was applied
 *   ambiguous     more than one reasonable reading, and they differ enough to
 *                 matter — say which was taken
 *   insufficient  the datasets are there but do not carry what is needed
 *   unknown       nothing here is about this at all
 */
export const STATES = ['answerable', 'derivable', 'ambiguous', 'insufficient', 'unknown'];

export function validate({ groups, plan, windows }) {
  const issues = [];

  for (const g of groups) {
    if (g.entities > g.records) issues.push(`${g.label}: more people than records, which cannot be true.`);
    // The same person twice inside one group is not a contradiction, but it is
    // the thing that made counts wrong, so it is stated rather than hidden.
    if (g.entity && g.records > g.entities) {
      g.note = `${g.records} records across ${g.entities} ${g.entities === 1 ? 'person' : 'people'}`;
    }
    if (g.window && g.coverage && g.coverage.total && g.coverage.readable === 0) {
      issues.push(`${g.label}: no date in ${g.dataset} could be read, so "${g.window}" could not be applied.`);
    }
  }

  // One person told two different things by two groups of the same kind.
  const byPerson = new Map();
  for (const g of groups) {
    for (const it of g.items) {
      if (!it.name) continue;
      const k = norm(it.name);
      if (!byPerson.has(k)) byPerson.set(k, []);
      byPerson.get(k).push(g.category);
    }
  }
  const contradictory = [...byPerson.entries()].filter(([, cats]) =>
    cats.includes('present') && (cats.includes('absent') || cats.includes('unconfirmed')));
  if (contradictory.length) {
    issues.push(`${contradictory.length} ${contradictory.length === 1 ? 'person is' : 'people are'} recorded both present and absent in the same period — worth a look.`);
  }

  const held = groups.reduce((n, g) => n + g.records, 0);
  let state;
  if (!plan.steps.length) state = 'unknown';
  else if (!groups.length) state = 'insufficient';
  else if (plan.ambiguous) state = 'ambiguous';
  else if (plan.steps.some(s => s.op === 'derive' || s.op === 'join')) state = 'derivable';
  else state = 'answerable';
  // Steps ran and matched nothing anywhere: the question is answerable in
  // principle and the answer is "none", which is not the same as not knowing.
  if (state !== 'unknown' && groups.length && held === 0) state = 'answerable';

  return { state, issues };
}
