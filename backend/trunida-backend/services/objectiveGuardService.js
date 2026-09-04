/**
 * Svarg — Business Objective Guard
 *
 * A full blueprint run is six domains and roughly sixteen capability
 * generations. On 2026-08-17 one user triggered four complete runs in eleven
 * minutes, two of them from the objective "what can you do?" — a question
 * about the product, not a business objective. Nothing stopped them, and the
 * cost was identical to four real blueprints.
 *
 * This runs once, before anything is created, and costs a fraction of one
 * capability. Two stages, cheapest first:
 *
 *   1. Free heuristics — catch the obvious cases with no API call at all.
 *   2. One small classification call — for everything the heuristics cannot
 *      decide, because "we want to reduce support costs" and "how do I use
 *      this" are not separable by pattern matching.
 *
 * It fails OPEN. A guard that wrongly blocks a real customer's objective is
 * far worse than one that occasionally lets a bad one through: the first
 * loses a customer, the second wastes a few cents.
 */

import { generate } from './llmService.js';

/** Below this, no objective carries enough signal to generate against. */
const MIN_MEANINGFUL_LENGTH = 25;

/**
 * Questions about the product itself. These are the ones actually seen, and
 * the point is not to enumerate every phrasing — the classifier handles the
 * long tail — but to reject the common ones for free.
 */
const PRODUCT_QUESTIONS = [
  /^what can you do\b/i,
  /^what do you do\b/i,
  /^who are you\b/i,
  /^how (do|does) (this|it|you) work\b/i,
  /^what is this\b/i,
  /^help\b\.?$/i,
  /^test\b\.?$/i,
  /^hi\b|^hello\b|^hey\b/i,
];

/**
 * @typedef {{ ok: boolean, reason: string, suggestion: string }} GuardResult
 */

/** @returns {GuardResult} */
function heuristicVerdict(objective) {
  const text = objective.trim();

  if (text.length < MIN_MEANINGFUL_LENGTH) {
    return {
      ok: false,
      reason: 'That is too short to build a blueprint from.',
      suggestion: 'Describe what your business does and the problem you want AI to help with — a couple of sentences is enough.',
    };
  }

  if (PRODUCT_QUESTIONS.some(re => re.test(text))) {
    return {
      ok: false,
      reason: 'That reads as a question about Svarg rather than an objective for your business.',
      suggestion: 'Tell us what your organisation does and where the effort or cost is today. Ask Cob directly if you want to know what Svarg can do.',
    };
  }

  // A single short question with no statement of business context.
  if (/\?$/.test(text) && text.length < 80 && !/\.\s/.test(text)) {
    return {
      ok: false,
      reason: 'That is a question rather than a business objective.',
      suggestion: 'Describe the situation you want to improve — what your business does, and what is expensive or slow about it today.',
    };
  }

  return { ok: true, reason: '', suggestion: '' };
}

/**
 * Decide whether an objective is worth a full generation run.
 *
 * @param {string} objective
 * @returns {Promise<GuardResult>}
 */
export async function checkObjective(objective) {
  const cheap = heuristicVerdict(objective);
  if (!cheap.ok) return cheap;

  // Anything long enough and not obviously a product question goes to one
  // small call. This is the case the heuristics genuinely cannot judge.
  try {
    const { text } = await generate({
      systemPrompt:
`You decide whether a submitted text is a BUSINESS OBJECTIVE that an AI transformation blueprint can be built from.

It qualifies if it describes an organisation, a business situation, a problem, a process, or an outcome someone wants — even if brief, informal, or imperfectly worded. Be generous: real customers write badly.

It does NOT qualify if it is a question about the product or assistant, a greeting, a test string, nonsense, or a request for general information with no business context.

Respond with ONLY compact JSON, no other text:
{"isBusinessObjective": true|false, "reason": "<one short sentence, under 15 words>"}`,
      userMessage: objective,
      maxTokens: 200,
      label: 'objective-guard',
    });

    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON in guard response');
    const parsed = JSON.parse(m[0]);

    if (parsed.isBusinessObjective === false) {
      return {
        ok: false,
        reason: String(parsed.reason || 'That does not read as a business objective.').slice(0, 200),
        suggestion: 'Describe what your organisation does and the problem you want AI to help with.',
      };
    }
    return { ok: true, reason: '', suggestion: '' };
  } catch (err) {
    // Fail open — see the header. A blocked real customer costs more than a
    // wasted run.
    console.warn('[objectiveGuard] classification unavailable, allowing:', err.message);
    return { ok: true, reason: '', suggestion: '' };
  }
}
