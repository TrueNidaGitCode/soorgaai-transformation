/**
 * Who a finding is about, and one person at a time.
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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  phoneKey, looksLikePhone, buildPhoneBook, personFor, peopleIn, nameColumnsIn, isName,
} from '../eame-template/services/peopleService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** A clinic's records, as they actually differ between systems. */
const RECORDS = [{
  columns: ['id', 'Full_Name', 'Phone', 'Owner'],
  rows: [
    ['1425808000000546781', 'Rahul Sharma', '+91 73492 50983', 'Pranesh'],
    ['1425808000000546782', 'Priya Nair', '9845012345', 'Pranesh'],
  ],
}];

describe('one telephone, however it was typed', () => {
  it('is the last ten digits', () => {
    for (const written of ['7349250983', '07349250983', '+917349250983', '+91 73492 50983']) {
      expect(phoneKey(written), written).toBe('7349250983');
    }
  });

  it('is not a record id, however many digits it has', () => {
    /*
     * A Zoho record id is nineteen digits and its last ten are a perfectly
     * good telephone number. Without an upper bound, a finding titled
     * 1425808000000546781 resolves to whoever owns 0000546781 — which is
     * nobody, until one day it is somebody.
     */
    expect(looksLikePhone('1425808000000546781')).toBe(false);
    expect(looksLikePhone('+917349250983')).toBe(true);
  });

  it('is not a name', () => {
    expect(looksLikePhone('Rahul Sharma')).toBe(false);
    expect(looksLikePhone('')).toBe(false);
  });
});

describe('turning a number into a person', () => {
  const book = buildPhoneBook(RECORDS);

  it('finds the patient behind the number the phone system reported', () => {
    expect(personFor('7349250983', book)).toBe('Rahul Sharma');
  });

  it('finds them however the number was written in either system', () => {
    expect(personFor('+91 73492 50983', book)).toBe('Rahul Sharma');
    expect(personFor('07349250983', book)).toBe('Rahul Sharma');
  });

  it('leaves a name alone', () => {
    // It only ever turns a number into a name, never one name into another.
    expect(personFor('Rahul Sharma', book)).toBe('Rahul Sharma');
  });

  it('leaves a number nobody in the records has', () => {
    expect(personFor('9999999999', book)).toBe('9999999999');
  });

  it('leaves a record id alone', () => {
    expect(personFor('1425808000000546781', book)).toBe('1425808000000546781');
  });
});

describe('what it refuses to guess', () => {
  it('shows the number when two people share it', () => {
    /*
     * A couple, a parent and a child, a clinic's own line typed into a
     * contact record. Attaching a recorded conversation to the wrong patient
     * is not a cosmetic error on a clinic's board, and a number nobody
     * recognises is a far smaller failure than the wrong name stated
     * confidently.
     */
    const shared = [{
      columns: ['Full_Name', 'Phone'],
      rows: [['Anil Kumar', '9845012345'], ['Meera Kumar', '9845012345']],
    }];
    expect(personFor('9845012345', buildPhoneBook(shared))).toBe('9845012345');
  });

  it('ignores the name of somebody else standing in the same row', () => {
    // A clinic's record carries the physiotherapist, the referrer and the
    // emergency contact beside the patient, all called something_name.
    const book = buildPhoneBook([{
      columns: ['Full_Name', 'Physio_Name', 'Emergency_Contact_Name', 'Phone'],
      rows: [['Rahul Sharma', 'Dr Rao', 'Sita Sharma', '7349250983']],
    }]);
    expect(book.get('7349250983')).toBe('Rahul Sharma');
  });

  it('never takes an id or an email as a name', () => {
    const book = buildPhoneBook([{
      columns: ['Name_Id', 'Email_Name', 'Phone'],
      rows: [['ABC-1', 'a@b.com', '7349250983']],
    }]);
    expect(book.size).toBe(0);
  });

  it('is empty when the records hold no telephone at all', () => {
    expect(buildPhoneBook([{ columns: ['Full_Name'], rows: [['Rahul Sharma']] }]).size).toBe(0);
  });
});

