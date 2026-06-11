/**
 * SoorgaAI — LLM Abstraction Layer
 *
 * Provides a single `generate()` entry point for all LLM calls.
 * Provider is selected via the LLM_PROVIDER env var (default: claude).
 * Adding a new provider requires only a new entry in PROVIDERS — no other
 * code changes needed.
 *
 * Supported providers:
 *   claude  — Anthropic (default model: claude-sonnet-4-6)
 *   openai  — OpenAI    (default model: gpt-4o)
 *
 * Switch provider: set LLM_PROVIDER=openai in Railway Variables.
 * Override model:  set ADVISOR_MODEL=gpt-4o-mini  (or any valid model ID).
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI    from 'openai';

const DEFAULT_PROVIDER   = process.env.LLM_PROVIDER || 'claude';
const DEFAULT_MAX_TOKENS = 1500;

const DEFAULT_MODELS = {
  claude: process.env.ADVISOR_MODEL || 'claude-sonnet-4-6',
  openai: process.env.ADVISOR_MODEL || 'gpt-4o',
};

// ── Provider implementations ──────────────────────────────────────────────────

const PROVIDERS = {
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a response from the configured LLM provider.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt  - Cached system instructions
 * @param {string} opts.userMessage   - Full user turn (context + question)
 * @param {string} [opts.model]       - Override model (default from env)
 * @param {number} [opts.maxTokens]   - Override max output tokens
 * @param {string} [opts.provider]    - Override provider (default from env)
 * @returns {Promise<{ text, inputTokens, outputTokens }>}
 */
export async function generate({
  systemPrompt,
  userMessage,
  model,
  maxTokens,
  provider = DEFAULT_PROVIDER,
}) {
  const impl = PROVIDERS[provider];
  if (!impl) throw new Error(`Unknown LLM provider: "${provider}". Supported: ${Object.keys(PROVIDERS).join(', ')}`);
  return impl.generate({ systemPrompt, userMessage, model, maxTokens });
}
