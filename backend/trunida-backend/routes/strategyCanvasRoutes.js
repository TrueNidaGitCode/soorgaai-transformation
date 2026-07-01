import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
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
} from '../controllers/strategyCanvasController.js';
import { ask } from '../controllers/advisorController.js';
import { exportBlueprintPDF } from '../controllers/pdfExportController.js';

const router = express.Router();

// ── Existing routes ───────────────────────────────────────────────────────────
router.get('/capabilities',            protect, listCapabilities);
router.get('/blueprint/:capabilityId', protect, fetchCapabilityBlueprint);
router.post('/advisor/ask',            protect, ask);
router.post('/blueprint-suggest',      protect, suggestSection);

// ── PI 26.3 Sprint 1: Blueprint Generation ────────────────────────────────────
router.post('/generate-blueprint',                                                             protect, startBlueprintGeneration);
router.get('/generate-blueprint/:blueprintId/stream',                                          protect, streamBlueprintProgress);
router.get('/company-blueprint',                                                               protect, getCompanyBlueprint);
router.get('/company-blueprint/export-pdf',                                                    protect, exportBlueprintPDF);
router.patch('/company-blueprint/:blueprintId/capability/:capabilityId/section/:sectionTitle', protect, updateBlueprintSection);
router.post('/company-blueprint/:blueprintId/capability/:capabilityId/regenerate',                                         protect, regenerateCapability);
router.post('/company-blueprint/:blueprintId/capability/:capabilityId/regenerate-section-extras',                         protect, regenerateSectionExtrasHandler);

export default router;
