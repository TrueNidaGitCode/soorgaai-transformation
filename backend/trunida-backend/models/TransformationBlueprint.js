/**
 * SoorgaAI — Transformation Blueprint Model
 *
 * Top-level blueprint that spans multiple AI transformation domains.
 * Each domain contains the same capability + section structure as the
 * legacy CompanyBlueprint, so existing section-level logic (brief, CTO
 * template extras, PATCH updates) works unchanged within each domain.
 */

import mongoose from 'mongoose';

// ── Shared sub-schemas (mirrors CompanyBlueprint) ─────────────────────────────

const leadershipValidationSchema = new mongoose.Schema({
  status:  { type: String, enum: ['Approved', 'In Review', 'Not Yet Validated'], default: 'Not Yet Validated' },
  context: { type: String, default: '' },
}, { _id: false });

const pillarSchema              = new mongoose.Schema({ title: String, description: String, businessImpactTag: String }, { _id: false });
const kpiHighlightSchema        = new mongoose.Schema({ value: String, label: String, description: String }, { _id: false });
const initiativeSchema          = new mongoose.Schema({ title: String, description: String }, { _id: false });
const commitmentPillarSchema    = new mongoose.Schema({ title: String, actions: [String] }, { _id: false });
const funnelStageSchema         = new mongoose.Schema({ count: String, label: String }, { _id: false });
const matrixQuadrantSchema      = new mongoose.Schema({ title: String, initiatives: [String] }, { _id: false });
const quarterlyPlanItemSchema   = new mongoose.Schema({ quarter: String, initiatives: [String] }, { _id: false });
const solutionPortfolioItemSchema = new mongoose.Schema({ name: String, businessOwner: String, deliveryTeam: String, kpis: [String] }, { _id: false });
const teamRoleSchema            = new mongoose.Schema({ title: String, description: String }, { _id: false });
const lifecycleStageSchema      = new mongoose.Schema({ stage: String, teamResponsibility: String, keyActivities: String }, { _id: false });
const pillarBulletSchema        = new mongoose.Schema({ name: String, points: [String] }, { _id: false });
const stageBulletSchema         = new mongoose.Schema({ stage: String, points: [String] }, { _id: false });
const waterfallItemSchema       = new mongoose.Schema({ category: String, value: String, type: String, description: String }, { _id: false });
const sdlcStageSchema           = new mongoose.Schema({ stage: String, aiTool: String, description: String }, { _id: false });

// ── AI Use Cases sub-schemas ──────────────────────────────────────────────────
const valueCategorySchema       = new mongoose.Schema({ title: String, focus: String, outcomes: [String] }, { _id: false });
const priorityQuadrantSchema    = new mongoose.Schema({ id: String, label: String, initiatives: [String] }, { _id: false });
const dimensionCardSchema       = new mongoose.Schema({ title: String, bullets: [String] }, { _id: false });
const classificationSchema      = new mongoose.Schema({ name: String, description: String }, { _id: false });
const classificationCardSchema  = new mongoose.Schema({ type: String, purpose: String, characteristics: [String], examples: [String] }, { _id: false });

const briefSchema = new mongoose.Schema({
  strategicPosition:    { type: String, default: '' },
  priorityActions:      { type: [String], default: [] },
  successMetrics:       { type: [String], default: [] },
  leadershipValidation: { type: leadershipValidationSchema, default: () => ({ status: 'Not Yet Validated', context: '' }) },
  strategicPillars:     { type: [pillarSchema],              default: [] },
  kpiHighlights:        { type: [kpiHighlightSchema],        default: [] },
  timelineSteps:        { type: [String],                    default: [] },
  alignmentInitiatives: { type: [initiativeSchema],          default: [] },
  spokeNodes:           { type: [String],                    default: [] },
  commitmentPillars:    { type: [commitmentPillarSchema],    default: [] },
  governanceNodes:      { type: [initiativeSchema],          default: [] },
  funnelStages:         { type: [funnelStageSchema],         default: [] },
  matrixQuadrants:      { type: [matrixQuadrantSchema],      default: [] },
  quarterlyPlan:        { type: [quarterlyPlanItemSchema],   default: [] },
  solutionPortfolio:    { type: [solutionPortfolioItemSchema], default: [] },
  teamRoles:            { type: [teamRoleSchema],             default: [] },
  lifecycleStages:      { type: [lifecycleStageSchema],       default: [] },
  waterfallItems:       { type: [waterfallItemSchema],        default: [] },
  sdlcStages:           { type: [sdlcStageSchema],            default: [] },
  flywheelStages:       { type: [pillarBulletSchema],         default: [] },
  securityPillars:      { type: [pillarBulletSchema],         default: [] },
  ethicsPillars:        { type: [pillarBulletSchema],         default: [] },
  modelLifecycleStages: { type: [stageBulletSchema],          default: [] },
  complianceControls:   { type: [pillarBulletSchema],         default: [] },
  adoptionStages:       { type: [pillarBulletSchema],         default: [] },
  // AI Use Cases extras
  businessProblems:         { type: [String], default: [] },
  workflowSteps:            { type: [String], default: [] },
  highEffortActivities:     { type: [String], default: [] },
  aiOpportunities:          { type: [String], default: [] },
  valueCategories:          { type: [valueCategorySchema],      default: [] },
  kpiPills:                 { type: [String], default: [] },
  businessValueInsight:     { type: String,   default: '' },
  recommendedStartingPoint: { type: String,   default: '' },
  priorityQuadrants:        { type: [priorityQuadrantSchema],   default: [] },
  dimensionCards:           { type: [dimensionCardSchema],      default: [] },
  prioritizationInsight:    { type: String,   default: '' },
  primaryClassification:    { type: classificationSchema,       default: undefined },
  secondaryClassification:  { type: classificationSchema,       default: undefined },
  classificationCards:      { type: [classificationCardSchema], default: [] },
  classificationInsight:    { type: String,   default: '' },
}, { _id: false });

const sectionSchema = new mongoose.Schema({
  title:    { type: String, required: true },
  brief:    { type: briefSchema, default: () => ({}) },
  content:  { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const capabilitySchema = new mongoose.Schema({
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },
  status: { type: String, enum: ['pending', 'in-progress', 'completed', 'error'], default: 'pending' },
  sections:     { type: [sectionSchema], default: [] },
  completedAt:  { type: Date },
  errorMessage: { type: String },
}, { _id: false });

// ── Domain ────────────────────────────────────────────────────────────────────

const domainSchema = new mongoose.Schema({
  domainId:   { type: String, required: true },
  domainName: { type: String, required: true },
  status: { type: String, enum: ['pending', 'generating', 'completed', 'error'], default: 'pending' },
  capabilities: { type: [capabilitySchema], default: [] },
}, { _id: false });

// ── Top-level document ────────────────────────────────────────────────────────

const transformationBlueprintSchema = new mongoose.Schema({
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
  domains: { type: [domainSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('TransformationBlueprint', transformationBlueprintSchema);
