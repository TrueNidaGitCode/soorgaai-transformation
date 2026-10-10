/**
 * Customer names, emails and phone numbers, replaced before a prompt leaves
 * this application, and put back in the answer when it returns.
 *
 * The model needs the facts of a finding -- no visit in 14 days, sessions used
 * above sessions bought -- and never needs to know WHO. So every prompt is
 * covered on its way out: each person the application's own records name
 * becomes "Person A", each account "Account A", each email and phone number
 * a stand-in, consistently within one call. The model reasons about Person A;
 * the answer comes back and Person A is Meera Iyer again before anybody reads
 * it. The audit log (services/egressLog.js) records the prompt after this, so
 * the owner can see for themselves that no name went.
 *
 * ── Where the names come from ─────────────────────────────────────────────
 *
 * The application's own datasets: the columns that name THIS person (the same
 * rule peopleService uses -- never the coach or the referrer beside them),
 * the columns that name a customer account, and any email or phone number
 * anywhere. Read once per change to the data (dataVersion), like the phone
 * book. A person's first and last names are covered on their own too, so
 * "How is Meera doing?" is covered as well as "Meera Iyer".
 *
 * ── What it cannot do ──────────────────────────────────────────────────────
 *
 * A name that appears in no dataset -- somebody mentioned in a WhatsApp
 * message who is not a customer -- is not known, so it is not covered. And a
 * recording sent to be transcribed is sound, not text. Both are said in the
 * docs and on the Privacy page rather than papered over.
 */
import { readIndex, readAllRows, dataVersion } from './connectorService.js';
import { nameColumnsIn, isName, looksLikePhone } from './peopleService.js';

/** Columns that name a customer account rather than a person. */
const ACCOUNT_COLUMN = /^(customer|client|account|company|school|organi[sz]ation|business|clinic|institution)(_?name)?$/i;
const NOT_A_VALUE = /(id|code|ref|number|no|type|status|owner|stage|source)$/i;
const OTHER_PERSON = /(coach|guardian|parent|instructor|teacher|staff|manager|owner|trainer|physio|doctor|consultant|referr|contact|agent|rep|assignee|assigned|counsel)/i;

/*
 * Words that are names and also ordinary words. A first name standing alone
 * is covered only when it is not one of these, so "the May invoices" and "we
 * will call" are not rewritten into nonsense.
 */
