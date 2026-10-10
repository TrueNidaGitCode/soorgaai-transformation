/**
 * What left this application: mounted by server.js at /api/egress.
 * Owner-only, every route. See controllers/egressController.js.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireOwner } from '../controllers/dataController.js';
import { summary, list, entry, check, exportLog } from '../controllers/egressController.js';

const router = express.Router();

router.get('/summary', protect, requireOwner, summary);
router.get('/verify', protect, requireOwner, check);
router.get('/export', protect, requireOwner, exportLog);
router.get('/entry/:seq', protect, requireOwner, entry);
router.get('/', protect, requireOwner, list);

export default router;
