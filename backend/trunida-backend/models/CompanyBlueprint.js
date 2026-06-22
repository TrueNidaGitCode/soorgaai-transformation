/**
 * SoorgaAI — Company Blueprint Model
 *
 * Section content is structured to support multiple presentation formats.
 * Only `brief` (Strategy Brief) is generated today; additional format slots
 * are schema-ready for future product expansion without migrations.
 *
 * Section format slots:
 *   brief   — Strategy Brief (Option 1, primary) ✓ implemented
 *   csg     — Current State / Target State / Gap (Option 2) — future
 *   okr     — Objective / Key Results / Initiatives (Option 3) — future
 *   maturity — Maturity Level / Rationale / Next Steps (Option 4) — future
 *   content  — Long-form essay (secondary, generated alongside brief)
 */

import mongoose from 'mongoose';

// ── Strategy Brief (Option 1) ─────────────────────────────────────────────────

const leadershipValidationSchema = new mongoose.Schema({
  status:  { type: String, enum: ['Approved', 'In Review', 'Not Yet Validated'], default: 'Not Yet Validated' },
  context: { type: String, default: '' },
}, { _id: false });

// Optional — populated only for sections that use a template with extra fields.
// Pillars are named strategic themes extracted from strategicPosition (Vision template only).
const pillarSchema = new mongoose.Schema({
  title:             { type: String, default: '' },
  description:       { type: String, default: '' },
  businessImpactTag: { type: String, default: '' },
}, { _id: false });

const briefSchema = new mongoose.Schema({
  strategicPosition:    { type: String, default: '' },
  priorityActions:      { type: [String], default: [] },
  successMetrics:       { type: [String], default: [] },
  leadershipValidation: { type: leadershipValidationSchema, default: () => ({ status: 'Not Yet Validated', context: '' }) },
  strategicPillars:     { type: [pillarSchema], default: [] },
}, { _id: false });

// ── Future format slots (schema-ready, not yet populated) ─────────────────────

const csgSchema = new mongoose.Schema({
  currentState: { type: String, default: '' },
  targetState:  { type: String, default: '' },
  gap:          { type: String, default: '' },
}, { _id: false });

const okrSchema = new mongoose.Schema({
  objective:   { type: String, default: '' },
  keyResults:  { type: [String], default: [] },
  initiatives: { type: [String], default: [] },
}, { _id: false });

const maturitySchema = new mongoose.Schema({
  score:     { type: Number, min: 1, max: 5, default: null },
  rationale: { type: String, default: '' },
  nextSteps: { type: [String], default: [] },
}, { _id: false });

// ── Section ───────────────────────────────────────────────────────────────────

const sectionSchema = new mongoose.Schema({
  title:    { type: String, required: true },

  // Primary format — Strategy Brief
  brief:    { type: briefSchema, default: () => ({}) },

  // Secondary — long-form essay
  content:  { type: String, default: '' },

  // Future format slots
  csg:      { type: csgSchema,     default: undefined },
  okr:      { type: okrSchema,     default: undefined },
  maturity: { type: maturitySchema, default: undefined },

  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

// ── Capability ────────────────────────────────────────────────────────────────

const capabilitySchema = new mongoose.Schema({
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },
  status: {
    type:    String,
    enum:    ['pending', 'in-progress', 'completed', 'error'],
    default: 'pending',
  },
  sections:     { type: [sectionSchema], default: [] },
  completedAt:  { type: Date },
  errorMessage: { type: String },
}, { _id: false });

// ── Blueprint document ────────────────────────────────────────────────────────

const companyBlueprintSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  businessObjective: { type: String, required: true },
  industry:          { type: String, default: 'Automotive' },
  companyName:       { type: String, default: '' },
  status: {
    type:    String,
    enum:    ['generating', 'completed', 'error'],
    default: 'generating',
  },
  version:      { type: String, default: '1.0' },
  generatedAt:  { type: Date, default: Date.now },
  capabilities: { type: [capabilitySchema], default: [] },
}, { timestamps: true });

export default mongoose.model('CompanyBlueprint', companyBlueprintSchema);
