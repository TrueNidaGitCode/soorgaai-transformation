/**
 * A watcher must ask about the right column, in the right dataset.
 *
 * ── Found on a live run, not in review ─────────────────────────────────────
 *
 * A physiotherapy centre's first application bound Stopped Coming to
 * `sale_date` on a package sheet — "clients with no sale_date in the last 14
 * days", which is true of every package sold a fortnight ago. The column it
 * wanted, `last_session_date`, was eleven columns further along the same row.
 *
 * Empty Slot did the same thing one level up: it took the package sheet
 * because that dataset came first, while an appointment diary with a cabin and
 * a booking time sat unused.
 *
 * Both are worse than not matching at all. A watcher that cannot run says so
 * and offers the records it would need. A watcher bound to the wrong column
 * runs happily, produces findings with real evidence attached, and teaches the
 * customer that the product does not understand their business.
 */

import { describe, it, expect } from 'vitest';
import { columnsFor, matchDataset, catalogueFor, entryFor, entryFor } from '../eame-template/services/agentCatalogue.js';

/** The real columns Cob generated for the clinic's package sheet. */
const packages = {
  name: 'Package Sales and Balances',
  columns: ['package_sale_id', 'client_id', 'client_name', 'package_name', 'sale_date',
    'expiry_date', 'total_sessions', 'sessions_completed', 'sessions_remaining',
    'last_session_date', 'days_since_last_visit', 'total_amount_inr',
    'balance_amount_due_inr', 'package_status', 'assigned_physio'],
};

const attendance = {
  name: 'Session Attendance Logs',
  columns: ['attendance_id', 'appointment_id', 'client_id', 'check_in_timestamp',
    'attendance_status', 'physio_name'],
};

describe('choosing the column within a dataset', () => {
  it('prefers when something last happened over when it began', () => {
    const when = columnsFor('when', packages.columns);
    expect(when[0], `ordered: ${when.join(', ')}`).toBe('last_session_date');
  });

  it('demotes the dates that mean something else entirely', () => {
    const when = columnsFor('when', packages.columns);
    // expiry_date is the `due` role's; sale_date is an origin, not a recency.
    expect(when.indexOf('last_session_date')).toBeLessThan(when.indexOf('sale_date'));
    expect(when.indexOf('last_session_date')).toBeLessThan(when.indexOf('expiry_date'));
  });

  it('never picks a count as the thing that was booked', () => {
    /*
     * The rule is about what gets CHOSEN, not about the exact ordering of the
     * rejects. Several count columns tie as poor and keep their own order
     * behind everything else; what matters is that none of them is reached
     * while a real candidate remains.
     */
    const slot = columnsFor('slot', packages.columns);
    const counts = ['total_sessions', 'sessions_completed', 'sessions_remaining'];
    expect(counts, `ordered: ${slot.join(', ')}`).not.toContain(slot[0]);
  });

  it('prefers a name over an id for the subject of a finding', () => {
    // The finding's title is this column. "Rohan S." is a finding somebody
    // can act on; "CL-1042" is a lookup they have to do first.
    expect(columnsFor('who', packages.columns)[0]).toBe('client_name');
  });

  it('asks the question that actually detects somebody drifting away', () => {
    const m = matchDataset(entryFor('stopped-coming'), packages);
    expect(m.using.when).toBe('last_session_date');
    expect(m.using.when).not.toBe('sale_date');
  });

  it('still matches a dataset with only one candidate per role', () => {
    // The reordering must not make anything unmatchable — the search is still
    // exhaustive, only the order it tries candidates has changed.
    const thin = { name: 'Roll Call', columns: ['Student Name', 'Session Date'] };
    expect(matchDataset(entryFor('stopped-coming'), thin)).toBeTruthy();
  });
});

describe('choosing the dataset', () => {
  it('takes the attendance log over the package sheet for who stopped coming', () => {
    /*
     * Both satisfy the roles. Only one is a record of people turning up.
     */
    const row = catalogueFor([packages, attendance], {}).find(r => r.id === 'stopped-coming');
    expect(row.using).toBe('Session Attendance Logs');
  });

  it('is not decided by which dataset happens to be first', () => {
    const forward = catalogueFor([packages, attendance], {}).find(r => r.id === 'stopped-coming');
    const reversed = catalogueFor([attendance, packages], {}).find(r => r.id === 'stopped-coming');
    expect(reversed.using).toBe(forward.using);
  });

  it('keeps the earlier dataset when nothing separates them', () => {
    // An application with one obvious source must behave exactly as before.
    const a = { name: 'Roll Call A', columns: ['Student Name', 'Session Date'] };
    const b = { name: 'Roll Call B', columns: ['Student Name', 'Session Date'] };
    expect(catalogueFor([a, b], {}).find(r => r.id === 'stopped-coming').using).toBe('Roll Call A');
  });

  it('sends money watchers to the money dataset', () => {
    const row = catalogueFor([attendance, packages], {}).find(r => r.id === 'overdue-invoice');
    if (row.ready) expect(row.using).toBe('Package Sales and Balances');
  });
});

