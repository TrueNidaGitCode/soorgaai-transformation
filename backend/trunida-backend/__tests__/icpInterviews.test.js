/**
 * Four answers in, the ten-step playbook and the wedge out.
 *
 * The owner's decisions (6 October 2026): the four questions are the
 * interview; the AI fills the playbook and a person confirms; the AI groups
 * companies by the SAME problem to find the wedge; the three hand-written
 * companies were re-filed under the four questions, word for word.
 *
 * What these hold the AI to is the table's whole worth: a tick must point at
 * words somebody said, a corrected cell is never overwritten, and a wedge is
 * not ready until two companies share one evidenced problem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

const gen = vi.fn();
vi.mock('../services/llmService.js', () => ({ generate: (...a) => gen(...a) }));

const S = await import('../services/icpInterviewService.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const salesJs = read('../../../frontend/admin/sales.js');
const legacy = JSON.parse(read('../scripts/data/icp_legacy_interviews.json'));

const ANSWERS = {
  problem: 'Patients stop coming mid-course and we only notice at the end of the month. About 15 a month.',
  example: 'Last week Meera missed two sessions; the booking system showed it and WhatsApp went unanswered.',
  detection: 'The front desk checks the list on Fridays and calls them.',
  value: 'We would have called after the first miss. Each course is worth 12000 rupees.',
};

describe('the four questions are one list, on both sides', () => {
  it('asks the same four the Sales page shows, word for word', () => {
    const at = salesJs.indexOf('const ICP_QUESTIONS = [');
    expect(at).toBeGreaterThan(-1);
    // eslint-disable-next-line no-new-func
    const page = new Function(`return ${salesJs.slice(salesJs.indexOf('[', at), salesJs.indexOf('];', at) + 1)};`)();
    expect(page).toEqual(S.QUESTIONS);
  });

  it('fills every per-company row the Target Audience table draws', () => {
    const keys = new Set(S.ROWS.map(([k]) => k));
    const table = ['q1', 'q2', 'q3', 'q4', 'kind', 'frequency', 'signals', 'spread', 'manual', 'late', 'cost',
      'action', 'measurable', 'icpline', 'bucket', 'reverse', 'economics', 'same', 'buyer', 'workflow',
      'simsignals', 'simaction', 'roi'];
    for (const k of table) expect(keys.has(k), k).toBe(true);
    // And the two only a person can fill are never offered to the AI.
    for (const k of S.MANUAL_ONLY) expect(keys.has(k), k).toBe(false);
    expect(S.MANUAL_ONLY).toEqual(['pilot', 'earlier']);
  });
});

describe('what the AI is allowed to write', () => {
  it('keeps a tick whose quote is in the answers', () => {
    const c = S.checkCells({ cells: { frequency: { state: 'yes', text: 'About 15 a month', quote: 'About 15 a month' } } }, ANSWERS);
    expect(c.frequency).toEqual({ state: 'yes', text: 'About 15 a month', quote: 'About 15 a month' });
  });

  it('downgrades a tick nothing said supports, rather than trusting it', () => {
    const c = S.checkCells({ cells: { cost: { state: 'yes', text: 'Loses 2 lakh a month', quote: 'we lose 2 lakh a month' } } }, ANSWERS);
    expect(c.cost.state).toBe('open');
    expect(c.cost.text).toMatch(/Not traced to the answers/);
    expect(c.cost.quote).toBe('');
  });

  it('does the same for a stated figure, and ignores rows that do not exist', () => {
    const c = S.checkCells({ cells: { roi: { state: 'claim', text: 'x', quote: '' }, pilot: { state: 'yes', text: 'agreed', quote: 'x' }, nonsense: {} } }, ANSWERS);
    expect(c.roi.state).toBe('open');
    expect(c.pilot).toBeUndefined();
    expect(c.nonsense).toBeUndefined();
  });

  it('never overwrites a cell a person corrected', () => {
    const merged = S.mergeCells(
      { cost: { state: 'claim', text: 'mine', edited: true }, late: { state: 'open', text: 'old', edited: false } },
      { cost: { state: 'yes', text: 'AI', quote: 'q' }, late: { state: 'yes', text: 'new', quote: 'q' } },
    );
    expect(merged.cost.text).toBe('mine');
    expect(merged.late).toEqual({ state: 'yes', text: 'new', quote: 'q', edited: false });
  });

  it('marks the playbook stale when the answers change after a fill', () => {
    const doc = { _id: 'x', vertical: 'clinics', company: 'A', answers: ANSWERS, cells: {}, filledFrom: S.answersHash(ANSWERS) };
    expect(S.view(doc).stale).toBe(false);
    expect(S.view({ ...doc, answers: { ...ANSWERS, value: 'changed' } }).stale).toBe(true);
  });
});

describe('asking the AI', () => {
  beforeEach(() => gen.mockReset());

  it('sends the four answers and the rows, with reasoning off, and checks what comes back', async () => {
    gen.mockResolvedValue({ text: '```json\n' + JSON.stringify({ cells: {
      frequency: { state: 'yes', text: 'About 15 a month.', quote: 'About 15 a month.' },
      cost: { state: 'claim', text: '12000 a course', quote: 'Each course is worth 12000 rupees' },
      economics: { state: 'yes', text: 'Saves 5 lakh', quote: 'saves five lakh' },
    } }) + '\n```' });
    const cells = await S.fillCells(ANSWERS);
    const call = gen.mock.calls[0][0];
    expect(call).toMatchObject({ thinking: false, label: 'icp-fill' });
    expect(call.userMessage).toContain(S.QUESTIONS[0][1]);
    expect(call.userMessage).toContain('A4. We would have called');
    expect(cells.frequency.state).toBe('yes');
    expect(cells.cost.state).toBe('claim');
    expect(cells.economics.state).toBe('open');
  });

  it('refuses to fill from nothing', async () => {
    await expect(S.fillCells({})).rejects.toThrow(/at least one answer/);
    expect(gen).not.toHaveBeenCalled();
  });
});

describe('the wedge', () => {
  const iv = (letter, yes) => ({
    id: letter, letter, company: `Co ${letter}`, answers: ANSWERS,
    cells: { same: { state: yes ? 'yes' : 'open', text: 'patients stop mid-course' } },
  });

  it('is ready only when two companies share one evidenced problem', () => {
    const list = [iv('A', true), iv('B', true), iv('C', false)];
    const one = S.checkWedge({ groups: [{ problem: 'Stop mid-course', companies: ['A', 'C'] }], draft: { sentence: 's' } }, list);
    expect(one.ready).toBe(false);
    expect(one.groups[0].evidenced).toEqual(['A']);
    const two = S.checkWedge({ groups: [{ problem: 'Stop mid-course', companies: ['A', 'B', 'Z'] }], draft: { sentence: 's' } }, list);
    expect(two.ready).toBe(true);
    // A letter that is not a company here is dropped, not believed.
    expect(two.groups[0].companies).toEqual(['A', 'B']);
  });

  it('describes each company to the AI from its own words and cells', () => {
    const text = S.wedgeInput([iv('A', true)]);
    expect(text).toContain('Company A: Co A');
    expect(text).toContain('Problem (their words): Patients stop coming mid-course');
    expect(text).toContain('Problem, one line: yes: patients stop mid-course');
  });

  it('refuses to lock before it is ready', () => {
    const src = read('../services/icpInterviewService.js');
    expect(src).toMatch(/if \(!w\?\.ready\) throw new Error\('It locks once two companies share one evidenced problem\.'\)/);
  });
});

describe('the three companies, re-filed word for word', () => {
  const by = (name) => legacy.find((d) => d.company === name);

  it('keeps every hand-written cell as a person’s, so the AI never overwrites it', () => {
    expect(legacy.map((d) => d.company)).toEqual(['Vesoma', 'The Wellness Co.', 'iSPAN']);
    for (const d of legacy) {
      expect(d.legacy).toBe(true);
      for (const [k, c] of Object.entries(d.cells)) expect(c.edited, `${d.company}.${k}`).toBe(true);
    }
  });

  it('keeps the ₹20,000 as a ceiling, not evidence', () => {
    const v = by('Vesoma');
    expect(v.cells.cost.state).toBe('yes');
    expect(v.cells.roi.state).toBe('claim');
    expect(v.cells.roi.text).toMatch(/Nobody has counted that yet/);
    expect(v.cells.measurable.state).toBe('');
  });

  it('puts only what was established into the answers, never our own notes', () => {
    for (const d of legacy) {
      for (const a of Object.values(d.answers)) {
        expect(a).not.toMatch(/Not asked|was not established|not asked/);
        expect(a).not.toMatch(/&[a-z]+;|<\w/);
      }
    }
    // The Wellness Co. was never asked what it costs, so its fourth answer is empty.
    expect(by('The Wellness Co.').answers.value).toBe('');
  });

  it('leaves the second company amber on the problem, with nothing priced', () => {
    const b = by('The Wellness Co.');
    expect(b.cells.same.state).toBe('open');
    expect(b.cells.cost).toBeUndefined();
    expect(b.cells.roi).toBeUndefined();
  });
});

describe('wired, and admin-only', () => {
  it('serves every ICP route behind protect and adminOnly', () => {
    const routes = read('../routes/salesSignalsRoutes.js').split('\n').filter((l) => l.includes("'/icp"));
    expect(routes.length).toBe(9);
    for (const r of routes) expect(r, r).toMatch(/protect, adminOnly,/);
  });
});
