/**
 * SoorgaAI — Dynamic Assessment Controller
 *
 * Handles the full lifecycle of a dynamic (v2) assessment session:
 *   startSession    → create session from registration data
 *   discoverDomain  → run Claude discovery, update session
 *   generateQuestions → compose KB + generate questions, persist to session
 *   submitAnswer    → append an answer, update status
 *   getSession      → return current session state (for resume)
 *   computeScore    → score all answers, persist scorecard
 *
 * Routes are mounted under /api/assessment/dynamic (parallel to v1 /api/assessment/*)
 * No existing v1 endpoints are modified.
 */

import AssessmentSession    from '../models/AssessmentSession.js';
import { discoverCompany }  from '../services/discoveryService.js';
import { generateQuestions } from '../services/questionGenerationService.js';
import { computeScore }     from '../services/dynamicScoringService.js';
import { retrieveContext }  from '../services/kbRetrievalService.js';

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions
// Body: { name, role, companyName }
// ─────────────────────────────────────────────────────────────────────────────

export const startSession = async (req, res) => {
  try {
    const { name, role, companyName } = req.body;

    if (!name || !role || !companyName) {
      return res.status(400).json({
        success: false,
        message: 'name, role, and companyName are required.',
      });
    }

    const session = await AssessmentSession.create({
      userId:      req.user?._id || null,  // optional — anonymous allowed
      name:        name.trim(),
      role:        role.trim(),
      companyName: companyName.trim(),
      status:      'started',
    });

    console.log(`✅ Session started: ${session._id} for ${companyName}`);

    return res.status(201).json({
      success:   true,
      sessionId: session._id,
      message:   'Session created. Call /discover next.',
    });

  } catch (err) {
    console.error('startSession error:', err);
    return res.status(500).json({ success: false, message: 'Failed to start session.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/discover
// ─────────────────────────────────────────────────────────────────────────────

export const discoverDomain = async (req, res) => {
  try {
    const session = await AssessmentSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    if (session.status !== 'started' && session.status !== 'discovered') {
      return res.status(400).json({ success: false, message: `Cannot discover: session is in "${session.status}" status.` });
    }

    const result = await discoverCompany(session.companyName);

    session.discoveredDomain = {
      domain:     result.domain,
      subDomain:  result.subDomain,
      summary:    result.summary,
      confidence: result.confidence,
    };
    session.welcomeMessage = result.welcomeMessage;
    session.status         = 'discovered';
    await session.save();

    console.log(`✅ Domain discovered for session ${session._id}: ${result.domain}`);

    return res.status(200).json({
      success:        true,
      sessionId:      session._id,
      domain:         result.domain,
      subDomain:      result.subDomain,
      summary:        result.summary,
      confidence:     result.confidence,
      welcomeMessage: result.welcomeMessage,
    });

  } catch (err) {
    console.error('discoverDomain error:', err);
    return res.status(500).json({ success: false, message: 'Failed to discover company domain.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/questions
// ─────────────────────────────────────────────────────────────────────────────

export const generateSessionQuestions = async (req, res) => {
  try {
    const session = await AssessmentSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    if (session.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Session already completed.' });
    }

    // Return cached questions if already generated
    if (session.questions.length > 0 && session.status !== 'discovered') {
      return res.status(200).json({
        success:   true,
        sessionId: session._id,
        questions: session.questions,
        cached:    true,
      });
    }

    const domain = session.discoveredDomain?.domain || 'Automotive';
    const ctx    = retrieveContext(domain);

    const questions = await generateQuestions({
      companyName:   session.companyName,
      role:          session.role,
      domain,
      subDomain:     session.discoveredDomain?.subDomain || '',
      summary:       session.discoveredDomain?.summary || '',
      maturityStages: ctx.maturityStages,
      focusAreas:    ctx.focusAreas,
      domainStudy:   ctx.domainStudy,
    });

    session.questions = questions;
    session.status    = 'questions_generated';
    await session.save();

    console.log(`✅ ${questions.length} questions generated for session ${session._id}`);

    return res.status(200).json({
      success:       true,
      sessionId:     session._id,
      totalQuestions: questions.length,
      questions,
    });

  } catch (err) {
    console.error('generateSessionQuestions error:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate questions.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/answers
// Body: { questionId, value }
// ─────────────────────────────────────────────────────────────────────────────

export const submitAnswer = async (req, res) => {
  try {
    const { questionId, value } = req.body;
    const session = await AssessmentSession.findById(req.params.id);

    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    if (session.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Session already completed.' });
    }
    if (!questionId || value === undefined) {
      return res.status(400).json({ success: false, message: 'questionId and value are required.' });
    }

    const numValue = Number(value);
    if (!Number.isInteger(numValue) || numValue < 1 || numValue > 5) {
      return res.status(400).json({ success: false, message: 'value must be an integer between 1 and 5.' });
    }

    // Verify question belongs to this session
    const question = session.questions.find(q => q.questionId === questionId);
    if (!question) {
      return res.status(400).json({ success: false, message: `Question "${questionId}" not found in this session.` });
    }

    // Update existing answer or append new
    const existingIdx = session.answers.findIndex(a => a.questionId === questionId);
    if (existingIdx >= 0) {
      session.answers[existingIdx].value      = numValue;
      session.answers[existingIdx].answeredAt = new Date();
    } else {
      session.answers.push({ questionId, value: numValue, answeredAt: new Date() });
    }

    // Update status
    session.status = 'in_progress';
    await session.save();

    const answered = session.answers.length;
    const total    = session.questions.length;

    return res.status(200).json({
      success:   true,
      answered,
      total,
      remaining: total - answered,
      complete:  answered >= total,
    });

  } catch (err) {
    console.error('submitAnswer error:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit answer.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id
// ─────────────────────────────────────────────────────────────────────────────

export const getSession = async (req, res) => {
  try {
    const session = await AssessmentSession.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    return res.status(200).json({ success: true, session });

  } catch (err) {
    console.error('getSession error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch session.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/score
// ─────────────────────────────────────────────────────────────────────────────

export const scoreSession = async (req, res) => {
  try {
    const session = await AssessmentSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    if (session.answers.length === 0) {
      return res.status(400).json({ success: false, message: 'No answers submitted yet.' });
    }

    const { focusAreaScores, overallScore, maturityStage, maturityStageDetails } = computeScore(session);

    session.focusAreaScores = focusAreaScores;
    session.overallScore    = overallScore;
    session.maturityStage   = maturityStage;
    session.status          = 'completed';
    session.completedAt     = new Date();
    await session.save();

    console.log(`✅ Session ${session._id} scored: ${overallScore}/100 — ${maturityStage}`);

    return res.status(200).json({
      success:              true,
      sessionId:            session._id,
      overallScore,
      maturityStage,
      maturityStageDetails,
      focusAreaScores,
      companyName:          session.companyName,
      domain:               session.discoveredDomain?.domain || 'Automotive',
    });

  } catch (err) {
    console.error('scoreSession error:', err);
    return res.status(500).json({ success: false, message: 'Failed to compute score.' });
  }
};
