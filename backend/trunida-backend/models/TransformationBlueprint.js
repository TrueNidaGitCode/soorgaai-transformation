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
const solutionPortfolioItemSchema = new mongoose.Schema({ name: String, businessOwner: String, deliveryTeam: mongoose.Schema.Types.Mixed, kpis: [String] }, { _id: false });
const solutionComponentSchema   = new mongoose.Schema({ name: String, purpose: String }, { _id: false });
const teamGroupSchema           = new mongoose.Schema({ group: String, roles: [String] }, { _id: false });
const teamRoleSchema            = new mongoose.Schema({ title: String, description: String }, { _id: false });
const lifecycleStageSchema      = new mongoose.Schema({ stage: String, teamResponsibility: String, keyActivities: String }, { _id: false });
const roiSummarySchema          = new mongoose.Schema({ investment: String, annualValue: String, payback: String, recommendation: String }, { _id: false });
const transformationRowSchema   = new mongoose.Schema({ currentState: String, futureState: String }, { _id: false });
const pmDashboardCardSchema          = new mongoose.Schema({ area: String, question: String, currentChallenge: String, aiImprovement: String, expectedKpi: String }, { _id: false });
const improvementScorecardItemSchema = new mongoose.Schema({ area: String, beforeAI: String, afterAI: String, businessBenefit: String }, { _id: false });
const pillarBulletSchema        = new mongoose.Schema({ name: String, points: [String] }, { _id: false });
const stageBulletSchema         = new mongoose.Schema({ stage: String, points: [String] }, { _id: false });
const waterfallItemSchema       = new mongoose.Schema({ category: String, value: String, type: String, description: String }, { _id: false });
const sdlcStageSchema           = new mongoose.Schema({ stage: String, aiTool: String, description: String }, { _id: false });

// ── AI Use Cases sub-schemas ──────────────────────────────────────────────────
const aiOpportunitySchema           = new mongoose.Schema({ name: String, why: String }, { _id: false });
const opportunityClassificationSchema = new mongoose.Schema({ opportunity: String, classification: String, rationale: String }, { _id: false });
const opportunityValueSchema    = new mongoose.Schema({ opportunity: String, valueArea: String, focus: String, outcomes: [String] }, { _id: false });
const valueCategorySchema       = new mongoose.Schema({ title: String, focus: String, outcomes: [String] }, { _id: false });
const priorityQuadrantSchema    = new mongoose.Schema({ id: String, label: String, initiatives: [String] }, { _id: false });
const dimensionCardSchema       = new mongoose.Schema({ title: String, bullets: [String] }, { _id: false });
const roadmapPhaseSchema        = new mongoose.Schema({ phase: String, initiatives: [String], rationale: String }, { _id: false });
const classificationSchema      = new mongoose.Schema({ name: String, rationale: String, businessOutcome: String }, { _id: false });
const classificationCardSchema  = new mongoose.Schema({ type: String, purpose: String, characteristics: [String], examples: [String] }, { _id: false });

