/**
 * SoorgaAI — Knowledge Document Model
 *
 * One document per extracted source page (Confluence today; `source` is kept
 * generic so a future SharePoint adapter can reuse this same collection).
 *
 * Only normalized text is stored — no diagrams/images/spreadsheets (out of
 * scope for v1). `contentHash` lets re-sync skip unchanged pages without an
 * LLM re-classification call.
 */

import mongoose from 'mongoose';

const knowledgeDocumentSchema = new mongoose.Schema({
  orgName: { type: String, required: true, index: true, trim: true },
  source:  { type: String, enum: ['confluence'], default: 'confluence' },

  sourceId:  { type: String, required: true },
  spaceKey:  { type: String, default: '' },
  title:     { type: String, required: true },
  permalink: { type: String, default: '' },

  docType: {
    type: String,
    enum: ['architecture', 'requirements', 'design', 'presentation', 'meeting_notes', 'other'],
    default: 'other',
  },
  summary:  { type: String, default: '' },
  keywords: { type: [String], default: [] },
  rawText:  { type: String, default: '' },

  contentHash: { type: String, default: '' },

  confluenceLastModified: { type: Date, default: null },
  lastSyncedAt:            { type: Date, default: null },

  extractionStatus: {
    type:    String,
    enum:    ['pending', 'extracted', 'error'],
    default: 'pending',
  },
  extractionError: { type: String, default: '' },

  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

knowledgeDocumentSchema.index({ orgName: 1, sourceId: 1 }, { unique: true });
knowledgeDocumentSchema.index({ orgName: 1, extractionStatus: 1 });

export default mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);
