/**
 * SoorgaAI — LLM Abstraction Layer (Node.js)
 *
 * Mirrors the Python knowledge_base/llm/ architecture:
 *   base.py        → LLMResponse / TokenUsage contract
 *   factory.py     → provider selection + chain
 *   providers/     → gemini.py, claude.py, openai.py
 *
 * Supported providers:  gemini  |  claude  |  openai  |  kimi  |  azure  |  selfhosted
 * Default model:        gemini-2.5-flash-lite
 *
 * Note: "kimi", "azure", and "selfhosted" are intentionally NOT in the
 * default chain — opt-in only (explicit `provider: 'kimi'`/`'azure'`/
 * `'selfhosted'`, or add to PROVIDER_CHAIN yourself) so none of them
 * silently affects advisorService / confluenceContentService / etc. which
 * all share this same chain via the default PROVIDER_CHAIN env var.
 *
 * "azure" hosts the same GPT models as "openai" above, just billed against
 * an Azure subscription instead — the point being to draw on Azure credits
 * instead of a separate OpenAI account for the same underlying model, once
 * Azure OpenAI access is approved (a separate gate from just having an
 * Azure subscription — see AZURE_OPENAI_* vars below) and a model is
 * deployed in the Azure portal.
 *
 * "selfhosted" points the same openai SDK at any OpenAI-compatible
 * /v1/chat/completions server (Ollama, vLLM, Hugging Face TGI) instead of
 * a cloud provider — the privacy path: nothing sent here leaves wherever
 * that server is actually running. See SELFHOSTED_MODEL_SETUP.md.
 *
 * ── Configuration (Railway Variables) ────────────────────────────────────────
 *
 *  PROVIDER_CHAIN    gemini,claude,openai   Ordered failover chain (recommended)
 *  LLM_PROVIDER      gemini                 Legacy: single provider, no failover
 *  (neither set)                            Default chain: gemini → claude → openai
 *
 *  GOOGLE_API_KEY    AIza…                  Gemini key (matches Python pipeline)
 *  ANTHROPIC_API_KEY sk-ant-…               Claude key
 *  OPENAI_API_KEY    sk-…                   OpenAI key
 *  OPENROUTER_API_KEY sk-or-…                Kimi K3 key (via OpenRouter — Moonshot
 *                                            AI's own platform's India availability
 *                                            is unconfirmed, so routed through the
 *                                            same global aggregator used for Qwen)
 *  AZURE_OPENAI_API_KEY   …                  From the Azure portal, once Azure
 *                                            OpenAI access is approved
 *  AZURE_OPENAI_ENDPOINT  https://{resource}.openai.azure.com/
 *  AZURE_OPENAI_DEPLOYMENT  gpt-4o           The deployment NAME you chose in the
 *                                            Azure portal — not a raw model id
 *  AZURE_OPENAI_API_VERSION 2025-04-01-preview  Optional override
 *
 *  SELFHOSTED_BASE_URL  http://localhost:11434/v1  Any OpenAI-compatible
 *                                            server's base URL (Ollama shown)
 *  SELFHOSTED_API_KEY   (optional)           Most self-hosted servers don't
 *                                            check this — defaults to a
 *                                            dummy value if unset, since the
 *                                            openai SDK requires a non-empty string
 *
 *  GEMINI_MODEL      gemini-2.5-flash-lite  Per-provider model override
 *  CLAUDE_MODEL      claude-sonnet-4-6
 *  OPENAI_MODEL      gpt-4o
 *  KIMI_MODEL        moonshotai/kimi-k3
 *  SELFHOSTED_MODEL  llama3.1:8b            Must match a model already
 *                                            pulled/loaded on that server
 *
 *  ADVISOR_MODEL     <any>                  Global override (applies to all providers)
 *
 * ── Failover behaviour ────────────────────────────────────────────────────────
 *
 *  If a provider throws due to: missing key · exhausted credits · rate limit ·
 *  service outage · network error → the next provider in the chain is tried
 *  automatically. Users see no error unless ALL providers are unavailable.
 *
 *  Programming errors (TypeError, ReferenceError) are never retried.
 */

