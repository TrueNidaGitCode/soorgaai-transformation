/**
 * Unit Tests — dynamicScoringService.js
 *
 * Strategy:
 *  - kbRetrievalService is mocked so scoring is fully isolated from the filesystem.
 *  - Tests cover the full scoring formula, each stage boundary, weighted scoring,
 *    partial answers, and the no-answers edge case.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { makeSampleQuestions, makeAnswers } from './__fixtures__/session-helpers.js';
import FIXTURE_STAGES from './__fixtures__/maturity-stages.json';
import FIXTURE_AREAS  from './__fixtures__/focus-areas.json';

// ── Mock kbRetrievalService ───────────────────────────────────────────────────
const { mockGetMaturityStages, mockGetFocusAreas } = vi.hoisted(() => ({
  mockGetMaturityStages: vi.fn(),
  mockGetFocusAreas:     vi.fn(),
}));

vi.mock('../services/kbRetrievalService.js', () => ({
  getMaturityStages: mockGetMaturityStages,
  getFocusAreas:     mockGetFocusAreas,
}));

// ── Import the service AFTER the mock is registered ──────────────────────────
import { computeScore } from '../services/dynamicScoringService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal mock session with N questions all answered at `value`. */
function makeSession(answerValue = 3, questionCount = 20, overrides = {}) {
  const questions = makeSampleQuestions(questionCount);
  const answers   = makeAnswers(questions, answerValue);
  return { questions, answers, ...overrides };
}

