/**
 * Svarg — Customer Code Chunk
 *
 * A piece of a customer's own source, embedded so Aria (and later Eame) can
 * retrieve the parts relevant to a question.
 *
 * ── Why this is not KnowledgeChunk ─────────────────────────────────────────
 *
 * KnowledgeChunk is the shared pool for retrievable content, and it is built
 * on two assumptions that are correct for a knowledge base and wrong for
 * customer source code:
 *
 *   1. computeChunkId hashes sourceType + path + section. Two customers with
 *      src/models/user.js produce the SAME id and silently overwrite one
 *      another — not a rare collision, the ordinary case.
 *
 *   2. hybridRetrieve filters on sourceType, capabilityId, industry and
 *      orgName. There is no tenant key, so a query that forgot one would
 *      return another company's code.
 *
 * The second is the reason this is a separate collection rather than
 * KnowledgeChunk with extra fields. Source code is the most sensitive thing a
 * customer hands over, and isolation by construction means a forgotten filter
 * cannot leak it: it is not in that pool to begin with.
 *
 * Chunk ids here hash userId + repo + path + index, which makes the collision
 * impossible rather than unlikely.
 */

import mongoose from 'mongoose';

const customerCodeChunkSchema = new mongoose.Schema({
  chunkId: { type: String, required: true, unique: true, index: true },

  // The tenant key. Required, indexed, and every read path filters on it.
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  blueprintId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'TransformationBlueprint',
    required: true,
    index:    true,
  },

  repoFullName: { type: String, required: true },
  path:         { type: String, required: true },
  chunkIndex:   { type: Number, default: 0 },

  // Redacted before it ever arrives here — see codebaseProfileService.
  content: { type: String, required: true },

  // Optional, and empty by default. Nothing retrieves code yet — that arrives
  // with Eame — so embedding every file of every repository on read would be
  // spend with no reader, and the text is the expensive half to obtain.
  // Storing it now means vectors can be backfilled later without going back to
  // GitHub. A chunk with no vector is simply invisible to retrieval.
  embedding: { type: [Number], default: [] },

  // Which embedding configuration produced the vector. Vectors from different
  // models are not comparable even at identical width, so retrieval filters on
  // these rather than trusting that everything in the collection belongs
  // together — the same lesson KnowledgeChunk already paid for.
  embeddingProvider: { type: String, default: '' },
  embeddingModel:    { type: String, default: '' },
}, { timestamps: true });

// The query every read makes: this user's code for this blueprint.
customerCodeChunkSchema.index({ userId: 1, blueprintId: 1 });

export default mongoose.model('CustomerCodeChunk', customerCodeChunkSchema);
