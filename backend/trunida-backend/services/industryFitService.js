/**
 * Svarg — Industry Grounding Resolver
 *
 * Decides which industry overlay, if any, should ground a blueprint.
 *
 * ── What this used to be, and why it changed ────────────────────────────────
 *
 * This was a binary automotive-or-not classifier: it asked "is this objective
 * automotive?" and forced everything else to a folder that does not exist, so
 * every non-automotive customer silently got core-only grounding. That was
 * correct when the knowledge base held one industry. It is wrong for a
 * platform meant to serve any business — no amount of industry content could
 * ever be reached, because the code could not select it.
 *
 * It now resolves the objective against whatever industries the knowledge
 * base actually covers, discovered from disk. Publishing a new industry
 * through the admin KB screen makes it selectable immediately: adding an
 * industry is a content operation, not a deployment.
 *
 * ── Why grounding on the wrong industry is worse than not grounding ─────────
 *
 * Industry overlays steer framing, vocabulary and examples. Grounding an
 * education objective in automotive material does not merely fail to help —
 * it actively pulls generation toward irrelevant framing. So the classifier
 * is deliberately conservative: an objective that does not clearly belong to
 * a covered industry gets no overlay, and core content alone. Fewer results,
 * never wrong ones.
 */

import { generate } from './llmService.js';
import { listGroundedIndustries } from './strategyCanvasService.js';

/**
 * @typedef {{ industry: string|null, matched: boolean, reason: string }} IndustryResolution
 *   industry — the overlay folder to ground with, or null for core-only
 *   matched  — whether an overlay was selected (kept for the stored field's
 *              existing shape, and for the UI's industry-fit banner)
 */

/**
 * @param {string} businessObjective
 * @returns {Promise<IndustryResolution>}
 */
export async function resolveIndustryGrounding(businessObjective) {
  const available = listGroundedIndustries();

  if (!available.length) {
    return { industry: null, matched: false, reason: 'The knowledge base has no industry coverage yet.' };
  }

  try {
    const result = await generate({
      systemPrompt:
`You match a business objective to the single most appropriate industry from a fixed list, or to none.

Available industries:
${available.map(i => `- ${i}`).join('\n')}

Rules:
- Choose an industry ONLY if the objective clearly belongs to it. A passing mention is not enough.
- "Artificial Intelligence" is a cross-industry option: choose it when the objective is about building or adopting AI capability generally, and no more specific industry on the list fits.
- If nothing on the list fits, return null. Returning null is correct and expected — grounding an objective in the wrong industry is worse than not grounding it at all.

Respond with ONLY compact JSON, no other text:
{"industry": "<exact name from the list>" | null, "reason": "<one short sentence, under 20 words>"}`,
      userMessage: businessObjective,
      maxTokens: 200,
      label: 'industry-grounding',
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in classifier response');
    const parsed = JSON.parse(jsonMatch[0]);

    // Trust the list, not the model: a hallucinated industry name would
    // resolve to a folder that does not exist, which fails closed to
    // core-only anyway — but silently, and with a misleading stored reason.
    const picked = available.find(i => i.toLowerCase() === String(parsed.industry || '').toLowerCase());

    return {
      industry: picked || null,
      matched: !!picked,
      reason: String(parsed.reason || '').slice(0, 300),
    };
  } catch (err) {
    // Fail closed to core-only. The previous version failed OPEN to
    // automotive, which was safe when automotive was the only industry and
    // most customers were automotive. With several industries covered,
    // failing open would ground an arbitrary customer in an arbitrary
    // industry — the exact harm this classifier exists to prevent.
    console.error('[industryGrounding] classification failed — core-only grounding:', err.message);
    return { industry: null, matched: false, reason: '' };
  }
}
