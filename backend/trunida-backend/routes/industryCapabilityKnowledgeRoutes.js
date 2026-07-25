import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import {
  listEntries,
  getEntry,
  streamGenerationProgress,
  generate,
  approveDraft,
  discardDraft,
} from '../controllers/industryCapabilityKnowledgeController.js';

const router = express.Router();

// Platform-admin-only.
router.get('/',                                          protect, adminOnly, listEntries);
router.get('/:id',                                        protect, adminOnly, getEntry);
router.get('/:id/stream',                                 protect, adminOnly, streamGenerationProgress);
router.post('/:id/generate',                              protect, adminOnly, generate);
router.post('/:id/capability/:capabilityId/approve',      protect, adminOnly, approveDraft);
router.post('/:id/capability/:capabilityId/discard',      protect, adminOnly, discardDraft);

export default router;
