/**
 * SoorgaAI — Dynamic Assessment Routes
 *
 * Mounted at: /api/assessment/dynamic
 * Auth: optional (JWT bearer if present links userId; anonymous allowed)
 *
 * Does NOT modify existing /api/assessment/* routes.
 */

import express from 'express';
import {
  startSession,
  discoverDomain,
  generateSessionQuestions,
  submitAnswer,
  getSession,
  scoreSession,
} from '../controllers/dynamicAssessmentController.js';

// Optional auth middleware — attaches req.user if token present, does not block
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST   /api/assessment/dynamic/sessions              — Start session (registration)
router.post('/sessions',                    optionalAuth, startSession);

// POST   /api/assessment/dynamic/sessions/:id/discover — Discover company domain
router.post('/sessions/:id/discover',       optionalAuth, discoverDomain);

// POST   /api/assessment/dynamic/sessions/:id/questions — Generate questions
router.post('/sessions/:id/questions',      optionalAuth, generateSessionQuestions);

// POST   /api/assessment/dynamic/sessions/:id/answers   — Submit one answer
router.post('/sessions/:id/answers',        optionalAuth, submitAnswer);

// GET    /api/assessment/dynamic/sessions/:id           — Get session state
router.get('/sessions/:id',                 optionalAuth, getSession);

// POST   /api/assessment/dynamic/sessions/:id/score     — Compute final score
router.post('/sessions/:id/score',          optionalAuth, scoreSession);

export default router;
