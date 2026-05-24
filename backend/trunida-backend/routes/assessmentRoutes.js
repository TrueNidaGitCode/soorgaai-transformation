/**
 * SoorgaAI - Assessment Routes
 *
 * Public:
 *   GET  /api/assessment/questions        → All domains + questions
 *
 * Authenticated:
 *   POST /api/assessment/submit           → Submit answers, get score
 *   GET  /api/assessment/results/:id      → Get scores for an assessment
 *   POST /api/assessment/report/:id       → Generate AI report
 *   GET  /api/assessment/report/:id       → Fetch existing AI report
 *   GET  /api/assessment/my-assessments   → User's assessment history
 *
 * Admin only:
 *   GET  /api/assessment/admin/all        → All users' assessments + stats
 */

import express from 'express';
import { protect }      from '../middleware/authMiddleware.js';
import { adminOnly }    from '../middleware/adminMiddleware.js';
import {
  getQuestions,
  submitAssessment,
  getAssessmentResults,
  generateReport,
  getReport,
  getUserAssessments,
  getAllAssessmentsAdmin,
} from '../controllers/assessmentController.js';

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get('/questions', getQuestions);

// ── Authenticated ─────────────────────────────────────────
router.post('/submit',                  protect, submitAssessment);
router.get('/my-assessments',           protect, getUserAssessments);
router.get('/results/:id',              protect, getAssessmentResults);
router.post('/report/:id',              protect, generateReport);
router.get('/report/:id',              protect, getReport);

// ── Admin only ────────────────────────────────────────────
router.get('/admin/all',                protect, adminOnly, getAllAssessmentsAdmin);

export default router;
