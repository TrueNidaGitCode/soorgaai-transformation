/**
 * The five stages, written by the AI about one customer.
 *
 * The owner's decisions (6 October 2026): the AI writes Explain, Recommend,
 * Act, Measure and Learn; the records decide whether a step worked; the
 * playbook stands in, labelled, when the AI cannot answer; and none of it is
 * charged to the evaluation allowance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

const gen = vi.fn();
vi.mock('../eame-template/services/llmService.js', () => ({ generateRaw: (...a) => gen(...a), generate: (...a) => gen(...a) }));

const {
  checkAnalysis, factsFor, fingerprint, inventedNumbers, analyseCustomer, standardFor,
} = await import('../eame-template/services/customerAnalysis.js');

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const NOW = Date.UTC(2026, 9, 6, 9);
const DAY = 86400000;

const finding = (over = {}) => ({
  id: 'f1', watcher: 'Stopped Coming', watcherId: 'stopped-coming', severity: 'medium',
  since: new Date(NOW - 5 * DAY),
  evidence: { rule: 'no visit in the last 14 days', dataset: 'Appointments', columns: ['patient', 'last_visit'], lines: [['Meera Iyer', '2026-09-12']] },
  ...over,
});

const good = {
  kind: 'retention',
  explain: 'Meera Iyer has not visited since 2026-09-12, which is how regular patients usually drift away.',
  recommend: { action: 'call', step: 'Call Meera Iyer this week and offer her next appointment.', why: 'No outcomes are recorded here yet, so a call is the most direct start.' },
  act: 'Hi Meera, we noticed we have not seen you for a while. Would you like us to book your next session?',
  measure: 'A new appointment for Meera Iyer that she attends.',
  learn: 'This business has no recorded outcomes for this yet.',
};

describe('the facts the AI may use', () => {
  it('carries the records, what the team did and what has worked here', () => {
    const facts = factsFor('Meera Iyer',
      [finding({ acted: { action: 'call', at: new Date(NOW - 2 * DAY) } })], [],
      { 'stopped-coming': { call: { tried: 4, worked: 3 } } }, NOW).join('\n');
    expect(facts).toContain('Record: Meera Iyer | 2026-09-12');
    expect(facts).toContain('Flagged because: no visit in the last 14 days');
    expect(facts).toContain('Team already did: Called them, 2 days ago');
    expect(facts).toContain('stopped-coming / call: tried 4, worked 3');
  });
});

describe('what is accepted from the AI', () => {
  const facts = factsFor('Meera Iyer', [finding()], [], {}, NOW);

  it('accepts an analysis that uses only the facts', () => {
    expect(checkAnalysis(good, facts)).toMatchObject({ kind: 'retention', recommend: { action: 'call' } });
  });

  it('rejects a number the facts do not contain', () => {
    expect(inventedNumbers('She owes 4500 rupees', facts)).toEqual(['4500']);
    expect(checkAnalysis({ ...good, act: 'You have 3 sessions left worth 4500.' }, facts)).toBeNull();
  });

  it('rejects a step outside the shared vocabulary, so outcomes stay countable', () => {
    expect(checkAnalysis({ ...good, recommend: { ...good.recommend, action: 'discount' } }, facts)).toBeNull();
  });

  it('rejects an analysis missing a stage', () => {
    expect(checkAnalysis({ ...good, measure: '' }, facts)).toBeNull();
    expect(checkAnalysis(null, facts)).toBeNull();
  });
});

describe('asking the AI', () => {
  beforeEach(() => { gen.mockReset(); });

  it('returns the checked analysis, with reasoning off', async () => {
    gen.mockResolvedValue({ text: '```json\n' + JSON.stringify(good) + '\n```' });
    const a = await analyseCustomer('Meera Iyer', [finding()], [], {}, NOW);
    expect(a.recommend.step).toMatch(/Call Meera/);
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen.mock.calls[0][0]).toMatchObject({ thinking: false, label: 'customer-analysis' });
    expect(gen.mock.calls[0][0].userMessage).toContain('FACTS');
  });

  it('asks once more after an unusable reply, then gives up so the playbook stands in', async () => {
    gen.mockResolvedValue({ text: JSON.stringify({ ...good, act: 'Pay 9999 now.' }) });
    expect(await analyseCustomer('Meera Iyer', [finding()], [], {}, NOW)).toBeNull();
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it('has a labelled standard version for when it gives up', () => {
    const s = standardFor([finding()]);
    expect(s.recommend.step).toBe('Call them');
    expect(s.measure).toMatch(/they come in again/);
  });
});

describe('when a customer is read again', () => {
  it('does not change when the order does, and does when the team acts or a finding resolves', () => {
    const a = finding({ id: 'a' }); const b = finding({ id: 'b', severity: 'high' });
    const base = fingerprint([a, b], []);
    expect(fingerprint([b, a], [])).toBe(base);
    expect(fingerprint([a, { ...b, acted: { action: 'call' } }], [])).not.toBe(base);
    expect(fingerprint([a], [{ id: 'b', outcomes: [{ action: 'call' }] }])).not.toBe(base);
  });

  it('ignores evidence rows moving on, which would re-bill every customer every hour', () => {
    const a = finding({ id: 'a' });
    expect(fingerprint([{ ...a, evidence: { lines: [['x']] } }], [])).toBe(fingerprint([a], []));
  });
});

describe('wired into the delivered app', () => {
  const ctl = read('../eame-template/controllers/agentsController.js');
  const svc = read('../eame-template/services/agentService.js');
  const server = read('../eame-template/server.js');
  const ui = read('../eame-template/frontend/findings.js');
  const src = read('../eame-template/services/customerAnalysis.js');

  it('ships to every application', async () => {
    const { FIXED_PATHS } = await import('../services/eameSpec.js');
    expect(FIXED_PATHS).toContain('services/customerAnalysis.js');
    expect(read('../services/eameProjectBuilder.js')).toContain("'services/customerAnalysis.js':");
  });

  it('re-reads customers after a watcher run that changed something', () => {
    expect(svc).toMatch(/if \(\(change\.new\.length \|\| change\.resolved\.length\) && findingsChanged\)/);
    expect(server).toContain('onFindingsChanged(() => { refreshAnalyses(); });');
  });

  it('is not charged to the evaluation allowance', () => {
    expect(src).not.toContain('takeEvaluation');
  });

  it('lays the AI over the card, and keeps the states counted in code', () => {
    expect(ctl).toMatch(/withAnalysis\(c, doc, fp, stats\)/);
    expect(ctl).toMatch(/c\.source = 'standard';/);
    expect(ctl).toMatch(/if \(s\.measure\.state !== 'done'\) s\.measure = \{ state: s\.measure\.state, line: ai\.measure \}/);
  });

  it('says on the card and the finding who wrote it', () => {
    expect(ui).toContain('Written by AI');
    expect(ui).toContain('Standard guidance');
  });
});
