/**
 * GET    /api/access         — who can use this application, and how much room is left
 * POST   /api/access         — let somebody in
 * DELETE /api/access/:email  — take access away, and the seat back with it
 *
 * All three are for the person who created the application. A colleague with a
 * session can use it; only the owner decides who else may.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { listAccess, grantAccess, revokeAccess, ownerOnly } from '../controllers/accessController.js';

const router = express.Router();

router.get   ('/',       protect, ownerOnly, listAccess);
router.post  ('/',       protect, ownerOnly, express.json({ limit: '8kb' }), grantAccess);
router.delete('/:email', protect, ownerOnly, revokeAccess);

export default router;
