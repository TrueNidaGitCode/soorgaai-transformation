/**
 * SoorgaAI — LLM Abstraction Layer (Node.js)
 *
 * Mirrors the Python knowledge_base/llm/ architecture:
 *   base.py        → LLMResponse / TokenUsage contract
 *   factory.py     → provider selection + chain
 *   providers/     → gemini.py, claude.py, openai.py
 *
 * Supported providers:  gemini  |  claude  |  openai
 * Default model:        gemini-2.5-flash-lite
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
 *
 *  GEMINI_MODEL      gemini-2.5-flash-lite  Per-provider model override
 *  CLAUDE_MODEL      claude-sonnet-4-6
 *  OPENAI_MODEL      gpt-4o
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
import OpenAI               from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Model defaults ─────────────────────────────────────────────────────────────

const GLOBAL_MODEL = process.env.ADVISOR_MODEL;   // backward-compat override

const DEFAULT_MODELS = {
  gemini: process.env.GEMINI_MODEL || GLOBAL_MODEL || 'gemini-2.5-flash-lite',
  claude: process.env.CLAUDE_MODEL || GLOBAL_MODEL || 'claude-sonnet-4-6',
  openai: process.env.OPENAI_MODEL || GLOBAL_MODEL || 'gpt-4o',
};

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

      const genAI  = new GoogleGenerativeAI(apiKey);
      const mdl    = genAI.getGenerativeModel({
        model:              model || DEFAULT_MODELS.gemini,
        systemInstruction:  systemPrompt,
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      });

      const result   = await mdl.generateContent({
        contents:          [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig:  { maxOutputTokens: maxTokens || DEFAULT_MAX_TOKENS },
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

      if (!isLast && isFailoverError(err)) {
        console.warn(`[llm] ${name} unavailable (${msg}) — trying next provider`);
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
