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

/**
 * Columns that hold a telephone number.
 *
 * called_from and called_to are here because a call has two ends and the
 * connector lands both. Without them the only number a call finding offered
 * was the one end the application had already picked as the subject — which
 * is the end the CRM may not know.
 */
const PHONE_COLUMN = /phone|mobile|whatsapp|\btel\b|contact_?number|msisdn|called_(from|to)|(from|to|caller|dialled|dialed)_number/i;

/**
 * Columns that hold THIS person's name.
 *
 * The same discipline the answer pipeline uses on identifiers: a clinic's
 * record carries the physiotherapist, the referrer and the emergency contact
 * beside the patient, and every one of those columns is called something
 * _name. Taking them all names two people as one, which reads as true.
 */
const NAME_COLUMN = /(^|_)(name|first|last|given|surname|full)(_|$)/i;
/*
 * Measured against a real Zoho module, where being loose cost dearly.
 *
 * Last_Activity_Time matches the name pattern on "last". Account_Name matches
 * on "name". Joined with the patient's own name they produced
 *
 *     "Rahul Sharma Rahul Sharma Clinic and Wellness 2026-09-29T12:44:04+05:30"
 *
 * as the name of a person — which is not a near miss, it is four fields in a
 * trench coat. time, activity and account are here for that reason.
 */
const NOT_A_NAME = /(id|code|ref|number|phone|mobile|email|date|time|amount|status|owner|activity|created|modified|account|company|source|stage|type|title)/i;
/*
 * And an address is not a person, however it ends.
 *
 * Zoho ships a column called Billing_Flat_House_No_Building_Apartment_Name,
 * which matches the name pattern on its last word and is a doorway. The
 * watcher catalogue learned this the same way and vetoes the same words.
 */
const AN_ADDRESS = /(address|street|house|flat|building|apartment|city|country|postal|zip|province|lane|road|locality|landmark)/i;
const SOMEONE_ELSE = /(coach|guardian|parent|instructor|teacher|staff|manager|owner|emergency|referr|next_of_kin|trainer|admin|physio|doctor|consultant)/i;

/**
 * The column, or the pair of columns, that name THIS person.
 *
 * One column, or a first/last pair, and never a handful joined — the same
 * rule the answer pipeline holds itself to when it resolves an identifier.
 * A record carries several name-ish columns and only one of them is the
 * patient; taking them all reads as true and is not.
 */
export function nameColumnsIn(columns = []) {
  const candidates = columns
    .map((c, i) => [c, i])
    .filter(([c]) => NAME_COLUMN.test(c) && !NOT_A_NAME.test(c)
      && !SOMEONE_ELSE.test(c) && !AN_ADDRESS.test(c));
  if (!candidates.length) return [];

  // A whole name, where the record keeps one.
  const full = candidates.find(([c]) => /(^|_)full(_|$)/i.test(c) || /^name$/i.test(c));
  if (full) return [full[1]];

  // Otherwise one person's name split in two, which is one name.
  const first = candidates.find(([c]) => /(^|_)(first|given)(_|$)/i.test(c));
  const last = candidates.find(([c]) => /(^|_)(last|surname)(_|$)/i.test(c));
  if (first && last) return [first[1], last[1]];

  return [candidates[0][1]];
}

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
 * Is this a person's name, or something that landed in a name column?
 *
 * The last guard, and a cheap one. A column can be chosen correctly and still
 * hold a timestamp, a phone number or an empty string on a given row, and a
 * board naming a patient "2026-09-29T12:44:04+05:30" is worse than one
 * showing the number it started with.
 */
export function isName(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s || s.length > 60) return false;
  if (looksLikePhone(s)) return false;
  // A date or a timestamp, however it was written.
  if (/\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}:\d{2}/.test(s)) return false;
  // A name has letters in it.
  return /\p{L}/u.test(s);
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

    const names = nameColumnsIn(columns);
    if (!names.length) continue;

    for (const row of d.rows || []) {
      const person = names
        .map((i) => String(row[i] == null ? '' : row[i]).trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!isName(person)) continue;

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

/** The phone numbers standing in one finding's own evidence rows. */
export function numbersIn(evidence) {
  const out = new Set();
  const sides = Array.isArray(evidence?.sides) && evidence.sides.length === 2
    ? [
      { columns: evidence.sides[0].columns, rows: (evidence.lines || []).slice(0, evidence.leftCount) },
      { columns: evidence.sides[1].columns, rows: (evidence.lines || []).slice(evidence.leftCount) },
    ]
    : [{ columns: evidence?.columns || [], rows: evidence?.lines || [] }];

  for (const s of sides) {
    (s.columns || []).forEach((c, i) => {
      if (!PHONE_COLUMN.test(c)) return;
      for (const r of s.rows || []) {
        const v = (r || [])[i];
        /*
         * The value has to look like a telephone, not merely sit in a column
         * that could hold one. phoneKey takes the last ten digits of whatever
         * it is given, so a call id of 80592ec7bca66af93e4450e5fe981a9t and a
         * timestamp of 2026-09-29T20:12:12.000Z both yield a perfectly
         * plausible number — and matching on one of those would name a
         * patient from a coincidence.
         */
        if (!looksLikePhone(v)) continue;
        const key = phoneKey(v);
        if (key) out.add(key);
      }
    });
  }
  return [...out];
}

/**
 * Who a finding is about, using every number it carries.
 *
 * ── Why the title alone is not enough ──────────────────────────────────────
 *
 * A call has two ends, and the application picks one of them to be the
 * subject — whoever the call was with, by direction. That is the right
 * subject, and it is not always the end the CRM knows.
 *
 * Measured. A clinic rang a patient from 07349250500 and reached him on
 * 07349250983. Their own Zoho contact for Rahul Sharma carries 07349250500 —
 * the line they dialled from — so the call's subject resolved to nobody, and
 * the same man sat on the board as "Rahul Sharma" three times and as a
 * telephone number once.
 *
 * Both ends are in the finding's own evidence. If exactly one person in the
 * customer's records is named by ANY number on it, the finding is about that
 * person: a call with two ends, one of which is a known patient, is a call
 * with that patient.
 *
 * ── And the same refusal, for the same reason ──────────────────────────────
 *
 * Exactly one, across every number. A clinic's main line sitting in fifty
 * contact records names fifty people, and that resolves to none of them
 * rather than to whichever came first — which is what stops this rule
 * attaching every outbound call in the practice to one unlucky patient.
 */
export function personForFinding(view, book) {
  const titled = personFor(view?.title, book);
  if (titled !== String(view?.title || '').trim()) return titled;
  if (!looksLikePhone(view?.title)) return titled;

  const named = new Set();
  for (const key of numbersIn(view?.evidence)) {
    const who = book && book.get ? book.get(key) : '';
    if (who) named.add(who);
  }
  return named.size === 1 ? [...named][0] : titled;
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
