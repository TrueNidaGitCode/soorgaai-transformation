/**
 * Signals: mounted by server.js at /api/signals.
 *
 * Feedback is any signed-in session's to give; the report of what leaves
 * this application is the owner's to read.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireOwner } from '../controllers/dataController.js';
import { feedback, report } from '../controllers/signalController.js';

const router = express.Router();

router.post('/feedback', protect, express.json(), feedback);
router.get('/', protect, requireOwner, report);

export default router;
