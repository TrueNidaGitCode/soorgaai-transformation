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
const classificationSchema      = new mongoose.Schema({ name: String, rationale: String, businessOutcome: String }, { _id: false });
const classificationCardSchema  = new mongoose.Schema({ type: String, purpose: String, characteristics: [String], examples: [String] }, { _id: false });

// ── Data Readiness sub-schemas ────────────────────────────────────────────────
const datasetSchema             = new mongoose.Schema({ name: String, purpose: String, priority: String, availability: String, category: String }, { _id: false });
const drRecommendationSchema    = new mongoose.Schema({ text: String, priority: String }, { _id: false });
const coverageSummarySchema     = new mongoose.Schema({ criticalDatasets: Number, missingData: Number, confidence: Number }, { _id: false });
const relationshipMapSchema     = new mongoose.Schema({ dataSource: [String], dependentData: [String], relatedData: [String], targetData: [String] }, { _id: false });
const inputDatasetSchema        = new mongoose.Schema({ name: String, status: String }, { _id: false });
const pipelineStageSchema       = new mongoose.Schema({ stage: String, status: String }, { _id: false });
const prepRecommendationSchema  = new mongoose.Schema({ text: String, priority: String, effort: String, impact: String }, { _id: false });
const dataStatsSchema           = new mongoose.Schema({ missingData: Number, dataQuality: Number, traceability: Number }, { _id: false });
const readinessSummarySchema    = new mongoose.Schema({ quality: Number, standardization: Number, integration: Number, aiReadiness: Number }, { _id: false });
const projectSystemSchema       = new mongoose.Schema({ name: String, connectionStatus: String }, { _id: false });
const archRecommendationSchema  = new mongoose.Schema({ title: String, impact: String, effort: String }, { _id: false });
const archStatsSchema           = new mongoose.Schema({ architectureReadiness: Number, automation: Number, connectedSystems: Number, disconnectedSystems: Number }, { _id: false });
const healthTimelineSchema      = new mongoose.Schema({ stage: String, status: String, health: String }, { _id: false });

// ── Technology Infrastructure sub-schemas ─────────────────────────────────────
const connectedSystemSchema         = new mongoose.Schema({ name: String, integrationMethod: String, status: String, healthIndicator: String }, { _id: false });
const integrationSummarySchema      = new mongoose.Schema({ integration: String, automation: String, reliability: String, scalability: String }, { _id: false });
const capabilityAssessmentSchema    = new mongoose.Schema({ name: String, score: Number, status: String }, { _id: false });
const platformStackLayerSchema      = new mongoose.Schema({ layer: String, score: Number, status: String }, { _id: false });
const platformRecommendationSchema  = new mongoose.Schema({ text: String, priority: String, benefit: String }, { _id: false });
const platformSummarySchema         = new mongoose.Schema({ development: String, knowledge: String, deployment: String, monitoring: String }, { _id: false });
const workloadProfileSchema         = new mongoose.Schema({ workloadType: String, computeRequirement: String, performanceRequirement: String, scalabilityRequirement: String, priority: String }, { _id: false });
const deploymentRecommendationSchema = new mongoose.Schema({ text: String, impact: String, reason: String }, { _id: false });
const deploymentScoresSchema        = new mongoose.Schema({ computeFit: Number, deploymentConfidence: Number, estimatedScalability: String }, { _id: false });
const deploymentKpisSchema          = new mongoose.Schema({ compute: String, deployment: String, latency: String, scalability: String }, { _id: false });
const engineeringCapabilitySchema   = new mongoose.Schema({ name: String, status: String, score: Number }, { _id: false });
const engineeringLifecycleSchema    = new mongoose.Schema({ stage: String, readiness: Number, automation: String }, { _id: false });
const engineeringRecommendationSchema = new mongoose.Schema({ text: String, priority: String, businessImpact: String }, { _id: false });
const automationStatsSchema         = new mongoose.Schema({ automation: String, testing: String, deployment: String }, { _id: false });
const engineeringSummarySchema      = new mongoose.Schema({ development: String, testing: String, deployment: String, continuousImprovement: String }, { _id: false });

