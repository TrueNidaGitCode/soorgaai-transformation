/**
 * SoorgaAI - Scoring Engine
 *
 * Calculates:
 *  - Per-domain score (0–100)
 *  - Overall weighted score (0–100)
 *  - Maturity stage (AI Scramble → AI-Fueled Enterprise)
 *
 * Formula:
 *   domain score  = (average raw answer / 5) × 100
 *   overall score = average of all domain scores (equal weights)
 */

import { DOMAINS, MATURITY_STAGES, QUESTION_MAP } from '../data/assessmentQuestions.js';

// ─────────────────────────────────────────────────────────
// SCORE DOMAIN
// ─────────────────────────────────────────────────────────

/**
 * Calculate the score for a single domain.
 * @param {string} domainId
 * @param {Array<{questionId, domainId, value}>} answers - all 35 answers
 * @returns {{ domainId, domainName, score, rawAverage, questionCount }}
 */
function scoreDomain(domainId, answers) {
  const domain = DOMAINS.find((d) => d.id === domainId);
  if (!domain) throw new Error(`Unknown domain: ${domainId}`);

  const domainAnswers = answers.filter((a) => a.domainId === domainId);
  if (domainAnswers.length === 0) {
    return {
      domainId,
      domainName: domain.name,
      score: 0,
      rawAverage: 0,
      questionCount: 0,
    };
  }

  const sum = domainAnswers.reduce((acc, a) => acc + a.value, 0);
  const rawAverage = sum / domainAnswers.length;
  const score = Math.round((rawAverage / 5) * 100 * 10) / 10; // 1 decimal place

  return {
    domainId,
    domainName: domain.name,
    score,
    rawAverage: Math.round(rawAverage * 100) / 100,
    questionCount: domainAnswers.length,
  };
}

// ─────────────────────────────────────────────────────────
// SCORE ALL DOMAINS
// ─────────────────────────────────────────────────────────

/**
 * Calculate scores for all 7 domains.
 * @param {Array} answers - raw answer array from the user submission
 * @returns {Array<DomainScore>}
 */
export function calculateDomainScores(answers) {
  return DOMAINS.map((domain) => scoreDomain(domain.id, answers));
}

// ─────────────────────────────────────────────────────────
// OVERALL SCORE
// ─────────────────────────────────────────────────────────

/**
 * Calculate the overall score as a weighted average of domain scores.
 * All domains carry equal weight (1/7).
 * @param {Array<DomainScore>} domainScores
 * @returns {number} 0–100
 */
export function calculateOverallScore(domainScores) {
  if (!domainScores.length) return 0;
  const total = domainScores.reduce((sum, d) => sum + d.score, 0);
  return Math.round((total / domainScores.length) * 10) / 10;
}

// ─────────────────────────────────────────────────────────
// MATURITY STAGE
// ─────────────────────────────────────────────────────────

/**
 * Determine the maturity stage based on overall score.
 * @param {number} overallScore - 0 to 100
 * @returns {{ stage, description, color, minScore, maxScore }}
 */
export function getMaturityStage(overallScore) {
  const stage = MATURITY_STAGES.find(
    (s) => overallScore >= s.minScore && overallScore <= s.maxScore
  );
  return stage || MATURITY_STAGES[0]; // default to lowest if out of range
}

// ─────────────────────────────────────────────────────────
// VALIDATE ANSWERS
// ─────────────────────────────────────────────────────────

/**
 * Validate and enrich submitted answers.
 * Checks that all 35 questions are answered and values are valid.
 * @param {Array<{questionId, value}>} rawAnswers - submitted by the user
 * @returns {{ valid: boolean, errors: string[], enrichedAnswers: Array }}
 */
export function validateAndEnrichAnswers(rawAnswers) {
  const errors = [];
  const enrichedAnswers = [];

  if (!Array.isArray(rawAnswers) || rawAnswers.length !== 35) {
    return {
      valid: false,
      errors: [`Expected 35 answers, received ${rawAnswers?.length ?? 0}.`],
      enrichedAnswers: [],
    };
  }

  for (const answer of rawAnswers) {
    const question = QUESTION_MAP[answer.questionId];

    if (!question) {
      errors.push(`Unknown question ID: ${answer.questionId}`);
      continue;
    }

    const value = Number(answer.value);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      errors.push(`Invalid value "${answer.value}" for question ${answer.questionId}. Must be 1–5.`);
      continue;
    }

    // Validate value is one of the allowed option values for this question
    const validValues = question.options.map((o) => o.value);
    if (!validValues.includes(value)) {
      errors.push(`Value ${value} not valid for question ${answer.questionId}.`);
      continue;
    }

    enrichedAnswers.push({
      questionId: answer.questionId,
      domainId: question.domainId,
      domainName: question.domainName,
      value,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    enrichedAnswers,
  };
}

// ─────────────────────────────────────────────────────────
// FULL SCORING PIPELINE
// ─────────────────────────────────────────────────────────

/**
 * Run the complete scoring pipeline on a set of validated answers.
 * @param {Array} enrichedAnswers
 * @returns {{ domainScores, overallScore, maturityStage }}
 */
export function runScoringPipeline(enrichedAnswers) {
  const domainScores   = calculateDomainScores(enrichedAnswers);
  const overallScore   = calculateOverallScore(domainScores);
  const maturityStage  = getMaturityStage(overallScore);

  return {
    domainScores,
    overallScore,
    maturityStage: maturityStage.stage,
    maturityStageDetails: maturityStage,
  };
}
