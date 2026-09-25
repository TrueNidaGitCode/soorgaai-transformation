/**
 * The numbers behind the investor page.
 *
 * Platform-admin only. It reports how many customers there are, what they
 * have and have not done with their applications, and what everything has
 * cost — which is a description of the business, not a page anybody outside
 * it should be able to read.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import { getCapitalProof } from '../controllers/capitalController.js';

const router = express.Router();

router.get('/proof', protect, adminOnly, getCapitalProof);

export default router;
