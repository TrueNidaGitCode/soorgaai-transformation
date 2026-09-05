/**
 * Svarg — which model the products run on
 *
 * Cob stays on the default chain. Its prompts were tuned against it, its
 * limitations are known, and its output is what every downstream stage is
 * built on — changing the model underneath it invalidates that testing.
 *
 * Everything after Cob — Aria, Arth, Eame, Yusu — can run on a local model
 * first. Those stages are still being built, they are re-run constantly while
 * developing, and reading a customer's repository sends far more text through
 * a model than generating a blueprint does. Paying a per-token price for work
 * that will be thrown away an hour later is the wrong default.
 *
 * There is a second reason, which will outlast the cost one: a local model
 * keeps a customer's source code on the machine. See codebaseProfileService.
 *
 * ── Failure is not an outage ────────────────────────────────────────────────
 *
 * generate() with an explicit provider does NOT fall back — it throws. A local
 * model that is not running would take Aria down with it, which is not a
 * trade anyone would choose for a cost optimisation. So this tries the product
 * provider and falls back to the default chain, loudly.
 */

import { generate } from './llmService.js';

/**
 * Empty or unset means "use the default chain", which is what Cob does and
 * what every product did before this existed. Setting it is opt-in.
 */
const PRODUCT_PROVIDER = (process.env.PRODUCT_LLM_PROVIDER || '').trim().toLowerCase();

/** @returns {string|null} the configured product provider, or null for the default chain. */
export function productProviderName() {
  return PRODUCT_PROVIDER || null;
}

/**
 * Same signature as generate(). Use for post-Cob product work; use generate()
 * directly for anything whose output has been tuned against a specific model.
 */
export async function generateForProduct(opts) {
  // A caller that names a provider means it. PRODUCT_LLM_PROVIDER is the
  // DEFAULT for product work, not an override of an explicit instruction —
  // and treating it as an override silently discarded the parameter. Eame's
  // builder asked for gemini and got the local model, which then sat
  // generating for minutes on a task it had no chance of finishing.
  if (opts.provider) return generate(opts);

  if (!PRODUCT_PROVIDER) return generate(opts);

  try {
    return await generate({ ...opts, provider: PRODUCT_PROVIDER });
  } catch (err) {
    // Worth a warning rather than a silent retry: a local model that is
    // quietly never running means every "local" run has been billed to the
    // default provider, which is the opposite of the intent.
    console.warn(
      `[productLlm] ${PRODUCT_PROVIDER} failed for ${opts.label || 'an unlabelled call'}`
      + ` (${err.message}) — falling back to the default chain.`
    );
    return generate(opts);
  }
}