/**
 * A CRM is not a spreadsheet, and the catalogue did not speak its language.
 *
 * ── Measured on a live Zoho account, not imagined ──────────────────────────
 *
 * Nine modules connected: Leads, Contacts, Accounts, Deals, Tasks, Meetings,
 * Calls, Stage History, Notes. A real appointment sat in Meetings with
 * Appointment_Status = "No Show" against Who_Id = "Rahul Sharma".
 *
 * Thirty-two of thirty-six watchers reported ready, and almost every one had
 * bound to Leads — the widest module, first in the list — because nothing in
 * these patterns knew the words a CRM uses. What that produced:
 *
 *   No Show          → "First_Name in Leads booked but marked absent"
 *   Overdue Invoice  → "rows in Deals past their Created_By and not paid"
 *   Marked Absent…   → "Enrich_Status__s ... has a Last_Enriched_Time__s"
 *   Late Delivery    → "orders in Contacts past their Created_By"
 *
 * Every one of those runs, attaches real rows, and is about nothing. Created_By
 * names a person; Enrich_Status__s describes Zoho's own enrichment feature;
 * and the module actually holding the no-show was never chosen by anything.
 */
describe('a CRM’s own words', () => {
  const meetings = {
    name: 'Meetings (Zoho CRM)',
    columns: ['id', 'Event_Title', 'Venue', 'Start_DateTime', 'End_DateTime', 'Owner', 'Who_Id',
      'Created_By', 'Modified_By', 'Created_Time', 'Modified_Time', 'Participants', 'Check_In_State',
      'Check_In_Status', 'Last_Activity_Time', 'Record_Status__s', 'Appointment_Status'],
    internal: ['Record_Status__s'],
  };
  const leads = {
    name: 'Leads (Zoho CRM)',
    columns: ['id', 'Owner', 'First_Name', 'Last_Name', 'Full_Name', 'Email', 'Phone', 'Lead_Source',
      'Lead_Status', 'Created_By', 'Modified_By', 'Created_Time', 'Modified_Time',
      'Last_Activity_Time', 'Enrich_Status__s', 'Last_Enriched_Time__s'],
    internal: ['Enrich_Status__s', 'Last_Enriched_Time__s'],
  };
  const deals = {
    name: 'Deals (Zoho CRM)',
    columns: ['id', 'Owner', 'Amount', 'Deal_Name', 'Closing_Date', 'Stage', 'Created_By',
      'Modified_By', 'Created_Time', 'Modified_Time', 'Last_Activity_Time'],
  };
  const all = [leads, deals, meetings];
  const row = (id) => catalogueFor(all, {}).find((r) => r.id === id);

  it('asks the diary about the no-show, not the lead list', () => {
    const r = row('no-show');
    expect(r.ready).toBe(true);
    expect(r.using).toBe('Meetings (Zoho CRM)');
    // The person the appointment is WITH, and the status the practice set.
    expect(r.question).toContain('Who_Id');
  });

  it('never reads a deadline off the name of whoever created the record', () => {
    for (const id of ['overdue-invoice', 'late-delivery', 'promise-overdue']) {
      const r = row(id);
      expect(r.question).not.toContain('Created_By');
      expect(r.question).not.toContain('Modified_By');
    }
  });

  it('measures a deal against the date a CRM closes it on', () => {
    const r = row('overdue-invoice');
    expect(r.ready).toBe(true);
    expect(r.question).toContain('Closing_Date');
  });

  it('asks nothing about the source’s own bookkeeping', () => {
    for (const r of catalogueFor(all, {})) {
      expect(r.question).not.toContain('Enrich_Status__s');
      expect(r.question).not.toContain('Last_Enriched_Time__s');
      expect(r.question).not.toContain('Record_Status__s');
    }
  });

  it('keeps the owner when the owner is the only name there', () => {
    // Weaker than a customer's name, not forbidden: on an engineering
    // schedule the owner of a task is exactly who the watcher means.
    const plan = { name: 'Delivery Plan', columns: ['Task_Id', 'Owner', 'Planned_Finish', 'Status'] };
    const r = catalogueFor([plan], {}).find((x) => x.id === 'unassigned-work');
    if (r.ready) expect(r.question).toContain('Owner');
  });
});

