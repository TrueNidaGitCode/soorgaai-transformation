/**
 * SoorgaAI — Hybrid Retrieval Service
 *
 * One retrieval system for both blueprint generation and chat, replacing
 * three previously-separate mechanisms (deterministic KB lookup, brute-force
 * capability dump in chat, naive keyword-overlap for Confluence).
 *
 * Two arms, merged:
 *   Structured — metadata filter (capabilityId/industry/orgName). No
 *                embedding needed, same certainty as a direct lookup.
 *                Fixed score 0.90.
 *   Semantic   — Atlas Vector Search ANN over `embedding`. Cosine similarity
 *                score (0–1). Catches unstructured/growing content a
 *                metadata filter can't (Confluence, cross-capability
 *                relevance) without knowing the exact match in advance.
 *
 * Chunks found by both arms get a +0.10 boost and source="both" — mirrors
 * the original Python hybrid_retrieval.py design exactly, reimplemented
 * natively in Node/Atlas instead of Python/Chroma.
 *
 * Status: live for Confluence-sourced context (connectedKnowledgeService.js).
 * KB capability+industry lookup deliberately stays a direct filesystem read
 * (see ARCHITECTURE.md, Hybrid retrieval section, for why).
 *
 * Also exports rankByRelevance() — a separate, lighter on-the-fly ranker for
 * ephemeral per-request content (e.g. one user's current blueprint state)
 * that shouldn't be persisted into KnowledgeChunk/Atlas at all.
 */

import crypto from 'crypto';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import { embedText, embedBatch, EMBEDDING_DIMENSIONS } from './embeddingService.js';

const VECTOR_INDEX_NAME       = 'knowledge_chunk_vector_index';
const STRUCTURED_SCORE        = 0.90;
const BOTH_ARM_BOOST          = 0.10;
// A sanity floor, not a relevance discriminator — tested empirically and found
// that OpenAI's text-embedding-3-small clusters short business text tightly
// (0.66-0.79 cosine similarity even between topically-unrelated documents),
// so a strict cutoff risks false-negative-excluding real relevant content
// more than it excludes irrelevant content. The original Python architecture's
// own default was similarity_threshold=0.0 (effectively off) for the same
// reason — ranking + topK does the real work, this just drops degenerate
// near-zero matches.
const SEMANTIC_SCORE_THRESHOLD = 0.15;

// ── Chunk ID ─────────────────────────────────────────────────────────────────
// Content-addressed: same (sourceType, path, section) always produces the
// same ID, so re-ingesting unchanged content is a no-op, not a duplicate.

export function computeChunkId(sourceType, path, sectionTitle) {
  return crypto.createHash('sha256').update(`${sourceType}|${path}|${sectionTitle}`).digest('hex').slice(0, 16);
}

// ── Chunking ─────────────────────────────────────────────────────────────────
// Splits Markdown by heading (#, ##, or ###) into sections. Generic on
// purpose — this module doesn't need to match strategyCanvasService.js's
// pillar-parsing rules, only to produce reasonable retrievable units.

export function chunkMarkdown(markdown) {
  const lines = String(markdown || '').split('\n');
  const chunks = [];
  let currentTitle = '(intro)';
  let currentLines = [];

  function flush() {
    const content = currentLines.join('\n').trim();
    if (content) chunks.push({ sectionTitle: currentTitle, content });
    currentLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[2].trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return chunks;
}

// ── Ingestion ────────────────────────────────────────────────────────────────

/**
 * Embeds and upserts chunks. Skips re-embedding any chunk whose chunkId
 * already exists with identical content — idempotent, cost-safe to re-run.
 *
 * @param {Array<{sourceType, layer, domainKbPath, capabilityId, capability,
 *                 industry, orgName, docType, title, section, path, content}>} chunkInputs
 */
export async function upsertChunks(chunkInputs) {
  if (!chunkInputs.length) return { inserted: 0, skipped: 0 };

  const withIds = chunkInputs.map(c => ({
    ...c,
    chunkId: computeChunkId(c.sourceType, c.path, c.section),
  }));

  const existing = await KnowledgeChunk.find(
    { chunkId: { $in: withIds.map(c => c.chunkId) } },
    { chunkId: 1, content: 1 }
  ).lean();
  const existingMap = new Map(existing.map(e => [e.chunkId, e.content]));

  const toEmbed = withIds.filter(c => existingMap.get(c.chunkId) !== c.content);
  if (!toEmbed.length) return { inserted: 0, skipped: withIds.length };

  const vectors = await embedBatch(toEmbed.map(c => c.content));

  const ops = toEmbed.map((c, i) => ({
    updateOne: {
      filter: { chunkId: c.chunkId },
      update: { $set: { ...c, embedding: vectors[i] } },
      upsert: true,
    },
  }));
  await KnowledgeChunk.bulkWrite(ops);

  return { inserted: toEmbed.length, skipped: withIds.length - toEmbed.length };
}

/**
 * Syncs one extracted KnowledgeDocument (Confluence page) into the shared
 * chunk store — one chunk per document, embedding the LLM-generated summary
 * (already a distilled representation, and safely under the embedding
 * model's input limit, unlike raw page text). Call this right after a
 * KnowledgeDocument is marked 'extracted'.
 */
export async function syncConfluenceDocToChunk(doc) {
  return upsertChunks([{
    sourceType: 'confluence',
    orgName:    doc.orgName,
    docType:    doc.docType || '',
    keywords:   doc.keywords || [],
    title:      doc.title,
    section:    doc.title,       // one chunk per doc — section = doc title
    path:       doc.sourceId,    // unique per org+page, stable across re-syncs
    content:    doc.summary || doc.title,
  }]);
}

/** One-time (or idempotent re-run) creation of the Atlas Vector Search index. */
export async function ensureVectorIndex() {
  const coll = KnowledgeChunk.collection;
  const existing = await coll.listSearchIndexes().toArray().catch(() => []);
  if (existing.some(ix => ix.name === VECTOR_INDEX_NAME)) {
    return { created: false, reason: 'already exists' };
  }

  await coll.createSearchIndexes([{
    name: VECTOR_INDEX_NAME,
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
        { type: 'filter', path: 'sourceType' },
        { type: 'filter', path: 'capabilityId' },
        { type: 'filter', path: 'industry' },
        { type: 'filter', path: 'orgName' },
      ],
    },
  }]);

  return { created: true };
}

