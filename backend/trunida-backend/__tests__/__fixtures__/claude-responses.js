/**
 * Fixture: Canonical Claude API response shapes used across all test files.
 * All responses follow the real @anthropic-ai/sdk message structure.
 */

/** Valid discovery response — Bosch classified as Automotive */
export const DISCOVERY_RESPONSE_AUTOMOTIVE = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      domain: 'Automotive',
      subDomain: 'Tier-1 Supplier',
      summary: 'Bosch is a global Tier-1 automotive supplier specialising in electronics, ADAS, and powertrain systems.',
      confidence: 0.95,
    }),
  }],
};

/** Valid discovery response — unknown company → Other, low confidence */
export const DISCOVERY_RESPONSE_OTHER_LOW_CONFIDENCE = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      domain: 'Other',
      subDomain: 'Unknown',
      summary: 'Could not determine the primary domain of this company.',
      confidence: 0.3,
    }),
  }],
};

/** Valid discovery response — Finance domain */
export const DISCOVERY_RESPONSE_FINANCE = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      domain: 'Finance',
      subDomain: 'Investment Banking',
      summary: 'A leading investment bank operating across capital markets.',
      confidence: 0.9,
    }),
  }],
};

/** Discovery response wrapped in markdown fences (Claude occasionally does this) */
export const DISCOVERY_RESPONSE_WITH_MARKDOWN_FENCE = {
  content: [{
    type: 'text',
    text: '```json\n' + JSON.stringify({
      domain: 'Healthcare',
      subDomain: 'Digital Health',
      summary: 'A digital health platform focused on remote patient monitoring.',
      confidence: 0.85,
    }) + '\n```',
  }],
};

/** Malformed discovery response — not valid JSON */
export const DISCOVERY_RESPONSE_MALFORMED = {
  content: [{ type: 'text', text: 'Sorry, I cannot classify this company.' }],
};

/** 20 valid questions for the question generation service */
export const QUESTIONS_RESPONSE_VALID = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      questions: Array.from({ length: 20 }, (_, i) => ({
        questionId: `q${i + 1}`,
        text: `Executive question ${i + 1} for the automotive domain — how mature is your AI capability in this area?`,
        focusAreaId: [
          'ai-strategy', 'leadership', 'ai-use-cases', 'data-readiness',
          'technology', 'skills-workforce', 'governance',
        ][i % 7],
        stageHint: 'AI Alignment',
        options: [
          { value: 1, label: 'Not started' },
          { value: 2, label: 'In early exploration' },
          { value: 3, label: 'Pilots underway' },
          { value: 4, label: 'Deployed and scaling' },
          { value: 5, label: 'Industry-leading' },
        ],
      })),
    }),
  }],
};

/** Too few questions — only 3 (below minimum threshold of 5) */
export const QUESTIONS_RESPONSE_TOO_FEW = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      questions: Array.from({ length: 3 }, (_, i) => ({
        questionId: `q${i + 1}`,
        text: `Question ${i + 1}`,
        focusAreaId: 'ai-strategy',
        stageHint: '',
        options: [
          { value: 1, label: 'A' },
          { value: 2, label: 'B' },
          { value: 3, label: 'C' },
          { value: 4, label: 'D' },
          { value: 5, label: 'E' },
        ],
      })),
    }),
  }],
};

/** Malformed question response — not a JSON questions array */
export const QUESTIONS_RESPONSE_MALFORMED = {
  content: [{ type: 'text', text: 'I will now generate questions for you...' }],
};

/** Response with invalid focusAreaIds — should be remapped to first valid id */
export const QUESTIONS_RESPONSE_INVALID_FOCUS_IDS = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      questions: Array.from({ length: 10 }, (_, i) => ({
        questionId: `q${i + 1}`,
        text: `Question ${i + 1}`,
        focusAreaId: 'not-a-valid-focus-area',
        stageHint: '',
        options: [
          { value: 1, label: 'A' },
          { value: 2, label: 'B' },
          { value: 3, label: 'C' },
          { value: 4, label: 'D' },
          { value: 5, label: 'E' },
        ],
      })),
    }),
  }],
};
