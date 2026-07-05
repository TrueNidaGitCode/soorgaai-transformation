/**
 * Unit Tests — dynamicAssessmentController.js
 *
 * Strategy:
 *  - All Mongoose model methods (create, findById) are mocked.
 *  - All service dependencies (discoveryService, questionGenerationService,
 *    dynamicScoringService, kbRetrievalService) are mocked.
 *  - Express req/res objects are created via makeReqRes() helpers.
 *  - No database is started; no real Claude calls are made.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { makeReqRes, makeSampleSession, makeSampleQuestions, makeAnswers }
  from './__fixtures__/session-helpers.js';

// ── Mock Mongoose model ───────────────────────────────────────────────────────
const { mockCreate, mockFindById } = vi.hoisted(() => ({
  mockCreate:   vi.fn(),
  mockFindById: vi.fn(),
}));

vi.mock('../models/AssessmentSession.js', () => ({
  default: {
    create:   mockCreate,
    findById: mockFindById,
  },
}));

// ── Mock service dependencies ─────────────────────────────────────────────────
const { mockDiscoverCompany }    = vi.hoisted(() => ({ mockDiscoverCompany: vi.fn() }));
const { mockGenerateQuestions }  = vi.hoisted(() => ({ mockGenerateQuestions: vi.fn() }));
const { mockComputeScore }       = vi.hoisted(() => ({ mockComputeScore: vi.fn() }));
const { mockRetrieveContext }    = vi.hoisted(() => ({ mockRetrieveContext: vi.fn() }));

vi.mock('../services/discoveryService.js',         () => ({ discoverCompany:   mockDiscoverCompany }));
vi.mock('../services/questionGenerationService.js', () => ({ generateQuestions: mockGenerateQuestions }));
vi.mock('../services/dynamicScoringService.js',    () => ({ computeScore:      mockComputeScore }));
vi.mock('../services/kbRetrievalService.js',       () => ({ retrieveContext:   mockRetrieveContext }));

// ── Import controller AFTER all mocks are registered ─────────────────────────
import {
  startSession,
  discoverDomain,
  generateSessionQuestions,
  submitAnswer,
  getSession,
  scoreSession,
} from '../controllers/dynamicAssessmentController.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const DISCOVERY_RESULT = {
  domain:         'Automotive',
  subDomain:      'Tier-1 Supplier',
  summary:        'A leading Tier-1 automotive supplier.',
  confidence:     0.95,
  welcomeMessage: 'Welcome to SoorgaAI. Bosch is in automotive.',
};

const SCORE_RESULT = {
  focusAreaScores:      [{ focusAreaId: 'ai-strategy', focusAreaName: 'AI Strategy & Vision', score: 60, rawAverage: 3, questionCount: 3 }],
  overallScore:         60,
  maturityStage:        'AI Alignment',
  maturityStageDetails: { stage: 'AI Alignment', minScore: 41, maxScore: 60, description: 'Aligning.' },
};

const KB_CONTEXT = {
  maturityStages: [{ stage: 'AI Scramble' }],
  focusAreas:     [{ id: 'ai-strategy', name: 'AI Strategy & Vision' }],
  domainStudy:    '# Automotive\nSome content.',
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('dynamicAssessmentController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRetrieveContext.mockReturnValue(KB_CONTEXT);
    mockDiscoverCompany.mockResolvedValue(DISCOVERY_RESULT);
    mockComputeScore.mockReturnValue(SCORE_RESULT);
  });

  // ── startSession ────────────────────────────────────────────────────────────

  describe('startSession()', () => {
    it('returns 201 with sessionId on valid input', async () => {
      const session = { _id: 'new-session-id' };
      mockCreate.mockResolvedValue(session);

      const { req, res } = makeReqRes({ name: 'Jane Smith', role: 'CTO / CIO', companyName: 'Bosch' });
      await startSession(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.sessionId).toBe('new-session-id');
    });

    it('creates session with correct fields from request body', async () => {
      mockCreate.mockResolvedValue({ _id: 'sid' });
      const { req, res } = makeReqRes({ name: 'John', role: 'Founder / CEO', companyName: 'Aptiv' });
      await startSession(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'John', role: 'Founder / CEO', companyName: 'Aptiv', status: 'started' }),
      );
    });

    it('allows anonymous sessions (userId is null when no req.user)', async () => {
      mockCreate.mockResolvedValue({ _id: 'sid' });
      const { req, res } = makeReqRes({ name: 'Jane', role: 'CTO / CIO', companyName: 'Bosch' }, {}, null);
      await startSession(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null }),
      );
    });

    it('attaches userId when user is logged in', async () => {
      mockCreate.mockResolvedValue({ _id: 'sid' });
      const { req, res } = makeReqRes(
        { name: 'Jane', role: 'CTO / CIO', companyName: 'Bosch' },
        {},
        { _id: 'user-abc' },
      );
      await startSession(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-abc' }),
      );
    });

    it('returns 400 when name is missing', async () => {
      const { req, res } = makeReqRes({ role: 'CTO / CIO', companyName: 'Bosch' });
      await startSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(false);
    });

    it('returns 400 when role is missing', async () => {
      const { req, res } = makeReqRes({ name: 'Jane', companyName: 'Bosch' });
      await startSession(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when companyName is missing', async () => {
      const { req, res } = makeReqRes({ name: 'Jane', role: 'CTO / CIO' });
      await startSession(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 when database create throws', async () => {
      mockCreate.mockRejectedValue(new Error('DB connection lost'));
      const { req, res } = makeReqRes({ name: 'Jane', role: 'CTO / CIO', companyName: 'Bosch' });
      await startSession(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── discoverDomain ──────────────────────────────────────────────────────────

  describe('discoverDomain()', () => {
    it('returns 200 with domain info on valid session', async () => {
      const session = makeSampleSession({ status: 'started' });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({}, { id: session._id });
      await discoverDomain(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.domain).toBe('Automotive');
      expect(jsonArg.welcomeMessage).toBeDefined();
    });

    it('persists discoveredDomain and updates status to "discovered"', async () => {
      const session = makeSampleSession({ status: 'started' });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({}, { id: session._id });
      await discoverDomain(req, res);

      expect(session.discoveredDomain.domain).toBe('Automotive');
      expect(session.status).toBe('discovered');
      expect(session.save).toHaveBeenCalledOnce();
    });

    it('returns 404 when session not found', async () => {
      mockFindById.mockResolvedValue(null);
      const { req, res } = makeReqRes({}, { id: 'nonexistent' });
      await discoverDomain(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when session status is invalid for discovery', async () => {
      const session = makeSampleSession({ status: 'completed' });
      mockFindById.mockResolvedValue(session);
      const { req, res } = makeReqRes({}, { id: session._id });
      await discoverDomain(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('allows re-discovery when status is "discovered"', async () => {
      const session = makeSampleSession({ status: 'discovered' });
      mockFindById.mockResolvedValue(session);
      const { req, res } = makeReqRes({}, { id: session._id });
      await discoverDomain(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 when discovery service throws', async () => {
      const session = makeSampleSession({ status: 'started' });
      mockFindById.mockResolvedValue(session);
      mockDiscoverCompany.mockRejectedValue(new Error('Claude unavailable'));

      const { req, res } = makeReqRes({}, { id: session._id });
      await discoverDomain(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── generateSessionQuestions ────────────────────────────────────────────────

  describe('generateSessionQuestions()', () => {
    it('returns 200 with generated questions', async () => {
      const session = makeSampleSession({ status: 'discovered', questions: [] });
      mockFindById.mockResolvedValue(session);
      const generatedQuestions = makeSampleQuestions(20);
      mockGenerateQuestions.mockResolvedValue(generatedQuestions);

      const { req, res } = makeReqRes({}, { id: session._id });
      await generateSessionQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.questions).toHaveLength(20);
    });

    it('persists questions and updates status to "questions_generated"', async () => {
      const session = makeSampleSession({ status: 'discovered', questions: [] });
      mockFindById.mockResolvedValue(session);
      mockGenerateQuestions.mockResolvedValue(makeSampleQuestions(20));

      const { req, res } = makeReqRes({}, { id: session._id });
      await generateSessionQuestions(req, res);

      expect(session.questions).toHaveLength(20);
      expect(session.status).toBe('questions_generated');
      expect(session.save).toHaveBeenCalledOnce();
    });

    it('returns cached questions without calling Claude again when already generated', async () => {
      const questions = makeSampleQuestions(20);
      const session   = makeSampleSession({ status: 'questions_generated', questions });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({}, { id: session._id });
      await generateSessionQuestions(req, res);

      expect(mockGenerateQuestions).not.toHaveBeenCalled();
      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.cached).toBe(true);
    });

    it('returns 404 when session not found', async () => {
      mockFindById.mockResolvedValue(null);
      const { req, res } = makeReqRes({}, { id: 'nonexistent' });
      await generateSessionQuestions(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when session is already completed', async () => {
      const session = makeSampleSession({ status: 'completed' });
      mockFindById.mockResolvedValue(session);
      const { req, res } = makeReqRes({}, { id: session._id });
      await generateSessionQuestions(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('calls retrieveContext with the discovered domain', async () => {
      const session = makeSampleSession({
        status: 'discovered',
        questions: [],
        discoveredDomain: { domain: 'Finance', subDomain: 'Banking', summary: '', confidence: 0.9 },
      });
      mockFindById.mockResolvedValue(session);
      mockGenerateQuestions.mockResolvedValue(makeSampleQuestions(20));

      const { req, res } = makeReqRes({}, { id: session._id });
      await generateSessionQuestions(req, res);

      expect(mockRetrieveContext).toHaveBeenCalledWith('Finance');
    });
  });

  // ── submitAnswer ────────────────────────────────────────────────────────────

  describe('submitAnswer()', () => {
    it('returns 200 with progress info on valid answer', async () => {
      const session = makeSampleSession({ status: 'questions_generated', answers: [] });
      mockFindById.mockResolvedValue(session);

      const validQId = session.questions[0].questionId;
      const { req, res } = makeReqRes({ questionId: validQId, value: 3 }, { id: session._id });
      await submitAnswer(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg).toHaveProperty('answered');
      expect(jsonArg).toHaveProperty('total');
      expect(jsonArg).toHaveProperty('remaining');
      expect(jsonArg).toHaveProperty('complete');
    });

    it('persists the answer and updates status to "in_progress"', async () => {
      const session = makeSampleSession({ status: 'questions_generated', answers: [] });
      mockFindById.mockResolvedValue(session);

      const validQId = session.questions[0].questionId;
      const { req, res } = makeReqRes({ questionId: validQId, value: 4 }, { id: session._id });
      await submitAnswer(req, res);

      expect(session.answers).toHaveLength(1);
      expect(session.answers[0].value).toBe(4);
      expect(session.status).toBe('in_progress');
      expect(session.save).toHaveBeenCalledOnce();
    });

    it('overwrites existing answer for the same questionId', async () => {
      const questions = makeSampleQuestions(20);
      const existing  = [{ questionId: questions[0].questionId, value: 2, answeredAt: new Date() }];
      const session   = makeSampleSession({ answers: existing, questions });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes(
        { questionId: questions[0].questionId, value: 5 },
        { id: session._id },
      );
      await submitAnswer(req, res);

      const updated = session.answers.find(a => a.questionId === questions[0].questionId);
      expect(updated.value).toBe(5);
    });

    it('returns 400 when questionId is not in the session', async () => {
      const session = makeSampleSession();
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({ questionId: 'not-a-real-id', value: 3 }, { id: session._id });
      await submitAnswer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when value is below 1', async () => {
      const session  = makeSampleSession({ answers: [] });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes(
        { questionId: session.questions[0].questionId, value: 0 },
        { id: session._id },
      );
      await submitAnswer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when value is above 5', async () => {
      const session = makeSampleSession({ answers: [] });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes(
        { questionId: session.questions[0].questionId, value: 6 },
        { id: session._id },
      );
      await submitAnswer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when value is not an integer', async () => {
      const session = makeSampleSession({ answers: [] });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes(
        { questionId: session.questions[0].questionId, value: 2.5 },
        { id: session._id },
      );
      await submitAnswer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when questionId is missing from body', async () => {
      const session = makeSampleSession({ answers: [] });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({ value: 3 }, { id: session._id });
      await submitAnswer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when session is already completed', async () => {
      const session = makeSampleSession({ status: 'completed' });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes(
        { questionId: session.questions[0].questionId, value: 3 },
        { id: session._id },
      );
      await submitAnswer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when session not found', async () => {
      mockFindById.mockResolvedValue(null);
      const { req, res } = makeReqRes({ questionId: 'q1', value: 3 }, { id: 'nonexistent' });
      await submitAnswer(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('reports complete = true when all questions are answered', async () => {
      const questions = makeSampleQuestions(2);
      const answers   = makeAnswers([questions[0]], 3); // only first answered
      const session   = makeSampleSession({ questions, answers });
      mockFindById.mockResolvedValue(session);

      // Submit the second (last) answer
      const { req, res } = makeReqRes(
        { questionId: questions[1].questionId, value: 4 },
        { id: session._id },
      );
      await submitAnswer(req, res);

      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.complete).toBe(true);
    });
  });

  // ── getSession ──────────────────────────────────────────────────────────────

  describe('getSession()', () => {
    it('returns 200 with session data when session exists', async () => {
      const session = makeSampleSession();
      mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(session) });

      const { req, res } = makeReqRes({}, { id: session._id });
      await getSession(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.session).toBeDefined();
    });

    it('returns 404 when session not found', async () => {
      mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      const { req, res } = makeReqRes({}, { id: 'nonexistent' });
      await getSession(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 when database throws', async () => {
      mockFindById.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) });
      const { req, res } = makeReqRes({}, { id: 'some-id' });
      await getSession(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── scoreSession ────────────────────────────────────────────────────────────

  describe('scoreSession()', () => {
    it('returns 200 with full scorecard on completed session', async () => {
      const session = makeSampleSession({ status: 'in_progress' });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({}, { id: session._id });
      await scoreSession(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.overallScore).toBe(60);
      expect(jsonArg.maturityStage).toBe('AI Alignment');
      expect(jsonArg.focusAreaScores).toBeDefined();
      expect(jsonArg.companyName).toBe('Bosch');
      expect(jsonArg.domain).toBe('Automotive');
    });

    it('persists scores and sets status to "completed"', async () => {
      const session = makeSampleSession({ status: 'in_progress' });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({}, { id: session._id });
      await scoreSession(req, res);

      expect(session.overallScore).toBe(60);
      expect(session.maturityStage).toBe('AI Alignment');
      expect(session.status).toBe('completed');
      expect(session.completedAt).toBeInstanceOf(Date);
      expect(session.save).toHaveBeenCalledOnce();
    });

    it('returns sessionId in the response', async () => {
      const session = makeSampleSession({ status: 'in_progress' });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({}, { id: session._id });
      await scoreSession(req, res);

      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.sessionId).toBe(session._id);
    });

    it('returns 400 when no answers have been submitted', async () => {
      const session = makeSampleSession({ answers: [] });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({}, { id: session._id });
      await scoreSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when session not found', async () => {
      mockFindById.mockResolvedValue(null);
      const { req, res } = makeReqRes({}, { id: 'nonexistent' });
      await scoreSession(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 when computeScore throws', async () => {
      const session = makeSampleSession({ status: 'in_progress' });
      mockFindById.mockResolvedValue(session);
      mockComputeScore.mockImplementation(() => { throw new Error('Scoring failure'); });

      const { req, res } = makeReqRes({}, { id: session._id });
      await scoreSession(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('domain defaults to "Automotive" when discoveredDomain is not set', async () => {
      const session = makeSampleSession({
        status: 'in_progress',
        discoveredDomain: null,
      });
      mockFindById.mockResolvedValue(session);

      const { req, res } = makeReqRes({}, { id: session._id });
      await scoreSession(req, res);

      const jsonArg = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(jsonArg.domain).toBe('Automotive');
    });
  });
});
