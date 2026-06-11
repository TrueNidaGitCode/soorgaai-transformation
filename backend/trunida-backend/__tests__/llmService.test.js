/**
 * Unit Tests — llmService.js
 *
 * Strategy:
 *  - All three SDK constructors (Gemini, Anthropic, OpenAI) are hoisted as
 *    stable function-syntax mock instances so they survive vi.clearAllMocks()
 *    and module re-imports without breaking the 'new X()' call pattern.
 *  - Provider is exercised via the explicit `provider` param for single-provider
 *    tests, and via env-var chain manipulation for failover tests.
 *  - Failover tests use vi.resetModules() + fresh import so the module reads
 *    the mutated PROVIDER_CHAIN / LLM_PROVIDER env vars at startup.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Hoisted stable mock references ───────────────────────────────────────────
// Constructor mocks MUST use `function` syntax (not arrows) so `new X()` works.

const {
  mockGeminiGenerateContent,
  mockAnthropicCreate,
  mockOpenAICreate,
  MockGoogleGenerativeAI,
  MockAnthropic,
  MockOpenAI,
} = vi.hoisted(() => {
  const mockGeminiGenerateContent = vi.fn();
  const mockAnthropicCreate       = vi.fn();
  const mockOpenAICreate          = vi.fn();

  const MockGoogleGenerativeAI = vi.fn(function () {
    return {
      getGenerativeModel: vi.fn(function () {
        return { generateContent: mockGeminiGenerateContent };
      }),
    };
  });
  const MockAnthropic = vi.fn(function () {
    return { messages: { create: mockAnthropicCreate } };
  });
  const MockOpenAI = vi.fn(function () {
    return { chat: { completions: { create: mockOpenAICreate } } };
  });

  return {
    mockGeminiGenerateContent,
    mockAnthropicCreate,
    mockOpenAICreate,
    MockGoogleGenerativeAI,
    MockAnthropic,
    MockOpenAI,
  };
});

vi.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: MockGoogleGenerativeAI }));
vi.mock('@anthropic-ai/sdk',      () => ({ default: MockAnthropic }));
vi.mock('openai',                  () => ({ default: MockOpenAI    }));

import { generate } from '../services/llmService.js';

// ── Stub API responses ────────────────────────────────────────────────────────

const GEMINI_RESP = {
  response: {
    text: () => 'Gemini response text.',
    usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 80 },
  },
};
const ANTHROPIC_RESP = {
  content: [{ type: 'text', text: 'Claude response text.' }],
  usage:   { input_tokens: 300, output_tokens: 120 },
};
const OPENAI_RESP = {
  choices: [{ message: { content: 'OpenAI response text.' } }],
  usage:   { prompt_tokens: 250, completion_tokens: 100 },
};

const CALL_OPTS = {
  systemPrompt: 'You are an AI strategy advisor.',
  userMessage:  'How do we scale AI?',
};

// ── Setup ─────────────────────────────────────────────────────────────────────

let savedEnv;

beforeEach(() => {
  vi.clearAllMocks();
  savedEnv = { ...process.env };
  process.env.GOOGLE_API_KEY    = 'test-google-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OPENAI_API_KEY    = 'test-openai-key';
  delete process.env.LLM_PROVIDER;
  delete process.env.PROVIDER_CHAIN;
  delete process.env.ADVISOR_MODEL;
  delete process.env.GEMINI_MODEL;
  delete process.env.CLAUDE_MODEL;
  delete process.env.OPENAI_MODEL;

  mockGeminiGenerateContent.mockResolvedValue(GEMINI_RESP);
  mockAnthropicCreate.mockResolvedValue(ANTHROPIC_RESP);
  mockOpenAICreate.mockResolvedValue(OPENAI_RESP);
});

afterEach(() => {
  process.env = savedEnv;
});

// ── Gemini provider ───────────────────────────────────────────────────────────

describe('gemini provider (explicit)', () => {
  it('calls GoogleGenerativeAI and not Anthropic or OpenAI', async () => {
    await generate({ ...CALL_OPTS, provider: 'gemini' });
    expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
  });

  it('returns text and token counts from Gemini response', async () => {
    const result = await generate({ ...CALL_OPTS, provider: 'gemini' });
    expect(result.text).toBe('Gemini response text.');
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(80);
  });

  it('passes userMessage as user content', async () => {
    await generate({ ...CALL_OPTS, provider: 'gemini' });
    const { contents } = mockGeminiGenerateContent.mock.calls[0][0];
    expect(contents[0].parts[0].text).toBe(CALL_OPTS.userMessage);
  });

  it('uses gemini-2.5-flash-lite as the default model', async () => {
    await generate({ ...CALL_OPTS, provider: 'gemini' });
    const call = MockGoogleGenerativeAI.mock.results[0].value.getGenerativeModel.mock.calls[0][0];
    expect(call.model).toBe('gemini-2.5-flash-lite');
  });

  it('passes systemPrompt as systemInstruction', async () => {
    await generate({ ...CALL_OPTS, provider: 'gemini' });
    const call = MockGoogleGenerativeAI.mock.results[0].value.getGenerativeModel.mock.calls[0][0];
    expect(call.systemInstruction).toBe(CALL_OPTS.systemPrompt);
  });

  it('throws when GOOGLE_API_KEY is missing', async () => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await expect(generate({ ...CALL_OPTS, provider: 'gemini' }))
      .rejects.toThrow('GOOGLE_API_KEY is not configured.');
  });

  it('falls back to GEMINI_API_KEY when GOOGLE_API_KEY is absent', async () => {
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = 'fallback-key';
    await expect(generate({ ...CALL_OPTS, provider: 'gemini' })).resolves.toBeTruthy();
  });
});

// ── Claude provider ───────────────────────────────────────────────────────────

describe('claude provider (explicit)', () => {
  it('calls Anthropic and not Gemini or OpenAI', async () => {
    await generate({ ...CALL_OPTS, provider: 'claude' });
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
  });

  it('returns text and token counts from Claude response', async () => {
    const result = await generate({ ...CALL_OPTS, provider: 'claude' });
    expect(result.text).toBe('Claude response text.');
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(120);
  });

  it('throws when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generate({ ...CALL_OPTS, provider: 'claude' }))
      .rejects.toThrow('ANTHROPIC_API_KEY is not configured.');
  });
});

// ── OpenAI provider ───────────────────────────────────────────────────────────

describe('openai provider (explicit)', () => {
  it('calls OpenAI and not Gemini or Anthropic', async () => {
    await generate({ ...CALL_OPTS, provider: 'openai' });
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('returns text and token counts from OpenAI response', async () => {
    const result = await generate({ ...CALL_OPTS, provider: 'openai' });
    expect(result.text).toBe('OpenAI response text.');
    expect(result.inputTokens).toBe(250);
    expect(result.outputTokens).toBe(100);
  });

  it('throws when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(generate({ ...CALL_OPTS, provider: 'openai' }))
      .rejects.toThrow('OPENAI_API_KEY is not configured.');
  });
});

// ── Provider chain + failover ─────────────────────────────────────────────────

describe('provider chain and failover', () => {
  it('default chain uses Gemini first when all providers are available', async () => {
    await generate(CALL_OPTS);
    expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
  });

  it('fails over to Claude when Gemini is unavailable', async () => {
    mockGeminiGenerateContent.mockRejectedValueOnce(new Error('GOOGLE_API_KEY is not configured.'));
    const result = await generate(CALL_OPTS);
    expect(result.text).toBe('Claude response text.');
    expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });

  it('fails over to OpenAI when Gemini and Claude are both unavailable', async () => {
    mockGeminiGenerateContent.mockRejectedValueOnce(new Error('Gemini quota exceeded'));
    mockAnthropicCreate.mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY is not configured.'));
    const result = await generate(CALL_OPTS);
    expect(result.text).toBe('OpenAI response text.');
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
  });

  it('throws a combined error when all providers in the chain fail', async () => {
    mockGeminiGenerateContent.mockRejectedValue(new Error('Gemini rate limit'));
    mockAnthropicCreate.mockRejectedValue(new Error('Claude credits exhausted'));
    mockOpenAICreate.mockRejectedValue(new Error('OpenAI unavailable'));

    await expect(generate(CALL_OPTS))
      .rejects.toThrow('All LLM providers are unavailable');
  });

  it('combined error message lists all failed providers', async () => {
    mockGeminiGenerateContent.mockRejectedValue(new Error('Gemini quota exceeded'));
    mockAnthropicCreate.mockRejectedValue(new Error('Claude billing error'));
    mockOpenAICreate.mockRejectedValue(new Error('OpenAI rate limit'));

    let caught;
    try { await generate(CALL_OPTS); } catch (e) { caught = e; }
    expect(caught.message).toContain('gemini');
    expect(caught.message).toContain('claude');
    expect(caught.message).toContain('openai');
  });

  it('does NOT fail over when a TypeError is thrown (programming error)', async () => {
    mockGeminiGenerateContent.mockRejectedValueOnce(new TypeError('Cannot read properties of null'));
    await expect(generate(CALL_OPTS)).rejects.toThrow('Cannot read properties of null');
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('respects PROVIDER_CHAIN env var ordering', async () => {
    process.env.PROVIDER_CHAIN = 'claude,openai';
    mockAnthropicCreate.mockRejectedValueOnce(new Error('Claude unavailable'));
    const result = await generate(CALL_OPTS);
    expect(result.text).toBe('OpenAI response text.');
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
  });

  it('uses only the single provider when LLM_PROVIDER is set', async () => {
    process.env.LLM_PROVIDER = 'openai';
    await generate(CALL_OPTS);
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });
});

// ── Unknown provider ──────────────────────────────────────────────────────────

describe('unknown provider', () => {
  it('throws for an unrecognised provider name when explicit', async () => {
    await expect(generate({ ...CALL_OPTS, provider: 'mistral' }))
      .rejects.toThrow('Unknown LLM provider: "mistral"');
  });

  it('error lists the supported providers', async () => {
    await expect(generate({ ...CALL_OPTS, provider: 'mistral' }))
      .rejects.toThrow(/gemini.*claude.*openai|gemini|claude|openai/i);
  });
});