// ── Data Readiness sub-schemas ────────────────────────────────────────────────
const datasetSchema                  = new mongoose.Schema({ name: String, purpose: String, typicalSource: String, priority: String, availability: String, category: String, expectedAIOutput: String }, { _id: false });
const collectionOrderItemSchema      = new mongoose.Schema({ name: String, action: String, reason: String }, { _id: false });
const implementationRoadmapItemSchema = new mongoose.Schema({ step: String, status: String }, { _id: false });
const drRecommendationSchema    = new mongoose.Schema({ text: String, priority: String }, { _id: false });
const coverageSummarySchema     = new mongoose.Schema({ criticalDatasets: Number, missingData: Number, confidence: Number }, { _id: false });
const relationshipMapSchema     = new mongoose.Schema({ dataSource: [String], dependentData: [String], relatedData: [String], targetData: [String] }, { _id: false });
const inputDatasetSchema        = new mongoose.Schema({ name: String, status: String }, { _id: false });
const pipelineStageSchema       = new mongoose.Schema({ stage: String, status: String }, { _id: false });
const prepRecommendationSchema  = new mongoose.Schema({ text: String, priority: String, effort: String, impact: String }, { _id: false });
const dataStatsSchema           = new mongoose.Schema({ missingData: Number, dataQuality: Number, traceability: Number }, { _id: false });
const readinessSummarySchema    = new mongoose.Schema({ quality: Number, standardization: Number, integration: Number, aiReadiness: Number }, { _id: false });
const prepActivitySchema        = new mongoose.Schema({ name: String, preparationActivity: String, businessPurpose: String, recommendedOwner: String, priority: String }, { _id: false });
const prepWorkPackageSchema     = new mongoose.Schema({ name: String, workPackage: [String], whyAINeeds: String, recommendedOwner: String, deliverable: String, priority: String }, { _id: false });
const firstStepSchema           = new mongoose.Schema({ action: String, why: String, owner: String, expectedOutput: String }, { _id: false });
const prepSummarySchema         = new mongoose.Schema({ preparationActivities: Number, engineeringRepositories: Number, recommendedOwners: Number, implementationPriority: String, workPackages: Number, repositories: Number, deliverables: Number, estimatedDuration: String }, { _id: false });
const projectSystemSchema       = new mongoose.Schema({ name: String, connectionStatus: String }, { _id: false });
const archRecommendationSchema  = new mongoose.Schema({ title: String, impact: String, effort: String }, { _id: false });
const archStatsSchema           = new mongoose.Schema({ architectureReadiness: Number, automation: Number, connectedSystems: Number, disconnectedSystems: Number }, { _id: false });
const healthTimelineSchema      = new mongoose.Schema({ stage: String, status: String, health: String }, { _id: false });
const archLayerSchema           = new mongoose.Schema({ name: String, purpose: String, recommended: [String], whyNeeded: String }, { _id: false });
const archDecisionSchema        = new mongoose.Schema({ decision: String, benefit: String, priority: String, decisionArea: String, recommendation: String, why: String }, { _id: false });
const techStackItemSchema       = new mongoose.Schema({ layer: String, recommendation: String }, { _id: false });
const archSummarySchema         = new mongoose.Schema({ sourceSystems: Number, integrationPoints: Number, aiStorage: String, aiConsumers: String }, { _id: false });

// ── Technology Infrastructure sub-schemas ─────────────────────────────────────
const connectedSystemSchema         = new mongoose.Schema({ name: String, integrationMethod: String, status: String, healthIndicator: String }, { _id: false });
const integrationSummarySchema      = new mongoose.Schema({ integration: String, automation: String, reliability: String, scalability: String }, { _id: false });
const siaSystemSchema               = new mongoose.Schema({ name: String, purpose: String, integrationPattern: String, aiInteraction: String, expectedOutcome: String }, { _id: false });
const siaPrioritySchema             = new mongoose.Schema({ order: Number, name: String, priority: String, businessBenefit: String }, { _id: false });
const siaArchLayerSchema            = new mongoose.Schema({ name: String, technologies: [String] }, { _id: false });
const capabilityAssessmentSchema    = new mongoose.Schema({ name: String, score: Number, status: String }, { _id: false });
const platformStackLayerSchema      = new mongoose.Schema({ layer: String, score: Number, status: String }, { _id: false });
const platformRecommendationSchema  = new mongoose.Schema({ text: String, priority: String, benefit: String }, { _id: false });
const platformSummarySchema         = new mongoose.Schema({ development: String, knowledge: String, deployment: String, monitoring: String }, { _id: false });
const aprPlatformCapabilitySchema   = new mongoose.Schema({ name: String, purpose: String, capabilities: [String], businessValue: String }, { _id: false });
const aprBlueprintLayerSchema       = new mongoose.Schema({ layer: String, recommendation: String }, { _id: false });
const aprRecommendationSchema       = new mongoose.Schema({ recommendation: String, why: String, priority: String, implementationPhase: String }, { _id: false });
const aprStackLayerSchema           = new mongoose.Schema({ layer: String, recommendation: String }, { _id: false });
const workloadProfileSchema         = new mongoose.Schema({ workloadType: String, computeRequirement: String, performanceRequirement: String, scalabilityRequirement: String, priority: String }, { _id: false });
const deploymentRecommendationSchema = new mongoose.Schema({ text: String, impact: String, reason: String }, { _id: false });
const deploymentScoresSchema        = new mongoose.Schema({ computeFit: Number, deploymentConfidence: Number, estimatedScalability: String }, { _id: false });
const deploymentKpisSchema          = new mongoose.Schema({ compute: String, deployment: String, latency: String, scalability: String }, { _id: false });
const deploymentBlockSchema         = new mongoose.Schema({ blockType: String, name: String, why: String }, { _id: false });
const techRecommendationSchema      = new mongoose.Schema({ layer: String, recommendation: String, selectionRationale: String }, { _id: false });
const cdsInvestmentEstimateSchema   = new mongoose.Schema({ area: String, estimate: String }, { _id: false });
const deploymentDecisionSchema      = new mongoose.Schema({ decisionType: String, choice: String, reason: String }, { _id: false });
const infraItemSchema               = new mongoose.Schema({ item: String, recommendation: String }, { _id: false });