// ── Skills & Workforce sub-schemas ────────────────────────────────────────────
const requiredSkillSchema           = new mongoose.Schema({ name: String, category: String, priority: String, availability: String }, { _id: false });
const skillsMatrixEntrySchema       = new mongoose.Schema({ category: String, readiness: Number, required: Number, missing: Number }, { _id: false });
const skillsRecommendationSchema    = new mongoose.Schema({ title: String, priority: String, expectedBenefit: String }, { _id: false });
const skillsStatsSchema             = new mongoose.Schema({ available: Number, gaps: Number, critical: Number }, { _id: false });
const skillsCategorySummarySchema   = new mongoose.Schema({ category: String, status: String }, { _id: false });
const requiredRoleSchema            = new mongoose.Schema({ name: String, responsibility: String, availability: String, priority: String }, { _id: false });
const teamRecommendationSchema      = new mongoose.Schema({ title: String, priority: String, impact: String }, { _id: false });
const teamStatsSchema               = new mongoose.Schema({ required: Number, available: Number, missing: Number }, { _id: false });
const teamCoverageSummarySchema     = new mongoose.Schema({ category: String, status: String }, { _id: false });
const learningPillarSchema          = new mongoose.Schema({ name: String, description: String, status: String }, { _id: false });
const adoptionLifecycleStageSchema  = new mongoose.Schema({ stage: String, currentStatus: String, readiness: Number, keyActivities: [String] }, { _id: false });
const adoptionRecommendationSchema  = new mongoose.Schema({ title: String, priority: String, expectedOutcome: String }, { _id: false });
const adoptionStatsSchema           = new mongoose.Schema({ teamsTrained: Number, toolsAdopted: Number, adoptionRate: String }, { _id: false });
const adoptionReadinessSummarySchema = new mongoose.Schema({ category: String, status: String }, { _id: false });

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
  transformationImplication: { type: String,   default: '' },
  // Data Readiness: Critical Data Identification extras
  datasets:                 { type: [datasetSchema],            default: [] },
  recommendations:          { type: [drRecommendationSchema],   default: [] },
  coverageSummary:          { type: coverageSummarySchema,      default: undefined },
  relationshipMap:          { type: relationshipMapSchema,      default: undefined },
  // Data Readiness: AI Data Preparation extras
  inputDatasets:            { type: [inputDatasetSchema],       default: [] },
  pipelineStages:           { type: [pipelineStageSchema],      default: [] },
  prepRecommendations:      { type: [prepRecommendationSchema], default: [] },
  dataStats:                { type: dataStatsSchema,            default: undefined },
  readinessSummary:         { type: readinessSummarySchema,     default: undefined },
  // Data Readiness: Data Architecture Enablement extras
  projectSystems:           { type: [projectSystemSchema],      default: [] },
  archRecommendations:      { type: [archRecommendationSchema], default: [] },
  archStats:                { type: archStatsSchema,            default: undefined },
  healthTimeline:           { type: [healthTimelineSchema],     default: [] },
  // Technology Infrastructure: System Integration & Architecture extras
  integrationReadiness:     { type: Number,   default: 0 },
  connectedSystems:         { type: [connectedSystemSchema],          default: [] },
  integrationSummary:       { type: integrationSummarySchema,         default: undefined },
  // Technology Infrastructure: AI Platform Readiness extras
  platformReadiness:        { type: Number,   default: 0 },
  capabilityAssessment:     { type: [capabilityAssessmentSchema],     default: [] },
  platformStack:            { type: [platformStackLayerSchema],       default: [] },
  platformRecommendations:  { type: [platformRecommendationSchema],   default: [] },
  platformSummary:          { type: platformSummarySchema,            default: undefined },
  // Technology Infrastructure: AI Compute & Deployment Strategy extras
  deploymentReadiness:      { type: Number,   default: 0 },
  workloadProfile:          { type: [workloadProfileSchema],          default: [] },
  deploymentRecommendations: { type: [deploymentRecommendationSchema], default: [] },
  deploymentScores:         { type: deploymentScoresSchema,           default: undefined },
  deploymentKpis:           { type: deploymentKpisSchema,             default: undefined },
  // Technology Infrastructure: AI Engineering Enablement extras
  engineeringReadiness:     { type: Number,   default: 0 },
  engineeringCapabilities:  { type: [engineeringCapabilitySchema],    default: [] },
  engineeringLifecycle:     { type: [engineeringLifecycleSchema],     default: [] },
  engineeringRecommendations: { type: [engineeringRecommendationSchema], default: [] },
  automationStats:          { type: automationStatsSchema,            default: undefined },
  engineeringSummary:       { type: engineeringSummarySchema,         default: undefined },
  // Skills & Workforce: AI Skills Assessment extras
  skillsReadiness:          { type: Number,   default: 0 },
  requiredSkills:           { type: [requiredSkillSchema],            default: [] },
  skillsMatrix:             { type: [skillsMatrixEntrySchema],        default: [] },
  skillsRecommendations:    { type: [skillsRecommendationSchema],     default: [] },
  skillsStats:              { type: skillsStatsSchema,                default: undefined },
  skillsCategorySummary:    { type: [skillsCategorySummarySchema],    default: [] },
  // Skills & Workforce: AI Team Readiness extras
  teamReadiness:            { type: Number,   default: 0 },
  requiredRoles:            { type: [requiredRoleSchema],             default: [] },
  teamRecommendations:      { type: [teamRecommendationSchema],       default: [] },
  teamStats:                { type: teamStatsSchema,                  default: undefined },
  teamCoverageSummary:      { type: [teamCoverageSummarySchema],      default: [] },
  // Skills & Workforce: AI Learning & Adoption extras
  adoptionReadiness:        { type: Number,   default: 0 },
  learningPillars:          { type: [learningPillarSchema],           default: [] },
  adoptionLifecycle:        { type: [adoptionLifecycleStageSchema],   default: [] },
  adoptionRecommendations:  { type: [adoptionRecommendationSchema],   default: [] },
  adoptionStats:            { type: adoptionStatsSchema,              default: undefined },
  adoptionReadinessSummary: { type: [adoptionReadinessSummarySchema], default: [] },
}, { _id: false, strict: false });

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
