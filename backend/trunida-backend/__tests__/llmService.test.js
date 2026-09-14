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
import { readFileSync } from 'fs';

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

  // The default tracks what Google still serves to new keys; 2.0-flash and
  // the 2.5 family answer 404 now. The service comment carries the date it
  // was last verified.
  it('uses gemini-3.8-flash as the default model', async () => {
    await generate({ ...CALL_OPTS, provider: 'gemini' });
    const call = MockGoogleGenerativeAI.mock.results[0].value.getGenerativeModel.mock.calls[0][0];
    expect(call.model).toBe('gemini-3.8-flash');
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

/**
 * Thinking tokens are billed as output and were never counted, so every cost
 * this system reported — the usage ledger, the spend cap, every estimate made
 * from them — was blind to the part of the bill that is usually largest. The
 * codebase had already measured a 59-token prompt spending 769 thinking
 * tokens; nothing was adding them up.
 */
describe('thinking is billed, so it is counted and can be turned off', () => {
  const src = readFileSync(new URL('../services/llmService.js', import.meta.url), 'utf8');

  it('counts thoughts as output, because that is how they are charged', () => {
    expect(src).toMatch(/thoughtsTokenCount/);
    expect(src).toMatch(/outputTokens: \(meta\?\.candidatesTokenCount \|\| 0\) \+ thoughts/);
    // And keeps the visible answer separately, so the split is readable.
    expect(src).toMatch(/visibleTokens/);
    expect(src).toMatch(/thinkingTokens/);
  });

  it('lets a caller refuse to pay for reasoning it does not need', () => {
    expect(src).toMatch(/thinkingConfig: \{ thinkingBudget: 0 \}/);
    // And drops the headroom with it, so the budget is what was asked for.
    expect(src).toMatch(/wantsThinking \? asked \+ THINKING_HEADROOM : asked/);
  });

  it('threads the option from generate through the failover chain', () => {
    // Four places: generate, runChain, the explicit-provider call, the chain
    // call. A miss anywhere leaves thinking on and the saving unrealised.
    expect((src.match(/maxTokens, thinking/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('the answer pipeline turns it off for both of its calls', () => {
    const answer = readFileSync(new URL('../eame-template/services/answerService.js', import.meta.url), 'utf8');
    expect((answer.match(/thinking: false/g) || []).length).toBe(2);
  });
});

/**
 * The saving only counts where the money is spent.
 *
 * A delivered application does not hold a model key. It calls Svarg's gateway
 * over HTTP, and an option that exists only as a JavaScript argument does not
 * survive that hop — so the first version of this fix turned thinking off in
 * a process that was not the one being billed. These assertions are about the
 * whole road: tenant -> selfhosted provider -> gateway route -> provider.
 */
describe('turning thinking off survives the hop to the gateway', () => {
  const llm     = readFileSync(new URL('../services/llmService.js', import.meta.url), 'utf8');
  const gateway = readFileSync(new URL('../services/gatewayService.js', import.meta.url), 'utf8');
  const control = readFileSync(new URL('../controllers/gatewayController.js', import.meta.url), 'utf8');

  it('sends it as a header, which an endpoint that does not know it ignores', () => {
    // A body field would be rejected outright by a strict OpenAI-compatible
    // server; a header is simply not read.
    expect(llm).toMatch(/export const THINKING_HEADER = 'x-svarg-thinking'/);
    expect(llm).toContain("headers: { [THINKING_HEADER]: 'off' }");
  });

  it('drops the headroom on the tenant side too, so the ask is the ask', () => {
    expect(llm).toContain('async generate({ systemPrompt, userMessage, model, maxTokens, thinking }) {\n      const baseURL = process.env.SELFHOSTED_BASE_URL;');
    expect(llm).toMatch(/max_tokens: wantsThinking/);
  });

  it('reads it back off the request rather than inventing a second name', () => {
    expect(control).toContain("import { THINKING_HEADER } from '../services/llmService.js'");
    expect(control).toContain('req.headers[THINKING_HEADER]');
  });

  it('carries it the last two steps, to forwardChat and into the provider', () => {
    expect(control).toContain('forwardChat(deployment, { messages, max_tokens, thinking })');
    expect(gateway).toContain('forwardChat(deployment, { messages, max_tokens, thinking })');
    // And on into the provider call, which is the step that spends the money.
    expect(gateway).toContain('provider: provider || undefined,');
    expect(gateway.split('provider: provider || undefined,')[1].slice(0, 400)).toContain('thinking,');
  });

  it('leaves thinking on for any caller that does not ask, as before', () => {
    // undefined, not false: silence must not quietly disable reasoning for
    // the blueprint, the planner or the build.
    expect(control).toContain('? false\n      : undefined;');
  });
});

/**
 * Nothing stood between a test harness and the card.
 *
 * qa_suite boots the application with a real provider key and asks it
 * eighty-eight questions. It does not go through the gateway, so the
 * per-tenant cap protects nothing there — the only thing that ever stopped a
 * run was the provider's own credits running out, which is the most
 * expensive possible place to find the brake.
 */
describe('a spend ceiling, for anything that is not a person waiting', () => {
  // The gemini stub bills 200 in / 80 out, which at the default rates is
  // $0.00026 a call. A ceiling of $0.0005 must stop the third one.
  const CEILING = 0.0005;

  async function freshWithCeiling(value) {
    vi.resetModules();
    if (value === undefined) delete process.env.LLM_MAX_SPEND_USD;
    else process.env.LLM_MAX_SPEND_USD = String(value);
    return import('../services/llmService.js?ceiling=' + String(value));
  }

  afterEach(() => { delete process.env.LLM_MAX_SPEND_USD; });

  it('stops the run once the ceiling is reached', async () => {
    const mod = await freshWithCeiling(CEILING);
    await mod.generate(CALL_OPTS);
    await mod.generate(CALL_OPTS);
    await expect(mod.generate(CALL_OPTS)).rejects.toThrow(/Spend ceiling reached/);
  });

  it('refuses BEFORE calling the provider, not after paying for it', async () => {
    const mod = await freshWithCeiling(CEILING);
    await mod.generate(CALL_OPTS);
    await mod.generate(CALL_OPTS);
    const before = mockGeminiGenerateContent.mock.calls.length;
    await expect(mod.generate(CALL_OPTS)).rejects.toThrow();
    expect(mockGeminiGenerateContent.mock.calls.length).toBe(before);
  });

  it('says what was spent and how to continue, not just that it stopped', async () => {
    const mod = await freshWithCeiling(CEILING);
    await mod.generate(CALL_OPTS);
    await mod.generate(CALL_OPTS);
    const err = await mod.generate(CALL_OPTS).catch(e => e);
    expect(err.code).toBe('LLM_BUDGET_EXCEEDED');
    expect(err.message).toMatch(/of \$0.0005/);
    expect(err.message).toMatch(/2 calls/);
    expect(err.message).toMatch(/LLM_MAX_SPEND_USD/);
  });

  it('is off unless asked for, so the server is unchanged', async () => {
    const mod = await freshWithCeiling(undefined);
    for (let i = 0; i < 12; i++) await mod.generate(CALL_OPTS);
    await expect(mod.generate(CALL_OPTS)).resolves.toBeTruthy();
  });

  it('the QA harness sets one, and stops asking when it is hit', () => {
    const qa = readFileSync(new URL('../scripts/app-checks/qa_suite.mjs', import.meta.url), 'utf8');
    expect(qa).toContain('LLM_MAX_SPEND_USD: String(BUDGET)');
    expect(qa).toContain("const BUDGET = Number(arg('budget', '1.00'));");
    expect(qa).toContain('if (hitCeiling()) break;');
  });
});
