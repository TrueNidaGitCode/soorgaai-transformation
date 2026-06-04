/**
 * SoorgaAI — DomainCanvas Model
 *
 * Stores the current state of the evolving canvas for one domain × user pair.
 * One document per (userId, domainId) — compound unique index enforced below.
 *
 * focusAreas[] holds the live descriptions that evolve through conversation.
 * auditLog[] is append-only: every accepted canvas update is recorded.
 *
 * Created atomically (7 docs) when the user completes profile setup.
 */

import mongoose from 'mongoose';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const FocusAreaSchema = new mongoose.Schema(
  {
    id:          { type: String, required: true },
    title:       { type: String, required: true },
    description: { type: String, required: true },
  },
  { _id: false }
);

const AuditEntrySchema = new mongoose.Schema(
  {
    focusAreaId:    { type: String, required: true },
    previousDesc:   { type: String, required: true },
    newDesc:        { type: String, required: true },
    evidence:       { type: String, required: true },
    confidence:     { type: Number, required: true },
    appliedAt:      { type: Date,   default: Date.now },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
  },
  { _id: false }
);

// ── Main Schema ───────────────────────────────────────────────────────────────

const DomainCanvasSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    domainId: {
      type:     String,
      required: true,
    },
    focusAreas: {
      type:    [FocusAreaSchema],
      default: [],
    },
    auditLog: {
      type:    [AuditEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Enforce one canvas per user × domain
DomainCanvasSchema.index({ userId: 1, domainId: 1 }, { unique: true });

const DomainCanvas = mongoose.model('DomainCanvas', DomainCanvasSchema);
export default DomainCanvas;
