/**
 * Unit Tests — llmService.js
 *
 * Strategy:
 *  - Both SDK constructors are hoisted so they remain stable across the module
 *    import and vi.clearAllMocks() resets their call state between tests.
 *  - Provider is exercised via the explicit `provider` param rather than
 *    re-loading the module (DEFAULT_PROVIDER is set at module-init time from
 *    env vars; that behaviour is tested at the deployment layer, not here).
 *  - Tests cover: Anthropic calls, OpenAI calls, token mapping, missing-key
 *    errors, model overrides, and unknown-provider errors.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted stable mock references ───────────────────────────────────────────
// All mock objects live in vi.hoisted() so they survive vi.clearAllMocks()
// without being re-created when the module re-imports the SDKs.

const {
  mockAnthropicCreate,
  mockOpenAICreate,
  MockAnthropic,
  MockOpenAI,
} = vi.hoisted(() => {
  const mockAnthropicCreate = vi.fn();
  const mockOpenAICreate    = vi.fn();
  // Must use 'function' (not arrow) so they can be called with 'new'
  const MockAnthropic = vi.fn(function () {
    return { messages: { create: mockAnthropicCreate } };
  });
  const MockOpenAI = vi.fn(function () {
    return { chat: { completions: { create: mockOpenAICreate } } };
  });
  return { mockAnthropicCreate, mockOpenAICreate, MockAnthropic, MockOpenAI };
});

vi.mock('@anthropic-ai/sdk', () => ({ default: MockAnthropic }));
vi.mock('openai',            () => ({ default: MockOpenAI    }));

import { generate } from '../services/llmService.js';

// ── Stub responses ────────────────────────────────────────────────────────────

const ANTHROPIC_RESP = {
  content: [{ type: 'text', text: 'Anthropic response text.' }],
  usage:   { input_tokens: 300, output_tokens: 120 },
};

const OPENAI_RESP = {
  choices: [{ message: { content: 'OpenAI response text.' } }],
  usage:   { prompt_tokens: 250, completion_tokens: 100 },
};

const CALL_OPTS = {
  systemPrompt: 'You are a strategy advisor.',
  userMessage:  'How do we scale AI?',
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OPENAI_API_KEY    = 'test-openai-key';
  mockAnthropicCreate.mockResolvedValue(ANTHROPIC_RESP);
  mockOpenAICreate.mockResolvedValue(OPENAI_RESP);
});

// ── Claude provider ───────────────────────────────────────────────────────────

describe('claude provider', () => {
  it('calls Anthropic messages.create and not OpenAI', async () => {
    await generate({ ...CALL_OPTS, provider: 'claude' });
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(mockOpenAICreate).not.toHaveBeenCalled();
  });

  it('returns text and token counts from Anthropic response', async () => {
    const result = await generate({ ...CALL_OPTS, provider: 'claude' });
    expect(result.text).toBe('Anthropic response text.');
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(120);
  });

  it('passes systemPrompt and userMessage correctly', async () => {
    await generate({ ...CALL_OPTS, provider: 'claude' });
    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.system).toBe(CALL_OPTS.systemPrompt);
    expect(call.messages[0].content).toBe(CALL_OPTS.userMessage);
    expect(call.messages[0].role).toBe('user');
  });

  it('defaults to claude-sonnet-4-6 when no model override is given', async () => {
    await generate({ ...CALL_OPTS, provider: 'claude' });
    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe('claude-sonnet-4-6');
  });

  it('respects a model override', async () => {
    await generate({ ...CALL_OPTS, provider: 'claude', model: 'claude-opus-4-8' });
    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe('claude-opus-4-8');
  });

  it('throws when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generate({ ...CALL_OPTS, provider: 'claude' }))
      .rejects.toThrow('ANTHROPIC_API_KEY is not configured.');
  });
});

// ── OpenAI provider ───────────────────────────────────────────────────────────

describe('openai provider', () => {
  it('calls OpenAI completions.create and not Anthropic', async () => {
    await generate({ ...CALL_OPTS, provider: 'openai' });
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('returns text and token counts from OpenAI response', async () => {
    const result = await generate({ ...CALL_OPTS, provider: 'openai' });
    expect(result.text).toBe('OpenAI response text.');
    expect(result.inputTokens).toBe(250);
    expect(result.outputTokens).toBe(100);
  });

  it('passes systemPrompt as system message and userMessage as user message', async () => {
    await generate({ ...CALL_OPTS, provider: 'openai' });
    const { messages } = mockOpenAICreate.mock.calls[0][0];
    expect(messages[0]).toEqual({ role: 'system', content: CALL_OPTS.systemPrompt });
    expect(messages[1]).toEqual({ role: 'user',   content: CALL_OPTS.userMessage  });
  });

  it('defaults to gpt-4o when no model override is given', async () => {
    await generate({ ...CALL_OPTS, provider: 'openai' });
    expect(mockOpenAICreate.mock.calls[0][0].model).toBe('gpt-4o');
  });

  it('respects a model override', async () => {
    await generate({ ...CALL_OPTS, provider: 'openai', model: 'gpt-4o-mini' });
    expect(mockOpenAICreate.mock.calls[0][0].model).toBe('gpt-4o-mini');
  });

  it('throws when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(generate({ ...CALL_OPTS, provider: 'openai' }))
      .rejects.toThrow('OPENAI_API_KEY is not configured.');
  });
});

// ── Provider validation ───────────────────────────────────────────────────────

describe('provider validation', () => {
  it('throws for an unrecognised provider name', async () => {
    await expect(generate({ ...CALL_OPTS, provider: 'mistral' }))
      .rejects.toThrow('Unknown LLM provider: "mistral"');
  });

  it('error for unknown provider lists supported providers', async () => {
    await expect(generate({ ...CALL_OPTS, provider: 'mistral' }))
      .rejects.toThrow(/claude.*openai|openai.*claude/i);
  });
});
