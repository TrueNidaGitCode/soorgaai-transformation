/**
 * Who a finding is about, said as a person rather than as an identifier.
 *
 * ── Why a board needed this ────────────────────────────────────────────────
 *
 * A clinic rang a patient back about a package. The call arrived from the
 * phone system carrying two numbers and no name, because a phone system does
 * not know anybody's name — so the finding it produced was titled
 * "7349250983", sitting on a board beside "Rahul Sharma" from the CRM.
 *
 * Those are the same man. Nothing said so, so the board showed one patient as
 * two, and a reader could not ask the one question they actually want to ask
 * of a morning list: what is going on with this person.
 *
 * ── The rule, and why it is this strict ────────────────────────────────────
 *
 * A number is matched on its last ten digits, because +917349250983,
 * 07349250983 and 7349250983 are one telephone and a clinic's records will
 * hold all three spellings across different systems.
 *
 * And it resolves ONLY when exactly one person in the records has that
 * number. Where two do — a couple, a parent and a child sharing a mobile, a
 * clinic's own line typed into a contact record — the number is shown as it
 * is. Attaching a recorded conversation to the wrong patient is not a
 * cosmetic error on a clinic's board, and showing a number nobody recognises
 * is a far smaller failure than naming the wrong person confidently.
 */
import { readIndex, readAllRows, dataVersion } from './connectorService.js';

/** Columns that hold a telephone number. */
const PHONE_COLUMN = /phone|mobile|whatsapp|\btel\b|contact_?number|msisdn/i;

/**
 * Columns that hold THIS person's name.
 *
 * The same discipline the answer pipeline uses on identifiers: a clinic's
 * record carries the physiotherapist, the referrer and the emergency contact
 * beside the patient, and every one of those columns is called something
 * _name. Taking them all names two people as one, which reads as true.
 */
const NAME_COLUMN = /(^|_)(name|first|last|given|surname|full)(_|$)/i;
const NOT_A_NAME = /(id|code|ref|number|phone|mobile|email|date|amount|status|owner)/i;
const SOMEONE_ELSE = /(coach|guardian|parent|instructor|teacher|staff|manager|owner|emergency|referr|next_of_kin|trainer|admin|physio|doctor|consultant)/i;

/** The last ten digits, which is the same telephone however it was typed. */
export function phoneKey(value) {
  const digits = String(value == null ? '' : value).replace(/\D+/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/**
 * Does this look like a telephone number rather than a name or a record id?
 *
 * The upper bound matters. A Zoho record id is nineteen digits, and its last
 * ten are a perfectly good telephone number — so without it, a finding titled
 * 1425808000000546781 could be resolved to whichever patient happened to own
 * 0000546781, which nobody does, until one day somebody does. Fifteen is the
 * most digits a telephone number has anywhere in the world.
 */
export function looksLikePhone(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s || /[a-z]/i.test(s)) return false;
  const digits = s.replace(/\D+/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * number -> name, built from whatever the customer's own records hold.
 *
 * Pure over the datasets it is given, so the rule can be tested without a
 * database. A number seen with two different names is dropped rather than
 * guessed at — see the note above on why that asymmetry is deliberate.
 */
export function buildPhoneBook(datasets = []) {
  const seen = new Map();

  for (const d of datasets) {
    const columns = d.columns || [];
    const phones = columns
      .map((c, i) => [c, i])
      .filter(([c]) => PHONE_COLUMN.test(c))
      .map(([, i]) => i);
    if (!phones.length) continue;

    const names = columns
      .map((c, i) => [c, i])
      .filter(([c]) => NAME_COLUMN.test(c) && !NOT_A_NAME.test(c) && !SOMEONE_ELSE.test(c))
      .map(([, i]) => i);
    if (!names.length) continue;

    for (const row of d.rows || []) {
      const person = names
        .map((i) => String(row[i] == null ? '' : row[i]).trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!person || looksLikePhone(person)) continue;

      for (const i of phones) {
        const key = phoneKey(row[i]);
        if (!key) continue;
        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key).add(person);
      }
    }
  }

  const book = new Map();
  for (const [key, people] of seen) if (people.size === 1) book.set(key, [...people][0]);
  return book;
}

/**
 * What to call the subject of a finding.
 *
 * A title that is not a telephone number is already a person's name, or a
 * record nothing could resolve, and is returned untouched. This only ever
 * turns a number into a name — never the other way, and never one name into
 * another.
 */
export function personFor(title, book) {
  const s = String(title == null ? '' : title).trim();
  if (!looksLikePhone(s)) return s;
  const name = book && book.get ? book.get(phoneKey(s)) : '';
  return name || s;
}

/*
 * Reading every row of every dataset is what building this costs, and the
 * answer does not change until rows do. Keyed on dataVersion, which changes
 * at the moment they land — so there is no staleness window to reason about.
 */
let cached = { version: null, book: new Map() };

export async function phoneBook(kind = 'own') {
  const version = dataVersion();
  if (cached.version === version) return cached.book;

  const datasets = [];
  for (const d of readIndex()) {
    try {
      const all = await readAllRows(d, kind);
      if (all.rows.length) {
        datasets.push({
          columns: all.columns,
          rows: all.rows.map((r) => r.cells),
        });
      }
    } catch { /* one unreadable dataset must not cost the whole book */ }
  }

  const book = buildPhoneBook(datasets);
  cached = { version, book };
  return book;
}

/**
 * The people a board is about, each with how many findings name them.
 *
 * Only people who have something wrong. A dropdown holding every patient in
 * the practice is a directory, and a directory is not what somebody reading a
 * morning list is looking for — they want to know which of the handful in
 * front of them to deal with, and then everything about that one.
 *
 * Ordered by how many findings each has, worst first, so the person needing
 * most attention is the first thing under the box.
 */
export function peopleIn(findings = []) {
  const by = new Map();
  for (const f of findings) {
    const person = String(f.person || f.title || '').trim();
    if (!person) continue;
    if (!by.has(person)) by.set(person, { person, findings: 0 });
    by.get(person).findings += 1;
  }
  return [...by.values()].sort((a, b) => b.findings - a.findings || a.person.localeCompare(b.person));
}