const ORDINARY = new Set(('january february march april may june july august september october november december '
  + 'monday tuesday wednesday thursday friday saturday sunday today tomorrow yesterday '
  + 'will may mark grace hope joy faith rose bill art sunny king summer autumn winter spring dawn rich '
  + 'the and for not new all one two ten top sam max van von de la le del son kumar devi bai lal '
  + 'person account customer client patient student member coach team school class batch session '
  + 'sir madam miss mrs mr ms dr').split(' '));

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// A run of digits, spaces, dashes and brackets, possibly with a leading +,
// that is a phone number by looksLikePhone -- never part of a longer number.
const PHONE = /(?<![\w+])\+?\d[\d\s()-]{8,18}\d(?!\d)/g;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A, B, ... Z, AA, AB ... */
export function letters(n) {
  let s = '';
  n += 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * The directory: every person and account the records name. Pure over the
 * datasets given, so it is tested without a database.
 *
 * @param {{columns: string[], rows: any[][]}[]} datasets
 * @returns {{ people: string[], accounts: string[] }}
 */
export function buildDirectory(datasets = []) {
  const people = new Set();
  const accounts = new Set();
  for (const d of datasets) {
    const columns = d.columns || [];
    const names = nameColumnsIn(columns);
    const accountCols = columns.map((c, i) => [c, i])
      .filter(([c]) => ACCOUNT_COLUMN.test(String(c).trim()) && !NOT_A_VALUE.test(String(c).trim()))
      .map(([, i]) => i);
    // The other people a record names -- the coach, the guardian, the record's
    // owner. Not the customer, but a person all the same, and just as covered.
    const others = columns.map((c, i) => [String(c), i])
      .filter(([c, i]) => !names.includes(i) && /name/i.test(c) && OTHER_PERSON.test(c) && !/(id|code|address|email|phone)/i.test(c))
      .map(([, i]) => i);
    for (const row of d.rows || []) {
      if (names.length) {
        const person = names.map((i) => String(row[i] == null ? '' : row[i]).trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
        if (isName(person) && person.length >= 3) people.add(person);
      }
      for (const i of others) {
        const v = String(row[i] == null ? '' : row[i]).trim().replace(/\s+/g, ' ');
        if (isName(v) && v.length >= 3) people.add(v);
      }
      for (const i of accountCols) {
        const v = String(row[i] == null ? '' : row[i]).trim().replace(/\s+/g, ' ');
        if (isName(v) && v.length >= 3 && !people.has(v)) accounts.add(v);
      }
    }
  }
  return { people: [...people], accounts: [...accounts] };
}

/**
 * A guard over one directory: cover(texts) gives the texts with every known
 * name replaced and a restore() for the answer. Pure, so it is tested
 * directly; the matchers are built once per directory.
 */
export function makeGuard({ people = [], accounts = [] } = {}) {
  // Names of two words or more match whatever the case: "MEERA IYER" is still
  // her. A one-word name is matched as written and never when it is also an
  // ordinary word, or a customer called May would rewrite every "may".
  const whole = new Map();   // lower-case full name -> { kind, name }
  const singles = new Map(); // one-word name, as written -> { kind, name }
  const add = (name, kind) => {
    if (/\s/.test(name)) { if (!whole.has(name.toLowerCase())) whole.set(name.toLowerCase(), { kind, name }); return; }
    if (name.length < 3 || ORDINARY.has(name.toLowerCase()) || !/^\p{Lu}/u.test(name)) return;
    if (!singles.has(name)) singles.set(name, { kind, name });
  };
  for (const p of people) add(p, 'Person');
  for (const a of accounts) add(a, 'Account');

  // Each part of a person's name, standing alone: the person it belongs to,
  // or null when two people share it (then it gets a stand-in of its own).
  const parts = new Map();
  for (const p of people) {
    if (!/\s/.test(p)) continue;
    for (const part of p.split(' ')) {
      if (part.length < 3 || ORDINARY.has(part.toLowerCase()) || !/^\p{Lu}/u.test(part)) continue;
      if (whole.has(part.toLowerCase())) continue;
      if (singles.has(part)) continue;
      const owner = parts.get(part);
      parts.set(part, owner === undefined ? p : (owner === p ? p : null));
    }
  }

  const bound = (alts, flags) => alts.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(${alts.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, flags)
    : null;
  const byLength = (a, b) => b.length - a.length;
  const wholeRe = bound([...whole.values()].map((v) => v.name).sort(byLength), 'giu');
  const singleRe = bound([...singles.keys()].sort(byLength), 'gu');
  const partRe = bound([...parts.keys()].sort(byLength), 'gu');

  function cover(texts) {
    const tokenOf = new Map();       // identity -> token
    const realOf = new Map();        // token -> what it stands for
    const counters = { Person: 0, Account: 0, email: 0, phone: 0 };
    const token = (identity, kind, real) => {
      if (tokenOf.has(identity)) return tokenOf.get(identity);
      const n = counters[kind]++;
      const t = kind === 'email' ? `email-${letters(n).toLowerCase()}@hidden.invalid`
        : kind === 'phone' ? `phone-${letters(n)}`
        : `${kind} ${letters(n)}`;
      tokenOf.set(identity, t);
      realOf.set(t, real);
      return t;
    };

    const one = (text) => {
      if (typeof text !== 'string' || !text) return text;
      let out = text.replace(EMAIL, (m) => token('e:' + m.toLowerCase(), 'email', m));
      out = out.replace(PHONE, (m) => (looksLikePhone(m) ? token('p:' + m.replace(/\D/g, '').slice(-10), 'phone', m) : m));
      if (wholeRe) {
        out = out.replace(wholeRe, (m) => {
          const v = whole.get(m.toLowerCase());
          return v ? token('w:' + v.name.toLowerCase(), v.kind, v.name) : m;
        });
      }
      if (singleRe) {
        out = out.replace(singleRe, (m) => {
          const v = singles.get(m);
          return v ? token('w:' + v.name.toLowerCase(), v.kind, v.name) : m;
        });
      }
      if (partRe) {
        out = out.replace(partRe, (m) => {
          const owner = parts.get(m);
          return owner ? token('w:' + owner.toLowerCase(), 'Person', owner) : token('part:' + m, 'Person', m);
        });
      }
      return out;
    };

    const covered = texts.map(one);
    const tokens = [...realOf.keys()].sort(byLength);
    const back = tokens.length ? new RegExp(tokens.map(escapeRe).join('|'), 'g') : null;
    return {
      texts: covered,
      count: realOf.size,
      restore: (s) => (back && typeof s === 'string' ? s.replace(back, (t) => realOf.get(t) ?? t) : s),
    };
  }

  return { cover, size: whole.size + singles.size };
}

// ── The application's own directory ─────────────────────────────────────────

let cached = { version: null, guard: makeGuard() };

/** The guard for the records as they are now: rebuilt only when rows change. */
export async function currentGuard() {
  const version = dataVersion();
  if (cached.version === version) return cached.guard;
  const datasets = [];
  for (const d of readIndex()) {
    for (const kind of ['own', 'sample']) {
      try {
        const all = await readAllRows(d, kind);
        if (all.rows.length) datasets.push({ columns: all.columns, rows: all.rows.map((r) => r.cells) });
      } catch { /* one unreadable dataset must not leave the rest uncovered */ }
    }
  }
  cached = { version, guard: makeGuard(buildDirectory(datasets)) };
  return cached.guard;
}
