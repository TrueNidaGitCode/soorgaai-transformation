/**
 * Svarg — billing routes
 *
 * Mounted at /api/billing. No payment routes yet: there is no checkout and no
 * webhook, so nothing here takes money. What it does is tell an account what
 * it is on, let it retire an objective it no longer wants counted, ask for a
 * bigger plan, and cancel.
 *
 * Upgrade and cancel record a decision rather than moving money. That is the
 * honest shape while there is no checkout: a button that appears to upgrade an
 * account and silently does nothing is worse than one that says a person will
 * follow up.
 */

import express from 'express';
import protect from '../middleware/authMiddleware.js';
import adminOnly from '../middleware/adminMiddleware.js';
import {
  getMyPlan, setArchived, adminSetPlan, adminGetUsage,
  requestUpgrade, cancelSubscription, resumeSubscription,
} from '../controllers/billingController.js';

const router = express.Router();

router.get ('/plan',                   protect, getMyPlan);
router.post('/archive/:blueprintId',   protect, setArchived);

// Asking for more, and stopping. Neither takes money — there is no checkout —
// so both record a decision and say plainly what happens next.
router.post('/upgrade-request',        protect, express.json({ limit: '8kb' }), requestUpgrade);
router.post('/cancel',                 protect, cancelSubscription);
router.post('/resume',                 protect, resumeSubscription);

// Admin. The only way onto a paid tier until Razorpay exists.
router.put ('/admin/plan',  protect, adminOnly, adminSetPlan);
router.get ('/admin/usage', protect, adminOnly, adminGetUsage);

export default router;
