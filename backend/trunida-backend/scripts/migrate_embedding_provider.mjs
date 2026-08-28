/**
 * One-time migration: re-embed every defect-matching KnowledgeChunk under
 * whatever embedding provider is currently configured (EMBEDDING_PROVIDER
 * env var), and rebuild the Atlas Search index at the new dimension.
 *
 * Required because switching embedding providers changes vector dimensions
 * (OpenAI's text-embedding-3-small is 1536; self-hosted models are commonly
 * 768) — the existing index and chunks were built at the old dimension, and
 * upsertChunks' content-based dedup would otherwise skip re-embedding
 * unchanged text even though the provider (and therefore the vector space)
 * changed.
 *
 * Scoped to sourceType: 'defect' only — Confluence-sourced chunks are left
 * untouched, matching the walking-skeleton's scope (this migration doesn't
 * attempt to move the whole knowledge base to self-hosted embeddings).
 *
 * Usage (after setting EMBEDDING_PROVIDER=selfhosted and the SELFHOSTED_*
 * embedding env vars — see SELFHOSTED_MODEL_SETUP.md):
 *   MONGO_URI="mongodb+srv://..." node scripts/migrate_embedding_provider.mjs
 */

import mongoose from 'mongoose';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import DefectRecord from '../models/DefectRecord.js';
import { VECTOR_INDEX_NAME, syncDefectRecordToChunk, ensureVectorIndex } from '../services/hybridRetrievalService.js';
import { EMBEDDING_DIMENSIONS } from '../services/embeddingService.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  console.log(`Target embedding dimensions: ${EMBEDDING_DIMENSIONS}`);

  const coll = KnowledgeChunk.collection;

  console.log(`Dropping search index "${VECTOR_INDEX_NAME}" (if it exists)...`);
  try {
    await coll.dropSearchIndex(VECTOR_INDEX_NAME);
    console.log('Dropped.');
  } catch (err) {
    console.log(`Skipped (${err.message}) — likely didn't exist yet.`);
  }

  const { deletedCount } = await KnowledgeChunk.deleteMany({ sourceType: 'defect' });
  console.log(`Deleted ${deletedCount} existing defect chunk(s).`);

  const records = await DefectRecord.find({}).lean();
  console.log(`Re-embedding ${records.length} defect record(s)...`);
  for (const record of records) {
    const { inserted } = await syncDefectRecordToChunk(record);
    console.log(`${record.defectId} — ${inserted ? 'embedded' : 'unchanged'}`);
  }

  console.log('Recreating search index at the new dimension...');
  const result = await ensureVectorIndex();
  console.log(result);

  console.log('\nDone. Verify with a real query through the defect-matching endpoint once the self-hosted server is reachable.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