// ── Skills & Workforce sub-schemas ────────────────────────────────────────────
const requiredSkillSchema           = new mongoose.Schema({ name: String, category: String, priority: String, availability: String }, { _id: false });
const skillsMatrixEntrySchema       = new mongoose.Schema({ category: String, readiness: Number, required: Number, missing: Number }, { _id: false });
const skillsRecommendationSchema    = new mongoose.Schema({ title: String, priority: String, expectedBenefit: String }, { _id: false });
const skillsStatsSchema             = new mongoose.Schema({ available: Number, gaps: Number, critical: Number }, { _id: false });
const skillsCategorySummarySchema   = new mongoose.Schema({ category: String, status: String }, { _id: false });
// AI Roles & Capability Planning (new format)
const projectRoleSchema             = new mongoose.Schema({ name: String, primaryResponsibility: String, aiCapabilities: [String], priority: String }, { _id: false });
const capabilityPrioritySchema      = new mongoose.Schema({ priority: Number, role: String, capability: String, businessOutcome: String }, { _id: false });
const workforceStatsSchema          = new mongoose.Schema({ requiredRoles: Number, criticalRoles: Number, aiCapabilities: Number, implementationPriority: String }, { _id: false });
const learningPillarSchema          = new mongoose.Schema({ name: String, description: String, status: String }, { _id: false });
const adoptionLifecycleStageSchema  = new mongoose.Schema({ stage: String, currentStatus: String, readiness: Number, keyActivities: [String] }, { _id: false });
const adoptionRecommendationSchema  = new mongoose.Schema({ title: String, priority: String, expectedOutcome: String }, { _id: false });
const adoptionStatsSchema           = new mongoose.Schema({ teamsTrained: Number, toolsAdopted: Number, adoptionRate: String }, { _id: false });
const adoptionReadinessSummarySchema = new mongoose.Schema({ category: String, status: String }, { _id: false });
// AI Learning & Adoption new-format schemas
const roleLearningSchema            = new mongoose.Schema({ role: String, learningPath: [String], businessOutcome: String }, { _id: false });
const adoptionRoadmapStageSchema    = new mongoose.Schema({ stage: String, goal: String, expectedOutput: String }, { _id: false });
const enablementActionSchema        = new mongoose.Schema({ action: String, owner: String, businessImpact: String, timeline: String }, { _id: false });
const enablementSummarySchema       = new mongoose.Schema({ projectRoles: Number, learningPaths: Number, aiTools: Number, adoptionActivities: Number }, { _id: false });
const learningResourceSchema        = new mongoose.Schema({ name: String, audience: String, priority: String }, { _id: false });

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
  solutionComponents:   { type: [solutionComponentSchema],    default: [] },
  teamGroups:           { type: [teamGroupSchema],             default: [] },
  teamRoles:            { type: [teamRoleSchema],              default: [] },
  lifecycleStages:      { type: [lifecycleStageSchema],       default: [] },
  roiSummary:           { type: roiSummarySchema,             default: undefined },
  transformationRows:   { type: [transformationRowSchema],    default: [] },
  impactAreas:          { type: [pillarBulletSchema],         default: [] },
  pmDashboard:          { type: [pmDashboardCardSchema],           default: [] },
  improvementScorecard: { type: [improvementScorecardItemSchema],  default: [] },
  valueJourney:         { type: [String],                     default: [] },
  valueDimensions:      { type: [pillarBulletSchema],         default: [] },
  customerKpis:         { type: [kpiHighlightSchema],         default: [] },
  costItems:            { type: [String],                    default: [] },
  valueItems:           { type: [String],                    default: [] },
  impactTimeline:       { type: [String],                    default: [] },
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
  aiOpportunities:          { type: [aiOpportunitySchema], default: [] },
  opportunityClassifications: { type: [opportunityClassificationSchema], default: [] },
  opportunityValues:        { type: [opportunityValueSchema], default: [] },
  valueCategories:          { type: [valueCategorySchema],      default: [] },
  kpiPills:                 { type: [String], default: [] },
  businessValueInsight:     { type: String,   default: '' },
  recommendedStartingPoint: { type: String,   default: '' },
  recommendedInitiativeName: { type: String,  default: '' },
  priorityQuadrants:        { type: [priorityQuadrantSchema],   default: [] },
  dimensionCards:           { type: [dimensionCardSchema],      default: [] },
  prioritizationInsight:    { type: String,   default: '' },
  implementationPhases:     { type: [roadmapPhaseSchema],       default: [] },
  primaryClassification:    { type: classificationSchema,       default: undefined },
  secondaryClassification:  { type: classificationSchema,       default: undefined },
  classificationCards:      { type: [classificationCardSchema], default: [] },
  transformationImplication: { type: String,   default: '' },
  // Data Readiness: Critical Data Identification extras
  datasets:                 { type: [datasetSchema],            default: [] },
  recommendations:          { type: [drRecommendationSchema],   default: [] },
  coverageSummary:          { type: coverageSummarySchema,           default: undefined },
  traceabilityChain:        { type: [String],                         default: [] },
  collectionOrder:          { type: [collectionOrderItemSchema],       default: [] },
  implementationRoadmap:    { type: [implementationRoadmapItemSchema], default: [] },
  relationshipMap:          { type: relationshipMapSchema,      default: undefined },
  consultantGuidance:       { type: String, default: '' },
  aiRecommendation:         { type: String, default: '' },
  // Data Readiness: AI Data Preparation extras
  inputDatasets:            { type: [inputDatasetSchema],       default: [] },
  pipelineStages:           { type: [pipelineStageSchema],      default: [] },
  prepRecommendations:      { type: [prepRecommendationSchema], default: [] },
  dataStats:                { type: dataStatsSchema,            default: undefined },
  readinessSummary:         { type: readinessSummarySchema,     default: undefined },
  prepActivities:           { type: [prepActivitySchema],       default: [] },
  prepWorkPackages:         { type: [prepWorkPackageSchema],    default: [] },
  firstSteps:               { type: [firstStepSchema],          default: [] },
  prepSummary:              { type: prepSummarySchema,          default: undefined },
  // Data Readiness: Data Architecture Enablement extras
  projectSystems:           { type: [projectSystemSchema],      default: [] },
  archRecommendations:      { type: [archRecommendationSchema], default: [] },
  archStats:                { type: archStatsSchema,            default: undefined },
  healthTimeline:           { type: [healthTimelineSchema],     default: [] },
  archLayers:               { type: [archLayerSchema],          default: [] },
  archDecisions:            { type: [archDecisionSchema],       default: [] },
  techStack:                { type: [techStackItemSchema],      default: [] },
  archSummary:              { type: archSummarySchema,          default: undefined },
  archPattern:              { type: [String],                   default: [] },
  archConsultantGuidance:   { type: String,                     default: '' },
  // Technology Infrastructure: System Integration & Architecture extras
  integrationReadiness:     { type: Number,   default: 0 },
  connectedSystems:         { type: [connectedSystemSchema],          default: [] },
  integrationSummary:       { type: integrationSummarySchema,         default: undefined },
  // Technology Infrastructure: System Integration & Architecture new-format extras
  siaEngineeringSystems:    { type: [siaSystemSchema],                default: [] },
  siaWorkflowSteps:         { type: [String],                         default: [] },
  siaIntegrationPriorities: { type: [siaPrioritySchema],              default: [] },
  siaArchLayers:            { type: [siaArchLayerSchema],             default: [] },
  siaImplSequence:          { type: [String],                         default: [] },
  siaConsultantGuidance:      { type: String,   default: '' },
  siaAIRecommendation:        { type: String,   default: '' },
  siaIntegrationPrinciples:   { type: [String], default: [] },
  // Technology Infrastructure: AI Platform Readiness extras
  platformReadiness:        { type: Number,   default: 0 },
  capabilityAssessment:     { type: [capabilityAssessmentSchema],     default: [] },
  platformStack:            { type: [platformStackLayerSchema],       default: [] },
  platformRecommendations:  { type: [platformRecommendationSchema],   default: [] },
  platformSummary:          { type: platformSummarySchema,            default: undefined },
  // Technology Infrastructure: AI Platform Readiness new-format extras
  platformCapabilities:     { type: [aprPlatformCapabilitySchema],   default: [] },
  platformBlueprintLayers:  { type: [aprBlueprintLayerSchema],       default: [] },
  platformRecs:             { type: [aprRecommendationSchema],        default: [] },
  aprImplRoadmap:           { type: [String],                        default: [] },
  aprStackLayers:           { type: [aprStackLayerSchema],           default: [] },
  aprConsultantGuidance:    { type: String,                          default: '' },
  aprAIRecommendation:      { type: String,                          default: '' },
  // Technology Infrastructure: AI Compute & Deployment Strategy extras
  deploymentReadiness:      { type: Number,   default: 0 },
  workloadProfile:          { type: [workloadProfileSchema],          default: [] },
  deploymentRecommendations: { type: [deploymentRecommendationSchema], default: [] },
  deploymentScores:         { type: deploymentScoresSchema,           default: undefined },
  deploymentKpis:           { type: deploymentKpisSchema,             default: undefined },
  // Technology Infrastructure: AI Compute & Deployment Strategy new-format extras
  deploymentBlocks:         { type: [deploymentBlockSchema],          default: [] },
  cdsDeploymentFlow:        { type: [String],                         default: [] },
  techRecommendations:      { type: [techRecommendationSchema],       default: [] },
  deploymentDecisions:      { type: [deploymentDecisionSchema],       default: [] },
  cdsImplSequence:          { type: [String],                         default: [] },
  infraItems:               { type: [infraItemSchema],                default: [] },
  cdsArchRationale:         { type: [String],                         default: [] },
  cdsInvestmentEstimate:    { type: [cdsInvestmentEstimateSchema],    default: [] },
  cdsConsultantGuidance:    { type: String,                           default: '' },
  cdsAIRecommendation:      { type: String,                           default: '' },
  recommendedModelApproach: { type: String,                           default: '' },
  modelSelectionRationale:  { type: String,                           default: '' },
  // Skills & Workforce: AI Roles & Capability Planning (legacy fields kept for backwards compat)
  skillsReadiness:          { type: Number,   default: 0 },
  requiredSkills:           { type: [requiredSkillSchema],            default: [] },
  skillsMatrix:             { type: [skillsMatrixEntrySchema],        default: [] },
  skillsRecommendations:    { type: [skillsRecommendationSchema],     default: [] },
  skillsStats:              { type: skillsStatsSchema,                default: undefined },
  skillsCategorySummary:    { type: [skillsCategorySummarySchema],    default: [] },
  // AI Roles & Capability Planning (new format fields)
  projectRoles:             { type: [projectRoleSchema],              default: [] },
  responsibilityJourney:    { type: [String],                         default: [] },
  capabilityPriorities:     { type: [capabilityPrioritySchema],       default: [] },
  workforceStats:           { type: workforceStatsSchema,             default: undefined },
  arcpConsultantGuidance:   { type: String },
  arcpAIRecommendation:     { type: String },
  // Skills & Workforce: AI Learning & Adoption new-format extras
  roleLearningJourney:      { type: [roleLearningSchema],            default: [] },
  adoptionRoadmap:          { type: [adoptionRoadmapStageSchema],    default: [] },
  enablementActions:        { type: [enablementActionSchema],        default: [] },
  enablementSummary:        { type: enablementSummarySchema,         default: undefined },
  learningResources:        { type: [learningResourceSchema],        default: [] },
  alaConsultantGuidance:    { type: String },
  alaAIRecommendation:      { type: String },
  // Skills & Workforce: AI Learning & Adoption legacy extras (backwards compat)
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
  // Absent for anonymous guest previews; set when the guest signs in and
  // claims the blueprint (see claimGuestBlueprint).
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: function () { return !this.guestId; },
    index:    true,
  },
  // Server-generated token for the anonymous try-before-login flow.
  // Removed when the blueprint is claimed by a real account.
  guestId: {
    type:   String,
    index:  true,
    sparse: true,
  },
  businessObjective: { type: String, required: true },
  industry:          { type: String, default: 'Automotive' },
  companyName:       { type: String, default: '' },
  status: {
    type:    String,
    enum:    ['generating', 'completed', 'error'],
    default: 'generating',
  },
  // Classified once, lazily, by the first generation run (see
  // resolveIndustryFit in blueprintGenerationService.js) and reused by every
  // later run (e.g. "generate remaining domains") — checked distinguishes
  // "not yet classified" from "classified as matched" so it's never
  // re-classified or left ambiguous. When unmatched, generation falls back
  // to core (industry-agnostic) KB grounding only, and the UI notifies the user.
  // Which industry overlay grounds this blueprint, decided once from the
  // objective and reused by every capability run so the decision cannot
  // flip-flop mid-generation.
  //
  // `industry` is the overlay folder name, or '' for core-only grounding.
  // `matched` is kept because the UI's industry-fit banner reads it, and
  // because blueprints created before `industry` existed only have this.
  industryFit: {
    checked:  { type: Boolean, default: false },
    matched:  { type: Boolean, default: true },
    industry: { type: String,  default: '' },
    reason:   { type: String,  default: '' },
  },
  // What KIND of AI work this is — see services/engagementClassifierService.js.
  // Decided once, before generation, and reused by every capability run so the
  // decision cannot flip-flop mid-generation (same discipline as industryFit).
  //
  // `category` is '' when undecided, which every reader must treat as "behave
  // as this product did before the classifier existed" rather than as a
  // default. `userSet` records that a human corrected it, so a later
  // regeneration never silently overwrites their answer with a fresh guess.
  //
  // Deliberately NOT an enum. The permitted values are documented in the
  // classifier and validated there before anything is written. An enum here
  // whose default is not itself a member rejects every new document on save —
  // that is exactly how arthSelection.preference stopped all blueprint
  // creation for three days in September 2026.
  engagement: {
    checked:    { type: Boolean, default: false },
    category:   { type: String,  default: '' },   // 'product-ai' | 'workflow-automation' | ''
    subArea:    { type: String,  default: '' },   // one of WORKFLOW_AREAS, or ''
    maturity:   { type: String,  default: '' },   // 'enterprise' | 'startup' | 'unknown' | ''
    confidence: { type: Number,  default: 0 },
    reason:     { type: String,  default: '' },
    userSet:    { type: Boolean, default: false },
  },
  // Set when the user clicks "Approve" on the AI Use Cases & Prioritization
  // screen (Window 1 / Cob) confirming Cob's recommended starting point —
  // a user decision recorded on the blueprint, not a generation output.
  opportunityApproval: {
    approved:   { type: Boolean, default: false },
    approvedAt: { type: Date,    default: null },
  },

  // Arth (stage 3): which model class this engagement runs on. Stores the
  // preference the user chose plus the resolved pick at that moment, since
  // the catalog can change later and we want the decision as it was made.
  // providerId is null for 'auto' — see modelSelectionService.selectModel.
  arthSelection: {
    // null is in the enum on purpose: it is the default, it means "no class
    // chosen yet", and Mongoose validates defaults on save. Without it every
    // new blueprint failed validation before it could be written — which
    // silently stopped all blueprint creation between 2026-09-01 and
    // 2026-09-04. Do not remove null without also changing the default.
    preference:  { type: String, enum: ['frontier', 'open-weight', 'auto', null], default: null },
    providerId:  { type: String, default: '' },
    displayName: { type: String, default: '' },
    selectedAt:  { type: Date,   default: null },

    // The specific model chosen from Arth's advisory catalog. Older rows have
    // only the class above, which is why these default to empty rather than
    // being required.
    modelId:     { type: String, default: '' },
    vendor:      { type: String, default: '' },
    // Why this one — Arth's reasoning when the class was 'auto', so the
    // decision can still be defended months later.
    rationale:   { type: String, default: '' },
    priority:    { type: String, default: '' },
    // Compute snapshot for open-weight picks, as derived at selection time.
    compute: {
      quantization: { type: String, default: '' },
      vramGb:       { type: Number, default: 0 },
      gpuCount:     { type: Number, default: 0 },
      gpu:          { type: String, default: '' },
      note:         { type: String, default: '' },
    },
  },

  // Yusu (stage 5): the governance areas were read and accepted before
  // go-live. Recorded on the blueprint rather than the deployment — it is a
  // statement about the engagement, and it survives redeploying.
  governanceReview: {
    acknowledged:   { type: Boolean, default: false },
    acknowledgedAt: { type: Date,    default: null },
    areas:          { type: [String], default: [] },
  },

  // What the customer calls their application. Chosen on Eame before the
  // build, so it reaches the repository name, the running application's
  // title and its chat header rather than being a label added afterwards.
  appName: { type: String, default: '', trim: true, maxlength: 48 },

  // Eame (stage 4): what was actually delivered. Hosting deploys from this
  // repository, so it has to outlive the browser session that pushed it.
  eameDelivery: {
    repoOwner: { type: String, default: '' },
    repoName:  { type: String, default: '' },
    repoUrl:   { type: String, default: '' },
    fileCount: { type: Number, default: 0 },
    pushedAt:  { type: Date,   default: null },
  },

  domains: { type: [domainSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('TransformationBlueprint', transformationBlueprintSchema);
