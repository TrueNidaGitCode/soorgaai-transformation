/**
 * Unit tests — services/capabilityBuildService.js
 *
 * The failure worth most of these tests is the silent one: Eame rewrites the
 * authored tree from one brief, so a capability missing from the brief is a
 * capability deleted from a working application, with a passing build and no
 * error anywhere. capabilitiesToCarry is what stands between the customer and
 * that, so it is tested hardest.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const {
  mockReqFindOneUpdate, mockReqUpdate, mockReqFind, mockReqFindOne,
  mockAppFindOne, mockAppFindOneUpdate, mockAppUpdate,
  mockBpFindOne, mockBuild,
} = vi.hoisted(() => ({
  mockReqFindOneUpdate: vi.fn(),
  mockReqUpdate:        vi.fn(),
  mockReqFind:          vi.fn(),
  mockReqFindOne:       vi.fn(),
  mockAppFindOne:       vi.fn(),
  mockAppFindOneUpdate: vi.fn(),
  mockAppUpdate:        vi.fn(),
  mockBpFindOne:        vi.fn(),
  mockBuild:            vi.fn(),
}));

vi.mock('../models/CapabilityRequest.js', () => ({
  default: {
    findOneAndUpdate: mockReqFindOneUpdate,
    updateOne: mockReqUpdate,
    find: mockReqFind,
    findOne: mockReqFindOne,
  },
}));
vi.mock('../models/GeneratedApplication.js', () => ({
  default: { findOne: mockAppFindOne, findOneAndUpdate: mockAppFindOneUpdate, updateOne: mockAppUpdate },
}));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: { findOne: mockBpFindOne } }));
vi.mock('../services/eameBuildService.js', () => ({ buildApplication: mockBuild }));

const { capabilitiesToCarry, generationInFlight, runCapabilityBuild, runNextPlannedBuild } =
  await import('../services/capabilityBuildService.js');

const REQ = 'req-1';
const BP = 'bp-1';

const plan = (title) => ({ title, summary: `${title} summary`, steps: ['step'], connectorsNeeded: [] });
const request = (over = {}) => ({
  _id: REQ, blueprintId: BP, userId: 'u1', status: 'building', plan: plan('WhatsApp messages'), ...over,
});

const lean = (v) => ({ lean: () => Promise.resolve(v) });
const selLean = (v) => ({ select: () => ({ lean: () => Promise.resolve(v) }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockReqFindOneUpdate.mockReturnValue({ lean: () => Promise.resolve(request()) });
  mockReqUpdate.mockResolvedValue({});
  mockReqFind.mockReturnValue(selLean([]));
  mockAppFindOne.mockReturnValue(lean(null));
  mockAppFindOneUpdate.mockResolvedValue({ _id: 'app-1' });
  mockAppUpdate.mockResolvedValue({});
  mockBpFindOne.mockReturnValue(lean({ _id: BP, businessObjective: 'manage my students' }));
  mockBuild.mockResolvedValue({ ok: true, files: [], generatedPaths: [], verifiedTo: 'smoke', history: [] });
});

describe('capabilitiesToCarry', () => {
  it('includes the capability being built', () => {
    expect(capabilitiesToCarry([], request()).map(p => p.title)).toEqual(['WhatsApp messages']);
  });

  // The whole point. Leaving these out deletes working features silently.
  it('carries every capability already in the application', () => {
    const existing = [
      { status: 'live',  plan: plan('Student records'), createdAt: '2026-01-01' },
      { status: 'ready', plan: plan('Invoicing'),       createdAt: '2026-05-01' },
    ];
    expect(capabilitiesToCarry(existing, request()).map(p => p.title))
      .toEqual(['Student records', 'Invoicing', 'WhatsApp messages']);
  });

  it('orders them as the customer grew the application', () => {
    const existing = [
      { status: 'live', plan: plan('Second'), createdAt: '2026-05-01' },
      { status: 'live', plan: plan('First'),  createdAt: '2026-01-01' },
    ];
    expect(capabilitiesToCarry(existing, null).map(p => p.title)).toEqual(['First', 'Second']);
  });

  it('leaves out capabilities that are not in the application yet', () => {
    const existing = [
      { status: 'planned',   plan: plan('Not built'),  createdAt: '2026-01-01' },
      { status: 'building',  plan: plan('Mid build'),  createdAt: '2026-01-02' },
      { status: 'failed',    plan: plan('Broke'),      createdAt: '2026-01-03' },
      { status: 'dismissed', plan: plan('Refused'),    createdAt: '2026-01-04' },
      { status: 'live',      plan: plan('Real'),       createdAt: '2026-01-05' },
    ];
    expect(capabilitiesToCarry(existing, null).map(p => p.title)).toEqual(['Real']);
  });

  it('drops anything without a title rather than briefing an unnamed capability', () => {
    const existing = [{ status: 'live', plan: { summary: 'no title' }, createdAt: '2026-01-01' }];
    expect(capabilitiesToCarry(existing, null)).toEqual([]);
  });

  it('does not describe the same capability twice when a build is retried', () => {
    const existing = [{ status: 'ready', plan: plan('WhatsApp messages'), createdAt: '2026-01-01' }];
    expect(capabilitiesToCarry(existing, request()).map(p => p.title)).toEqual(['WhatsApp messages']);
  });

  it('survives junk and missing arguments', () => {
    expect(capabilitiesToCarry()).toEqual([]);
    expect(capabilitiesToCarry([null, {}], null)).toEqual([]);
    expect(capabilitiesToCarry([], { plan: null })).toEqual([]);
  });
});

describe('generationInFlight', () => {
  it('is false when nothing is building', async () => {
    expect(await generationInFlight(BP)).toBe(false);
  });

  it('is true for a build that started just now', async () => {
    mockAppFindOne.mockReturnValue(lean({ progress: { startedAt: new Date() } }));
    expect(await generationInFlight(BP)).toBe(true);
  });

  // A restart mid-build leaves a lock nobody holds; it must not block forever.
  it('is false for a lock left behind by a dead build', async () => {
    mockAppFindOne.mockReturnValue(lean({ progress: { startedAt: new Date(Date.now() - 60 * 60000) } }));
    expect(await generationInFlight(BP)).toBe(false);
  });
});

describe('runCapabilityBuild', () => {
  it('claims the request only while it is still planned', async () => {
    await runCapabilityBuild({ requestId: REQ });
    expect(mockReqFindOneUpdate.mock.calls[0][0]).toEqual({ _id: REQ, status: 'planned' });
    expect(mockReqFindOneUpdate.mock.calls[0][1].$set).toEqual({ status: 'building' });
  });

  it('does nothing when another pass already claimed it', async () => {
    mockReqFindOneUpdate.mockReturnValue({ lean: () => Promise.resolve(null) });
    expect(await runCapabilityBuild({ requestId: REQ })).toMatchObject({ built: false, reason: 'not-claimable' });
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('hands the build every capability the application has', async () => {
    mockReqFind.mockReturnValue(selLean([
      { status: 'live', plan: plan('Student records'), createdAt: '2026-01-01' },
    ]));

    const out = await runCapabilityBuild({ requestId: REQ });
    expect(out).toMatchObject({ built: true, carried: 2 });
    expect(mockBuild.mock.calls[0][1].addedCapabilities.map(p => p.title))
      .toEqual(['Student records', 'WhatsApp messages']);
  });

  it('marks the request ready when the build passed', async () => {
    await runCapabilityBuild({ requestId: REQ });
    const set = mockReqUpdate.mock.calls.at(-1)[1].$set;
    expect(set).toMatchObject({ status: 'ready' });
  });

  // Not returned to planned: it would spend the month's budget retrying one
  // requirement that does not work.
  it('marks the request failed, with the reason, when the build did not pass', async () => {
    mockBuild.mockResolvedValue({ ok: false, reason: 'boot failed', history: [] });
    const out = await runCapabilityBuild({ requestId: REQ });
    expect(out).toMatchObject({ built: false, reason: 'build-failed' });
    expect(mockReqUpdate.mock.calls.at(-1)[1].$set).toMatchObject({ status: 'failed', error: 'boot failed' });
  });

  // Nothing is wrong with the capability — the application is busy.
  it('puts the request back to planned when a generation is already running', async () => {
    mockAppFindOne.mockReturnValue(lean({ progress: { startedAt: new Date() } }));
    const out = await runCapabilityBuild({ requestId: REQ });
    expect(out).toMatchObject({ built: false, reason: 'generation-in-flight' });
    expect(mockReqUpdate.mock.calls.at(-1)[1].$set).toEqual({ status: 'planned' });
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('fails the request when its blueprint has gone', async () => {
    mockBpFindOne.mockReturnValue(lean(null));
    expect(await runCapabilityBuild({ requestId: REQ })).toMatchObject({ reason: 'no-blueprint' });
    expect(mockReqUpdate.mock.calls.at(-1)[1].$set.status).toBe('failed');
  });

  it('records a crash on the request instead of throwing', async () => {
    mockBuild.mockRejectedValue(new Error('generator exploded'));
    const out = await runCapabilityBuild({ requestId: REQ });
    expect(out).toMatchObject({ built: false, reason: 'error' });
    expect(mockReqUpdate.mock.calls.at(-1)[1].$set.error).toContain('generator exploded');
  });

  it('does nothing without an id', async () => {
    expect(await runCapabilityBuild({})).toMatchObject({ reason: 'missing-id' });
  });
});

describe('runNextPlannedBuild', () => {
  it('takes the oldest planned request', async () => {
    mockReqFindOne.mockReturnValue({ sort: () => selLean({ _id: REQ }) });
    await runNextPlannedBuild({ blueprintId: BP });
    expect(mockReqFindOne.mock.calls[0][0]).toEqual({ blueprintId: BP, status: 'planned' });
    expect(mockBuild).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nothing is planned', async () => {
    mockReqFindOne.mockReturnValue({ sort: () => selLean(null) });
    expect(await runNextPlannedBuild({ blueprintId: BP })).toMatchObject({ reason: 'nothing-planned' });
    expect(mockBuild).not.toHaveBeenCalled();
  });
});
