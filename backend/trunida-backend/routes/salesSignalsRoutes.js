import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import {
  getBoard, ask, createLead, patchLead, removeLead, mailStatus,
  sendLeadNow, putSequence, readTemplate, writeTemplate, previewLead, setAccountKind, generateLeadEmail, getMotions,
  getDeck,
} from '../controllers/salesSignalsController.js';
import {
  getIcp, getIcpCounts, postInterview, patchInterview, postFill, patchCell, deleteInterview,
  postFindWedge, postLockWedge,
} from '../controllers/icpInterviewController.js';

const router = express.Router();

// Platform-admin-only. This board names customers, objectives, IPs and spend.
router.get('/',                    protect, adminOnly, getBoard);
router.get('/motions',             protect, adminOnly, getMotions);
// The deck's live half: what the product is and how much of it is used.
router.get('/deck',                protect, adminOnly, getDeck);
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

// ICP interviews: four answers, the playbook the AI fills from them, and the
// wedge found across a vertical. See icpInterviewService.
router.get('/icp',                         protect, adminOnly, getIcp);
router.get('/icp/counts',                  protect, adminOnly, getIcpCounts);
router.post('/icp/interviews',             protect, adminOnly, postInterview);
router.patch('/icp/interviews/:id',        protect, adminOnly, patchInterview);
router.delete('/icp/interviews/:id',       protect, adminOnly, deleteInterview);
router.post('/icp/interviews/:id/fill',    protect, adminOnly, postFill);
router.patch('/icp/interviews/:id/cells/:key', protect, adminOnly, patchCell);
router.post('/icp/wedge/:vertical/find',   protect, adminOnly, postFindWedge);
router.post('/icp/wedge/:vertical/lock',   protect, adminOnly, postLockWedge);

export default router;
