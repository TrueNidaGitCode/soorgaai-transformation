/**
 * Unit Tests — questionGenerationService.js
 *
 * Strategy:
 *  - @anthropic-ai/sdk is fully mocked — no real network calls.
 *  - dotenv is mocked as a no-op.
 *  - ANTHROPIC_API_KEY presence is controlled per test via vi.resetModules()
 *    + dynamic import to exercise both the Claude and fallback code paths.
 *  - Prompt composition is verified by inspecting what was passed to
 *    mockMessagesCreate (asserting all four KB components are present).
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import FIXTURE_AREAS from './__fixtures__/focus-areas.json';
import {
  QUESTIONS_RESPONSE_VALID,
  QUESTIONS_RESPONSE_TOO_FEW,
  QUESTIONS_RESPONSE_MALFORMED,
  QUESTIONS_RESPONSE_INVALID_FOCUS_IDS,
} from './__fixtures__/claude-responses.js';

// ── Stable mock references ────────────────────────────────────────────────────
const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: mockMessagesCreate };
    }
  },
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// ── Shared fixture params passed to generateQuestions() ──────────────────────
const BASE_PARAMS = {
  companyName:    'Bosch',
  role:           'CTO / CIO',
  domain:         'Automotive',
  subDomain:      'Tier-1 Supplier',
  summary:        'A leading Tier-1 automotive supplier.',
  maturityStages: [
    { stage: 'AI Scramble', minScore: 0,  maxScore: 20,  tagline: 'Ad hoc.' },
    { stage: 'AI Pivot',    minScore: 21, maxScore: 40,  tagline: 'Pivoting.' },
    { stage: 'AI Alignment',minScore: 41, maxScore: 60,  tagline: 'Aligning.' },
    { stage: 'AI Transform',minScore: 61, maxScore: 80,  tagline: 'Transforming.' },
    { stage: 'AI-Fueled Enterprise', minScore: 81, maxScore: 100, tagline: 'Leading.' },
  ],
  focusAreas:     FIXTURE_AREAS.focusAreas,
  domainStudy:    '# Automotive\nAI in automotive is transforming ADAS, manufacturing, and aftersales.',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function importWithApiKey() {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = 'test-key-xyz';
  return import('../services/questionGenerationService.js');
}

async function importWithoutApiKey() {
  vi.resetModules();
  delete process.env.ANTHROPIC_API_KEY;
  return import('../services/questionGenerationService.js');
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('questionGenerationService — generateQuestions()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  // ── No-API-key → template fallback ─────────────────────────────────────────

  describe('when ANTHROPIC_API_KEY is not set', () => {
    it('returns exactly 20 template questions without calling Claude', async () => {
      const { generateQuestions } = await importWithoutApiKey();
      const questions = await generateQuestions(BASE_PARAMS);

      expect(mockMessagesCreate).not.toHaveBeenCalled();
      expect(questions).toHaveLength(20);
    });

    it('every template question has the required contract fields', async () => {
      const { generateQuestions } = await importWithoutApiKey();
      const questions = await generateQuestions(BASE_PARAMS);

      for (const q of questions) {
        expect(q).toHaveProperty('questionId');
        expect(q).toHaveProperty('text');
        expect(q).toHaveProperty('focusAreaId');
        expect(q).toHaveProperty('stageHint');
        expect(q).toHaveProperty('options');
        expect(q).toHaveProperty('weight');
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options).toHaveLength(5);
      }
    });

    it('template question IDs are unique', async () => {
      const { generateQuestions } = await importWithoutApiKey();
      const questions = await generateQuestions(BASE_PARAMS);
      const ids = questions.map(q => q.questionId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('template questions cover all 7 focus areas', async () => {
      const { generateQuestions } = await importWithoutApiKey();
      const questions = await generateQuestions(BASE_PARAMS);
      const usedFocusAreas = new Set(questions.map(q => q.focusAreaId));
      const expectedAreas = ['ai-strategy', 'leadership', 'ai-use-cases', 'data-readiness', 'technology', 'skills-workforce', 'governance'];
      for (const id of expectedAreas) {
        expect(usedFocusAreas.has(id)).toBe(true);
      }
    });

    it('each option has value (number) and label (string)', async () => {
      const { generateQuestions } = await importWithoutApiKey();
      const questions = await generateQuestions(BASE_PARAMS);
      for (const q of questions) {
        for (const opt of q.options) {
          expect(typeof opt.value).toBe('number');
          expect(typeof opt.label).toBe('string');
          expect(opt.value).toBeGreaterThanOrEqual(1);
          expect(opt.value).toBeLessThanOrEqual(5);
        }
      }
    });
  });

  // ── Happy path: Claude returns 20 valid questions ───────────────────────────

  describe('when Claude returns a valid 20-question response', () => {
    it('returns exactly 20 questions', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      const questions = await generateQuestions(BASE_PARAMS);

      expect(questions).toHaveLength(20);
    });

    it('every question has required contract fields', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      const questions = await generateQuestions(BASE_PARAMS);

      for (const q of questions) {
        expect(q).toHaveProperty('questionId');
        expect(q).toHaveProperty('text');
        expect(q).toHaveProperty('focusAreaId');
        expect(q).toHaveProperty('stageHint');
        expect(q).toHaveProperty('options');
        expect(q).toHaveProperty('weight');
        expect(q.options).toHaveLength(5);
      }
    });

    it('option values are numbers (not strings)', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      const questions = await generateQuestions(BASE_PARAMS);

      for (const q of questions) {
        for (const opt of q.options) {
          expect(typeof opt.value).toBe('number');
        }
      }
    });

    it('caps response at 20 questions even if Claude returns more', async () => {
      const { generateQuestions } = await importWithApiKey();
      // Build a response with 25 questions
      const manyQuestions = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            questions: Array.from({ length: 25 }, (_, i) => ({
              questionId: `q${i + 1}`,
              text: `Question ${i + 1}`,
              focusAreaId: 'ai-strategy',
              stageHint: '',
              options: [1,2,3,4,5].map(v => ({ value: v, label: `L${v}` })),
            })),
          }),
        }],
      };
      mockMessagesCreate.mockResolvedValue(manyQuestions);

      const questions = await generateQuestions(BASE_PARAMS);

      expect(questions.length).toBeLessThanOrEqual(20);
    });

    it('remaps invalid focusAreaId to the first valid focus area id', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_INVALID_FOCUS_IDS);

      const questions = await generateQuestions(BASE_PARAMS);

      for (const q of questions) {
        const validIds = FIXTURE_AREAS.focusAreas.map(f => f.id);
        expect(validIds).toContain(q.focusAreaId);
      }
    });

    it('assigns weight of 1 to every question', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      const questions = await generateQuestions(BASE_PARAMS);

      for (const q of questions) {
        expect(q.weight).toBe(1);
      }
    });
  });

  // ── Prompt composition verification ────────────────────────────────────────

  describe('prompt composition', () => {
    it('prompt contains company name', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      await generateQuestions(BASE_PARAMS);

      const promptContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
      expect(promptContent).toContain('Bosch');
    });

    it('prompt contains the role', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      await generateQuestions(BASE_PARAMS);

      const promptContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
      expect(promptContent).toContain('CTO / CIO');
    });

    it('prompt contains the domain', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      await generateQuestions(BASE_PARAMS);

      const promptContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
      expect(promptContent).toContain('Automotive');
    });

    it('prompt contains maturity stage names', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      await generateQuestions(BASE_PARAMS);

      const promptContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
      expect(promptContent).toContain('AI Scramble');
      expect(promptContent).toContain('AI-Fueled Enterprise');
    });

    it('prompt contains focus area IDs', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      await generateQuestions(BASE_PARAMS);

      const promptContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
      expect(promptContent).toContain('ai-strategy');
      expect(promptContent).toContain('governance');
    });

    it('prompt contains domain study excerpt', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      await generateQuestions(BASE_PARAMS);

      const promptContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
      expect(promptContent).toContain('Automotive');
    });

    it('uses claude-sonnet-4-6 model', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_VALID);

      await generateQuestions(BASE_PARAMS);

      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-6');
    });
  });

  // ── Claude API failure → template fallback ──────────────────────────────────

  describe('when Claude API fails', () => {
    it('returns 20 template questions when Claude throws', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockRejectedValue(new Error('Network timeout'));

      const questions = await generateQuestions(BASE_PARAMS);

      expect(questions).toHaveLength(20);
    });

    it('returns template fallback when Claude returns malformed JSON', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_MALFORMED);

      const questions = await generateQuestions(BASE_PARAMS);

      expect(questions).toHaveLength(20);
    });

    it('returns template fallback when Claude returns fewer than 5 valid questions', async () => {
      const { generateQuestions } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(QUESTIONS_RESPONSE_TOO_FEW);

      const questions = await generateQuestions(BASE_PARAMS);

      // Falls back to full 20-question template
      expect(questions).toHaveLength(20);
    });

    it('filters out questions missing required fields before threshold check', async () => {
      const { generateQuestions } = await importWithApiKey();
      // Response with questions missing `text` — should be filtered out → < 5 → fallback
      mockMessagesCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            questions: [
              { questionId: 'q1', focusAreaId: 'ai-strategy', options: [1,2,3,4,5].map(v => ({ value: v, label: `L${v}` })) },
            ],
          }),
        }],
      });

      const questions = await generateQuestions(BASE_PARAMS);
      expect(questions).toHaveLength(20);
    });
  });
});
