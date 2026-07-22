import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import {
  listEntries,
  createEntry,
  getEntry,
  research,
  patchCapability,
  approveDraft,
  discardDraft,
} from '../controllers/industryVerticalKnowledgeController.js';

const router = express.Router();

// Platform-admin-only — no per-org CTO fallback.
router.get('/',                                                                    protect, adminOnly, listEntries);
router.post('/',                                                                   protect, adminOnly, createEntry);
router.get('/:id',                                                                 protect, adminOnly, getEntry);
router.post('/:id/research',                                                       protect, adminOnly, research);
router.patch('/:id/capability/:capabilityId',                                      protect, adminOnly, patchCapability);
router.post('/:id/capability/:capabilityId/section/:sectionTitle/approve',         protect, adminOnly, approveDraft);
router.post('/:id/capability/:capabilityId/section/:sectionTitle/discard',         protect, adminOnly, discardDraft);

export default router;
