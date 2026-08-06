/**
 * SoorgaAI — Embedding Service
 *
 * Thin wrapper around OpenAI's embeddings API. Reuses OPENAI_API_KEY —
 * no new key, no new provider account. text-embedding-3-small: 1536
 * dimensions, ~$0.02 per million tokens — negligible next to generation
 * LLM cost.
 */

import OpenAI from 'openai';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  return new OpenAI({ apiKey });
}

/** Embed a single string. Returns a 1536-length number array. */
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
