/**
 * SoorgaAI — Linked Project Document Model
 *
 * One row per source document (a Confluence page, or a Jira issue) a
 * user explicitly linked to a specific TransformationBlueprint via their
 * personal connection. Deliberately separate from KnowledgeDocument
 * (org-wide, keyword-relevance filtered) — these are explicitly
 * user-picked and always included in that blueprint's generation
 * context, no filtering.
 *
 * sourceType distinguishes the two source kinds sharing this one
 * generic shape — existing rows predate this field and default to
 * 'confluence', no migration needed.
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

  // 'website' is the source every company has, including one with no
  // Confluence and no Jira. It carries company context — what they do, who
  // they serve — not operational data.
  sourceType: { type: String, enum: ['confluence', 'jira', 'website'], default: 'confluence' },
  sourceId:  { type: String, required: true },
  spaceKey:  { type: String, default: '' },   // Confluence
  projectKey: { type: String, default: '' },  // Jira
  title:     { type: String, required: true },
  permalink: { type: String, default: '' },

  summary: { type: String, default: '' },
  keywords: { type: [String], default: [] },
  rawText: { type: String, default: '' },
  contentHash: { type: String, default: '' },

  // What the redaction pass removed before the text was stored or sent to
  // an LLM. redactionCount 0 with redactionApplied true means "we looked
  // and found nothing", which is different from "we never looked".
  redactionApplied: { type: Boolean, default: false },
  redactionCount: { type: Number, default: 0 },
  redactionNotes: { type: [String], default: [] },

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
