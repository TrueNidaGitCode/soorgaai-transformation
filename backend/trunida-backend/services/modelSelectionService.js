/**
 * SoorgaAI — Model Selection Service
 *
 * Perplexity-style routing: given a preference ('frontier' | 'open-weight'
 * | 'auto'), pick the best-fit model from config/modelCatalog.js and
 * explain the Quality/Cost/Performance tradeoff for that specific pick —
 * deterministic and rule-based, not an LLM call, so it's cheap, reliable,
 * and directly testable.
 */

import { MODEL_CATALOG } from '../config/modelCatalog.js';

const QUALITY_RANK = { best: 3, good: 2, fair: 1 };

function buildRationale(model, preference) {
  if (model.type === 'frontier') {
    return `${model.displayName} — ${model.quality} quality and ${model.performance} performance, at a ${model.cost} per-call cost. Right fit when result quality matters more than per-request cost.`;
  }
  return `${model.displayName} — ${model.cost} cost at scale (fixed infrastructure, not per-token pricing) with ${model.performance} performance and full data control, trading some peak quality for that. Right fit when privacy or volume economics outweigh squeezing out the last bit of quality.`;
}

/**
 * @param {object} [opts]
 * @param {'frontier'|'open-weight'|'auto'} [opts.preference='auto']
 * @returns {{ providerId: string|null, displayName: string, type: string,
 *   quality: string, cost: string, performance: string, rationale: string }}
 *   providerId is null for 'auto' — deliberately: callers should NOT pass
 *   an explicit provider to generate() in that case, since doing so would
 *   skip llmService.js's own Gemini→Claude→OpenAI failover chain entirely
 *   (an explicit provider bypasses the chain by design). 'auto' means
 *   "defer to the existing resilient default," not "pin to one model."
 */
export function selectModel({ preference = 'auto' } = {}) {
  if (preference === 'auto') {
    return {
      providerId:  null,
      displayName: 'Default failover chain (Gemini → Claude → OpenAI)',
      type:        'frontier',
      quality:     'best',
      cost:        'variable',
      performance: 'high',
      rationale:   'No preference set — uses the existing resilient multi-provider chain rather than pinning to a single model, so one provider\'s outage or rate limit never blocks the request.',
    };
  }

  const candidates = MODEL_CATALOG.filter(m => m.type === preference);
  if (!candidates.length) {
    throw new Error(`No model in the catalog matches preference "${preference}".`);
  }

  const picked = [...candidates].sort(
    (a, b) => (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0)
  )[0];

  return {
    providerId:  picked.providerId,
    displayName: picked.displayName,
    type:        picked.type,
    quality:     picked.quality,
    cost:        picked.cost,
    performance: picked.performance,
    rationale:   buildRationale(picked, preference),
  };
}
