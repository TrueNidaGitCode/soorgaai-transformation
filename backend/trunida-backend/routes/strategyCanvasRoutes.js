import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { screenChat, saveArthSelection, listArthModels, recommendArthModel } from '../controllers/screenChatController.js';
import { getDeployment, prepareInfrastructure, attachApplication, destroyDeployment, acknowledgeGovernance } from '../controllers/deploymentController.js';
import {
  listCapabilities,
  fetchCapabilityBlueprint,
  suggestSection,
  startBlueprintGeneration,
  streamBlueprintProgress,
  getCompanyBlueprint,
  updateBlueprintSection,
  regenerateCapability,
  regenerateSectionExtrasHandler,
  regenerateTransformationSectionExtrasHandler,
  regenerateTransformationCapabilityHandler,
  startTransformationGeneration,
  streamTransformationProgress,
  getTransformationBlueprint,
  listTransformationBlueprints,
  approveOpportunity,
  claimGuestBlueprint,
  updateTransformationSection,
  regenerateSpecificDomains,
  removeGovernanceEthicsCapability,
  removeAIEngineeringEnablement,
  renameAISkillsAssessmentCapability,
  removeAITeamReadiness,
} from '../controllers/strategyCanvasController.js';
import { ask } from '../controllers/advisorController.js';
import { exportBlueprintPDF } from '../controllers/pdfExportController.js';

const router = express.Router();

// ── Shared ────────────────────────────────────────────────────────────────────
router.get('/capabilities',            protect, listCapabilities);
router.get('/blueprint/:capabilityId', protect, fetchCapabilityBlueprint);
router.post('/advisor/ask',            protect, ask);
router.post('/blueprint-suggest',      protect, suggestSection);
// Conversational chat with Cob / Aria (see screenChatController.js)
router.post('/screen-chat',            protect, screenChat);
// Arth (stage 3): the model menu, Arth's own recommendation, and the choice.
router.get('/arth/models',             protect, listArthModels);
router.post('/transformation-blueprint/:blueprintId/arth-recommend',  protect, recommendArthModel);
router.patch('/transformation-blueprint/:blueprintId/arth-selection', protect, saveArthSelection);

// Arth prepares the environment; Eame (later Yusu) attaches the application.
router.get   ('/transformation-blueprint/:blueprintId/deployment',     protect, getDeployment);
router.post  ('/transformation-blueprint/:blueprintId/infrastructure', protect, prepareInfrastructure);
router.post  ('/transformation-blueprint/:blueprintId/deploy',         protect, attachApplication);
router.delete('/transformation-blueprint/:blueprintId/deployment',     protect, destroyDeployment);
 router.patch ('/transformation-blueprint/:blueprintId/governance-review', protect, acknowledgeGovernance);

// ── Legacy: single-domain AI Strategy blueprint (kept for backwards compat) ───
router.post('/generate-blueprint',                                                              protect, startBlueprintGeneration);
router.get('/generate-blueprint/:blueprintId/stream',                                           protect, streamBlueprintProgress);
router.get('/company-blueprint',                                                                protect, getCompanyBlueprint);
router.get('/company-blueprint/export-pdf',                                                     protect, exportBlueprintPDF);
router.patch('/company-blueprint/:blueprintId/capability/:capabilityId/section/:sectionTitle',  protect, updateBlueprintSection);
router.post('/company-blueprint/:blueprintId/capability/:capabilityId/regenerate',              protect, regenerateCapability);
router.post('/company-blueprint/:blueprintId/capability/:capabilityId/regenerate-section-extras', protect, regenerateSectionExtrasHandler);

// ── Multi-domain Transformation Blueprint ─────────────────────────────────────
router.post('/generate-transformation',                                protect, startTransformationGeneration);
router.get('/generate-transformation/:transformationId/stream',        protect, streamTransformationProgress);
router.get('/transformation-blueprint',                                protect, getTransformationBlueprint);
router.get('/transformation-blueprints',                               protect, listTransformationBlueprints);
router.post('/claim-guest-blueprint',                                  protect, claimGuestBlueprint);
router.patch('/transformation-blueprint/:blueprintId/approve-opportunity', protect, approveOpportunity);
router.patch(
  '/transformation-blueprint/:blueprintId/domain/:domainId/capability/:capabilityId/section/:sectionTitle',
  protect, updateTransformationSection
);
router.post(
  '/transformation-blueprint/:blueprintId/domain/:domainId/capability/:capabilityId/regenerate',
  protect, regenerateTransformationCapabilityHandler
);
router.post(
  '/transformation-blueprint/:blueprintId/domain/:domainId/capability/:capabilityId/regenerate-section-extras',
  protect, regenerateTransformationSectionExtrasHandler
);
router.post(
  '/transformation-blueprint/:blueprintId/regenerate-domains',
  protect, regenerateSpecificDomains
);

// ── One-time cleanup ──────────────────────────────────────────────────────────
router.post('/admin/remove-governance-ethics',             protect, removeGovernanceEthicsCapability);
router.post('/admin/remove-ai-engineering-enablement',    protect, removeAIEngineeringEnablement);
router.post('/admin/rename-ai-skills-assessment',         protect, renameAISkillsAssessmentCapability);
router.post('/admin/remove-ai-team-readiness',            protect, removeAITeamReadiness);

export default router;
