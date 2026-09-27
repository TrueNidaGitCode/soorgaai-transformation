/**
 * The reasoning layer: time, derivation, joining, validation.
 *
 * These are the operations that used to be impossible, and every one of them
 * is arithmetic or set logic rather than judgement — which is the whole point
 * of having moved them out of the prompt. No model is involved in any of it.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDate, windowRange, inWindow, dateCoverage,
  deriveByEntity, matchesAll, joinOnEntity, validate,
} from '../eame-template/services/reasoning.js';

const NOW = new Date(2026, 8, 14, 10, 0, 0);   // Monday 14 September 2026
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

describe('a date, however the spreadsheet wrote it', () => {
  it('reads the shapes a customer\'s sheet actually contains', () => {
    // Day-first for the ambiguous ones: these are Indian academy sheets.
    expect(iso(parseDate('12/09/2026', NOW))).toBe('2026-09-12');
    expect(iso(parseDate('2026-09-12', NOW))).toBe('2026-09-12');
    expect(iso(parseDate('12-09-2026', NOW))).toBe('2026-09-12');
    expect(iso(parseDate('12 Sep 2026', NOW))).toBe('2026-09-12');
    expect(iso(parseDate('12/09/26', NOW))).toBe('2026-09-12');
  });

  it('fills in a missing year with the one that is not in the future', () => {
    // A roll call sheet is about days that have happened.
    expect(iso(parseDate('12/09', NOW))).toBe('2026-09-12');
    expect(iso(parseDate('25/12', NOW))).toBe('2025-12-25');
  });

  it('returns nothing rather than a wrong day', () => {
    expect(parseDate('', NOW)).toBeNull();
    expect(parseDate('not a date', NOW)).toBeNull();
    expect(parseDate('32/13/2026', NOW)).toBeNull();
  });
});

describe('the windows a person names', () => {
  it('computes today, this week, last week and this month', () => {
    expect(iso(windowRange('today', NOW).from)).toBe('2026-09-14');
    expect(iso(windowRange('this week', NOW).from)).toBe('2026-09-14');    // Monday
    const last = windowRange('last week', NOW);
    expect(iso(last.from)).toBe('2026-09-07');
    expect(iso(last.to)).toBe('2026-09-14');                                // exclusive
    expect(iso(windowRange('this month', NOW).from)).toBe('2026-09-01');
  });

  it('reads "recently" as a fortnight, which is what a coach means', () => {
    expect(iso(windowRange('recently', NOW).from)).toBe('2026-08-31');
    expect(iso(windowRange('last 30 days', NOW).from)).toBe('2026-08-15');
  });

  it('has no opinion about a phrase it does not know', () => {
    expect(windowRange('at some point', NOW)).toBeNull();
  });

  it('puts a row in the window or leaves it out, whatever the date format', () => {
    const week = windowRange('this week', NOW);
    expect(inWindow('14/09/2026', week, NOW)).toBe(true);
    expect(inWindow('2026-09-13', week, NOW)).toBe(false);   // Sunday, last week
    // An unreadable date is not quietly counted as inside.
    expect(inWindow('n/a', week, NOW)).toBe(false);
  });

  it('reports how much of a column could be read at all', () => {
    const rows = [{ cells: ['12/09/2026'] }, { cells: ['rubbish'] }, { cells: [''] }];
    expect(dateCoverage(rows, 0, NOW)).toEqual({ readable: 1, total: 3 });
    // A window over an unreadable column would answer "nobody", which looks
    // like good news; the validator uses this to say so instead.
    expect(dateCoverage(rows, -1, NOW)).toEqual({ readable: 0, total: 3 });
  });
});

describe('a fact computed per person, not read off a row', () => {
  const columns = ['date', 'name', 'status'];
  const rows = [
    ['01/09/2026', 'Arjun Bose', 'absent'],
    ['03/09/2026', 'Arjun Bose', 'absent'],
    ['05/09/2026', 'Arjun Bose', 'present'],
    ['01/09/2026', 'Rohan Sharma', 'absent'],
    ['03/09/2026', 'Rohan Sharma', 'present'],
  ].map(cells => ({ cells, source: 'folder' }));

  it('turns "poor attendance" into a count and a threshold', () => {
    // Not a column in anybody's spreadsheet — which is why every question
    // phrased this way used to be refused.
    const out = deriveByEntity(rows, columns, {
      entity: 'name', where: [['status', 'is', 'absent']], metric: 'count', having: ['>=', 2],
    });
    expect(out.map(o => o.name)).toEqual(['Arjun Bose']);
    expect(out[0].value).toBe(2);
    expect(out[0].records).toHaveLength(3);   // the person's rows, all of them
  });

  it('can measure a share rather than a count', () => {
    const out = deriveByEntity(rows, columns, {
      entity: 'name', where: [['status', 'is', 'absent']], metric: 'rate', having: ['>=', 0.6],
    });
    expect(out.map(o => o.name)).toEqual(['Arjun Bose']);   // 2 of 3
  });

  it('orders the worst first, because a list nobody ordered is a list nobody reads', () => {
    const out = deriveByEntity(rows, columns, { entity: 'name', where: [['status', 'is', 'absent']] });
    expect(out.map(o => o.name)).toEqual(['Arjun Bose', 'Rohan Sharma']);
  });
});

describe('matching a cell', () => {
  const columns = ['name', 'status'];
  it('takes a list of names, which is how a follow-up narrows a set', () => {
    expect(matchesAll(['Arjun Bose', 'absent'], columns, [['name', 'is any of', 'Arjun Bose|Rohan Sharma']])).toBe(true);
    expect(matchesAll(['Dhruv Mehta', 'absent'], columns, [['name', 'is any of', 'Arjun Bose|Rohan Sharma']])).toBe(false);
  });
  it('catches a status written loosely', () => {
    // "no response (2nd time)" is a no-show however the coach typed it.
    expect(matchesAll(['A', 'No Response (2nd time)'], columns, [['status', 'matches', 'absent|no response']])).toBe(true);
  });
});

describe('the same person in two results', () => {
  const left = [{ name: 'Arjun Bose', records: [1] }, { name: 'Rohan Sharma', records: [2] }];
  const right = [{ name: ' arjun  bose ', records: [3] }, { name: 'Dhruv Mehta', records: [4] }];

  it('joins on the person, loosely enough to survive two spreadsheets', () => {
    const both = joinOnEntity(left, right, 'both');
    expect(both.map(b => b.name)).toEqual(['Arjun Bose']);
    expect(both[0].records).toEqual([1, 3]);
  });

  it('can ask for the ones in the first and not the second', () => {
    expect(joinOnEntity(left, right, 'leftOnly').map(b => b.name)).toEqual(['Rohan Sharma']);
  });
});

describe('what may safely be said', () => {
  const group = (o) => ({ label: 'G', category: 'absent', records: 2, entities: 2, items: [], dataset: 'd', ...o });

  it('calls a plain lookup answerable and a computed one derivable', () => {
    const plan = { steps: [{ op: 'select' }] };
    expect(validate({ groups: [group({})], plan }).state).toBe('answerable');
    expect(validate({ groups: [group({})], plan: { steps: [{ op: 'select' }, { op: 'derive' }] } }).state).toBe('derivable');
  });

  it('separates having no steps from having no matching rows', () => {
    // Nothing to look at at all versus looked and found none: the first is
    // "I don't hold that", the second is a real answer of zero.
    expect(validate({ groups: [], plan: { steps: [] } }).state).toBe('unknown');
    expect(validate({ groups: [], plan: { steps: [{ op: 'select' }] } }).state).toBe('insufficient');
    expect(validate({ groups: [group({ records: 0, entities: 0 })], plan: { steps: [{ op: 'select' }] } }).state).toBe('answerable');
  });

  it('says so when a reading had to be chosen', () => {
    expect(validate({ groups: [group({})], plan: { steps: [{ op: 'select' }], ambiguous: true } }).state).toBe('ambiguous');
  });

  it('notices a person recorded both present and absent', () => {
    const a = group({ label: 'Absent', category: 'absent', items: [{ name: 'Arjun Bose' }] });
    const p = group({ label: 'Present', category: 'present', items: [{ name: 'Arjun Bose' }] });
    const { issues } = validate({ groups: [a, p], plan: { steps: [{ op: 'select' }] } });
    expect(issues.join(' ')).toMatch(/both present and absent/);
  });

  it('says when a window could not be applied because no date could be read', () => {
    const g = group({ window: 'this week', coverage: { readable: 0, total: 12 } });
    const { issues } = validate({ groups: [g], plan: { steps: [{ op: 'select' }] } });
    expect(issues.join(' ')).toMatch(/no date .* could be read/i);
  });

  it('records the difference between rows and people so a count cannot mislead', () => {
    const g = group({ records: 6, entities: 5, entity: 'name' });
    validate({ groups: [g], plan: { steps: [{ op: 'select' }] } });
    expect(g.note).toBe('6 records across 5 people');
  });
});

/**
 * Sequence, which is the difference between two opposite findings.
 *
 * Rahul's booking says No Show. He also rang the clinic. Those two facts
 * together mean nothing until you know which came first:
 *
 *   he rang BEFORE the appointment    he cancelled, and nobody changed the
 *                                     booking — the slot could have been sold
 *   he rang AFTER the appointment     he came, or he wants something, and
 *                                     nobody followed up
 *
 * Presence alone returns one pile containing both. Every window in this file
 * is measured from now, so none of them can express "after the date in the
 * other row" — which is why the join learned to.
 */
