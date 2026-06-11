/**
 * SoorgaAI — LLM Abstraction Layer
 *
 * Provides a single `generate()` entry point for all LLM calls.
 * Provider is selected via the LLM_PROVIDER env var (default: claude).
 * Adding a new provider requires only a new entry in PROVIDERS — no other
 * code changes needed.
 *
 * Supported providers:
 *   claude  — Anthropic claude-sonnet-4-6 (default)
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_PROVIDER = process.env.LLM_PROVIDER || 'claude';
const DEFAULT_MODEL    = process.env.ADVISOR_MODEL || 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1500;

// ── Provider implementations ──────────────────────────────────────────────────

const PROVIDERS = {
  claude: {
    async generate({ systemPrompt, userMessage, model, maxTokens }) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

      const client = new Anthropic({ apiKey });
      const resp   = await client.messages.create({
        model:      model || DEFAULT_MODEL,
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
