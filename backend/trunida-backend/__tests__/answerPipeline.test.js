/**
 * The plan, and what survives a model that gets it wrong.
 *
 * The model chooses steps; code runs them. So what matters here is that a plan
 * naming a column that does not exist, an operation that is not one, or a step
 * that refers to a step that never ran, cannot reach the data — and that the
 * numbers in a finished sentence are only ever ones code computed.
 *
 * The arithmetic those steps perform is in reasoning.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  sanitisePlan, overlap, allowedNumbers, unsupportedNumbers, composeAnswer, CATEGORIES,
} from '../eame-template/services/answerService.js';

const CAT = [{
  name: 'Daily Session Roll Call Logs',
  columns: ['session_date', 'batch', 'player_name', 'reply', 'status'],
  key: 'session_date + player_name', rows: 83, values: [[], [], [], [], []], dateColumn: 'session_date',
}, {
  name: 'Master Student Roster',
  columns: ['student_id', 'name', 'batch', 'subscription_status'],
  key: 'student_id', rows: 64, values: [[], [], [], []], dateColumn: '',
}];

const step = (o) => ({ id: 'a', op: 'select', dataset: CAT[0].name, label: 'L', category: 'absent', entity: 'player_name', where: [], ...o });

describe('the plan reaches the data only where the data exists', () => {
  it('drops an invented dataset, column and operator but keeps the rest', () => {
    const p = sanitisePlan({
      steps: [
        step({ where: [['status', 'is', 'absent'], ['made_up', 'is', 'x'], ['status', 'wat', 'y']] }),
        step({ id: 'b', dataset: 'A Dataset That Does Not Exist' }),
        step({ id: 'c', dataset: CAT[1].name, category: 'not-a-category', entity: 'nope' }),
      ],
    }, CAT);
    expect(p.steps.map(s => s.id)).toEqual(['a', 'c']);
    expect(p.steps[0].where).toEqual([['status', 'is', 'absent']]);
    expect(p.steps[1].category).toBe('info');     // an unknown category is not honoured
    expect(p.steps[1].entity).toBeNull();
  });

  it('refuses a derive or join that points at a step which never ran', () => {
    // Otherwise a plan could compute over rows that were never fetched.
    const p = sanitisePlan({
      steps: [
        { id: 'd', op: 'derive', from: 'nothing', entity: 'player_name', having: ['>=', '2'] },
        { id: 'j', op: 'join', left: 'nothing', right: 'also-nothing' },
      ],
    }, CAT);
    expect(p.steps).toEqual([]);
  });

  it('carries a derivation\'s rule through, and only a real comparison', () => {
    const p = sanitisePlan({
      steps: [
        step({}),
        { id: 'b', op: 'derive', from: 'a', entity: 'player_name', where: [['status', 'is', 'absent']], metric: 'count', having: ['>=', '2'], label: 'Missed twice', category: 'absent' },
        { id: 'c', op: 'derive', from: 'a', entity: 'player_name', having: ['nonsense', '2'] },
      ],
    }, CAT);
    expect(p.steps[1]).toMatchObject({ op: 'derive', from: 'a', metric: 'count', having: ['>=', 2] });
    expect(p.steps[2].having).toBeNull();          // a comparison nobody defined is no filter at all
  });

  it('keeps a join and the two steps it joins', () => {
    const p = sanitisePlan({
      steps: [
        step({ id: 'a' }),
        step({ id: 'b', dataset: CAT[1].name, entity: 'name', category: 'overdue' }),
        { id: 'c', op: 'join', left: 'a', right: 'b', mode: 'both', label: 'Both', category: 'discrepancy' },
      ],
    }, CAT);
    expect(p.steps.map(s => s.op)).toEqual(['select', 'select', 'join']);
    expect(p.steps[2]).toMatchObject({ left: 'a', right: 'b', mode: 'both' });
  });

  it('survives a model that returns nothing usable', () => {
    expect(sanitisePlan(null, CAT).steps).toEqual([]);
    expect(sanitisePlan({ steps: 'not an array' }, CAT).steps).toEqual([]);
    expect(sanitisePlan({}, CAT).intent).toBe('lookup');
    expect(sanitisePlan({ intent: 'summary', reading: 'x' }, CAT).intent).toBe('summary');
  });
});

describe('categories are never merged', () => {
  it('gives absence and needs-review different labels', () => {
    expect(CATEGORIES.absent.label).toBe('Absent');
    expect(CATEGORIES.discrepancy.label).toBe('Needs review');
    expect(CATEGORIES.absent.label).not.toBe(CATEGORIES.discrepancy.label);
  });
});

// "6 unconfirmed and 7 overdue" is 13 items and it is NOT 13 people.
describe('the people across all the groups', () => {
  const g = (label, names) => ({ label, records: names.length, entities: names.length, items: names.map(n => ({ name: n })) });
  const attend = g('Not confirmed', ['Arjun Bose', 'Rohan Sharma', 'Tanvi Reddy']);
  const fees = g('Overdue', ['Arjun Bose', 'Dhruv Mehta']);

  it('counts items and people apart, and names who is in both', () => {
    const x = overlap([attend, fees]);
    expect(x.issues).toBe(5);
    expect(x.people).toBe(4);
    expect(x.both.map(p => p.name)).toEqual(['Arjun Bose']);
    expect(x.both[0].groups).toEqual(['Not confirmed', 'Overdue']);
  });
});

describe('a number the code cannot explain never reaches the customer', () => {
  const g = { label: 'Absent', records: 3, entities: 2, entity: 'name', rule: 'count >= 2', items: [{ name: 'A' }, { name: 'B' }] };
  const x = overlap([g]);
  const allowed = allowedNumbers([g], x);

  it('allows what code computed, including a derivation\'s threshold', () => {
    expect(allowed.has(3)).toBe(true);   // records
    expect(allowed.has(2)).toBe(true);   // people, and the threshold
    expect(unsupportedNumbers('2 players missed 2 or more of 3 sessions.', allowed)).toEqual([]);
    // The failure that reached the customer: a count nothing produced.
    expect(unsupportedNumbers('4 players missed practice this week.', allowed)).toEqual([4]);
  });

  it('leaves years, money and percentages alone', () => {
    expect(unsupportedNumbers('Since 2023 the total is ₹4,500 and 90% attended.', allowed)).toEqual([]);
  });

  it('falls back to a sentence built from the facts', () => {
    const said = composeAnswer([g], x);
    expect(unsupportedNumbers(said, allowed)).toEqual([]);
  });

  it('says plainly when there is nothing to answer from', () => {
    expect(composeAnswer([], { people: 0, both: [], issues: 0 }))
      .toBe('I cannot answer that from the connected data.');
  });
});

/**
 * The fallback is what the customer reads when the model produced a number
 * code could not explain. It caught the bad number and then printed "4 in
 * u-16 trainees." — careful, and unreadable. It has to be a sentence.
 */
