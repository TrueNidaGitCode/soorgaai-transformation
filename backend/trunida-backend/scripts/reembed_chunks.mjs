/**
 * Re-embed knowledge chunks under the currently configured embedding provider.
 *
 * Switching EMBEDDING_PROVIDER is a one-line change, but vectors persist and
 * are not comparable across models — so after switching, existing chunks are
 * invisible to semantic retrieval until they are re-embedded. This does that.
 *
 *   node scripts/reembed_chunks.mjs --dry-run    what would change
 *   node scripts/reembed_chunks.mjs              do it
 *   node scripts/reembed_chunks.mjs --all        re-embed even matching rows
 *
 * Safe to re-run and safe to interrupt: each batch is committed as it
 * completes, so a second run picks up where the first stopped.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import { ensureVectorIndex, VECTOR_INDEX_NAME } from '../services/hybridRetrievalService.js';
import {
  embedBatch, verifyEmbeddingConfig,
  EMBEDDING_PROVIDER, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_PROVENANCE,
} from '../services/embeddingService.js';

const DRY = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const BATCH = 64;

await mongoose.connect(process.env.MONGO_URI);

console.log(`provider : ${EMBEDDING_PROVIDER}/${EMBEDDING_MODEL} @ ${EMBEDDING_DIMENSIONS} dims`);
console.log(`index    : ${VECTOR_INDEX_NAME}`);

// Prove the provider works before touching a single row. Re-embedding half a
// collection and then failing leaves the store in two vector spaces at once.
try {
  const v = await verifyEmbeddingConfig();
  console.log(`check    : OK — returned ${v.dimensions} dimensions\n`);
} catch (err) {
  console.error(`check    : FAILED — ${err.message}`);
  await mongoose.disconnect();
  process.exit(1);
}

const staleFilter = ALL ? {} : {
  $or: [
    { embeddingProvider: { $ne: EMBEDDING_PROVIDER } },
    { embeddingModel:    { $ne: EMBEDDING_MODEL } },
  ],
};

const total = await KnowledgeChunk.estimatedDocumentCount();
const stale = await KnowledgeChunk.countDocuments(staleFilter);

// What is actually in there, so the scale of the change is visible up front.
const breakdown = await KnowledgeChunk.aggregate([
  { $group: { _id: { p: '$embeddingProvider', m: '$embeddingModel' }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]);
console.log('current contents:');
breakdown.forEach(b => {
  const p = b._id.p || '(none)';
  const m = b._id.m || '(none)';
  const cur = p === EMBEDDING_PROVIDER && m === EMBEDDING_MODEL;
  console.log(`  ${String(b.n).padStart(6)}  ${p}/${m}${cur ? '   <- current' : ''}`);
});
console.log(`\ntotal ${total}, to re-embed ${stale}`);

if (!stale) { console.log('\nNothing to do.'); await mongoose.disconnect(); process.exit(0); }
if (DRY)    { console.log('\n--dry-run: stopping here.'); await mongoose.disconnect(); process.exit(0); }

const idx = await ensureVectorIndex();
console.log(`\nindex    : ${idx.created ? 'created' : idx.reason}`);

let done = 0, failed = 0;
while (true) {
  const batch = await KnowledgeChunk.find(staleFilter, { chunkId: 1, content: 1 }).limit(BATCH).lean();
  if (!batch.length) break;

  try {
    const vectors = await embedBatch(batch.map(c => c.content));
    await KnowledgeChunk.bulkWrite(batch.map((c, i) => ({
      updateOne: {
        filter: { chunkId: c.chunkId },
        update: { $set: { embedding: vectors[i], ...EMBEDDING_PROVENANCE } },
      },
    })));
    done += batch.length;
    process.stdout.write(`\r  re-embedded ${done}/${stale}`);
  } catch (err) {
    // Stop rather than skip: a provider erroring mid-run will keep erroring,
    // and looping over a failing batch forever is worse than reporting it.
    failed = batch.length;
    console.error(`\n  batch failed — ${err.message}`);
    break;
  }
}

console.log(`\n\nre-embedded ${done}${failed ? `, stopped with ${stale - done} remaining` : ''}`);
if (!failed) console.log('Semantic retrieval now sees every chunk again.');

await mongoose.disconnect();
process.exit(failed ? 1 : 0);
