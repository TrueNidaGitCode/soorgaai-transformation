/**
 * A price is one price.
 *
 * ── Why this test is what allows the copy ──────────────────────────────────
 *
 * Until the finance board existed, the price of a plan lived in exactly one
 * place: two data attributes on a card in frontend/pricing/pricing.html. The
 * server could count what an account consumed and could not say what it was
 * worth, so "does this customer pay for themselves" was a question answerable
 * only by a person with the marketing page open beside a spreadsheet.
 *
 * PLANS now carries the price. That is a second copy of a number, which this
 * codebase refuses everywhere else — AccountPlan says at length why the limits
 * are NOT copied into it, and the reason is exactly right: a copy drifts the
 * first time pricing changes, and then the numbers on the pricing page describe
 * neither the product nor the accounting.
 *
 * This test is the only thing that makes the copy defensible. It reads the
 * marketing page and fails if the two ever disagree, so a price change that
 * updates one and forgets the other is a red test rather than a wrong margin on
 * an admin screen that nobody thinks to doubt.
 *
 * If this test is ever deleted, delete the prices from PLANS in the same
 * commit and have the finance page ask for them instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PLANS } from '../services/entitlements.js';

const pricingPage = readFileSync(
  new URL('../../../frontend/pricing/pricing.html', import.meta.url),
  'utf8',
);

/**
 * What the marketing page actually offers, read from the cards themselves.
 *
 * Parsed rather than hardcoded here: a constant in this file would be a THIRD
 * copy, and a test that compares two copies of the same guess proves nothing.
 */
function pricesOnThePage(html) {
  const out = {};
  const re = /data-plan="([a-z]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, plan, rest] = m;
    const monthly = /data-price-monthly="(\d+)"/.exec(rest);
    const yearly = /data-price-yearly="(\d+)"/.exec(rest);
    out[plan] = {
      monthly: monthly ? Number(monthly[1]) : null,
      yearly: yearly ? Number(yearly[1]) : null,
    };
  }
  return out;
}

describe('the pricing page and the server agree', () => {
  const page = pricesOnThePage(pricingPage);

  it('finds the cards at all', () => {
    // A parser that silently matches nothing would make every assertion below
    // vacuously true, which is the failure mode of this whole approach.
    expect(Object.keys(page).sort()).toEqual(['enterprise', 'hobby', 'pro', 'ultra']);
  });

  it('names the same tiers on both sides', () => {
    expect(Object.keys(page).sort()).toEqual(Object.keys(PLANS).sort());
  });

  for (const tier of ['pro', 'ultra']) {
    it(`quotes the same monthly and yearly price for ${tier}`, () => {
      expect(PLANS[tier].priceInrMonthly).toBe(page[tier].monthly);
      expect(PLANS[tier].priceInrYearly).toBe(page[tier].yearly);
    });
  }

  it('keeps a yearly price below twelve monthly ones, or the discount is a rounding error', () => {
    for (const tier of ['pro', 'ultra']) {
      expect(PLANS[tier].priceInrYearly).toBeLessThan(PLANS[tier].priceInrMonthly * 12);
    }
  });
});

describe('the tiers with no list price', () => {
  it('prices Hobby at nothing, which is a real price', () => {
    // 0, not null: Hobby genuinely earns nothing, and a margin calculation
    // that treated it as "unknown" could not report the cost of the free tier
    // — which is the number that decides whether the free tier is affordable.
    expect(PLANS.hobby.priceInrMonthly).toBe(0);
    expect(PLANS.hobby.priceInrYearly).toBe(0);
  });

  it('leaves Enterprise unpriced, which is not the same as free', () => {
    /*
     * null, not 0. Enterprise is negotiated per contract, and 0 would make
     * every enterprise account appear on the finance board as a total loss
     * equal to its cost — the most expensive customers looking like the worst
     * ones, on a screen built to set prices.
     */
    expect(PLANS.enterprise.priceInrMonthly).toBeNull();
    expect(PLANS.enterprise.priceInrYearly).toBeNull();
  });

  it('and the page does not quote a number for either', () => {
    const page = pricesOnThePage(pricingPage);
    expect(page.hobby.monthly).toBeNull();
    expect(page.enterprise.monthly).toBeNull();
  });
});

describe('the yearly toggle says what the yearly prices give', () => {
  it('calls it two months free only while each yearly price is ten monthly ones', async () => {
    const fs = await import('fs');
    const page = fs.readFileSync(new URL('../../../frontend/pricing/pricing.html', import.meta.url), 'utf8');
    const { PLANS } = await import('../services/entitlements.js');
    if (page.includes('2 months free')) {
      for (const k of ['pro', 'ultra']) expect(PLANS[k].priceInrYearly, k).toBe(PLANS[k].priceInrMonthly * 10);
    }
    expect(page).not.toMatch(/Save 20%/);
  });
});
