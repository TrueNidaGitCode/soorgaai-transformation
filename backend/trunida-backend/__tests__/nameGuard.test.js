/**
 * Customer names never reach the model (eame-template/services/nameGuard.js).
 *
 * The promise is "the model sees the facts, never who". These hold it: every
 * person and account the records name is covered, in any case and as a first
 * name alone; emails and phone numbers too; ordinary words are left alone;
 * and the answer comes back with the real names in it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { buildDirectory, makeGuard, letters } from '../eame-template/services/nameGuard.js';

const DATASETS = [
  { columns: ['student_id', 'full_name', 'coach_name', 'phone', 'batch'], rows: [
    ['S1', 'Meera Iyer', 'Ravi Kumar', '98450 12345', 'U12'],
    ['S2', 'Asha Rao', 'Ravi Kumar', '9845012346', 'U14'],
    ['S3', 'Asha Menon', '', '', 'U14'],
    ['S4', 'May', '', '', 'U16'],
    ['S5', 'Tanvi', '', '', 'U16'],
  ] },
  { columns: ['school', 'user_email', 'status'], rows: [['Hillview School', 'asha@hillview.edu', 'active']] },
];
const guard = () => makeGuard(buildDirectory(DATASETS));

describe('who the records name', () => {
  it('finds the customers, the people beside them, and the accounts', () => {
    const dir = buildDirectory(DATASETS);
    expect(dir.people).toEqual(expect.arrayContaining(['Meera Iyer', 'Asha Rao', 'Asha Menon', 'Ravi Kumar', 'Tanvi']));
    expect(dir.accounts).toEqual(['Hillview School']);
    // A status is not a name.
    expect(dir.accounts).not.toContain('active');
  });
});

describe('a prompt on its way out', () => {
  it('carries no name, email or phone number the records hold', () => {
    const c = guard().cover(['', 'Customer: Meera Iyer (+91 98450 12345, asha@hillview.edu). Coach Ravi Kumar. Hillview School renews. Tanvi missed two.']);
    const out = c.texts[1];
    for (const real of ['Meera', 'Iyer', '98450', 'asha@hillview.edu', 'Ravi', 'Hillview', 'Tanvi']) expect(out).not.toContain(real);
    expect(out).toMatch(/Customer: Person A \(phone-A, email-a@hidden\.invalid\)/);
    expect(out).toContain('Account A renews');
  });

  it('is the same stand-in for the same person, however they are written', () => {
    const out = guard().cover(['', 'Meera Iyer. MEERA IYER. Meera alone.']).texts[1];
    expect(out).toBe('Person A. Person A. Person A alone.');
  });

  it('gives a shared first name a stand-in of its own, rather than guessing which', () => {
    const out = guard().cover(['', 'Asha called.']).texts[1];
    expect(out).toBe('Person A called.');
    expect(guard().cover(['', 'Asha called.']).restore('Person A called back.')).toBe('Asha called back.');
  });

  it('leaves ordinary words alone, even when they are somebody\'s name', () => {
    const out = guard().cover(['', 'We may call in May. Ravindra is someone else.']).texts[1];
    expect(out).toBe('We may call in May. Ravindra is someone else.');
  });

  it('covers the system prompt too, and leaves an empty one empty', () => {
    const c = guard().cover(['Rows: Meera Iyer, Asha Rao', '']);
    expect(c.texts[0]).toBe('Rows: Person A, Person B');
    expect(c.texts[1]).toBe('');
  });
});

describe('the answer on its way back', () => {
  it('has the real names in it before anybody reads it', () => {
    const c = guard().cover(['', 'Customer: Meera Iyer, Hillview School']);
    expect(c.restore('Call Person A today about Account A.')).toBe('Call Meera Iyer today about Hillview School.');
  });

  it('restores a plan the model wrote with stand-ins, so the filter finds the real rows', () => {
    const c = guard().cover(['', 'Who is Meera Iyer?']);
    const plan = c.restore('{"where":[["full_name","matches","Person A"]]}');
    expect(JSON.parse(plan).where[0][2]).toBe('Meera Iyer');
  });

  it('does not confuse Person A with Person AA', () => {
    expect(letters(0)).toBe('A');
    expect(letters(25)).toBe('Z');
    expect(letters(26)).toBe('AA');
    const people = Array.from({ length: 30 }, (_, i) => `Given${String.fromCharCode(97 + (i % 26))}${i} Family`);
    const g = makeGuard({ people, accounts: [] });
    const c = g.cover(['', people.join('; ')]);
    expect(c.restore('Person A and Person AA')).toBe(`${people[0]} and ${people[26]}`);
  });
});

describe('every model call is covered', () => {
  const llm = readFileSync(new URL('../eame-template/services/llmService.js', import.meta.url), 'utf8');

  it('in the one place every call passes, generate and generateRaw alike', () => {
    expect(llm).toContain("return covered({ ...opts, systemPrompt: frame(opts.systemPrompt, appIdentity()) });");
    expect(llm).toContain('return covered(opts);');
    expect(llm).toContain('text: c.restore(res.text)');
  });

  it('and nothing in the application calls the model past it', () => {
    for (const f of ['answerService.js', 'customerAnalysis.js', 'draftService.js', 'connectors/phone.js']) {
      const src = readFileSync(new URL(`../eame-template/services/${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/from ['"]\.\.?\/(\.\.\/)?(services\/)?llmCore\.js['"]/);
    }
  });
});

describe('a call that cannot be covered', () => {
  it('is refused, never sent uncovered', () => {
    const llm = readFileSync(new URL('../eame-template/services/llmService.js', import.meta.url), 'utf8');
    const block = llm.slice(llm.indexOf('async function covered('), llm.indexOf('/** The model call with the application'));
    expect(block).toContain("throw new Error('This could not be sent to the AI model without exposing customer names, so it was not sent.');");
    expect(block).not.toContain('makeGuard()');
  });
});