import Anthropic            from '@anthropic-ai/sdk';
import OpenAI, { AzureOpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Model defaults ─────────────────────────────────────────────────────────────

const GLOBAL_MODEL = process.env.ADVISOR_MODEL;   // backward-compat override

const DEFAULT_MODELS = {
  // Verified against the live API on 2026-09-03. gemini-2.0-flash was the
  // previous default and Google has since retired it — it answers 404 "no
  // longer available", which fails every generation rather than degrading.
  // gemini-2.5-flash and -2.5-pro are likewise closed to new keys now.
  // Re-check this when a run starts 404ing: model ids here expire.
  gemini: process.env.GEMINI_MODEL || GLOBAL_MODEL || 'gemini-3.8-flash',
  claude: process.env.CLAUDE_MODEL || GLOBAL_MODEL || 'claude-sonnet-4-6',
  openai: process.env.OPENAI_MODEL || GLOBAL_MODEL || 'gpt-4o',
  kimi:   process.env.KIMI_MODEL   || GLOBAL_MODEL || 'moonshotai/kimi-k3',
  // No GLOBAL_MODEL fallback here on purpose — ADVISOR_MODEL is a cloud
  // model id (e.g. 'gpt-4o'); falling back to it would send a model name
  // the self-hosted server almost certainly doesn't have loaded.
  selfhosted: process.env.SELFHOSTED_MODEL || 'llama3.1:8b',
};

// OpenRouter's OpenAI-compatible endpoint.
const KIMI_BASE_URL = 'https://openrouter.ai/api/v1';

const DEFAULT_MAX_TOKENS = 1500;

/**
 * Extra output budget for models that think before answering.
 *
 * Gemini 3.x charges thinking tokens against maxOutputTokens, so a budget
 * sized for the visible answer starves it and returns nothing. Measured:
 * a 59-token prompt spent 769 thinking tokens, and short classification
 * prompts routinely spend several hundred. 2048 covers the short structured
 * calls this codebase makes without meaningfully capping long generations.
 *
 * Configurable because the right number moves with the model, and the whole
 * point of this service is not to depend on one.
 */
const THINKING_HEADROOM = parseInt(process.env.LLM_THINKING_HEADROOM || '2048', 10);

// ── Provider chain ─────────────────────────────────────────────────────────────

function getProviderChain() {
  if (process.env.PROVIDER_CHAIN) {
    return process.env.PROVIDER_CHAIN
      .split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
  }
  if (process.env.LLM_PROVIDER) {
    return [process.env.LLM_PROVIDER.toLowerCase()];
  }
  return ['gemini', 'claude', 'openai'];
}

// ── Error classifier (mirrors Python _classify functions) ──────────────────────
// Returns true when the error is provider-side and the next provider should be tried.
// Returns false for programming bugs (TypeError, ReferenceError) — don't retry those.

function isFailoverError(err) {
  if (err instanceof TypeError || err instanceof ReferenceError) return false;
  return true;   // auth, billing, rate-limit, timeout, network, missing key
}

// ── Provider implementations ───────────────────────────────────────────────────

const PROVIDERS = {

  // ── Gemini (default) ─────────────────────────────────────────────────────────
  // Mirrors knowledge_base/llm/providers/gemini.py
  // Env var: GOOGLE_API_KEY (matches Python pipeline); GEMINI_API_KEY also accepted.

  gemini: {
    async generate({ systemPrompt, userMessage, model, maxTokens }) {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured.');

      // Safety settings applied at BOTH model level and request level.
      // Some SDK versions only honour request-level settings; duplicating
      // ensures they take effect regardless of @google/generative-ai version.
      const safetySettings = [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ];

      const genAI  = new GoogleGenerativeAI(apiKey);
      const mdl    = genAI.getGenerativeModel({
        model:             model || DEFAULT_MODELS.gemini,
        systemInstruction: systemPrompt,
        safetySettings,
      });

      // Gemini 3.x models think before answering, and thinking tokens are
      // charged against maxOutputTokens. A budget sized for the visible
      // answer alone therefore gets consumed by thinking and returns an
      // EMPTY response — no error, just nothing, which callers then fail to
      // parse. Every maxTokens in this codebase was chosen before thinking
      // models existed, so the headroom is added here rather than asking
      // ~30 call sites to know which models think.
      const asked = maxTokens || DEFAULT_MAX_TOKENS;
      const budget = asked + THINKING_HEADROOM;

      const result   = await mdl.generateContent({
        contents:         [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: budget },
        safetySettings,
      });

      const response = result.response;
      const meta     = response.usageMetadata;

      // response.text() throws when Gemini blocks the response (safety, recitation, etc.).
      // We catch it and rethrow as a plain Error so the failover chain can handle it.
      let text;
      try {
        text = response.text();
      } catch (textErr) {
        const finishReason = response.candidates?.[0]?.finishReason || 'UNKNOWN';
        const blockReason  = response.promptFeedback?.blockReason   || '';
        throw new Error(
          `Gemini response unavailable — finishReason: ${finishReason}${blockReason ? `, blockReason: ${blockReason}` : ''}`
        );
      }

      // An empty body with MAX_TOKENS means thinking ate the whole budget.
      // Say so, rather than handing back '' for the caller to misdiagnose as
      // a bad prompt — this exact failure silently broke three classifiers.
      if (!text || !text.trim()) {
        const finishReason = response.candidates?.[0]?.finishReason || 'UNKNOWN';
        const thoughts = meta?.thoughtsTokenCount || 0;
        throw new Error(
          `Gemini returned an empty response — finishReason: ${finishReason}` +
          (thoughts ? `, ${thoughts} thinking tokens against a ${budget}-token budget` : '')
        );
      }

      return {
        text,
        inputTokens:  meta?.promptTokenCount     || 0,
        outputTokens: meta?.candidatesTokenCount || 0,
      };
    },
  },

  // ── Claude ───────────────────────────────────────────────────────────────────
  // Mirrors knowledge_base/llm/providers/claude.py

  claude: {
    async generate({ systemPrompt, userMessage, model, maxTokens }) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

      const client = new Anthropic({ apiKey });
      const resp   = await client.messages.create({
        model:      model || DEFAULT_MODELS.claude,
        max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      });

      return {
        text:         resp.content[0]?.text || '',
        inputTokens:  resp.usage?.input_tokens  || 0,
        outputTokens: resp.usage?.output_tokens || 0,
      };
    },
  },

  // ── OpenAI ───────────────────────────────────────────────────────────────────
  // Mirrors knowledge_base/llm/providers/openai.py

  openai: {
    async generate({ systemPrompt, userMessage, model, maxTokens }) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

      const client = new OpenAI({ apiKey });
      const resp   = await client.chat.completions.create({
        model:      model || DEFAULT_MODELS.openai,
        max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
      });

      return {
        text:         resp.choices[0]?.message?.content || '',
        inputTokens:  resp.usage?.prompt_tokens     || 0,
        outputTokens: resp.usage?.completion_tokens || 0,
      };
    },
  },

  // ── Kimi K3 (via OpenRouter) ─────────────────────────────────────────────────
  // Opt-in only — not part of the default chain. Uses the same `openai` SDK
  // via OpenRouter's OpenAI-compatible endpoint, so the request/response shape
  // mirrors the openai provider above exactly.

  kimi: {
    async generate({ systemPrompt, userMessage, model, maxTokens }) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');

      const client = new OpenAI({ apiKey, baseURL: KIMI_BASE_URL });
      const resp   = await client.chat.completions.create({
        model:      model || DEFAULT_MODELS.kimi,
        max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
      });

      return {
        text:         resp.choices[0]?.message?.content || '',
        inputTokens:  resp.usage?.prompt_tokens     || 0,
        outputTokens: resp.usage?.completion_tokens || 0,
      };
    },
  },

  // ── Azure OpenAI ─────────────────────────────────────────────────────────────
  // Opt-in only — not part of the default chain. Same underlying GPT models as
  // "openai" above, billed against an Azure subscription instead. Uses the
  // openai SDK's dedicated AzureOpenAI client (handles the api-key header and
  // /deployments/{name} path Azure requires, unlike the plain OpenAI client).
  //
  // "model" here means the DEPLOYMENT NAME chosen in the Azure portal, not a
  // raw model id like "gpt-4o" — Azure resolves the actual model from that
  // deployment, so the same deployment name must exist in the Azure resource
  // before this can succeed.

  azure: {
    async generate({ systemPrompt, userMessage, model, maxTokens }) {
      const apiKey     = process.env.AZURE_OPENAI_API_KEY;
      const endpoint   = process.env.AZURE_OPENAI_ENDPOINT;
      const deployment = model || process.env.AZURE_OPENAI_DEPLOYMENT;
      if (!apiKey)     throw new Error('AZURE_OPENAI_API_KEY is not configured.');
      if (!endpoint)   throw new Error('AZURE_OPENAI_ENDPOINT is not configured.');
      if (!deployment) throw new Error('AZURE_OPENAI_DEPLOYMENT is not configured (and no model override was given).');

      const client = new AzureOpenAI({
        apiKey,
        endpoint,
        deployment,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview',
      });

      const resp = await client.chat.completions.create({
        model:      deployment, // ignored for routing (deployment already pins the model) — kept for SDK typing
        max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
      });

      return {
        text:         resp.choices[0]?.message?.content || '',
        inputTokens:  resp.usage?.prompt_tokens     || 0,
        outputTokens: resp.usage?.completion_tokens || 0,
      };
    },
  },

  // ── Self-hosted (Ollama / vLLM / Hugging Face TGI) ──────────────────────────
  // Opt-in only — not part of the default chain. The privacy path: this
  // points the same openai SDK at a self-hosted, OpenAI-compatible server
  // instead of a cloud provider, so nothing sent here leaves wherever that
  // server is actually running. See SELFHOSTED_MODEL_SETUP.md for setup.

  selfhosted: {
    async generate({ systemPrompt, userMessage, model, maxTokens }) {
      const baseURL = process.env.SELFHOSTED_BASE_URL;
      if (!baseURL) throw new Error('SELFHOSTED_BASE_URL is not configured.');

      const client = new OpenAI({ apiKey: process.env.SELFHOSTED_API_KEY || 'not-needed', baseURL });
      const resp   = await client.chat.completions.create({
        model:      model || DEFAULT_MODELS.selfhosted,
        max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
      });

      return {
        text:         resp.choices[0]?.message?.content || '',
        inputTokens:  resp.usage?.prompt_tokens     || 0,
        outputTokens: resp.usage?.completion_tokens || 0,
      };
    },
  },
};

