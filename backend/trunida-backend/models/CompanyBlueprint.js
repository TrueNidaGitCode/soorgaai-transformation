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

// ── CTO template extras (Vision template) ────────────────────────────────────
// All optional — empty arrays for sections that don't use a visual template.

// Named strategic themes displayed as cards above the brief (Vision)
const pillarSchema = new mongoose.Schema({
  title:             { type: String, default: '' },
  description:       { type: String, default: '' },
  businessImpactTag: { type: String, default: '' },
}, { _id: false });

// Hero KPI metrics displayed as large-number cards (Vision — 3-col grid; Alignment — stacked)
const kpiHighlightSchema = new mongoose.Schema({
  value:       { type: String, default: '' },  // e.g. "75%", "4+", "100%"
  label:       { type: String, default: '' },  // e.g. "Leadership Awareness"
  description: { type: String, default: '' },  // e.g. "Aligned across leadership."
}, { _id: false });

// Named action/initiative cards (Alignment — 3-col grid + 1 wide card)
const initiativeSchema = new mongoose.Schema({
  title:       { type: String, default: '' },
  description: { type: String, default: '' },
}, { _id: false });

// Commitment pillar cards — title + bullet action items
const commitmentPillarSchema = new mongoose.Schema({
  title:   { type: String, default: '' },
  actions: { type: [String], default: [] },
}, { _id: false });

// Business-Led Roadmap: funnel stage (count + label)
const funnelStageSchema = new mongoose.Schema({
  count: { type: String, default: '' },  // e.g. "15", "8"
  label: { type: String, default: '' },  // e.g. "AI Ideas", "Evaluated"
}, { _id: false });

// Strategic Roadmap Design: 2×2 matrix quadrant
const matrixQuadrantSchema = new mongoose.Schema({
  title:       { type: String, default: '' },    // e.g. "Quick Wins"
  initiatives: { type: [String], default: [] },  // initiative names in this quadrant
}, { _id: false });

// Strategic Roadmap Design: quarterly execution plan item
const quarterlyPlanItemSchema = new mongoose.Schema({
  quarter:     { type: String, default: '' },    // "Q1" | "Q2" | "Q3" | "Q4"
  initiatives: { type: [String], default: [] },
}, { _id: false });

// AI Operating Model: solution in the portfolio map
const solutionPortfolioItemSchema = new mongoose.Schema({
  name:          { type: String, default: '' },  // e.g. "AI Support Assistant"
  businessOwner: { type: String, default: '' },  // e.g. "Support Operations Lead"
  deliveryTeam:  { type: String, default: '' },  // e.g. "AI/ML Engineering, Product"
  kpis:          { type: [String], default: [] },
}, { _id: false });

// AI Operating Model: role in the cross-functional team
const teamRoleSchema = new mongoose.Schema({
  title:       { type: String, default: '' },  // e.g. "Product Owner"
  description: { type: String, default: '' },  // e.g. "Owns business outcomes and prioritization"
}, { _id: false });

// AI Operating Model: stage in the lifecycle ownership loop
const lifecycleStageSchema = new mongoose.Schema({
  stage:              { type: String, default: '' },  // e.g. "Deploy"
  teamResponsibility: { type: String, default: '' },  // e.g. "Engineering Lead, DevOps"
  keyActivities:      { type: String, default: '' },  // e.g. "Release to production with minimal risk"
}, { _id: false });

// Shared: pillar or flywheel stage with a bullet-point list (used across AI ROI + Governance)
const pillarBulletSchema = new mongoose.Schema({
  name:   { type: String, default: '' },
  points: { type: [String], default: [] },
}, { _id: false });

// Shared: lifecycle/monitoring stage with bullet-point list (stage key instead of name)
const stageBulletSchema = new mongoose.Schema({
  stage:  { type: String, default: '' },
  points: { type: [String], default: [] },
}, { _id: false });

// AI ROI — Financial Performance: one bar in the value waterfall
const waterfallItemSchema = new mongoose.Schema({
  category:    { type: String, default: '' },   // e.g. "Initial Investment"
  value:       { type: String, default: '0' },  // numeric string e.g. "-8", "2"
  type:        { type: String, default: 'positive' }, // 'negative' | 'positive' | 'total'
  description: { type: String, default: '' },
}, { _id: false });

// AI ROI — Operational Excellence: one SDLC stage
const sdlcStageSchema = new mongoose.Schema({
  stage:       { type: String, default: '' },  // e.g. "Plan"
  aiTool:      { type: String, default: '' },  // e.g. "AI Planning Assistant"
  description: { type: String, default: '' },
}, { _id: false });

const briefSchema = new mongoose.Schema({
  strategicPosition:    { type: String, default: '' },
  priorityActions:      { type: [String], default: [] },
  successMetrics:       { type: [String], default: [] },
  leadershipValidation: { type: leadershipValidationSchema, default: () => ({ status: 'Not Yet Validated', context: '' }) },
  // Vision CTO template extras
  strategicPillars:     { type: [pillarSchema],      default: [] },
  kpiHighlights:        { type: [kpiHighlightSchema], default: [] },
  timelineSteps:        { type: [String],             default: [] },
  // Alignment CTO template extras
  alignmentInitiatives: { type: [initiativeSchema],  default: [] },
  spokeNodes:           { type: [String],            default: [] },
  // Commitment CTO template extras
  commitmentPillars:    { type: [commitmentPillarSchema],   default: [] },
  governanceNodes:      { type: [initiativeSchema],         default: [] },
  // Business-Led Roadmap CTO template extras
  funnelStages:         { type: [funnelStageSchema],        default: [] },
  // Strategic Roadmap Design CTO template extras
  matrixQuadrants:      { type: [matrixQuadrantSchema],     default: [] },
  quarterlyPlan:        { type: [quarterlyPlanItemSchema],  default: [] },
  // AI Operating Model CTO template extras
  solutionPortfolio:    { type: [solutionPortfolioItemSchema], default: [] },
  teamRoles:            { type: [teamRoleSchema],               default: [] },
  lifecycleStages:      { type: [lifecycleStageSchema],         default: [] },
  // AI ROI CTO template extras
  waterfallItems:       { type: [waterfallItemSchema],  default: [] },
  sdlcStages:           { type: [sdlcStageSchema],      default: [] },
  flywheelStages:       { type: [pillarBulletSchema],   default: [] },
  // AI Governance & Ethics CTO template extras
  securityPillars:      { type: [pillarBulletSchema],   default: [] },
  ethicsPillars:        { type: [pillarBulletSchema],   default: [] },
  modelLifecycleStages: { type: [stageBulletSchema],    default: [] },
  complianceControls:   { type: [pillarBulletSchema],   default: [] },
  adoptionStages:       { type: [pillarBulletSchema],   default: [] },
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
