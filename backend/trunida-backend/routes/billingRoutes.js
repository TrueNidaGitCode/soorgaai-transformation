/**
 * Svarg — billing routes
 *
 * Mounted at /api/billing. No payment routes yet: there is no checkout and no
 * webhook, so nothing here takes money. What it does is tell an account what
 * it is on and let it retire an objective it no longer wants counted.
 */

import express from 'express';
import protect from '../middleware/authMiddleware.js';
import adminOnly from '../middleware/adminMiddleware.js';
import {
  getMyPlan, setArchived, adminSetPlan, adminGetUsage,
} from '../controllers/billingController.js';

const router = express.Router();

router.get ('/plan',                   protect, getMyPlan);
router.post('/archive/:blueprintId',   protect, setArchived);

// Admin. The only way onto a paid tier until Razorpay exists.
router.put ('/admin/plan',  protect, adminOnly, adminSetPlan);
router.get ('/admin/usage', protect, adminOnly, adminGetUsage);

export default router;
