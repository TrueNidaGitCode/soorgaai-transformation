/**
 * /api/patterns — churn patterns learned from this business's own customers.
 *
 * Reading is anyone signed in, like the findings: the people who would call a
 * customer should see why they were flagged. Changing what is learned, and
 * what is watched, is the owner's, like every agent write.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { ownerOnly } from '../controllers/accessController.js';
import {
  listPatternsHandler, putDefinitionHandler, learnHandler, approveHandler, dismissHandler,
} from '../controllers/patternsController.js';

const router = express.Router();

router.get ('/',            protect, listPatternsHandler);
router.put ('/definition',  protect, ownerOnly, express.json({ limit: '4kb' }), putDefinitionHandler);
router.post('/learn',       protect, ownerOnly, learnHandler);
router.post('/:id/approve', protect, ownerOnly, express.json({ limit: '1kb' }), approveHandler);
router.post('/:id/dismiss', protect, ownerOnly, dismissHandler);

export default router;
