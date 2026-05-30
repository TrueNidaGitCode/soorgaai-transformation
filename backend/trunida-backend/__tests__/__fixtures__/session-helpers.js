/**
 * Fixture: Helpers to build mock AssessmentSession documents and Express req/res objects.
 */

/** All 7 valid focus area IDs matching focus-areas.json */
export const FOCUS_AREA_IDS = [
  'ai-strategy',
  'leadership',
  'ai-use-cases',
  'data-readiness',
  'technology',
  'skills-workforce',
  'governance',
];

const DEFAULT_OPTIONS = [
  { value: 1, label: 'Not at all' },
  { value: 2, label: 'Minimally' },
  { value: 3, label: 'Partially' },
  { value: 4, label: 'Mostly' },
  { value: 5, label: 'Fully' },
];

/**
 * Build an array of mock questions covering all 7 focus areas.
 * @param {number} count - number of questions (default 20)
 */
export function makeSampleQuestions(count = 20) {
  return Array.from({ length: count }, (_, i) => ({
    questionId: `q${i + 1}`,
    text: `Sample question ${i + 1} — how mature is your AI capability?`,
    focusAreaId: FOCUS_AREA_IDS[i % FOCUS_AREA_IDS.length],
    stageHint: '',
    options: DEFAULT_OPTIONS,
    weight: 1,
  }));
}

/**
 * Build a full set of answers for the given questions at a fixed value.
 * @param {Array}  questions
 * @param {number} value - 1–5
 */
export function makeAnswers(questions, value = 3) {
  return questions.map(q => ({
    questionId: q.questionId,
    value,
    answeredAt: new Date(),
  }));
}

/**
 * Build a mock AssessmentSession document (plain object — NOT a Mongoose instance).
 * Includes a no-op `save` spy so controllers can call await session.save().
 */
export function makeSampleSession(overrides = {}) {
  const questions = makeSampleQuestions(20);
  return {
    _id: 'session-abc-123',
    userId: null,
    name: 'Jane Smith',
    role: 'CTO / CIO',
    companyName: 'Bosch',
    status: 'in_progress',
    discoveredDomain: {
      domain: 'Automotive',
      subDomain: 'Tier-1 Supplier',
      summary: 'A leading Tier-1 automotive supplier.',
      confidence: 0.95,
    },
    welcomeMessage: 'Welcome to SoorgaAI. Bosch operates in the automotive industry.',
    questions,
    answers: makeAnswers(questions, 3),   // all answered at score 3
    focusAreaScores: [],
    overallScore: null,
    maturityStage: null,
    completedAt: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Build mock Express req and res objects for controller tests.
 * @param {object} body   - req.body
 * @param {object} params - req.params
 * @param {object|null} user - req.user (from optionalAuth)
 */
export function makeReqRes(body = {}, params = {}, user = null) {
  const req = { body, params, user };

  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });

  const res = { status, json };

  return { req, res };
}