/**
 * Records the business has beat records this application invented.
 *
 * ── Why this outranks everything else in fitOf ─────────────────────────────
 *
 * A delivered application ships with sample datasets whose columns were built
 * to be exactly the columns the business uses. That makes them unbeatable on
 * structure by construction: measured live, "Appointment Booking Diary"
 * (sample) and "Meetings (Zoho CRM)" (real, ten records, one of them a No
 * Show against a real patient) both scored 4 for the No Show watcher, and the
 * tie went to whichever came first in the index — the sample one.
 *
 * A watcher reads `kind: 'own'`. Bound to a dataset holding none of the
 * owner's rows it finds nothing every morning, which on the board and in the
 * digest is indistinguishable from a business with nothing wrong.
 */
describe('sample data and the real thing', () => {
  const shipped = {
    name: 'Appointment Booking Diary',
    columns: ['appointment_id', 'client_id', 'practitioner_name', 'appointment_date', 'booking_status'],
    own: 0,
  };
  const real = {
    name: 'Meetings (Zoho CRM)',
    columns: ['id', 'Event_Title', 'Start_DateTime', 'Owner', 'Who_Id', 'Appointment_Status'],
    own: 10,
  };

  it('takes the dataset the owner’s records are actually in', () => {
    const r = catalogueFor([shipped, real], {}).find((x) => x.id === 'no-show');
    expect(r.ready).toBe(true);
    expect(r.using).toBe('Meetings (Zoho CRM)');
  });

  it('is not decided by which came first', () => {
    const r = catalogueFor([real, shipped], {}).find((x) => x.id === 'no-show');
    expect(r.using).toBe('Meetings (Zoho CRM)');
  });

  it('still uses the sample one when nothing real has arrived', () => {
    // Before anything is connected this is all there is, and a watcher on it
    // is how somebody sees what the product does.
    const r = catalogueFor([shipped, { ...real, own: 0 }], {}).find((x) => x.id === 'no-show');
    expect(r.using).toBe('Appointment Booking Diary');
  });

  it('changes nothing for a caller that did not count', () => {
    const uncounted = [{ ...shipped, own: undefined }, { ...real, own: undefined }];
    const r = catalogueFor(uncounted, {}).find((x) => x.id === 'no-show');
    expect(r.ready).toBe(true);
  });
});

/**
 * An address is not a person.
 *
 * A CRM's Accounts module carries Billing_Flat_House_No_Building_Apartment_Name.
 * It matches `name`, so it ranked exactly as well as First_Name did, and with
 * the modules tied on everything else the choice fell to alphabetical order —
 * Accounts before Leads. The board read:
 *
 *   Billing_Flat_House_No_Building_Apartment_Name in Accounts (Zoho CRM)
 *   with no Last_Activity_Time in the last 14 days
 */
describe('a name-shaped column that is not a name', () => {
  const accounts = {
    name: 'Accounts (Zoho CRM)',
    columns: ['id', 'Account_Name', 'Billing_City', 'Billing_State',
      'Billing_Flat_House_No_Building_Apartment_Name', 'Last_Activity_Time'],
    own: 11,
  };

  it('is never the person a finding is about', () => {
    const r = catalogueFor([accounts], {}).find((x) => x.id === 'stopped-coming');
    expect(r.question).not.toContain('Billing_Flat');
    expect(r.question).toContain('Account_Name');
  });

  it('loses to a real name in another dataset', () => {
    const leads = {
      name: 'Leads (Zoho CRM)',
      columns: ['id', 'First_Name', 'Lead_Status', 'Last_Activity_Time'],
      own: 10,
    };
    // Accounts sorts first; nothing but the veto separates them.
    const r = catalogueFor([accounts, leads], {}).find((x) => x.id === 'stopped-coming');
    expect(r.question).toContain('First_Name');
  });
});

/**
 * A watcher must name the columns it bound.
 *
 * ── Measured on a live CRM ─────────────────────────────────────────────────
 *
 * No Show asked "{who} in {dataset} booked but marked absent". It requires a
 * status column in order to match a dataset at all — and then never told the
 * pipeline which one. Against Meetings (Zoho CRM), where one row said
 * Appointment_Status = "No Show", it ran clean, planned nothing, read nothing
 * and reported nothing.
 *
 * That is the worst failure this product has: a watcher that is green, a
 * board that is empty, and a business that reads the silence as good news.
 */
describe('a watcher says where to look', () => {
  it('names the status it bound, because the absence is written there', () => {
    const e = entryFor('no-show');
    expect(e.needs).toContain('status');
    expect(e.question).toContain('{status}');
  });

  it('puts the real column into the question it will ask', () => {
    const meetings = {
      name: 'Meetings (Zoho CRM)',
      columns: ['id', 'Event_Title', 'Start_DateTime', 'Owner', 'Who_Id', 'Appointment_Status'],
      own: 10,
    };
    const r = catalogueFor([meetings], {}).find((x) => x.id === 'no-show');
    expect(r.question).toContain('Appointment_Status');
    expect(r.question).toContain('Who_Id');
  });
});
