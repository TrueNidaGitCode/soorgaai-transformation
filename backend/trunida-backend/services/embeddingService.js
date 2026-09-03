/**
 * Svarg — Embedding Service
 *
 * Provider-agnostic by design, mirroring llmService.js: the platform must
 * never depend on one vendor. Local models are the cheap path for testing,
 * frontier models the path for production, and moving between them is a
 * configuration change rather than a code change.
 *
 *   EMBEDDING_PROVIDER    openai | gemini | selfhosted     (default: openai)
 *   EMBEDDING_MODEL       provider-specific, has a default per provider
 *   EMBEDDING_DIMENSIONS  the width every vector is stored at
 *
 * ── The thing that makes this safe ──────────────────────────────────────────
 *
 * Swapping a generation provider is free: it affects only the next call.
 * Swapping an embedding provider is NOT, because vectors persist, and the
 * trap is subtler than width. A 1536-dim OpenAI vector and a 1536-dim Gemini
 * vector are the same size but live in different spaces — cosine similarity
 * between them is meaningless. Equal dimensions make the index accept both;
 * they do not make them comparable.
 *
 * So every vector records which provider and model produced it (see
 * KnowledgeChunk.embeddingProvider / embeddingModel), retrieval only ever
 * compares vectors from the current configuration, and switching providers
 * degrades to "fewer results until re-embedded" rather than to silent
 * nonsense. scripts/migrate_embedding_provider.mjs does the re-embedding.
 *
 * Adding a provider means adding one entry to PROVIDERS below. Nothing else
 * in the codebase needs to know it exists.
 */

import OpenAI from 'openai';

const PROVIDER = (process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();

/**
 * Per-provider defaults. `dimensions` is the width used when
 * EMBEDDING_DIMENSIONS is not set; `supportsDimensionRequest` says whether
 * the provider can be asked for a specific width, which is what allows one
 * width to be held constant across providers.
 */
const PROVIDERS = {
  openai: {
    defaultModel: 'text-embedding-3-small',
    defaultDimensions: 1536,
    supportsDimensionRequest: true,      // `dimensions` param on v3 models
  },
  gemini: {
    defaultModel: 'gemini-embedding-2',
    defaultDimensions: 1536,             // native is 3072; 1536 is requestable
    supportsDimensionRequest: true,      // `outputDimensionality`
  },
  selfhosted: {
    defaultModel: 'nomic-embed-text',
    defaultDimensions: 768,              // typical for local models
    supportsDimensionRequest: false,     // whatever the model emits, it emits
  },
};

const spec = PROVIDERS[PROVIDER];
if (!spec) {
  throw new Error(
    `EMBEDDING_PROVIDER='${PROVIDER}' is not a known provider. ` +
    `Supported: ${Object.keys(PROVIDERS).join(', ')}.`
  );
}

export const EMBEDDING_PROVIDER = PROVIDER;
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || spec.defaultModel;
export const EMBEDDING_DIMENSIONS = parseInt(
  process.env.EMBEDDING_DIMENSIONS
    // Kept for compatibility with deployments that set the old name.
    || process.env.SELFHOSTED_EMBEDDING_DIMENSIONS
    || String(spec.defaultDimensions),
  10
);

/**
 * Stamped onto every stored vector. Retrieval compares only vectors carrying
 * the current stamp, so a provider switch can never silently compare across
 * two different embedding spaces.
 */
export const EMBEDDING_PROVENANCE = {
  embeddingProvider: EMBEDDING_PROVIDER,
  embeddingModel: EMBEDDING_MODEL,
  embeddingDimensions: EMBEDDING_DIMENSIONS,
};

// ── Clients ─────────────────────────────────────────────────────────────────

function openAiCompatibleClient() {
  if (PROVIDER === 'selfhosted') {
    const baseURL = process.env.SELFHOSTED_EMBEDDING_BASE_URL || process.env.SELFHOSTED_BASE_URL;
    if (!baseURL) throw new Error('SELFHOSTED_EMBEDDING_BASE_URL is not configured.');
    return new OpenAI({ apiKey: process.env.SELFHOSTED_API_KEY || 'not-needed', baseURL });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  return new OpenAI({ apiKey });
}

function geminiKey() {
  const k = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GOOGLE_API_KEY is not configured.');
  return k;
}

// ── Per-provider embed implementations ──────────────────────────────────────
// Each returns { embeddings: number[][], promptTokens: number }.

async function embedOpenAiCompatible(texts) {
  const params = { model: EMBEDDING_MODEL, input: texts };
  // Only ask for a width where the provider honours it. Sending `dimensions`
  // to a server that ignores it would give a silent width mismatch, which is
  // exactly the failure this service exists to prevent.
  if (spec.supportsDimensionRequest) params.dimensions = EMBEDDING_DIMENSIONS;

  const resp = await openAiCompatibleClient().embeddings.create(params);
  return {
    embeddings: resp.data.map(d => d.embedding),
    promptTokens: resp.usage?.prompt_tokens || 0,
  };
}

async function embedGemini(texts) {
  // batchEmbedContents takes the per-request shape, repeated — one round trip
  // rather than one per chunk, which matters when ingesting a whole KB.
  const body = {
    requests: texts.map(text => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })),
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${geminiKey()}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini embeddings failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    embeddings: (data.embeddings || []).map(e => e.values),
    // Google does not report embedding token usage here. Reporting 0 would
    // let a tenant embed without it counting against their cap, so estimate
    // rather than under-report: ~4 characters per token.
    promptTokens: Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 4),
  };
}

