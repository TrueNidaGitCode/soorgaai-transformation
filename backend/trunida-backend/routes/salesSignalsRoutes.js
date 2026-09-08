import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import { getBoard, ask } from '../controllers/salesSignalsController.js';

const router = express.Router();

// Platform-admin-only. This board names customers, objectives and spend.
router.get('/',     protect, adminOnly, getBoard);
router.post('/ask', protect, adminOnly, ask);

export default router;
