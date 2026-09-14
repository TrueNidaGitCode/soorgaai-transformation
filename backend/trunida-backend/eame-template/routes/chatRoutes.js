/**
 * POST /api/chat — one question, one answer, with the turns before it.
 * Behind the same session guard as everything else the application answers.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { ask } from '../controllers/chatController.js';

const router = express.Router();
router.post('/', express.json({ limit: '256kb' }), protect, ask);
export default router;
