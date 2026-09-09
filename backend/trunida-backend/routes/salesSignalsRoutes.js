import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import {
  getBoard, ask, createLead, patchLead, removeLead, mailStatus,
  sendLeadNow, putSequence, readTemplate, writeTemplate, previewLead, setAccountKind, generateLeadEmail, getMotions,
} from '../controllers/salesSignalsController.js';

const router = express.Router();

// Platform-admin-only. This board names customers, objectives, IPs and spend.
router.get('/',                    protect, adminOnly, getBoard);
router.get('/motions',             protect, adminOnly, getMotions);
router.get('/mail-status',         protect, adminOnly, mailStatus);
router.post('/ask',                protect, adminOnly, ask);
router.post('/leads',              protect, adminOnly, createLead);
router.patch('/leads/:id',         protect, adminOnly, patchLead);
router.delete('/leads/:id',        protect, adminOnly, removeLead);
router.put('/leads/:id/sequence',  protect, adminOnly, putSequence);
router.get('/leads/:id/preview',   protect, adminOnly, previewLead);
router.post('/leads/:id/generate', protect, adminOnly, generateLeadEmail);
router.post('/leads/:id/send',     protect, adminOnly, sendLeadNow);
router.patch('/accounts/:id/kind', protect, adminOnly, setAccountKind);
router.get('/template',            protect, adminOnly, readTemplate);
router.put('/template',            protect, adminOnly, writeTemplate);

export default router;