describe('the sentence built from the facts reads like a sentence', () => {
  const g = (label, n, e) => ({ label, records: n, entities: e === undefined ? n : e, entity: 'name', items: [] });
  const none = { both: [], issues: 0, people: 0 };

  it('names the group and its count', () => {
    // Was 'U-16 trainees: 4.' — a label, a colon and a number, which is what the
    // application said when asked WHICH students are in U16. With no names in
    // the facts the count still carries it, but as a sentence.
    expect(composeAnswer([g('U-16 trainees', 4)], { ...none, issues: 4, people: 4 }))
      .toBe('4 people are U-16 trainees.');
  });

  it('says nothing matched rather than reporting a zero as a finding', () => {
    expect(composeAnswer([g('U-16 students with unconfirmed attendance', 0)], none))
      // U-16 keeps its capitals: it is the name of the batch, not a description
      // of it, and "u-16" reads as the application not knowing that.
      .toBe('Nothing matched U-16 students with unconfirmed attendance.');
  });

  it('agrees with itself about one person versus several', () => {
    const two = composeAnswer([g('Absent', 3, 2), g('Overdue', 2)], { both: [{ name: 'X' }], issues: 5, people: 4 });
    expect(two).toContain('One person appears in more than one');
    const three = composeAnswer([g('Absent', 3, 2), g('Overdue', 2)], { both: [{ name: 'X' }, { name: 'Y' }], issues: 5, people: 3 });
    expect(three).toContain('2 people appear in more than one');
  });
});

/**
 * "Who is attending practice today?" was refused while "how many students are
 * attending today's sessions?" was answered, on the same data — the planner
 * returning no steps for a question it could obviously have planned, and the
 * refusal then claiming the application does not hold something it plainly
 * holds.
 */
describe('a refusal has to be earned, and has to leave the customer somewhere', () => {
  const src = readFileSync(new URL('../eame-template/services/answerService.js', import.meta.url), 'utf8');

  it('tells the planner that no rows is an answer, not a reason to refuse', () => {
    expect(src).toMatch(/Finding no rows is NOT a reason to return no steps/);
    // Named examples, because the abstract rule was not enough on its own.
    expect(src).toMatch(/Who is attending practice today/);
    expect(src).toMatch(/does not have to use the customer..?s words/);
  });

  it('reserves no-steps for a subject nothing is about', () => {
    expect(src).toMatch(/an opening/);
    expect(src).toMatch(/a refund policy/);
  });

  it('names what the application does hold when it refuses', () => {
    // So the person can see whether the refusal is fair, and rephrase.
    expect(src).toMatch(/This application holds \$\{holds/);
    expect(src).toMatch(/ask me about any of those/);
  });
});