const IMPLEMENTATIONS = {
  openai: embedOpenAiCompatible,
  selfhosted: embedOpenAiCompatible,
  gemini: embedGemini,
};

/**
 * A width other than the configured one means every vector written from here
 * is incomparable with the rest of the collection. Fail loudly rather than
 * store it — this is the mistake that once built an index no query could match.
 *
 * In practice this only ever fires for `selfhosted`: the hosted providers are
 * asked for a specific width and honour it, so they cannot mismatch. A local
 * model emits whatever it emits, which is exactly the case worth guarding.
 * Exported so that guarantee can be tested directly rather than inferred.
 */
export function assertWidth(embeddings) {
  const wrong = embeddings.find(v => Array.isArray(v) && v.length !== EMBEDDING_DIMENSIONS);
  if (wrong) {
    throw new Error(
      `${EMBEDDING_PROVIDER}/${EMBEDDING_MODEL} returned ${wrong.length}-dimension vectors ` +
      `but EMBEDDING_DIMENSIONS is ${EMBEDDING_DIMENSIONS}. Set EMBEDDING_DIMENSIONS to ` +
      `${wrong.length}, or choose a model that supports ${EMBEDDING_DIMENSIONS}. ` +
      `Storing these would make them incomparable with every existing vector.`
    );
  }
  return embeddings;
}

// ── Public API (unchanged shape — callers need no edits) ────────────────────

/** Embed a single string. Returns a number array, length EMBEDDING_DIMENSIONS. */
export async function embedText(text) {
  const { embeddings } = await IMPLEMENTATIONS[PROVIDER]([text]);
  return assertWidth(embeddings)[0];
}

/** Embed multiple strings in one call. Returns arrays in input order. */
export async function embedBatch(texts) {
  if (!texts.length) return [];
  const { embeddings } = await IMPLEMENTATIONS[PROVIDER](texts);
  return assertWidth(embeddings);
}

/**
 * As embedBatch, but also returns the token count the provider reported.
 * The gateway meters embeddings against a tenant's spend cap and cannot do
 * that from the vectors alone.
 */
export async function embedBatchWithUsage(texts) {
  if (!texts.length) return { embeddings: [], promptTokens: 0, model: EMBEDDING_MODEL };
  const { embeddings, promptTokens } = await IMPLEMENTATIONS[PROVIDER](texts);
  return { embeddings: assertWidth(embeddings), promptTokens, model: EMBEDDING_MODEL };
}

/**
 * Confirm the configuration actually works before anything depends on it.
 * Called at startup: a provider that is misconfigured should say so once, on
 * boot, rather than once per request for the rest of the deployment's life.
 */
export async function verifyEmbeddingConfig() {
  const { embeddings } = await IMPLEMENTATIONS[PROVIDER](['configuration check']);
  const vector = embeddings[0];
  if (!Array.isArray(vector)) {
    throw new Error(`${EMBEDDING_PROVIDER}/${EMBEDDING_MODEL} returned no vector.`);
  }
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding configuration mismatch: ${EMBEDDING_PROVIDER}/${EMBEDDING_MODEL} ` +
      `returns ${vector.length} dimensions, EMBEDDING_DIMENSIONS is ${EMBEDDING_DIMENSIONS}.`
    );
  }
  return { provider: EMBEDDING_PROVIDER, model: EMBEDDING_MODEL, dimensions: vector.length };
}
