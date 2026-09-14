/**
 * Does the answer read like a colleague wrote it?
 *
 * The pipeline was right and the prose was not. Every answer named a count and
 * withheld the people, used the vocabulary of the database, and footnoted
 * itself — "23 distinct trainees were marked absent", "20 records need
 * attention across 10 distinct students", "Based on 17 discrepancy records."
 * Correct, and nothing a person would write.
 *
 * Two layers were giving the writer opposite instructions: the conduct asked
 * for "the supporting detail, the records, the names", and SAY_RULES said the
 * application lists them below so do not list them again. The answer was the
 * compromise, and the compromise was contentless.
 */

import { describe, it, expect } from 'vitest';
import { composeAnswer } from '../eame-template/services/answerService.js';
import { conduct } from '../eame-template/services/assistant.js';

const group = (over = {}) => ({
  label: 'Absent this week',
  category: 'absent',
  records: 4,
  entities: 3,
  entity: 'player_name',
  dataset: 'Daily Session Roll Call Logs',
  rule: '',
  items: [{ name: 'Arjun Bose' }, { name: 'Rohan Sharma' }, { name: 'Tanvi Reddy' }],
  ...over,
});
const NO_CROSS = { both: [], issues: 0, people: 0 };

describe('the sentence the application falls back to', () => {
  it('names people instead of printing a label and a number', () => {
    // The failure this replaces: "Which students are enrolled in U16?"
    // answered "U-16 Students: 9." — a fragment, and the wrong question.
    const out = composeAnswer([group()], NO_CROSS);
    expect(out).toContain('Arjun Bose');
    expect(out).toContain('Rohan Sharma');
    expect(out).toContain('Tanvi Reddy');
    expect(out).not.toMatch(/^Absent this week: 3\.$/);
  });

  it('reads as a sentence, not as a field', () => {
    const out = composeAnswer([group()], NO_CROSS);
    expect(out).toMatch(/^[A-Z]/);
    expect(out.trim()).toMatch(/[.!?]$/);
    expect(out).not.toMatch(/:\s*\d+\.?$/);
  });

  it('caps the names and says how many more there are', () => {
    const many = group({
      entities: 23,
      items: Array.from({ length: 23 }, (_, i) => ({ name: `Player ${String.fromCharCode(65 + i)}` })),
    });
    const out = composeAnswer([many], NO_CROSS);
    expect(out).toMatch(/and 17 others/);
    // Six named, not twenty-three: an answer, not a data dump.
    expect((out.match(/Player /g) || []).length).toBe(6);
  });

  it('agrees with itself about one person versus several', () => {
    const solo = composeAnswer([group({ records: 1, entities: 1, items: [{ name: 'Arjun Bose' }] })], NO_CROSS);
    expect(solo).toMatch(/Arjun Bose is /);
    expect(solo).not.toMatch(/\bare\b/);
  });

  it('still says plainly when nothing matched', () => {
    const out = composeAnswer([group({ records: 0, entities: 0, items: [] })], NO_CROSS);
    expect(out).toMatch(/Nothing matched/i);
  });

  it('falls back to a count when the rows carry no names', () => {
    const out = composeAnswer([group({ entity: '', items: [{ name: '' }] })], NO_CROSS);
    expect(out).toMatch(/4 records are absent this week\./i);
  });

  it('names the people who appear in more than one group', () => {
    const cross = { both: [{ name: 'Arjun Bose' }, { name: 'Tanvi Reddy' }], issues: 9, people: 6 };
    const out = composeAnswer([group(), group({ label: 'Overdue', category: 'overdue' })], cross);
    expect(out).toContain('Arjun Bose');
    expect(out).toMatch(/2 people appear in more than one/);
  });
});

describe('the vocabulary the customer reads', () => {
  const SCHEMA_WORDS = /\b(distinct|rows?|entries|data points)\b/i;

  it('keeps database words out of the fallback sentence', () => {
    const out = composeAnswer([group()], NO_CROSS);
    expect(out).not.toMatch(SCHEMA_WORDS);
  });

  it('tells the writer to use them too', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(new URL('../eame-template/services/answerService.js', import.meta.url), 'utf8'));
    expect(src).toMatch(/NAME PEOPLE/);
    expect(src).toMatch(/WRITE LIKE A COLLEAGUE, NOT LIKE A DATABASE/);
    // And may offer the next step, which the previous rules forbade outright.
    expect(src).toMatch(/OFFER THE OBVIOUS NEXT STEP/);
    expect(src).not.toMatch(/No sign-off, no offer of further help/);
  });
});

describe('the answer is shaped by what was asked', () => {
  // "Which students are enrolled in U16?" must not be answered "9".
  it('routes who/which questions to names and how-many to a count', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(new URL('../eame-template/services/answerService.js', import.meta.url), 'utf8'));
    expect(src).toMatch(/function answerShape\(question, intent\)/);
    expect(src).toMatch(/THEY ASKED WHO/);
    expect(src).toMatch(/THEY ASKED HOW MANY/);
    // And the broad question still gets a judgement rather than a tally.
    expect(src).toContain('are asking you to judge, so judge');
  });
});

describe('the conduct no longer contradicts the writer', () => {
  it('asks for citation where it is earned, not on every answer', () => {
    const c = conduct({ appName: 'Six Cricket', purpose: 'take the roll call' });
    expect(c).toMatch(/CITE WHEN IT EARNS IT/);
    expect(c).toMatch(/surprising/);
    expect(c).toMatch(/derived by a rule/);
    // The instruction that produced a footnote under every sentence is gone.
    expect(c).not.toMatch(/on its own line at the end/);
  });

  it('still refuses to let a number be invented', () => {
    const c = conduct({ appName: 'Six Cricket', purpose: 'take the roll call' });
    expect(c).toMatch(/Never invent a record, a name, a number or a date/);
  });
});
