/**
 * Unit tests — controllers/chatController.js
 *
 * Strategy:
 *  - handleTurn (conversationService) and applyUpdates (canvasEvolutionService) mocked.
 *  - Conversation and DomainCanvas models mocked for history/canvas GET routes.
 *  - getDomain from domainDefinitions used directly (real data).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  makeReqRes,
  makeDomainCanvas,
  makeConversation,
  makeStubTurns,
  STUB_USER_ID,
} from './__fixtures__/workspace-helpers.js';

const { mockHandleTurn, mockApplyUpdates } = vi.hoisted(() => ({
  mockHandleTurn:   vi.fn(),
  mockApplyUpdates: vi.fn(),
}));

const { mockConvFindOne, mockCanvasFindOne } = vi.hoisted(() => ({
  mockConvFindOne:   vi.fn(),
  mockCanvasFindOne: vi.fn(),
}));

vi.mock('../services/conversationService.js',   () => ({ handleTurn:   mockHandleTurn   }));
vi.mock('../services/canvasEvolutionService.js', () => ({ applyUpdates: mockApplyUpdates }));
vi.mock('../models/Conversation.js',  () => ({ default: { findOne: mockConvFindOne  } }));
vi.mock('../models/DomainCanvas.js',  () => ({ default: { findOne: mockCanvasFindOne } }));

import {
  sendMessage,
  getHistory,
  getCanvas,
  getSuggestedPrompts,
} from '../controllers/chatController.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

const TURN_RESULT = {
  reply:          'Here is my analysis.',
  parsedUpdates:  [{ focusAreaId: 'vision-alignment', newDescription: 'New desc.', confidence: 0.8, evidence: 'Evidence.' }],
  conversationId: 'conv-id-001',
};

const ACCEPTED_UPDATES = [{ focusAreaId: 'vision-alignment', title: 'AI Vision & Business Alignment', newDescription: 'New desc.' }];

beforeEach(() => {
  vi.clearAllMocks();
  mockHandleTurn.mockResolvedValue(TURN_RESULT);
  mockApplyUpdates.mockResolvedValue(ACCEPTED_UPDATES);
  mockConvFindOne.mockReturnValue({ lean: () => Promise.resolve(makeConversation(makeStubTurns(4))) });
  mockCanvasFindOne.mockReturnValue({ lean: () => Promise.resolve(makeDomainCanvas()) });
});

// ── sendMessage — validation ──────────────────────────────────────────────────

describe('sendMessage() — input validation', () => {
  it('returns 400 when message body is missing', async () => {
    const { req, res } = makeReqRes({}, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when message is an empty string', async () => {
    const { req, res } = makeReqRes({ message: '' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when message is whitespace-only', async () => {
    const { req, res } = makeReqRes({ message: '   ' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── sendMessage — domain checks ───────────────────────────────────────────────

describe('sendMessage() — domain checks', () => {
  it('returns 404 for an unknown domainId', async () => {
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'unknown-domain' });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 for an unknown domain', async () => {
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'leadership' });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('does not call handleTurn for an unknown domain', async () => {
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'leadership' });
    await sendMessage(req, res);
    expect(mockHandleTurn).not.toHaveBeenCalled();
  });
});

// ── sendMessage — happy path ──────────────────────────────────────────────────

describe('sendMessage() — happy path', () => {
  it('returns 200 on success', async () => {
    const { req, res } = makeReqRes({ message: 'How should I start?' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('calls handleTurn with userId, domainId, and trimmed message', async () => {
    const { req, res } = makeReqRes({ message: '  Hello  ' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    expect(mockHandleTurn).toHaveBeenCalledWith(
      expect.anything(),
      'ai-strategy',
      'Hello',
    );
  });

  it('calls applyUpdates with the parsed updates from handleTurn', async () => {
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    expect(mockApplyUpdates).toHaveBeenCalledWith(
      expect.anything(),
      'ai-strategy',
      TURN_RESULT.parsedUpdates,
      TURN_RESULT.conversationId,
    );
  });

  it('response body includes reply, canvasUpdates, and conversationId', async () => {
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body).toHaveProperty('reply');
    expect(body).toHaveProperty('canvasUpdates');
    expect(body).toHaveProperty('conversationId');
  });

  it('canvasUpdates in the response matches the accepted updates from applyUpdates', async () => {
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.canvasUpdates).toEqual(ACCEPTED_UPDATES);
  });
});

// ── sendMessage — Claude/service error → 503 ─────────────────────────────────

describe('sendMessage() — service error', () => {
  it('returns 503 when handleTurn throws', async () => {
    mockHandleTurn.mockRejectedValue(new Error('Claude timeout'));
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('503 response body contains an error message with "try again"', async () => {
    mockHandleTurn.mockRejectedValue(new Error('Claude timeout'));
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.error.toLowerCase()).toContain('try again');
  });

  it('returns 404 when handleTurn throws a 404-status error (profile not found)', async () => {
    const notFoundErr = new Error('User profile not found.');
    notFoundErr.status = 404;
    mockHandleTurn.mockRejectedValue(notFoundErr);
    const { req, res } = makeReqRes({ message: 'Hello' }, { domainId: 'ai-strategy' });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe('getHistory()', () => {
  it('returns 200 with turns array', async () => {
    const { req, res } = makeReqRes({}, { domainId: 'ai-strategy' }, undefined, { limit: '50' });
    await getHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(Array.isArray(body.turns)).toBe(true);
  });

  it('returns empty turns and summary when no conversation exists', async () => {
    mockConvFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const { req, res } = makeReqRes({}, { domainId: 'ai-strategy' });
    await getHistory(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.turns).toHaveLength(0);
    expect(body.summary).toBe('');
  });
});

// ── getCanvas ─────────────────────────────────────────────────────────────────

describe('getCanvas()', () => {
  it('returns 200 with focusAreas when canvas exists', async () => {
    const { req, res } = makeReqRes({}, { domainId: 'ai-strategy' });
    await getCanvas(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.focusAreas).toHaveLength(5);
  });

  it('returns 404 when canvas does not exist', async () => {
    mockCanvasFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const { req, res } = makeReqRes({}, { domainId: 'ai-strategy' });
    await getCanvas(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── getSuggestedPrompts ───────────────────────────────────────────────────────

describe('getSuggestedPrompts()', () => {
  it('returns 200 with 4 prompts for ai-strategy', async () => {
    const { req, res } = makeReqRes({}, { domainId: 'ai-strategy' });
    await getSuggestedPrompts(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.prompts).toHaveLength(4);
  });

  it('returns 404 for an unknown domainId', async () => {
    const { req, res } = makeReqRes({}, { domainId: 'unknown' });
    await getSuggestedPrompts(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns an array of non-empty strings', async () => {
    const { req, res } = makeReqRes({}, { domainId: 'ai-strategy' });
    await getSuggestedPrompts(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    for (const p of body.prompts) {
      expect(typeof p).toBe('string');
      expect(p.trim().length).toBeGreaterThan(0);
    }
  });
});
