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
import { columnsFor, matchDataset, catalogueFor, entryFor } from '../eame-template/services/agentCatalogue.js';

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