describe('a join that knows which came first', () => {
  // One appointment, on the 12th. Two calls: one before it, one after.
  const appt = [{ name: 'Rahul', records: [{ cells: ['Rahul', '2026-09-12', 'No Show'] }] }];
  const calls = [{
    name: 'Rahul',
    records: [
      { cells: ['Rahul', '2026-09-10', 'cannot make Saturday'] },
      { cells: ['Rahul', '2026-09-13', 'asked about upgrading'] },
    ],
  }];
  const order = (direction) => ({ direction, leftIdx: 1, rightIdx: 1 });

  it('finds the call that came after the appointment, and only that one', () => {
    const out = joinOnEntity(appt, calls, 'both', order('after'), NOW);
    expect(out.map(o => o.name)).toEqual(['Rahul']);
    // The two rows the sentence is about, not everything both sides hold:
    // handing over every appointment he ever had buries the one that matters.
    expect(out[0].records).toHaveLength(2);
    expect(out[0].records[1].cells[2]).toBe('asked about upgrading');
  });

  it('finds the one before it when asked the other way', () => {
    const out = joinOnEntity(appt, calls, 'both', order('before'), NOW);
    expect(out[0].records[1].cells[2]).toBe('cannot make Saturday');
  });

  it('still answers presence when no order is asked for', () => {
    // The old behaviour, untouched: both rows, no sequence test.
    const out = joinOnEntity(appt, calls, 'both', null, NOW);
    expect(out[0].records).toHaveLength(3);
  });

  it('reports nobody when the sequence does not hold', () => {
    const late = [{ name: 'Rahul', records: [{ cells: ['Rahul', '2026-09-20', 'x'] }] }];
    // Nothing before the 12th here, so "cancelled beforehand" finds nobody.
    expect(joinOnEntity(appt, late, 'both', order('before'), NOW)).toEqual([]);
  });

  it('treats an unreadable date as no match, never as a match', () => {
    /*
     * The failure that would matter: a blank or broken date silently passing
     * the test would invent a finding about a real customer, which is the one
     * thing this pipeline may never do.
     */
    const broken = [{ name: 'Rahul', records: [{ cells: ['Rahul', '', 'x'] }, { cells: ['Rahul', 'n/a', 'y'] }] }];
    expect(joinOnEntity(appt, broken, 'both', order('after'), NOW)).toEqual([]);
    // And leftOnly is its complement: unmatched means it belongs there.
    expect(joinOnEntity(appt, broken, 'leftOnly', order('after'), NOW).map(o => o.name)).toEqual(['Rahul']);
  });

  it('says nothing at all when a side has no date column', () => {
    expect(joinOnEntity(appt, calls, 'both', { direction: 'after', leftIdx: -1, rightIdx: 1 }, NOW)).toEqual([]);
  });

  it('leftOnly means the sequence never held — a call nobody followed up', () => {
    /*
     * The other half of the demo, and the more valuable one: an enquiry with
     * no appointment booked after it. Same machinery, sides swapped.
     */
    const enquiry = [{ name: 'Priya', records: [{ cells: ['Priya', '2026-09-11', 'wants a slot'] }] }];
    const booked  = [{ name: 'Priya', records: [{ cells: ['Priya', '2026-09-08', 'Attended'] }] }];
    // Her only appointment predates the enquiry, so nothing followed it.
    expect(joinOnEntity(enquiry, booked, 'leftOnly', order('after'), NOW).map(o => o.name)).toEqual(['Priya']);
  });
});