// ── Structured arm ───────────────────────────────────────────────────────────

async function structuredRetrieve(filter) {
  const cleanFilter = Object.fromEntries(Object.entries(filter).filter(([, v]) => v));

  // Only capabilityId is a genuine "we already know the exact match" signal
  // (same certainty a direct file lookup has). orgName/sourceType/industry
  // are scoping filters, not relevance signals — org membership doesn't mean
  // a document is relevant to a given query, so they must never trigger the
  // structured arm by themselves (a real bug caught in testing: an org-only
  // filter was returning every Confluence doc for that org at a flat 0.90,
  // including ones with zero topical relevance to the query).
  if (!cleanFilter.capabilityId) return [];

  const docs = await KnowledgeChunk.find(cleanFilter).limit(20).lean();
  return docs.map(d => ({ ...d, score: STRUCTURED_SCORE, source: 'structured' }));
}

// ── Semantic arm ─────────────────────────────────────────────────────────────

async function semanticRetrieve(queryText, filter, topK) {
  const queryVector = await embedText(queryText);

  const mongoFilter = {};
  if (filter.sourceType) mongoFilter.sourceType = filter.sourceType;
  if (filter.orgName)    mongoFilter.orgName    = filter.orgName;
  if (filter.industry)   mongoFilter.industry   = filter.industry;

  const pipeline = [
    {
      $vectorSearch: {
        index:         VECTOR_INDEX_NAME,
        path:          'embedding',
        queryVector,
        numCandidates: Math.max(topK * 10, 100),
        limit:         topK,
        ...(Object.keys(mongoFilter).length ? { filter: mongoFilter } : {}),
      },
    },
    { $project: { embedding: 0, score: { $meta: 'vectorSearchScore' } } },
  ];

  const results = await KnowledgeChunk.aggregate(pipeline);
  // Atlas Vector Search always returns up to `limit` nearest neighbours even
  // when none are actually relevant — a threshold is what turns "nearest"
  // into "relevant" (mirrors the original design's Context Builder step 2).
  return results
    .filter(d => d.score >= SEMANTIC_SCORE_THRESHOLD)
    .map(d => ({ ...d, source: 'semantic' }));
}

// ── Merge ────────────────────────────────────────────────────────────────────

function mergeResults(structured, semantic) {
  const byId = new Map();

  for (const r of structured) byId.set(r.chunkId, r);
  for (const r of semantic) {
    const existing = byId.get(r.chunkId);
    if (existing) {
      byId.set(r.chunkId, { ...existing, score: existing.score + BOTH_ARM_BOOST, source: 'both' });
    } else {
      byId.set(r.chunkId, r);
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} [opts.queryText]   - free text for the semantic arm; omit to run structured-only
 * @param {string} [opts.sourceType]  - 'kb' | 'confluence'
 * @param {string} [opts.capabilityId]
 * @param {string} [opts.industry]
 * @param {string} [opts.orgName]
 * @param {number} [opts.topK=5]
 */
export async function hybridRetrieve({ queryText, sourceType, capabilityId, industry, orgName, topK = 5 }) {
  const structuredFilter = { sourceType, capabilityId, industry, orgName };

  const [structured, semantic] = await Promise.all([
    structuredRetrieve(structuredFilter),
    queryText ? semanticRetrieve(queryText, { sourceType, industry, orgName }, topK).catch(() => []) : Promise.resolve([]),
  ]);

  return mergeResults(structured, semantic);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * On-the-fly semantic ranking for ephemeral, per-request content that must
 * never be persisted (e.g. one user's current blueprint state, which
 * changes as they edit) — no KnowledgeChunk writes, no Atlas index, no
 * caching across requests. Embeds the query and every candidate fresh in
 * one batched call, ranks by cosine similarity computed locally, applies
 * the same sanity-floor threshold as the persistent semantic arm.
 *
 * @param {string} queryText
 * @param {Array<{key: string, text: string}>} candidates
 * @param {number} [topK=5]
 * @returns {Promise<Array<{key: string, score: number}>>}
 */
export async function rankByRelevance(queryText, candidates, topK = 5) {
  if (!candidates.length) return [];

  const [queryVector, ...candidateVectors] = await embedBatch([queryText, ...candidates.map(c => c.text)]);

  return candidates
    .map((c, i) => ({ key: c.key, score: cosineSimilarity(queryVector, candidateVectors[i]) }))
    .filter(r => r.score >= SEMANTIC_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
