/**
 * SoorgaAI — Industry Fit Classifier
 *
 * The knowledge base only has real content for the automotive industry
 * (knowledge_base/automotive/enterprise_ai/<domain>/Automotive/*.md) — every
 * other industryDomain enum value silently resolves to the same folder
 * (see strategyCanvasController.js INDUSTRY_FOLDER). Grounding a non-automotive
 * objective with automotive-specific reference material doesn't just fail to
 * help — it actively steers generation toward irrelevant framing.
 *
 * This runs ONCE per blueprint (not per capability) right after the objective
 * is submitted, and the result is stored on the blueprint document so every
 * capability generation call — including later "generate remaining domains"
 * runs — reuses the same decision without re-classifying.
 */

import { generate } from './llmService.js';

export async function detectIndustryFit(businessObjective) {
  try {
    const result = await generate({
      systemPrompt: `You classify whether a business objective belongs to the automotive industry — vehicles, OEMs, vehicle diagnostics, ADAS, infotainment, automotive manufacturing or engineering. Objectives about other industries (e.g. industrial machine safety, healthcare, retail, generic software/IT) do NOT match, even if they mention "AI" or "engineering" in general terms.

Respond with ONLY compact JSON, no other text: {"matched": true|false, "reason": "<one short sentence, under 20 words>"}`,
      userMessage: businessObjective,
      maxTokens: 120,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in classifier response');
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      matched: !!parsed.matched,
      reason:  String(parsed.reason || '').slice(0, 300),
    };
  } catch (err) {
    console.error('[industryFit] classification failed — defaulting to matched=true:', err.message);
    // Fail open: if the classifier itself breaks, keep today's behavior
    // (automotive grounding applied) rather than silently degrading every
    // blueprint's grounding quality because of an unrelated outage.
    return { matched: true, reason: '' };
  }
}
