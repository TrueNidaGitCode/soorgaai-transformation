/**
 * SoorgaAI — Linked Project Document Model
 *
 * One row per Confluence page a user explicitly linked to a specific
 * TransformationBlueprint via their personal connection. Deliberately
 * separate from KnowledgeDocument (org-wide, keyword-relevance filtered) —
 * these are explicitly user-picked and always included in that blueprint's
 * generation context, no filtering.
 */

import mongoose from 'mongoose';

const linkedProjectDocumentSchema = new mongoose.Schema({
  blueprintId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'TransformationBlueprint',
    required: true,
    index:    true,
  },
  linkedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  sourceId:  { type: String, required: true },
  spaceKey:  { type: String, default: '' },
  title:     { type: String, required: true },
  permalink: { type: String, default: '' },

  summary: { type: String, default: '' },
  keywords: { type: [String], default: [] },
  rawText: { type: String, default: '' },
  contentHash: { type: String, default: '' },

  confluenceLastModified: { type: Date, default: null },

  extractionStatus: {
    type:    String,
    enum:    ['pending', 'extracted', 'error'],
    default: 'pending',
  },
  extractionError: { type: String, default: '' },
}, { timestamps: true });

linkedProjectDocumentSchema.index({ blueprintId: 1, sourceId: 1 }, { unique: true });

export default mongoose.model('LinkedProjectDocument', linkedProjectDocumentSchema);