// ── Failover chain executor ────────────────────────────────────────────────────

async function runChain({ systemPrompt, userMessage, model, maxTokens }) {
  const chain  = getProviderChain();
  const errors = [];

  for (let i = 0; i < chain.length; i++) {
    const name   = chain[i];
    const impl   = PROVIDERS[name];
    const isLast = (i === chain.length - 1);

    if (!impl) {
      console.warn(`[llm] Unknown provider "${name}" in chain — skipping`);
      errors.push(`${name}: unknown provider`);
      continue;
    }

    console.log(i === 0
      ? `[llm] Provider: ${name} (primary)`
      : `[llm] Failover → ${name}`);

    try {
      const result = await impl.generate({ systemPrompt, userMessage, model, maxTokens });
      if (i > 0) console.log(`[llm] Failover succeeded via ${name}`);
      // Which model actually answered. Providers do not report it back, and
      // the ledger cannot price a call it cannot name — an unknown model is
      // costed at the most expensive row, so guessing here inflates the whole
      // breakdown rather than leaving one line blank.
      return { ...result, provider: name, model: model || DEFAULT_MODELS[name] || '' };
    } catch (err) {
      const msg = err.message || String(err);
      errors.push(`${name}: ${msg}`);
      console.error(`[llm] ${name} FAILED —`, { message: msg, type: err.constructor?.name, status: err.status });

      if (!isLast && isFailoverError(err)) {
        console.warn(`[llm] trying next provider in chain`);
        continue;
      }

      // Last provider in chain, or non-retryable error — surface to caller
      const allFailed = errors.length > 1;
      throw new Error(
        allFailed
          ? `All LLM providers are unavailable:\n${errors.map(e => `  - ${e}`).join('\n')}`
          : msg
      );
    }
  }

  // Reached only if every entry was skipped (all unknown providers)
  throw new Error(
    `No valid LLM providers in chain.\n${errors.map(e => `  - ${e}`).join('\n')}`
  );
}

