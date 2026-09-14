/**
 * POST /api/chat        — one question, one answer, with the turns before it.
 * GET  /api/chat/history — the conversation so far, so a reload does not erase it.
 *
 * Both behind the same session guard as everything else the application
 * answers, and history is scoped to the caller's own turns.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { ask, history } from '../controllers/chatController.js';

const router = express.Router();
router.post('/', express.json({ limit: '256kb' }), protect, ask);
router.get('/history', protect, history);
export default router;
