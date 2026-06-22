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
} from '../controllers/strategyCanvasController.js';
import { ask } from '../controllers/advisorController.js';

const router = express.Router();

// ── Existing routes ───────────────────────────────────────────────────────────
router.get('/capabilities',            protect, listCapabilities);
router.get('/blueprint/:capabilityId', protect, fetchCapabilityBlueprint);
router.post('/advisor/ask',            protect, ask);
router.post('/blueprint-suggest',      protect, suggestSection);

// ── PI 26.3 Sprint 1: Blueprint Generation ────────────────────────────────────
router.post('/generate-blueprint',                                                         protect, startBlueprintGeneration);
router.get('/generate-blueprint/:blueprintId/stream',                                      protect, streamBlueprintProgress);
router.get('/company-blueprint',                                                           protect, getCompanyBlueprint);
router.patch('/company-blueprint/:blueprintId/capability/:capabilityId/section/:sectionTitle', protect, updateBlueprintSection);

export default router;
