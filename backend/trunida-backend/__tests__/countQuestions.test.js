/**
 * "How many sessions are scheduled?" — answered with a list of dates.
 *
 * Found by the conformance suite on a live customer application, which asked
 * how many records a dataset held and got back "13, 2024, 15, 2024, 1, 1".
 * Two separate faults, compounding:
 *
 *   The writer is handed sample rows in its facts — "SES-4412 · 2024-03-13 ·
 *   U16" — and the validator allowed only the COUNTS. So it was given a
 *   session date and forbidden to repeat it. It wrote "sessions on 13 and 15
 *   March", 13 and 15 were not counts, rejected; asked again, rejected again;
 *   replaced by the composed fallback.
 *
 *   And the fallback leads with names whenever it has them, which is right for
 *   "which students…" and wrong for "how many sessions…" — and when the names
 *   are dates, it answers a counting question with a list of dates.
 *
 * Nothing invented ever reached the reader. The guard held; it just held the
 * wrong thing, and the net it dropped into did not know what had been asked.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { allowedNumbers, unsupportedNumbers, composeAnswer } from '../eame-template/services/answerService.js';

/** One group as execute() builds it. */
const group = (over = {}) => ({
  id: 'a',
  label: 'Scheduled sessions',
  category: 'neutral',
  dataset: 'Batch and Training Schedule',
  columns: ['session_id', 'session_date', 'batch_code'],
  entity: null,
  window: null,
  rule: '',
  opaque: false,
  records: 20,
  entities: 20,
  items: [
    { name: '', records: [{ cells: ['SES-4412', '2024-03-13', 'U16'] }] },
    { name: '', records: [{ cells: ['SES-4418', '2024-03-15', 'U14'] }] },
  ],
  ...over,
});

const NO_CROSS = { people: 0, both: [], issues: 0 };

// ── The numbers a writer is allowed to repeat ────────────────────────────────

describe('a figure the writer was shown is a figure it may use', () => {
  it('allows the counts, as it always did', () => {
    const ok = allowedNumbers([group()], NO_CROSS);
    expect(ok.has(20)).toBe(true);
    expect(ok.has(0)).toBe(true);
  });

  it('allows a value that came out of the records', () => {
    // 13 and 15 are days in the sample rows handed to the writer. Refusing
    // them is refusing the data.
    const ok = allowedNumbers([group()], NO_CROSS);
    expect(unsupportedNumbers('Sessions ran on 13 and 15 March.', ok)).toEqual([]);
  });

  it('allows an identifier from the records', () => {
    const ok = allowedNumbers([group()], NO_CROSS);
    expect(unsupportedNumbers('SES-4412 is the first.', ok)).toEqual([]);
  });

  it('still catches a number that is in neither the counts nor the records', () => {
    // The whole point of the guard, and it must survive this change.
    const ok = allowedNumbers([group()], NO_CROSS);
    expect(unsupportedNumbers('Attendance is up 47 per cent.', ok)).toEqual([47]);
    expect(unsupportedNumbers('There are 91 sessions.', ok)).toEqual([91]);
  });

  it('does not widen the set for a group whose rows are withheld', () => {
    // An opaque group's rows are never shown to the writer, so nothing in them
    // is a figure it was given.
    const ok = allowedNumbers([group({ opaque: true })], NO_CROSS);
    expect(unsupportedNumbers('Sessions ran on 13 March.', ok)).toEqual([13]);
  });

  it('keeps allowing a threshold named in a rule', () => {
    const ok = allowedNumbers([group({ rule: 'missed at least 3' })], NO_CROSS);
    expect(ok.has(3)).toBe(true);
  });

  it('goes on ignoring years, which were never the risk', () => {
    const ok = allowedNumbers([group()], NO_CROSS);
    expect(unsupportedNumbers('In 1999 and 2031 this held.', ok)).toEqual([]);
  });
});

// ── What the fallback says when it takes over ────────────────────────────────

