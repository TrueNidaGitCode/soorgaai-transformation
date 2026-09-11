/**
 * Unit tests — services/capabilityDecisionService.js
 *
 * Building happens unattended, so the guards are what these tests are for:
 * one decision per requirement, one build at a time, a monthly ceiling, and a
 * planner that is allowed to say no. A hole in any of them is money spent and
 * a customer's application changed with nobody watching.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const {
  mockCreate, mockCount, mockFindReq, mockFindOneCU, mockUpdateCU, mockGenerate,
} = vi.hoisted(() => ({
  mockCreate:    vi.fn(),
  mockCount:     vi.fn(),
  mockFindReq:   vi.fn(),
  mockFindOneCU: vi.fn(),
  mockUpdateCU:  vi.fn(),
  mockGenerate:  vi.fn(),
}));

vi.mock('../models/CapabilityRequest.js', () => ({
  default: { create: mockCreate, countDocuments: mockCount, find: mockFindReq },
}));
vi.mock('../models/CustomerUnderstanding.js', () => ({
  default: { findOne: mockFindOneCU, updateOne: mockUpdateCU },
}));
vi.mock('../services/llmService.js', () => ({ generate: mockGenerate }));

const {
  needKeyOf, selectActionableNeeds, monthWindow, parsePlan,
  considerCapabilities, planCapability, MONTHLY_BUILD_BUDGET,
} = await import('../services/capabilityDecisionService.js');

const USER = 'user-1';
const BP = 'bp-1';

const GOOD_PLAN = JSON.stringify({
  actionable: true,
  title: 'WhatsApp class messages',
  summary: 'Send class timings to students on WhatsApp.',
  steps: ['Pick a class', 'Write the message', 'Send to every student'],
  connectorsNeeded: ['WhatsApp Business'],
});

const need = (text, extra = {}) => ({ text, mentions: 1, status: 'noticed', ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  mockFindOneCU.mockReturnValue({ lean: () => Promise.resolve({ needs: [need('send class timings on WhatsApp')] }) });
  mockCount.mockResolvedValue(0);
  mockFindReq.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
  mockCreate.mockResolvedValue({});
  mockUpdateCU.mockResolvedValue({});
  mockGenerate.mockResolvedValue({ text: GOOD_PLAN });
});

describe('needKeyOf', () => {
  it('agrees with the Learner about what is the same requirement', () => {
    expect(needKeyOf('Send Class Timings!')).toBe(needKeyOf('send class timings'));
  });
});

describe('selectActionableNeeds', () => {
  it('offers a need mentioned only once — the brief acts on first mention', () => {
    expect(selectActionableNeeds([need('send class timings')])).toHaveLength(1);
  });

  it('ignores needs already planned or dismissed', () => {
    const out = selectActionableNeeds([
      need('a', { status: 'planned' }),
      need('b', { status: 'dismissed' }),
      need('c'),
    ]);
    expect(out.map(n => n.text)).toEqual(['c']);
  });

  it('ignores anything already decided, whatever its status says', () => {
    const out = selectActionableNeeds(
      [need('send class timings')],
      { decidedKeys: new Set([needKeyOf('send class timings')]) }
    );
    expect(out).toEqual([]);
  });

  it('puts the most-mentioned first, so a scarce budget goes to the loudest need', () => {
    const out = selectActionableNeeds([
      need('quiet', { mentions: 1 }),
      need('loud',  { mentions: 6 }),
      need('middle', { mentions: 3 }),
    ]);
    expect(out.map(n => n.text)).toEqual(['loud', 'middle', 'quiet']);
  });

  it('survives junk entries', () => {
    expect(selectActionableNeeds([null, {}, need('real')])).toHaveLength(1);
  });
});

describe('monthWindow', () => {
  it('spans the calendar month containing the date', () => {
    const { start, end } = monthWindow(new Date('2026-09-11T12:00:00Z'));
    expect(start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rolls over the year in December', () => {
    expect(monthWindow(new Date('2026-12-20T00:00:00Z')).end.toISOString())
      .toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('parsePlan', () => {
  it('reads a good plan', () => {
    const p = parsePlan(GOOD_PLAN);
    expect(p.actionable).toBe(true);
    expect(p.title).toBe('WhatsApp class messages');
    expect(p.steps).toHaveLength(3);
    expect(p.connectorsNeeded).toEqual(['WhatsApp Business']);
  });

  it('reads it out of a fenced block', () => {
    expect(parsePlan('```json\n' + GOOD_PLAN + '\n```').actionable).toBe(true);
  });

  it('carries the planner refusal and its reason', () => {
    const p = parsePlan('{"actionable":false,"reason":"this is a wish, not a capability"}');
    expect(p.actionable).toBe(false);
    expect(p.reason).toBe('this is a wish, not a capability');
  });

  // Unreadable must never become "build the empty plan".
  it('refuses anything it cannot read, rather than returning a blank plan', () => {
    for (const junk of ['', null, 'no json', '{ broken', '[1,2]']) {
      expect(parsePlan(junk).actionable).toBe(false);
      expect(parsePlan(junk).reason).toBeTruthy();
    }
  });

  it('refuses a plan flagged actionable that has no steps', () => {
    expect(parsePlan('{"actionable":true,"title":"Something"}').actionable).toBe(false);
  });

  it('refuses a plan flagged actionable that has no title', () => {
    expect(parsePlan('{"actionable":true,"steps":["do a thing"]}').actionable).toBe(false);
  });

  it('does not treat a truthy non-true value as consent', () => {
    expect(parsePlan('{"actionable":"yes","title":"X","steps":["y"]}').actionable).toBe(false);
  });
});

describe('planCapability', () => {
  it('turns a planner failure into a refusal rather than an exception', async () => {
    mockGenerate.mockRejectedValue(new Error('All LLM providers failed'));
    const p = await planCapability({ need: 'send timings', understanding: {}, blueprint: {} });
    expect(p.actionable).toBe(false);
    expect(p.reason).toContain('planning failed');
  });

  it('is accounted separately from chat', async () => {
    await planCapability({ need: 'send timings', understanding: {}, blueprint: {} });
    expect(mockGenerate.mock.calls[0][0].label).toBe('learn:plan-capability');
  });
});

describe('considerCapabilities', () => {
  it('plans the candidate and records the decision', async () => {
    const out = await considerCapabilities({ userId: USER, blueprintId: BP });
    expect(out).toMatchObject({ decided: true, reason: 'planned' });

    const doc = mockCreate.mock.calls[0][0];
    expect(doc).toMatchObject({ status: 'planned', blueprintId: BP, mentionsAtDecision: 1 });
    expect(doc.needKey).toBe(needKeyOf('send class timings on WhatsApp'));
    expect(doc.plan.title).toBe('WhatsApp class messages');
  });

  it('marks the need planned so the Learner stops offering it', async () => {
    await considerCapabilities({ userId: USER, blueprintId: BP });
    expect(mockUpdateCU.mock.calls[0][1]).toEqual({ $set: { 'needs.$.status': 'planned' } });
  });

  it('does nothing without ids', async () => {
    expect(await considerCapabilities({ blueprintId: BP })).toMatchObject({ reason: 'missing-ids' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('does nothing when nothing has been learned', async () => {
    mockFindOneCU.mockReturnValue({ lean: () => Promise.resolve(null) });
    expect(await considerCapabilities({ userId: USER, blueprintId: BP }))
      .toMatchObject({ reason: 'nothing-learned' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  // Guard 2 — two generations rewriting one authored tree is a corrupted app.
  it('will not start anything while a build is in flight', async () => {
    mockCount.mockResolvedValueOnce(1);
    expect(await considerCapabilities({ userId: USER, blueprintId: BP }))
      .toMatchObject({ decided: false, reason: 'build-in-flight' });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // Guard 3 — the backstop against a detector that is too eager.
  it('stops at the monthly budget', async () => {
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(MONTHLY_BUILD_BUDGET);
    expect(await considerCapabilities({ userId: USER, blueprintId: BP }))
      .toMatchObject({ decided: false, reason: 'budget-spent' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  // Guard 1 — the customer mentioning it four times must buy one build.
  it('skips a requirement that has already been decided', async () => {
    mockFindReq.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([{ needKey: needKeyOf('send class timings on WhatsApp') }]) }),
    });
    expect(await considerCapabilities({ userId: USER, blueprintId: BP }))
      .toMatchObject({ decided: false, reason: 'no-candidate' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  // The same guard, at the database, for two passes racing each other.
  it('treats a duplicate-key collision as the guard working, not an error', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await considerCapabilities({ userId: USER, blueprintId: BP }))
      .toMatchObject({ decided: false, reason: 'already-decided' });
  });

  // Guard 4 — and the refusal must stick, or it is re-planned every message.
  it('records a refusal as dismissed rather than dropping it', async () => {
    mockGenerate.mockResolvedValue({ text: '{"actionable":false,"reason":"a wish, not a capability"}' });

    const out = await considerCapabilities({ userId: USER, blueprintId: BP });
    expect(out).toMatchObject({ decided: false, reason: 'not-actionable' });
    expect(mockCreate.mock.calls[0][0].status).toBe('dismissed');
    expect(mockUpdateCU.mock.calls[0][1]).toEqual({ $set: { 'needs.$.status': 'dismissed' } });
  });

  it('plans one capability per pass, not a queue', async () => {
    mockFindOneCU.mockReturnValue({
      lean: () => Promise.resolve({ needs: [need('first', { mentions: 5 }), need('second', { mentions: 4 })] }),
    });
    await considerCapabilities({ userId: USER, blueprintId: BP });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].need).toBe('first');
  });

  it('reports a database failure instead of throwing into the caller', async () => {
    mockCount.mockRejectedValue(new Error('connection lost'));
    await expect(considerCapabilities({ userId: USER, blueprintId: BP }))
      .resolves.toMatchObject({ decided: false, reason: 'error' });
  });
});
