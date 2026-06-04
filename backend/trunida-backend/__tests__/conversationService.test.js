/**
 * Unit tests — services/conversationService.js
 *
 * Strategy:
 *  - @anthropic-ai/sdk is mocked (same hoisting pattern as discoveryService.test.js).
 *  - Conversation model is mocked.
 *  - contextMemoryService and chatPrompt are mocked as pure data sources.
 *  - dotenv mocked as no-op.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  makeProfile,
  makeDomainCanvas,
  makeConversation,
  makeChatEnvelopeValid,
  CHAT_ENVELOPE_NO_UPDATES,
  CHAT_RESPONSE_MALFORMED,
  SUMMARY_RESPONSE,
  makeStubTurns,
  STUB_USER_ID,
} from './__fixtures__/workspace-helpers.js';

// ── Hoist all mock fns ────────────────────────────────────────────────────────

const { mockMessagesCreate }    = vi.hoisted(() => ({ mockMessagesCreate: vi.fn() }));
const { mockLoadContext }       = vi.hoisted(() => ({ mockLoadContext:    vi.fn() }));
const { mockBuildSystemPrompt } = vi.hoisted(() => ({ mockBuildSystemPrompt: vi.fn() }));
const { mockBuildMessages }     = vi.hoisted(() => ({ mockBuildMessages:     vi.fn() }));
const { mockConvFindOneUpdate, mockConvFindOne } = vi.hoisted(() => ({
  mockConvFindOneUpdate: vi.fn(),
  mockConvFindOne:       vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() { this.messages = { create: mockMessagesCreate }; }
  },
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

vi.mock('../services/contextMemoryService.js', () => ({
  loadContext: mockLoadContext,
}));

vi.mock('../services/promptTemplates/chatPrompt.js', () => ({
  buildSystemPrompt: mockBuildSystemPrompt,
  buildMessages:     mockBuildMessages,
}));

vi.mock('../models/Conversation.js', () => ({
  default: {
    findOneAndUpdate: mockConvFindOneUpdate,
    findOne:          mockConvFindOne,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function importWithApiKey() {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = 'test-key-abc';
  return import('../services/conversationService.js');
}

function setupDefaultMocks() {
  mockLoadContext.mockResolvedValue({
    profile:        makeProfile(),
    canvasSnapshot: makeDomainCanvas().focusAreas,
    recentTurns:    [],
    summary:        '',
  });
  mockBuildSystemPrompt.mockReturnValue('System prompt text');
  mockBuildMessages.mockReturnValue([{ role: 'user', content: 'Test message' }]);

  const conv = makeConversation();
  mockConvFindOneUpdate.mockResolvedValue(conv);
  mockConvFindOne.mockResolvedValue(makeConversation(makeStubTurns(4)));
  mockMessagesCreate.mockResolvedValue(makeChatEnvelopeValid());
}

beforeEach(setupDefaultMocks);

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('handleTurn() — happy path', () => {
  it('returns an object with reply, parsedUpdates, and conversationId', async () => {
    const { handleTurn } = await importWithApiKey();
    const result = await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');

    expect(result).toHaveProperty('reply');
    expect(result).toHaveProperty('parsedUpdates');
    expect(result).toHaveProperty('conversationId');
  });

  it('calls loadContext with userId and domainId', async () => {
    const { handleTurn } = await importWithApiKey();
    await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');
    expect(mockLoadContext).toHaveBeenCalledWith(STUB_USER_ID, 'ai-strategy');
  });

  it('calls Claude messages.create', async () => {
    const { handleTurn } = await importWithApiKey();
    await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
  });

  it('passes model claude-sonnet-4-6 to Claude', async () => {
    const { handleTurn } = await importWithApiKey();
    await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');
    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet-4-6');
  });

  it('returns the reply string from the JSON envelope', async () => {
    const { handleTurn } = await importWithApiKey();
    const result = await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');
    expect(result.reply).toBe('Here is my advice for your AI strategy.');
  });

  it('returns parsedUpdates array from the JSON envelope', async () => {
    const { handleTurn } = await importWithApiKey();
    const result = await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');
    expect(Array.isArray(result.parsedUpdates)).toBe(true);
    expect(result.parsedUpdates).toHaveLength(1);
    expect(result.parsedUpdates[0].focusAreaId).toBe('vision-alignment');
  });

  it('returns empty parsedUpdates when envelope has no canvasUpdates', async () => {
    mockMessagesCreate.mockResolvedValue(CHAT_ENVELOPE_NO_UPDATES);
    const { handleTurn } = await importWithApiKey();
    const result = await handleTurn(STUB_USER_ID, 'ai-strategy', 'Tell me more');
    expect(result.parsedUpdates).toHaveLength(0);
  });

  it('persists the conversation turn (calls findOneAndUpdate)', async () => {
    const { handleTurn } = await importWithApiKey();
    await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');
    expect(mockConvFindOneUpdate).toHaveBeenCalled();
  });
});

// ── Malformed JSON fallback ───────────────────────────────────────────────────

describe('handleTurn() — malformed LLM JSON', () => {
  it('returns raw text as reply when Claude returns non-JSON', async () => {
    mockMessagesCreate.mockResolvedValue(CHAT_RESPONSE_MALFORMED);
    const { handleTurn } = await importWithApiKey();
    const result = await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');

    expect(result.reply).toBe('This is not JSON at all.');
  });

  it('returns empty parsedUpdates when Claude returns non-JSON', async () => {
    mockMessagesCreate.mockResolvedValue(CHAT_RESPONSE_MALFORMED);
    const { handleTurn } = await importWithApiKey();
    const result = await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');

    expect(result.parsedUpdates).toHaveLength(0);
  });

  it('still persists the turn when JSON parsing fails', async () => {
    mockMessagesCreate.mockResolvedValue(CHAT_RESPONSE_MALFORMED);
    const { handleTurn } = await importWithApiKey();
    await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello');

    expect(mockConvFindOneUpdate).toHaveBeenCalled();
  });
});

// ── Claude API error ──────────────────────────────────────────────────────────

describe('handleTurn() — Claude API error', () => {
  it('re-throws the Claude error so the controller can return 503', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('API timeout'));
    const { handleTurn } = await importWithApiKey();

    await expect(handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello'))
      .rejects
      .toThrow('API timeout');
  });

  it('still persists the user turn before re-throwing', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('API timeout'));
    const { handleTurn } = await importWithApiKey();

    try { await handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello'); } catch { /* expected */ }

    expect(mockConvFindOneUpdate).toHaveBeenCalled();
  });
});

// ── No API key ────────────────────────────────────────────────────────────────

describe('handleTurn() — no ANTHROPIC_API_KEY', () => {
  it('throws when API key is missing', async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const { handleTurn } = await import('../services/conversationService.js');

    await expect(handleTurn(STUB_USER_ID, 'ai-strategy', 'Hello'))
      .rejects
      .toThrow();
  });
});
