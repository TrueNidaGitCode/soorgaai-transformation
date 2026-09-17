/**
 * POST /api/conformance — run the AI conformance checks against this
 * application and return what they found.
 *
 * Svarg (with a short-lived token of its own) or the person who created the
 * application. Nobody else: each run costs real model calls against this
 * tenant's cap, so an open endpoint is a way to spend somebody's budget.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { ownerOnly } from '../controllers/accessController.js';
import { runReport, svargOrOwner } from '../controllers/conformanceController.js';

const router = express.Router();

router.post('/', svargOrOwner(protect, ownerOnly), runReport);

export default router;
