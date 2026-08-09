/**
 * SoorgaAI — LLM Abstraction Layer (Node.js)
 *
 * Mirrors the Python knowledge_base/llm/ architecture:
 *   base.py        → LLMResponse / TokenUsage contract
 *   factory.py     → provider selection + chain
 *   providers/     → gemini.py, claude.py, openai.py
 *
 * Supported providers:  gemini  |  claude  |  openai  |  kimi  |  azure
 * Default model:        gemini-2.5-flash-lite
 *
 * Note: "kimi" and "azure" are intentionally NOT in the default chain —
 * opt-in only (explicit `provider: 'kimi'`/`'azure'`, or add to
 * PROVIDER_CHAIN yourself) so neither silently affects advisorService /
 * confluenceContentService / etc. which all share this same chain via the
 * default PROVIDER_CHAIN env var.
 *
 * "azure" hosts the same GPT models as "openai" above, just billed against
 * an Azure subscription instead — the point being to draw on Azure credits
 * instead of a separate OpenAI account for the same underlying model, once
 * Azure OpenAI access is approved (a separate gate from just having an
 * Azure subscription — see AZURE_OPENAI_* vars below) and a model is
 * deployed in the Azure portal.
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
 *  GEMINI_MODEL      gemini-2.5-flash-lite  Per-provider model override
 *  CLAUDE_MODEL      claude-sonnet-4-6
 *  OPENAI_MODEL      gpt-4o
 *  KIMI_MODEL        moonshotai/kimi-k3
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
  // gemini-2.0-flash: ~200 RPD on free tier (v1beta supported);
  // gemini-2.5-flash-lite was only 20 RPD and gemini-1.5-flash is not on v1beta
  gemini: process.env.GEMINI_MODEL || GLOBAL_MODEL || 'gemini-2.0-flash',
  claude: process.env.CLAUDE_MODEL || GLOBAL_MODEL || 'claude-sonnet-4-6',
  openai: process.env.OPENAI_MODEL || GLOBAL_MODEL || 'gpt-4o',
  kimi:   process.env.KIMI_MODEL   || GLOBAL_MODEL || 'moonshotai/kimi-k3',
};

// OpenRouter's OpenAI-compatible endpoint.
const KIMI_BASE_URL = 'https://openrouter.ai/api/v1';

const DEFAULT_MAX_TOKENS = 1500;

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

      const result   = await mdl.generateContent({
        contents:         [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens || DEFAULT_MAX_TOKENS },
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
      return result;
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
}) {
  // Explicit single-provider call (e.g. from tests or direct API usage)
  if (provider) {
    const impl = PROVIDERS[provider];
    if (!impl) {
      throw new Error(
        `Unknown LLM provider: "${provider}". Supported: ${Object.keys(PROVIDERS).join(', ')}`
      );
    }
    console.log(`[llm] Provider: ${provider} (explicit)`);
    return impl.generate({ systemPrompt, userMessage, model, maxTokens });
  }

  return runChain({ systemPrompt, userMessage, model, maxTokens });
}