/**
 * Two systems, two shapes, and the table that would have drawn them as one.
 *
 * A finding that compares an appointment diary against a call log carries
 * rows from both. They have different columns. The group can only publish
 * one `columns`, so without saying where the first dataset's rows stop, the
 * screen draws a call log's cells under the diary's headings — which does not
 * look broken. It looks authoritative and is wrong, which is worse.
 */
describe('evidence from two systems keeps them apart', () => {
  const appt = [{ name: 'Rahul', records: [{ cells: ['Rahul', '2026-09-12', 'No Show'] }] }];
  const calls = [{
    name: 'Rahul',
    records: [{ cells: ['Rahul', '2026-09-13', 'phone', 'asked about upgrading'] }],
  }];

  it('says how many rows came from the first dataset', () => {
    const out = joinOnEntity(appt, calls, 'both', { direction: 'after', leftIdx: 1, rightIdx: 1 }, NOW);
    expect(out[0].leftCount).toBe(1);
    expect(out[0].records).toHaveLength(2);
    // The split the screen makes: one row each side, under its own header.
    expect(out[0].records.slice(0, out[0].leftCount)[0].cells[2]).toBe('No Show');
    expect(out[0].records.slice(out[0].leftCount)[0].cells[3]).toBe('asked about upgrading');
  });

  it('counts the left side correctly for a presence join too', () => {
    // Not one-per-side here: every row from both, left first.
    const many = [{ name: 'Rahul', records: [{ cells: ['a'] }, { cells: ['b'] }] }];
    const out = joinOnEntity(many, calls, 'both', null, NOW);
    expect(out[0].leftCount).toBe(2);
    expect(out[0].records).toHaveLength(3);
  });

  it('gives leftOnly a count covering all of its rows', () => {
    /*
     * Nothing from the right side is in a leftOnly result by definition, so
     * every row belongs to the left dataset. Saying so rather than leaving it
     * null keeps the screen on one path.
     */
    const out = joinOnEntity(appt, [], 'leftOnly', null, NOW);
    expect(out[0].leftCount).toBe(1);
    expect(out[0].records).toHaveLength(1);
  });
});