import { currentUsage, currentRun } from './usageContext.js';
import { recordLedgerCall, costOf } from './usageLedgerService.js';

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate a response from the configured provider chain.
 *
 * When `provider` is omitted, the PROVIDER_CHAIN (or default gemini → claude →
 * openai) is tried with automatic failover.
 *
 * @param {object}  opts
 * @param {string}  opts.systemPrompt  Model instructions
 * @param {string}  opts.userMessage   Full context + user question
 * @param {string}  [opts.model]       Override model for the active provider
 * @param {number}  [opts.maxTokens]   Override max output tokens
 * @param {string}  [opts.provider]    Force a single provider (no failover)
 * @returns {Promise<{ text, inputTokens, outputTokens }>}
 */
export async function generate({
  systemPrompt,
  userMessage,
  model,
  maxTokens,
  provider,
  label,
}) {
  const started = Date.now();
  let result;

  // Explicit single-provider call (e.g. from tests or direct API usage)
  if (provider) {
    const impl = PROVIDERS[provider];
    if (!impl) {
      throw new Error(
        `Unknown LLM provider: "${provider}". Supported: ${Object.keys(PROVIDERS).join(', ')}`
      );
    }
    console.log(`[llm] Provider: ${provider} (explicit)`);
    result = await impl.generate({ systemPrompt, userMessage, model, maxTokens });
    result = { ...result, provider, model: model || DEFAULT_MODELS[provider] || '' };
  } else {
    result = await runChain({ systemPrompt, userMessage, model, maxTokens });
  }

  recordCall({ label, result, ms: Date.now() - started });
  return result;
}

