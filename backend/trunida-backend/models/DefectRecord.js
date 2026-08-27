/**
 * SoorgaAI — Defect Record Model
 *
 * Structured source-of-truth for a historical defect, feeding the
 * "Retrieval-Augmented Semantic Matching for Defects" capability — the
 * same structured-original/retrieval-index split KnowledgeDocument already
 * has relative to KnowledgeChunk, applied to a new source type.
 *
 * v1 was seeded with synthetic, representative records (no real Jira
 * connector existed yet) — `sourceSystem` names which real system a record
 * represents, and is deliberately suffixed "(sample)" so the synthetic
 * origin is visible in the data itself, not just in code comments. Real
 * Jira-sourced records (pipeline wizard Window 3) are added alongside the
 * synthetic ones, not replacing them — `sourceIssueKey` distinguishes them.
 */

import mongoose from 'mongoose';

const defectRecordSchema = new mongoose.Schema({
  defectId: { type: String, required: true, unique: true, index: true },

  orgName:  { type: String, required: true, index: true, trim: true },
  industry: { type: String, default: 'Automotive' },
  system:   { type: String, default: '' },   // e.g. 'OTA ECU Flashing'

  title:     { type: String, required: true },
  symptom:   { type: String, required: true },  // what a new failure description is matched against
  rootCause: { type: String, required: true },
  resolution: { type: String, required: true },

  component: { type: String, default: '' },     // e.g. 'Checksum Validation', 'Bootloader'
  severity: {
    type:    String,
    enum:    ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },

  sourceSystem: { type: String, default: '' },  // e.g. 'Jira Defect Management (sample)' or '(real)'
  keywords:     { type: [String], default: [] },

  // Real-Jira provenance (empty for synthetic seed records)
  sourceIssueKey:    { type: String, default: '' },  // e.g. 'PROJ-123'
  sourceContentHash: { type: String, default: '' },  // skip re-redaction/re-LLM-call on an unchanged issue
}, { timestamps: true });

defectRecordSchema.index({ orgName: 1, system: 1 });

export default mongoose.model('DefectRecord', defectRecordSchema);
