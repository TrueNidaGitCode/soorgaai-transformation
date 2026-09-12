/**
 * Svarg — LLM Gateway routes
 *
 * Mounted at /api/gateway/v1 so a hosted application can point an OpenAI SDK
 * straight at it. No `protect` here on purpose: these are authenticated by a
 * per-deployment token inside the controller, not by a user session.
 */

import express from 'express';
import { chatCompletions, embeddings, signals } from '../controllers/gatewayController.js';

const router = express.Router();

router.post('/chat/completions', chatCompletions);
router.post('/embeddings',       embeddings);
// What a live application reports about itself. Small JSON; the default
// body limit is plenty and anything larger is not a batch of signals.
router.post('/signals',          express.json({ limit: '256kb' }), signals);

export default router;