describe('the people a morning is about', () => {
  const findings = [
    { person: 'Rahul Sharma', title: 'Rahul Sharma' },
    { person: 'Rahul Sharma', title: '7349250983' },
    { person: 'Priya Nair', title: 'Priya Nair' },
  ];

  it('counts a patient once, however the finding named them', () => {
    // The whole point: a call and a CRM record are the same man.
    const people = peopleIn(findings);
    expect(people.map((p) => p.person)).toEqual(['Rahul Sharma', 'Priya Nair']);
    expect(people[0].findings).toBe(2);
  });

  it('puts whoever needs most attention first', () => {
    expect(peopleIn(findings)[0].person).toBe('Rahul Sharma');
  });

  it('holds only people something is wrong with', () => {
    /*
     * A list of every patient in the practice is a directory, and nobody
     * reading a morning list wants a directory.
     */
    expect(peopleIn([]).length).toBe(0);
  });
});

describe('how the board uses it', () => {
  const ctl = read('../eame-template/controllers/agentsController.js');
  const ui = read('../eame-template/frontend/findings.js');
  const html = read('../eame-template/frontend/index.html');

  it('attaches the person to every finding it serves', () => {
    expect(ctl).toContain('v.person = personFor(v.title, book)');
    expect(ctl).toContain('resolved: resolved.map(withPerson)');
  });

  it('serves the list of people beside them', () => {
    expect(ctl).toContain('people: peopleIn(rows)');
  });

  it('filters without asking the server again', () => {
    // A lens on one morning's findings, exactly as a category chip is.
    expect(ui).toContain('if (person && (f.person || f.title) !== person) return false;');
    expect(ui).toContain('if (_last) render(_last);');
  });

  it('hides the box when there is nobody to choose between', () => {
    // A control offering a choice of one does nothing, and a reader has to
    // work that out for themselves.
    expect(ui).toContain('if (people.length < 2)');
  });

  it('clears a selection whose findings have all resolved', () => {
    expect(ui).toContain("if (person && !people.some(function (p) { return p.person === person; })) person = '';");
  });

  it('is on the board, above the findings', () => {
    expect(html).toContain('id="fn-who"');
    expect(html.indexOf('id="fn-who"')).toBeLessThan(html.indexOf('id="fn-list"'));
  });
});

/**
 * Which column names the patient, measured against a real Zoho module.
 *
 * Being loose here cost dearly. Last_Activity_Time matches the name pattern
 * on "last". Account_Name matches on "name". Joined with the patient's own
 * name they produced, as the name of a person:
 *
 *     "Rahul Sharma Rahul Sharma Clinic and Wellness 2026-09-29T12:44:04+05:30"
 *
 * which is not a near miss, it is four fields in a trench coat.
 */
describe('which column names the patient', () => {
  const pick = (columns) => nameColumnsIn(columns).map((i) => columns[i]);

  it('takes a whole name where the record keeps one', () => {
    expect(pick(['id', 'Full_Name', 'First_Name', 'Last_Name', 'Phone'])).toEqual(['Full_Name']);
  });

  it('takes a first and last pair, which is one name split in two', () => {
    expect(pick(['id', 'First_Name', 'Last_Name', 'Phone'])).toEqual(['First_Name', 'Last_Name']);
  });

  it('never joins a handful of name-ish columns', () => {
    // The rule the answer pipeline holds itself to: one column, or a pair.
    expect(pick(['Full_Name', 'Account_Name', 'Owner_Name', 'Last_Activity_Time'])).toEqual(['Full_Name']);
  });

  it('refuses a timestamp that matched on "last"', () => {
    expect(pick(['Last_Activity_Time', 'Phone'])).toEqual([]);
  });

  it('refuses the account or the company', () => {
    expect(pick(['Account_Name', 'Company_Name', 'Phone'])).toEqual([]);
  });

  it('refuses an address, however it ends', () => {
    // Zoho ships Billing_Flat_House_No_Building_Apartment_Name, which matches
    // the name pattern on its last word and is a doorway.
    expect(pick(['Billing_Flat_House_No_Building_Apartment_Name', 'Phone'])).toEqual([]);
  });

  it('refuses the physiotherapist standing beside the patient', () => {
    expect(pick(['Physio_Name', 'Emergency_Contact_Name', 'Phone'])).toEqual([]);
  });
});

describe('the last guard on a value', () => {
  it('refuses a timestamp that landed in a name column', () => {
    expect(isName('2026-09-29T12:44:04+05:30')).toBe(false);
    expect(isName('29/09/2026')).toBe(false);
  });

  it('refuses a number, an empty cell and a paragraph', () => {
    expect(isName('7349250983')).toBe(false);
    expect(isName('   ')).toBe(false);
    expect(isName('x'.repeat(61))).toBe(false);
  });

  it('accepts a name', () => {
    expect(isName('Rahul Sharma')).toBe(true);
    expect(isName('Priya')).toBe(true);
  });
});
