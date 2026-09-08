import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import {
  getBoard, ask, createLead, patchLead, removeLead,
  sendLeadNow, putSequence,
} from '../controllers/salesSignalsController.js';

const router = express.Router();

// Platform-admin-only. This board names customers, objectives, IPs and spend.
router.get('/',                    protect, adminOnly, getBoard);
router.post('/ask',                protect, adminOnly, ask);
router.post('/leads',              protect, adminOnly, createLead);
router.patch('/leads/:id',         protect, adminOnly, patchLead);
router.delete('/leads/:id',        protect, adminOnly, removeLead);
router.put('/leads/:id/sequence',  protect, adminOnly, putSequence);
router.post('/leads/:id/send',     protect, adminOnly, sendLeadNow);

export default router;
