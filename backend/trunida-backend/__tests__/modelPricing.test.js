/**
 * What a call costs, and why this is the third time it has been wrong.
 *
 * ── The bug, twice ─────────────────────────────────────────────────────────
 *
 * A model is named in more than one place and the names drift. First the
 * ledger recorded the API id while pricing only knew the advisory id, and
 * every internal Gemini Flash call was costed at Opus rates. That was fixed
 * by matching the API id too.
 *
 * Then the benchmark catalogue in the database — which is where a
 * DEPLOYMENT's modelId comes from — spelled the same model
 * 'gemini-3-8-flash' where the advisory catalogue spells it
 * 'gemini-3.8-flash'. One dot. Both exact tests missed, every deployment
 * fell through to the most expensive row, and the per-deployment spend cap
 * counted forty times the truth until three customers' applications stopped
 * answering on money nobody had spent.
 *
 * So the test is not "gemini-3-8-flash prices correctly". It is: however a
 * known model is spelled, it prices the same. That is the property that
 * keeps failing, and it is the one pinned here.
 */
import { describe, it, expect } from 'vitest';
import { ADVISORY_CATALOG } from '../config/modelCatalog.js';
import { findCatalogModel, estimateCostUsd, isPriced } from '../services/gatewayService.js';

/** Every advisory row that actually carries a price. */
const priced = ADVISORY_CATALOG.filter(m => Number.isFinite(m.priceIn) && Number.isFinite(m.priceOut));

describe('a known model prices the same however it is spelled', () => {
  it('has rows to test', () => {
    expect(priced.length).toBeGreaterThan(3);
  });

  for (const m of priced) {
    it(`${m.id} prices from its id, its API id, and the API id without punctuation`, () => {
      const want = estimateCostUsd(m.id, 1e6, 1e6);
      expect(want).toBeGreaterThan(0);

      if (m.apiModel) {
        expect(estimateCostUsd(m.apiModel, 1e6, 1e6), 'api id').toBe(want);
        // The spelling the database catalogue uses: dots become hyphens.
        const hyphenated = m.apiModel.replace(/\./g, '-');
        expect(estimateCostUsd(hyphenated, 1e6, 1e6), hyphenated).toBe(want);
      }
    });
  }

  it('prices the deployment spelling of Gemini Flash as Flash, not as Opus', () => {
    /*
     * The exact case that broke. Named outright as well as covered by the
     * loop above, because this is the one that took applications down and a
     * named test is what somebody reads when it fails.
     */
    const flash = findCatalogModel('gemini-3-8-flash');
    expect(flash).toBeTruthy();
    expect(flash.priceIn).toBe(0.30);
    expect(flash.priceOut).toBe(2.50);

    // Vesoma's real meter: 80,466 in and 10,061 out over ten days.
    const real = estimateCostUsd('gemini-3-8-flash', 80466, 10061);
    expect(real).toBeLessThan(0.10);
    // What it was being charged instead, against a $2–$5 ceiling.
    const worst = Math.max(...ADVISORY_CATALOG.map(x => x.priceOut || 0));
    expect(worst / 2.50).toBeGreaterThan(10);
  });
});

describe('an unpriced model is capped, not free, and not silent', () => {
  it('still costs an unknown model at the most expensive row', () => {
    /*
     * Deliberate, and unchanged: an unpriced model must not become an
     * uncapped one. The fix above is about models that ARE known and were
     * not being recognised — not about relaxing this.
     */
    const worstIn = Math.max(...ADVISORY_CATALOG.map(x => x.priceIn || 0));
    const worstOut = Math.max(...ADVISORY_CATALOG.map(x => x.priceOut || 0));
    expect(estimateCostUsd('a-model-nobody-has-priced', 1e6, 1e6)).toBe(worstIn + worstOut);
  });

  it('says which model it is, once, instead of absorbing it', () => {
    // The number is forty times the truth; it should not be able to hide.
    const src = require('fs').readFileSync(new URL('../services/gatewayService.js', import.meta.url), 'utf8');
    expect(src).toContain('warnedUnpriced');
    expect(src).toMatch(/has no price in the catalogue/);
  });

  it('reports honestly whether a model is priced at all', () => {
    expect(isPriced('gemini-3-8-flash')).toBe(true);
    expect(isPriced('claude-sonnet')).toBe(true);
    expect(isPriced('a-model-nobody-has-priced')).toBe(false);
    expect(isPriced('')).toBe(false);
    expect(isPriced(null)).toBe(false);
  });
});

describe('the correction is arithmetic, not amnesia', () => {
  it('recomputes cost from tokens already recorded, and touches nothing else', () => {
    /*
     * The repair script rewrites usage.costUsd only. Requests and token
     * counts are the record of what happened and are not a script's to
     * adjust — and leaving them means running it twice says the same thing
     * as running it once.
     */
    const src = require('fs').readFileSync(new URL('../scripts/reprice_deployment_usage.mjs', import.meta.url), 'utf8');
    expect(src).toContain("{ $set: { 'usage.costUsd': now } }");
    expect(src).not.toMatch(/usage\.requests|usage\.inputTokens|usage\.outputTokens/);
    // And a model with no price is left exactly as it is.
    expect(src).toContain('if (!isPriced(modelId))');
    // Reporting is the default; writing is opt-in.
    expect(src).toContain("const WRITE = process.argv.includes('--write');");
  });
});
