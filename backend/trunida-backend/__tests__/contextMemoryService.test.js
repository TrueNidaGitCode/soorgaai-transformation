/**
 * Unit tests — services/contextMemoryService.js
 *
 * Strategy:
 *  - UserProfile, DomainCanvas, Conversation Mongoose models are mocked.
 *  - loadContext() is the only public export; tested via direct call.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  makeProfile,
  makeDomainCanvas,
  makeConversation,
  makeStubTurns,
  AI_STRATEGY_FOCUS_AREAS,
  STUB_USER_ID,
} from './__fixtures__/workspace-helpers.js';

// ── Hoist model mock functions ────────────────────────────────────────────────

const { mockProfileFind, mockCanvasFind, mockConvFind } = vi.hoisted(() => ({
  mockProfileFind: vi.fn(),
  mockCanvasFind:  vi.fn(),
  mockConvFind:    vi.fn(),
}));

vi.mock('../models/UserProfile.js',  () => ({ default: { findOne: mockProfileFind } }));
vi.mock('../models/DomainCanvas.js', () => ({ default: { findOne: mockCanvasFind  } }));
vi.mock('../models/Conversation.js', () => ({ default: { findOne: mockConvFind    } }));

import { loadContext } from '../services/contextMemoryService.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path stubs
  mockProfileFind.mockReturnValue({ lean: () => Promise.resolve(makeProfile()) });
  mockCanvasFind.mockReturnValue({ lean: () => Promise.resolve(makeDomainCanvas()) });
  mockConvFind.mockReturnValue({ lean: () => Promise.resolve(makeConversation()) });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('loadContext() — happy path', () => {
  it('returns a context bundle with profile, canvasSnapshot, recentTurns, and summary', async () => {
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');

    expect(ctx).toHaveProperty('profile');
    expect(ctx).toHaveProperty('canvasSnapshot');
    expect(ctx).toHaveProperty('recentTurns');
    expect(ctx).toHaveProperty('summary');
  });

  it('returns the correct profile', async () => {
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.profile.orgName).toBe('Acme Motors GmbH');
  });

  it('returns all 5 focus areas in canvasSnapshot', async () => {
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.canvasSnapshot).toHaveLength(5);
  });

  it('returns an empty recentTurns array when no conversation exists', async () => {
    mockConvFind.mockReturnValue({ lean: () => Promise.resolve(null) });
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.recentTurns).toHaveLength(0);
  });

  it('returns empty summary when no conversation exists', async () => {
    mockConvFind.mockReturnValue({ lean: () => Promise.resolve(null) });
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.summary).toBe('');
  });

  it('returns empty canvasSnapshot when no canvas exists', async () => {
    mockCanvasFind.mockReturnValue({ lean: () => Promise.resolve(null) });
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.canvasSnapshot).toHaveLength(0);
  });

  it('returns the rolling summary from the conversation', async () => {
    mockConvFind.mockReturnValue({
      lean: () => Promise.resolve(makeConversation([], { summary: 'User is focused on ADAS.' })),
    });
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.summary).toBe('User is focused on ADAS.');
  });
});

// ── Turn windowing ────────────────────────────────────────────────────────────

describe('loadContext() — 10-turn window', () => {
  it('returns all turns when conversation has fewer than 10', async () => {
    const turns = makeStubTurns(6);
    mockConvFind.mockReturnValue({
      lean: () => Promise.resolve(makeConversation(turns)),
    });
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.recentTurns).toHaveLength(6);
  });

  it('returns exactly 10 turns when conversation has exactly 10', async () => {
    const turns = makeStubTurns(10);
    mockConvFind.mockReturnValue({
      lean: () => Promise.resolve(makeConversation(turns)),
    });
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.recentTurns).toHaveLength(10);
  });

  it('returns only the last 10 turns when conversation has more than 10', async () => {
    const turns = makeStubTurns(15);
    mockConvFind.mockReturnValue({
      lean: () => Promise.resolve(makeConversation(turns)),
    });
    const ctx = await loadContext(STUB_USER_ID, 'ai-strategy');
    expect(ctx.recentTurns).toHaveLength(10);
    expect(ctx.recentTurns[0].content).toBe('Turn 6 content.');
  });
});

// ── Missing profile ───────────────────────────────────────────────────────────

describe('loadContext() — missing profile', () => {
  it('throws an error when the user profile does not exist', async () => {
    mockProfileFind.mockReturnValue({ lean: () => Promise.resolve(null) });
    await expect(loadContext(STUB_USER_ID, 'ai-strategy')).rejects.toThrow();
  });

  it('thrown error has status 404', async () => {
    mockProfileFind.mockReturnValue({ lean: () => Promise.resolve(null) });
    try {
      await loadContext(STUB_USER_ID, 'ai-strategy');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });
});
