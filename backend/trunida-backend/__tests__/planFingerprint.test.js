/**
 * Recognising a question that has been asked before.
 *
 * The first agent in a generated application is the one the owner could
 * articulate. Every agent after that has to be proposed, and the strongest
 * evidence for a proposal is the plainest one: they keep asking the same thing
 * by hand. "You have asked this three Mondays running — shall I just tell you
 * every Monday?" is accepted almost every time, because it cites what they did
 * rather than what is typical of businesses like theirs.
 *
 * Matching the words would not find it. Somebody asks "who hasn't come this
 * week", then "which students missed this week", then "show me absentees" —
 * three wordings, one question. What they share is the PLAN the first stage
 * builds, so that is what gets fingerprinted.
 *
 * Nothing reads these yet. The proposal engine needs weeks of turns before it
 * can say anything, so the collecting starts now.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { planFingerprint } from '../eame-template/services/answerService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const absentees = (label, category, where) => ({
  intent: 'lookup',
  steps: [{
    id: 's0', op: 'select', dataset: 'attendance', entity: 'student',
    window: 'last 14 days', where, label, category,
  }],
});

describe('one question, however it was worded', () => {
  it('ignores the model prose, which varies between two askings', () => {
    // `label` and `category` are written by the model each time. Including
    // them would split a repeated question into several, and the proposal
    // would never fire.
    const a = absentees('Absentees', 'risk', [['status', '==', 'absent']]);
    const b = absentees('Who is missing', 'info', [['status', '==', 'absent']]);
    expect(planFingerprint(a)).toBe(planFingerprint(b));
  });

  it('ignores the order the filters came back in', () => {
    const a = absentees('x', 'info', [['status', '==', 'absent'], ['grade', '==', 'U12']]);
    const b = absentees('x', 'info', [['grade', '==', 'U12'], ['status', '==', 'absent']]);
    expect(planFingerprint(a)).toBe(planFingerprint(b));
  });

  it('ignores casing and stray spacing in a filter value', () => {
    const a = absentees('x', 'info', [['status', '==', 'absent']]);
    const b = absentees('x', 'info', [['status', '==', ' ABSENT ']]);
    expect(planFingerprint(a)).toBe(planFingerprint(b));
  });
});

describe('different questions stay different', () => {
  const base = absentees('x', 'info', [['status', '==', 'absent']]);

  it('separates a different dataset', () => {
    const fees = { intent: 'lookup', steps: [{ ...base.steps[0], dataset: 'fees' }] };
    expect(planFingerprint(fees)).not.toBe(planFingerprint(base));
  });

  it('separates a different window', () => {
    const wider = { intent: 'lookup', steps: [{ ...base.steps[0], window: 'last 30 days' }] };
    expect(planFingerprint(wider)).not.toBe(planFingerprint(base));
  });

  it('separates a different filter value', () => {
    /*
     * Over-splitting is the safe direction. A question that hashes two ways
     * means a proposal that never fires — silent, and nobody is misled. Under-
     * splitting means proposing a watch for something they never asked about,
     * which is the kind of wrong that gets the feature switched off.
     */
    const other = absentees('x', 'info', [['status', '==', 'injured']]);
    expect(planFingerprint(other)).not.toBe(planFingerprint(base));
  });

  it('separates a different intent', () => {
    expect(planFingerprint({ ...base, intent: 'count' })).not.toBe(planFingerprint(base));
  });
});

describe('a plan that says nothing gets no fingerprint', () => {
  it('returns empty for an empty plan', () => {
    /*
     * The trap this avoids. BLANK_PLAN is what an unanswerable or failed turn
     * produces, and hashing it would give every one of them the same value —
     * so the very first thing the proposal engine "noticed" would be that the
     * application is regularly asked a question it cannot answer, reported
     * back as a repeated task worth automating.
     */
    expect(planFingerprint({ intent: 'lookup', steps: [] })).toBe('');
    expect(planFingerprint({})).toBe('');
    expect(planFingerprint(undefined)).toBe('');
    expect(planFingerprint(null)).toBe('');
  });

  it('is short and stable when there is one', () => {
    const fp = planFingerprint(absentees('x', 'info', [['status', '==', 'absent']]));
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(fp).toBe(planFingerprint(absentees('y', 'risk', [['status', '==', 'absent']])));
  });
});

describe('it reaches the record', () => {
  it('travels on the envelope, which is what everything downstream reads', () => {
    const src = read('../eame-template/services/answerService.js');
    expect(src).toContain('planHash: planFingerprint(planned),');
  });

  it('is stored on the turn', () => {
    const log = read('../eame-template/services/turnLog.js');
    expect(log).toContain("planHash: String(planHash || ''),");
    expect(log).toContain("planHash = ''");
  });

  it('is read off the reply, so a route that answers another way still records', () => {
    /*
     * turnMiddleware is generic on purpose: generated routes differ in shape,
     * and the one thing they share is a POST taking { message }. A route that
     * never builds a plan must record a turn with no shape rather than fail.
     */
    const log = read('../eame-template/services/turnLog.js');
    expect(log).toContain("planHash: (body && typeof body.planHash === 'string') ? body.planHash : ''");
  });
});
