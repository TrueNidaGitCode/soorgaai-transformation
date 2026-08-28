/**
 * SoorgaAI — Embedding Service
 *
 * Default: thin wrapper around OpenAI's embeddings API. Reuses
 * OPENAI_API_KEY — no new key, no new provider account. text-embedding-3-small:
 * 1536 dimensions, ~$0.02 per million tokens — negligible next to generation
 * LLM cost.
 *
 * Opt-in alternative: EMBEDDING_PROVIDER=selfhosted points the same openai
 * SDK at a self-hosted, OpenAI-compatible /v1/embeddings server (Ollama,
 * vLLM, Hugging Face TGI) instead — the privacy path, mirrors llmService.js's
 * 'selfhosted' provider. See SELFHOSTED_MODEL_SETUP.md.
 *
 * IMPORTANT: switching providers changes EMBEDDING_DIMENSIONS (OpenAI's is
 * 1536; self-hosted embedding models are commonly 768). Existing
 * KnowledgeChunk documents and the Atlas Search index were built at the old
 * dimension — run scripts/migrate_embedding_provider.mjs once after
 * switching, don't just flip the env var on a live index.
 */

import OpenAI from 'openai';

const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'openai';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

export const EMBEDDING_DIMENSIONS = EMBEDDING_PROVIDER === 'selfhosted'
  ? parseInt(process.env.SELFHOSTED_EMBEDDING_DIMENSIONS || '768', 10)
  : 1536;

function client() {
  if (EMBEDDING_PROVIDER === 'selfhosted') {
    const baseURL = process.env.SELFHOSTED_EMBEDDING_BASE_URL;
    if (!baseURL) throw new Error('SELFHOSTED_EMBEDDING_BASE_URL is not configured.');
    return new OpenAI({ apiKey: process.env.SELFHOSTED_API_KEY || 'not-needed', baseURL });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  return new OpenAI({ apiKey });
}

/** Embed a single string. Returns a number array, length EMBEDDING_DIMENSIONS. */
export async function embedText(text) {
  const resp = await client().embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return resp.data[0].embedding;
}

/** Embed multiple strings in one API call. Returns arrays in the same order as input. */
export async function embedBatch(texts) {
  if (!texts.length) return [];
  const resp = await client().embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return resp.data.map(d => d.embedding);
}