describe('the safety net answers the question that was asked', () => {
  it('leads with the number when they asked how many', () => {
    const said = composeAnswer([group()], NO_CROSS, 'count');
    expect(said).toBe('There are 20 scheduled sessions.');
    // Never the database word. The writing rules forbid the model 'records',
    // and a customer should not meet it from the fallback either.
    expect(said).not.toMatch(/record|row|entr(y|ies)|distinct/i);
    // And does not answer a counting question with a list of dates.
    expect(said).not.toMatch(/2024-03-13/);
  });

  it('says so plainly when a count is zero', () => {
    expect(composeAnswer([group({ records: 0, entities: 0, items: [] })], NO_CROSS, 'count'))
      .toMatch(/^Nothing matched/);
  });

  it('carries the rule that produced the number', () => {
    expect(composeAnswer([group({ rule: 'missed at least 3' })], NO_CROSS, 'count'))
      .toContain('(missed at least 3)');
  });

  it('still leads with names when they asked which', () => {
    // The behaviour this must not break: "Which students are in U16?" is
    // answered with students, not with a total.
    const named = group({
      entity: 'student_name',
      entities: 2,
      label: 'in U16',
      items: [
        { name: 'Tejas Hegde', records: [{ cells: ['SCA-26-001'] }] },
        { name: 'Arjun Bose', records: [{ cells: ['SCA-26-008'] }] },
      ],
    });
    const said = composeAnswer([named], NO_CROSS, 'names');
    expect(said).toContain('Tejas Hegde');
    expect(said).toContain('Arjun Bose');
  });

  it('behaves exactly as before when no shape is given', () => {
    // Every existing caller, unchanged.
    expect(composeAnswer([group()], NO_CROSS)).toBe(composeAnswer([group()], NO_CROSS, 'default'));
  });

  it('is unchanged for a count question spanning more than one group', () => {
    // Two groups is a comparison, not a count, whatever the words were.
    const said = composeAnswer([group(), group({ id: 'b', label: 'Cancelled', records: 3, entities: 3 })], NO_CROSS, 'count');
    expect(said).toContain('scheduled sessions');
    expect(said).toContain('cancelled');
  });
});

describe('the fallback is reached with the shape, not without it', () => {
  const src = readFileSync(new URL('../eame-template/services/answerService.js', import.meta.url), 'utf8');

  it('passes it at both places the net can be entered', () => {
    // A truncated answer and a rejected one both land here, and both used to
    // land without knowing what had been asked.
    expect(src.match(/composeAnswer\(groups, cross, shape\)/g)).toHaveLength(2);
  });

  it('works the shape out from the question that was actually asked', () => {
    // `asked`, not `q`: a challenge re-runs the previous question, and the
    // shape belongs to that one.
    expect(src).toContain('const shape = answerShape(asked, planned.intent);');
  });
});

describe('the sentence beside the number 1', () => {
  const one = (label) => composeAnswer(
    [group({ label, records: 1, entities: 1, items: [] })], NO_CROSS, 'count');

  it('agrees with itself', () => {
    // "There is 1 scheduled sessions" reads as a bug in the sentence rather
    // than an answer to the question.
    expect(one('Scheduled sessions')).toBe('There is 1 scheduled session.');
  });

  it('changes the head noun, which is not always the last word', () => {
    expect(one('Payments in progress')).toBe('There is 1 payment in progress.');
    expect(one('Students with unpaid fees')).toBe('There is 1 student with unpaid fees.');
  });

  it('leaves a label with no plural head alone', () => {
    expect(one('Absent this week')).toBe('There is 1 absent this week.');
  });

  it('handles the plurals that are not a bare s', () => {
    expect(one('Classes')).toBe('There is 1 class.');
    expect(one('Batches')).toBe('There is 1 batch.');
  });

  it('does not maul a word that merely ends in s', () => {
    expect(one('Progress')).toBe('There is 1 progress.');
    expect(one('Campus')).toBe('There is 1 campus.');
  });
});
