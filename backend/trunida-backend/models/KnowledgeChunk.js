/**
 * SoorgaAI — Unified Knowledge Chunk (hybrid retrieval)
 *
 * One collection for every retrievable chunk, regardless of source — KB
 * markdown sections, Confluence-extracted documents, defect records. Both the
 * structured arm (metadata filter, no embedding needed) and the semantic
 * arm (Atlas Vector Search on `embedding`) query this same collection, so
 * blueprint generation and chat share one retrieval system instead of two.
 *
 * chunkId is content-addressed (SHA-256 of sourceType + path + section) —
 * stable across re-ingestion, makes upserts idempotent.
 */

import mongoose from 'mongoose';

const knowledgeChunkSchema = new mongoose.Schema({
  chunkId: { type: String, required: true, unique: true, index: true },

  sourceType: { type: String, required: true, enum: ['kb', 'confluence', 'defect'] },

  // KB-sourced fields
  layer:        { type: String, default: '' },   // 'Core' | industry name (e.g. 'Automotive')
  domainKbPath: { type: String, default: '' },    // e.g. 'AI_Use_Cases'
  capabilityId: { type: String, default: '' },    // e.g. 'ai-opportunity-discovery'
  capability:   { type: String, default: '' },    // e.g. 'AI Opportunity Discovery'
  industry:     { type: String, default: '' },

  // Confluence-sourced fields
  orgName:  { type: String, default: '' },
  docType:  { type: String, default: '' },
  keywords: { type: [String], default: [] },

  // Common fields
  title:   { type: String, default: '' },
  section: { type: String, default: '' },
  path:    { type: String, default: '' },
  content: { type: String, required: true },

  embedding: { type: [Number], required: true },

  // Which embedding configuration produced the vector above.
  //
  // Vectors from different models are not comparable even at identical width
  // — same size, different space — so retrieval filters on these rather than
  // trusting that everything in the collection belongs together. Without
  // them, switching provider silently returns nonsense instead of nothing.
  //
  // Existing rows predate this and carry '', which the retrieval filter
  // treats as "unknown provenance" and excludes from semantic results until
  // scripts/migrate_embedding_provider.mjs re-embeds them.
  embeddingProvider:   { type: String, default: '' },
  embeddingModel:      { type: String, default: '' },
  embeddingDimensions: { type: Number, default: 0 },
}, { timestamps: true });

knowledgeChunkSchema.index({ sourceType: 1, capabilityId: 1, industry: 1 });
knowledgeChunkSchema.index({ sourceType: 1, orgName: 1 });
// Drives both the retrieval filter and the migration script's "what is stale"
// query, so it is worth an index of its own.
knowledgeChunkSchema.index({ embeddingProvider: 1, embeddingModel: 1 });

export default mongoose.model('KnowledgeChunk', knowledgeChunkSchema);
