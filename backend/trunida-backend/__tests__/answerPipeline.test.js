/**
 * The answer pipeline — the five conversations that were getting it wrong.
 *
 * The point of these is not that the model says something sensible; it is that
 * code, not the model, decides how many records there are, whether two rows are
 * the same person, and whether a category may be merged with another. So the
 * model is stubbed throughout: what is tested is what survives when the model
 * is unreliable, because that is the case that reached the customer.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitisePlan, resolveGroup, overlap, allowedNumbers, unsupportedNumbers, composeAnswer, CATEGORIES,
} from '../eame-template/services/answerService.js';

const CAT = [{
  name: 'Daily Session Roll Call Logs',
  columns: ['session_date', 'batch', 'player_name', 'reply', 'status'],
  key: 'session_date + player_name',
  rows: 83,
  values: [[], [], [], [], ['present', 'absent', 'excused', 'unclear']],
}, {
  name: 'Master Student Roster',
  columns: ['student_id', 'name', 'batch', 'subscription_status'],
  key: 'student_id',
  rows: 64,
  values: [[], [], [], ['active', 'overdue']],
}];

const rows = (cells) => cells.map(c => ({ cells: c, source: 'folder' }));

describe('the plan is the model choosing, never the model counting', () => {
  it('keeps only datasets, columns, operators and categories that exist', () => {
    const p = sanitisePlan({
      groups: [
        { label: 'Absent', dataset: 'Daily Session Roll Call Logs', category: 'absent', entity: 'player_name',
          where: [['status', 'is', 'absent'], ['made_up_column', 'is', 'x'], ['status', 'wat', 'y']] },
        { label: 'Ghosts', dataset: 'A Dataset That Does Not Exist', category: 'absent', where: [] },
        { label: 'Odd', dataset: 'Master Student Roster', category: 'not-a-category', entity: 'nope', where: [] },
      ],
      intent: 'question',
    }, CAT);
    expect(p.groups).toHaveLength(2);
    expect(p.groups[0].where).toEqual([['status', 'is', 'absent']]);   // the invented column and operator are gone
    expect(p.groups[1].category).toBe('info');                          // an unknown category is not honoured
    expect(p.groups[1].entity).toBeNull();
  });

  it('survives a model that returns nothing usable', () => {
    expect(sanitisePlan(null, CAT).groups).toEqual([]);
    expect(sanitisePlan({ groups: 'not an array' }, CAT).groups).toEqual([]);
    expect(sanitisePlan({}, CAT).intent).toBe('question');
  });
});

// TEST 2 — "Who has missed practice this week?"
describe('missed practice: absence and discrepancy are never one count', () => {
  const columns = ['session_date', 'batch', 'player_name', 'reply', 'status'];
  const absent = resolveGroup(
    { label: 'Absent', dataset: 'd', category: 'absent', where: [], entity: 'player_name' },
    columns,
    rows([
      ['12/09', 'U16', 'Arjun Bose', 'No response', 'absent'],
      ['13/09', 'U16', 'Arjun Bose', 'No response', 'absent'],
      ['12/09', 'U14', 'Rohan Sharma', '', 'absent'],
    ]));
  const review = resolveGroup(
    { label: 'Needs review', dataset: 'd', category: 'discrepancy', where: [], entity: 'player_name' },
    columns,
    rows([
      ['12/09', 'U16', 'Tanvi Reddy', 'Attending', 'unclear'],
      ['12/09', 'U12', 'Aditya Verma', 'thumbs up', 'unclear'],
    ]));

  it('counts people, not rows: two sessions for one player is one player', () => {
    expect(absent.records).toBe(3);
    expect(absent.entities).toBe(2);            // Arjun twice is still one player
    expect(absent.items).toHaveLength(2);
    const arjun = absent.items.find(i => i.name === 'Arjun Bose');
    expect(arjun.records).toHaveLength(2);      // both sessions kept, under one person
  });

  it('keeps the two categories separate and differently labelled', () => {
    expect(absent.category).toBe('absent');
    expect(review.category).toBe('discrepancy');
    expect(CATEGORIES[absent.category].label).toBe('Absent');
    expect(CATEGORIES[review.category].label).toBe('Needs review');
    // Nothing in the pipeline can add one to the other: they are separate groups.
    expect(absent.entities + review.entities).toBe(4);
    expect(absent.entities).not.toBe(4);
  });
});

// TEST 8/9 — entity resolution and count consistency
describe('one person in two programmes is one person', () => {
  const columns = ['student_id', 'name', 'batch', 'status'];
  const g = resolveGroup(
    { label: 'Needs attention', dataset: 'd', category: 'discrepancy', where: [], entity: 'name' },
    columns,
    rows([
      ['SC-2023-0211', 'Aditya Verma', 'Morning Nets U-16', 'excused'],
      ['SC-2023-0211', 'Aditya Verma', 'Weekend Development U-12', 'unclear'],
      ['SC-2024-0089', 'Dhruv Mehta', 'Wicketkeeping', 'unclear'],
    ]));

  it('groups the two records under one name rather than inflating the count', () => {
    expect(g.records).toBe(3);
    expect(g.entities).toBe(2);
    const aditya = g.items.find(i => i.name === 'Aditya Verma');
    expect(aditya.records).toHaveLength(2);
    expect(aditya.records.map(r => r.cells[2])).toEqual(['Morning Nets U-16', 'Weekend Development U-12']);
  });
});

// TEST 1 / 11 — synthesis across datasets, without adding overlapping people twice
describe('what needs attention today: 13 items is not 13 people', () => {
  const attend = resolveGroup(
    { label: 'Not confirmed', dataset: 'roll calls', category: 'unconfirmed', where: [], entity: 'name' },
    ['name', 'batch'],
    rows([['Arjun Bose', 'U16'], ['Rohan Sharma', 'U14'], ['Tanvi Reddy', 'U16']]));
  const fees = resolveGroup(
    { label: 'Overdue', dataset: 'roster', category: 'overdue', where: [], entity: 'name' },
    ['name', 'status'],
    rows([['Arjun Bose', 'overdue'], ['Dhruv Mehta', 'overdue']]));

  it('notices the people in both groups and reports items and people apart', () => {
    const x = overlap([attend, fees]);
    expect(x.issues).toBe(5);      // five records
    expect(x.people).toBe(4);      // four people — Arjun is in both
    expect(x.both.map(p => p.name)).toEqual(['Arjun Bose']);
    expect(x.both[0].groups).toEqual(['Not confirmed', 'Overdue']);
  });
});

describe('a number the code cannot explain never reaches the customer', () => {
  const g = resolveGroup({ label: 'Absent', dataset: 'd', category: 'absent', where: [], entity: 'name' },
    ['name'], rows([['A'], ['B'], ['A']]));
  const x = overlap([g]);
  const allowed = allowedNumbers([g], x);

  it('allows the figures code computed and catches the ones it did not', () => {
    expect(allowed.has(3)).toBe(true);   // records
    expect(allowed.has(2)).toBe(true);   // people
    expect(unsupportedNumbers('2 players were absent across 3 sessions.', allowed)).toEqual([]);
    // The failure that reached the customer: a count nothing produced.
    expect(unsupportedNumbers('4 players missed practice this week.', allowed)).toEqual([4]);
  });

  it('leaves years, money and percentages alone', () => {
    expect(unsupportedNumbers('Since 2023 the total is ₹4,500 and 90% attended.', allowed)).toEqual([]);
  });

  it('falls back to a sentence built from the facts', () => {
    const said = composeAnswer([g], x);
    expect(unsupportedNumbers(said, allowed)).toEqual([]);
    expect(said).toContain('2');
  });

  it('says plainly when there is nothing to answer from', () => {
    expect(composeAnswer([], { people: 0, both: [], issues: 0 }))
      .toBe('I cannot answer that from the connected data.');
  });
});

// TEST 3 — aggregate-only data must not become invented names
describe('a group that matched nothing is reported, not filled in', () => {
  it('has no items to name when no row matched', () => {
    const g = resolveGroup({ label: 'Overdue', dataset: 'roster', category: 'overdue', where: [], entity: 'name' }, ['name'], []);
    expect(g.records).toBe(0);
    expect(g.entities).toBe(0);
    expect(g.items).toEqual([]);
    // Nothing in the envelope can produce a student name from an empty group.
    expect(composeAnswer([g], overlap([g]))).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/);
  });
});
