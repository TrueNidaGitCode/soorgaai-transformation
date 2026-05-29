/**
 * SoorgaAI — Dynamic Scoring Service
 *
 * Scores a completed AssessmentSession:
 *  - Per focus-area score (0–100)
 *  - Overall score (0–100) = average of focus-area scores
 *  - Maturity stage mapped from score thresholds (reuses v1 bands)
 *
 * Formula:
 *   focusAreaScore = (average raw answer / 5) × 100
 *   overallScore   = average of all focus-area scores
 */

import { getMaturityStages, getFocusAreas } from './kbRetrievalService.js';

// ── Stage mapping ─────────────────────────────────────────────────────────────

/**
 * Map a 0–100 score to a maturity stage object.
 * Reuses the same thresholds as v1 scoringEngine.js.
 * @param {number} score
 */
function mapToStage(score) {
  const { stages } = getMaturityStages();
  return stages.find(s => score >= s.minScore && score <= s.maxScore) || stages[0];
}

// ── Focus-area scoring ────────────────────────────────────────────────────────

/**
 * Compute per-focus-area scores for a session.
 * @param {Array} questions - session.questions[]
 * @param {Array} answers   - session.answers[]
 * @returns {Array<FocusAreaScore>}
 */
function scoreFocusAreas(questions, answers) {
  const { focusAreas } = getFocusAreas();

  // Build a lookup: questionId → answer value
  const answerMap = {};
  for (const a of answers) {
    answerMap[a.questionId] = a.value;
  }

  const results = [];

  for (const fa of focusAreas) {
    // Questions belonging to this focus area
    const faQuestions = questions.filter(q => q.focusAreaId === fa.id);
    if (faQuestions.length === 0) continue;

    // Only score questions that have an answer
    const answered = faQuestions.filter(q => answerMap[q.questionId] !== undefined);
    if (answered.length === 0) continue;

    const sum        = answered.reduce((acc, q) => acc + (answerMap[q.questionId] * (q.weight || 1)), 0);
    const totalWeight = answered.reduce((acc, q) => acc + (q.weight || 1), 0);
    const rawAverage = sum / totalWeight;
    const score      = Math.round((rawAverage / 5) * 100 * 10) / 10; // 1 decimal, 0–100

    results.push({
      focusAreaId:   fa.id,
      focusAreaName: fa.name,
      score,
      rawAverage:    Math.round(rawAverage * 100) / 100,
      questionCount: answered.length,
    });
  }

  return results;
}

// ── Overall score ─────────────────────────────────────────────────────────────

/**
 * Compute overall score from focus-area scores (equal weights).
 * @param {Array} focusAreaScores
 * @returns {number} 0–100
 */
function computeOverall(focusAreaScores) {
  if (!focusAreaScores.length) return 0;
  const total = focusAreaScores.reduce((sum, f) => sum + f.score, 0);
  return Math.round((total / focusAreaScores.length) * 10) / 10;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Score a completed or in-progress session.
 *
 * @param {object} session - Mongoose AssessmentSession document
 * @returns {{ focusAreaScores, overallScore, maturityStage, maturityStageDetails }}
 */
export function computeScore(session) {
  const focusAreaScores = scoreFocusAreas(session.questions, session.answers);
  const overallScore    = computeOverall(focusAreaScores);
  const stageDetails    = mapToStage(overallScore);

  return {
    focusAreaScores,
    overallScore,
    maturityStage:        stageDetails.stage,
    maturityStageDetails: stageDetails,
  };
}
