/**
 * Four answers in, the ten-step playbook and the wedge out.
 *
 * Since 7 October 2026 the owner shares each interview's questions and
 * answers in the Claude chat; the playbook is filled there and written with
 * scripts/icp_record.mjs. The Target Audience tab only displays, and nothing
 * here calls a model.
 *
 * What these hold the filling to is the table's whole worth: a tick must
 * point at words somebody said, a cell written by hand earlier is kept, and a
 * wedge is not ready — nor lockable — until two companies share one
 * evidenced problem.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

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

  it('has a row for everything the Target Audience table draws', () => {
    const keys = new Set([...S.ROWS.map(([k]) => k), ...S.MANUAL_ONLY]);
    for (const k of ['q1', 'q2', 'q3', 'q4', 'kind', 'frequency', 'signals', 'spread', 'manual', 'late', 'cost',
      'action', 'measurable', 'icpline', 'bucket', 'reverse', 'pilot', 'earlier', 'economics', 'same', 'buyer',
      'workflow', 'simsignals', 'simaction', 'roi']) expect(keys.has(k), k).toBe(true);
  });
});

describe('every tick is traced to the answers', () => {
  it('keeps a tick whose quote is in the answers', () => {
    const { cells, downgraded } = S.checkCells({ frequency: { state: 'yes', text: 'About 15 a month', quote: 'About 15 a month' } }, ANSWERS);
    expect(cells.frequency).toEqual({ state: 'yes', text: 'About 15 a month', quote: 'About 15 a month' });
    expect(downgraded).toEqual([]);
  });

  it('downgrades a tick nothing said supports, and says which', () => {
    const { cells, downgraded } = S.checkCells({ cost: { state: 'yes', text: 'Loses 2 lakh a month', quote: 'we lose 2 lakh a month' } }, ANSWERS);
    expect(cells.cost.state).toBe('open');
    expect(cells.cost.text).toMatch(/Not traced to the answers/);
    expect(downgraded).toEqual(['cost']);
  });

  it('does the same for a stated figure, and ignores rows that do not exist', () => {
    const { cells } = S.checkCells({ roi: { state: 'claim', text: 'x', quote: '' }, nonsense: { state: 'yes' } }, ANSWERS);
    expect(cells.roi.state).toBe('open');
    expect(cells.nonsense).toBeUndefined();
  });

  it('lets a pilot or a caught incident be recorded without a quote, because no answer holds them', () => {
    const { cells } = S.checkCells({ pilot: { state: 'yes', text: 'Agreed 30 days from 1 Nov' } }, ANSWERS);
    expect(cells.pilot.state).toBe('yes');
  });

  it('keeps a cell written by hand earlier', () => {
    const merged = S.mergeCells(
      { cost: { state: 'claim', text: 'mine', edited: true }, late: { state: 'open', text: 'old', edited: false } },
      { cost: { state: 'yes', text: 'new', quote: 'q' }, late: { state: 'yes', text: 'new', quote: 'q' } },
    );
    expect(merged.cost.text).toBe('mine');
    expect(merged.late).toEqual({ state: 'yes', text: 'new', quote: 'q', edited: false });
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

  it('refuses to lock before it is ready', () => {
    expect(read('../services/icpInterviewService.js'))
      .toMatch(/if \(lock && !result\.ready\) throw new Error\('It locks once two companies share one evidenced problem\.'\)/);
  });
});

describe('filled in the chat, not by a model here', () => {
  it('calls no model, and serves only reads', () => {
    expect(read('../services/icpInterviewService.js')).not.toMatch(/llmService|generate\(/);
    const routes = read('../routes/salesSignalsRoutes.js').split('\n').filter((l) => l.includes("'/icp"));
    expect(routes).toHaveLength(2);
    for (const r of routes) expect(r, r).toMatch(/^router\.get\(.*protect, adminOnly,/);
  });

  it('writes through a script that checks before it saves', () => {
    const script = read('../scripts/icp_record.mjs');
    expect(script).toContain('S.checkCells(iv.cells || {}, answers)');
    expect(script).toContain("process.argv.includes('--write')");
    expect(script).toContain('S.recordWedge(vertical, input.wedge)');
  });
});

describe('the three companies, re-filed word for word', () => {
  const by = (name) => legacy.find((d) => d.company === name);

  it('keeps every hand-written cell as a person’s', () => {
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
    expect(by('The Wellness Co.').answers.value).toBe('');
  });

  it('leaves the second company amber on the problem, with nothing priced', () => {
    const b = by('The Wellness Co.');
    expect(b.cells.same.state).toBe('open');
    expect(b.cells.cost).toBeUndefined();
    expect(b.cells.roi).toBeUndefined();
  });
});