/** Build a session where only `answeredCount` questions are answered. */
function makePartialSession(totalQuestions = 20, answeredCount = 10, value = 3) {
  const questions = makeSampleQuestions(totalQuestions);
  const answers   = questions
    .slice(0, answeredCount)
    .map(q => ({ questionId: q.questionId, value, answeredAt: new Date() }));
  return { questions, answers };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('dynamicScoringService — computeScore()', () => {
  beforeEach(() => {
    mockGetMaturityStages.mockReturnValue({ stages: FIXTURE_STAGES.stages });
    mockGetFocusAreas.mockReturnValue({ focusAreas: FIXTURE_AREAS.focusAreas });
  });

  // ── Return shape ────────────────────────────────────────────────────────────

  describe('return shape', () => {
    it('returns all four required top-level fields', () => {
      const session = makeSession(3);
      const result  = computeScore(session);

      expect(result).toHaveProperty('focusAreaScores');
      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('maturityStage');
      expect(result).toHaveProperty('maturityStageDetails');
    });

    it('focusAreaScores is an array with expected item shape', () => {
      const session = makeSession(3);
      const { focusAreaScores } = computeScore(session);

      expect(Array.isArray(focusAreaScores)).toBe(true);
      for (const fa of focusAreaScores) {
        expect(fa).toHaveProperty('focusAreaId');
        expect(fa).toHaveProperty('focusAreaName');
        expect(fa).toHaveProperty('score');
        expect(fa).toHaveProperty('rawAverage');
        expect(fa).toHaveProperty('questionCount');
      }
    });

    it('overallScore is a number between 0 and 100', () => {
      const session = makeSession(3);
      const { overallScore } = computeScore(session);

      expect(typeof overallScore).toBe('number');
      expect(overallScore).toBeGreaterThanOrEqual(0);
      expect(overallScore).toBeLessThanOrEqual(100);
    });

    it('maturityStageDetails matches a known stage', () => {
      const session = makeSession(3);
      const { maturityStageDetails } = computeScore(session);

      expect(maturityStageDetails).toHaveProperty('stage');
      expect(maturityStageDetails).toHaveProperty('minScore');
      expect(maturityStageDetails).toHaveProperty('maxScore');
      expect(maturityStageDetails).toHaveProperty('description');
    });

    it('maturityStage string matches maturityStageDetails.stage', () => {
      const session = makeSession(3);
      const { maturityStage, maturityStageDetails } = computeScore(session);

      expect(maturityStage).toBe(maturityStageDetails.stage);
    });
  });

  // ── Scoring formula ─────────────────────────────────────────────────────────

  describe('scoring formula', () => {
    it('all answers = 5 → overallScore = 100', () => {
      const session = makeSession(5);
      const { overallScore } = computeScore(session);
      expect(overallScore).toBe(100);
    });

    it('all answers = 1 → overallScore = 20', () => {
      const session = makeSession(1);
      const { overallScore } = computeScore(session);
      expect(overallScore).toBe(20);
    });

    it('all answers = 3 → overallScore = 60', () => {
      const session = makeSession(3);
      const { overallScore } = computeScore(session);
      expect(overallScore).toBe(60);
    });

    it('focus area score = (rawAverage / 5) × 100', () => {
      // Use single-question sessions per focus area for predictable math
      const questions = [{ questionId: 'q1', focusAreaId: 'ai-strategy', weight: 1, text: '', stageHint: '', options: [] }];
      const answers   = [{ questionId: 'q1', value: 4, answeredAt: new Date() }];
      const { focusAreaScores } = computeScore({ questions, answers });

      const strategyScore = focusAreaScores.find(f => f.focusAreaId === 'ai-strategy');
      // (4 / 5) * 100 = 80
      expect(strategyScore.score).toBe(80);
      expect(strategyScore.rawAverage).toBe(4);
    });

    it('weighted scoring: higher-weight questions have more influence', () => {
      const questions = [
        { questionId: 'q1', focusAreaId: 'ai-strategy', weight: 2, text: '', stageHint: '', options: [] },
        { questionId: 'q2', focusAreaId: 'ai-strategy', weight: 1, text: '', stageHint: '', options: [] },
      ];
      // q1 (weight 2) answered 5, q2 (weight 1) answered 1
      // rawAverage = (5*2 + 1*1) / (2+1) = 11/3 ≈ 3.667 → score ≈ 73.3
      const answers = [
        { questionId: 'q1', value: 5, answeredAt: new Date() },
        { questionId: 'q2', value: 1, answeredAt: new Date() },
      ];
      const { focusAreaScores } = computeScore({ questions, answers });

      const strategyScore = focusAreaScores.find(f => f.focusAreaId === 'ai-strategy');
      // Weighted raw average = (10 + 1) / 3 = 3.667
      expect(strategyScore.rawAverage).toBeCloseTo(3.67, 1);
      expect(strategyScore.score).toBeCloseTo(73.3, 1);
    });

    it('focus area score is rounded to 1 decimal place', () => {
      const questions = [
        { questionId: 'q1', focusAreaId: 'ai-strategy', weight: 1, text: '', stageHint: '', options: [] },
        { questionId: 'q2', focusAreaId: 'ai-strategy', weight: 1, text: '', stageHint: '', options: [] },
        { questionId: 'q3', focusAreaId: 'ai-strategy', weight: 1, text: '', stageHint: '', options: [] },
      ];
      // avg = (1+2+3)/3 = 2 → score = 40.0 (clean)
      const answers = questions.map((q, i) => ({ questionId: q.questionId, value: i + 1, answeredAt: new Date() }));
      const { focusAreaScores } = computeScore({ questions, answers });

      const score = focusAreaScores.find(f => f.focusAreaId === 'ai-strategy').score;
      // Should be a number with at most 1 decimal
      expect(score.toString()).toMatch(/^\d+(\.\d)?$/);
    });
  });

  // ── Maturity stage classification at boundaries ────────────────────────────

  describe('maturity stage classification at score boundaries', () => {
    // Helper: build a session that forces a specific overallScore
    // by using a single focus area with a single question
    function sessionForScore(targetScore) {
      // targetScore = (value / 5) * 100 → value = targetScore * 5 / 100
      // Use questions that all map to 'ai-strategy' to get predictable overall score
      const value = (targetScore / 100) * 5;
      const questions = [{ questionId: 'q1', focusAreaId: 'ai-strategy', weight: 1, text: '', stageHint: '', options: [] }];
      const answers   = [{ questionId: 'q1', value, answeredAt: new Date() }];
      return { questions, answers };
    }

    it('score = 0 → AI Scramble', () => {
      const { maturityStage } = computeScore(sessionForScore(0));
      expect(maturityStage).toBe('AI Scramble');
    });

    it('score = 20 → AI Scramble (upper boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(20));
      expect(maturityStage).toBe('AI Scramble');
    });

    it('score = 21 → AI Pivot (lower boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(21));
      expect(maturityStage).toBe('AI Pivot');
    });

    it('score = 40 → AI Pivot (upper boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(40));
      expect(maturityStage).toBe('AI Pivot');
    });

    it('score = 41 → AI Alignment (lower boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(41));
      expect(maturityStage).toBe('AI Alignment');
    });

    it('score = 60 → AI Alignment (upper boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(60));
      expect(maturityStage).toBe('AI Alignment');
    });

    it('score = 61 → AI Transform (lower boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(61));
      expect(maturityStage).toBe('AI Transform');
    });

    it('score = 80 → AI Transform (upper boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(80));
      expect(maturityStage).toBe('AI Transform');
    });

    it('score = 81 → AI-Fueled Enterprise (lower boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(81));
      expect(maturityStage).toBe('AI-Fueled Enterprise');
    });

    it('score = 100 → AI-Fueled Enterprise (upper boundary)', () => {
      const { maturityStage } = computeScore(sessionForScore(100));
      expect(maturityStage).toBe('AI-Fueled Enterprise');
    });
  });

  // ── Partial answers ─────────────────────────────────────────────────────────

  describe('partial answers', () => {
    it('only scores focus areas that have at least one answered question', () => {
      // Answer only first 7 questions (one per focus area)
      const questions = makeSampleQuestions(20);
      const answers   = questions
        .slice(0, 7)
        .map((q, i) => ({ questionId: q.questionId, value: 3, answeredAt: new Date() }));

      const { focusAreaScores } = computeScore({ questions, answers });

      // Each of the 7 focus areas has at least 1 answered question
      expect(focusAreaScores.length).toBeGreaterThan(0);
      expect(focusAreaScores.length).toBeLessThanOrEqual(7);
    });

    it('questionCount in each focus area reflects only answered questions', () => {
      const questions = makeSampleQuestions(14); // 2 per focus area
      // Answer only first question per focus area
      const answers   = questions
        .filter((_, i) => i % 2 === 0)
        .map(q => ({ questionId: q.questionId, value: 4, answeredAt: new Date() }));

      const { focusAreaScores } = computeScore({ questions, answers });

      for (const fa of focusAreaScores) {
        expect(fa.questionCount).toBe(1);
      }
    });
  });

  // ── No answers edge case ────────────────────────────────────────────────────

  describe('when there are no answers', () => {
    it('returns overallScore of 0', () => {
      const session = { questions: makeSampleQuestions(20), answers: [] };
      const { overallScore } = computeScore(session);
      expect(overallScore).toBe(0);
    });

    it('returns an empty focusAreaScores array', () => {
      const session = { questions: makeSampleQuestions(20), answers: [] };
      const { focusAreaScores } = computeScore(session);
      expect(focusAreaScores).toHaveLength(0);
    });

    it('defaults to AI Scramble stage when score is 0', () => {
      const session = { questions: makeSampleQuestions(20), answers: [] };
      const { maturityStage } = computeScore(session);
      expect(maturityStage).toBe('AI Scramble');
    });
  });

  // ── Empty questions array ───────────────────────────────────────────────────

  describe('when there are no questions', () => {
    it('returns overallScore of 0 and empty focusAreaScores', () => {
      const { overallScore, focusAreaScores } = computeScore({ questions: [], answers: [] });
      expect(overallScore).toBe(0);
      expect(focusAreaScores).toHaveLength(0);
    });
  });
});