// ── Usage accounting ───────────────────────────────────────────────────────────
/**
 * Every provider above already reports token counts and nothing was adding
 * them up, so there was no way to answer "what does one blueprint cost?".
 * Accumulating here rather than at each of the twelve call sites keeps it
 * impossible to add a call that goes uncounted.
 *
 * In-process only — it resets when the server restarts. This measures a run,
 * it is not billing; per-tenant spend is metered durably in gatewayService.
 * `label` is optional and only groups the breakdown.
 */
const usage = { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0, byLabel: {} };

function recordCall({ label, result, ms }) {
  const inTok  = result?.inputTokens  || 0;
  const outTok = result?.outputTokens || 0;
  const key = label || 'unlabelled';

  usage.calls++;
  usage.inputTokens  += inTok;
  usage.outputTokens += outTok;
  usage.ms += ms;

  const b = usage.byLabel[key] || (usage.byLabel[key] = { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0 });
  b.calls++; b.inputTokens += inTok; b.outputTokens += outTok; b.ms += ms;

  if (process.env.LLM_LOG_USAGE === '1') {
    console.log(`[llm usage] ${key}: ${inTok} in / ${outTok} out (${(ms / 1000).toFixed(1)}s)`);
  }

  // Durable, per-account, and deliberately not awaited: the counters above
  // measure a process, this measures a customer. A ledger write that fails
  // must never fail the generation it is describing — see usageLedgerService.
  const { userId, stage, guest } = currentUsage();
  const costUsd = costOf(result?.model || '', inTok, outTok);

  // "What did THAT run cost" — accumulated in memory for the piece of work in
  // flight, and logged when it finishes. The ledger below answers the monthly
  // question; this answers the one asked after a provider bill moves.
  const run = currentRun();
  if (run) {
    run.calls++;
    run.inputTokens += inTok;
    run.outputTokens += outTok;
    run.costUsd += costUsd;
  }

  if (userId || guest) {
    recordLedgerCall({
      userId, guest, stage, label: key, costUsd,
      inputTokens: inTok, outputTokens: outTok,
    }).catch(() => {});
  }
}

/**
 * What this process will actually call, for the boot log.
 *
 * Written for cloud rounds: which provider is serving is decided by three
 * separate environment variables across two files, and the only way to know
 * what a deployed instance settled on was to make a call and read the log
 * line. A configuration that differs from the one being tested invalidates
 * the test, and finding that out afterwards is the expensive way.
 *
 * Also flags a chain that fails over into a provider with no key configured,
 * because that failover does not degrade — it turns one provider's hiccup
 * into an authentication error from a different vendor.
 */
export function describeLlmConfig() {
  const chain = getProviderChain();
  const KEYS = {
    gemini: 'GOOGLE_API_KEY', claude: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY', kimi: 'OPENROUTER_API_KEY',
  };
  return {
    chain,
    models: chain.map(p => `${p}:${DEFAULT_MODELS[p] || '?'}`),
    // 'selfhosted' needs a reachable base URL, not an API key.
    unkeyed: chain.filter(p => KEYS[p] && !process.env[KEYS[p]]),
    productProvider: (process.env.PRODUCT_LLM_PROVIDER || '').trim() || null,
    eameProvider: (process.env.EAME_BUILD_PROVIDER || 'gemini').trim(),
  };
}

export function getUsageStats() {
  return JSON.parse(JSON.stringify(usage));
}

export function resetUsageStats() {
  usage.calls = 0; usage.inputTokens = 0; usage.outputTokens = 0; usage.ms = 0;
  usage.byLabel = {};
}
