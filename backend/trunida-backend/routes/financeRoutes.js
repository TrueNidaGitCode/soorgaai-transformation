import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import { getBom, getPeriods, putAssumptions } from '../controllers/financeController.js';

const router = express.Router();

// Platform-admin-only. This board names every customer beside what they cost
// and what they earn, which is strictly more sensitive than the sales board.
router.get('/', protect, adminOnly, getBom);
router.get('/periods', protect, adminOnly, getPeriods);
router.put('/assumptions', protect, adminOnly, putAssumptions);

export default router;
