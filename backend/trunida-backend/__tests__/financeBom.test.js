/**
 * What an account costs, and the four ways that number can lie.
 *
 * ── Why this is tested this hard ───────────────────────────────────────────
 *
 * This board exists to set prices. Every other screen in the product can be
 * wrong and be corrected by whoever reads it next; a price set from a wrong
 * figure here is charged to real customers for as long as the tier lasts, and
 * nothing downstream will contradict it.
 *
 * The four ways it can lie, each pinned below:
 *
 *   Double counting     — two meters cover model spend, and adding one to the
 *                         other twice would inflate every cost.
 *   Silent blending     — a measured $0.58 and an assumed ₹33,333 added into
 *                         one total that says which it is nowhere.
 *   A flattering unset  — a page whose empty state implies things are free.
 *   A guessed divisor   — a fixed cost divided by a number nobody stated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildBom, amortisedMonthlyInr, fixedMonthlyInr, priceOf, periodOf,
} from '../services/financeService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Two accounts, one guest bucket, shaped as the collections really store it. */
const PERIOD = '2026-09';

const users = [
  { _id: 'u1', name: 'Vesoma Clinic', email: 'clinic@example.com' },
  { _id: 'u2', name: 'Six Cricket', email: 'academy@example.com' },
];

const ledgerRows = [
  {
    userId: 'u1', period: PERIOD, calls: 40, costUsd: 1.0, inputTokens: 900, outputTokens: 300,
    byStage: { cob: { calls: 30, costUsd: 0.8 }, eame: { calls: 10, costUsd: 0.2 } },
  },
  {
    userId: 'u2', period: PERIOD, calls: 10, costUsd: 0.25,
    byStage: { cob: { calls: 10, costUsd: 0.25 } },
  },
  // The guest bucket: userId null by design, one row for every anonymous
  // preview in the month.
  { userId: null, period: PERIOD, calls: 67, costUsd: 0.5, byStage: { cob: { calls: 67, costUsd: 0.5 } } },
  // A different month, which must not be counted into this one.
  { userId: 'u1', period: '2026-08', calls: 999, costUsd: 99, byStage: {} },
];

const deployments = [
  { userId: 'u1', usage: { costUsd: 0.5, requests: 400 }, status: 'live' },
  { userId: 'u2', usage: { costUsd: 0.25, requests: 100 }, status: 'live' },
];

const assumptions = {
  inrPerUsd: 100,
  platformDevelopment: { label: 'Platform development', totalInr: 3600000, overMonths: 36 },
  integrations: [
    { label: 'Zoho CRM', totalInr: 120000, overMonths: 12 },
    { label: 'Exotel', totalInr: 60000, overMonths: 12 },
  ],
  monthly: { atlasInr: 5000, controlPlaneInr: 1000, brevoInr: 2000, otherInr: 0 },
  perAccount: { tenantHostingInr: 400 },
  perUnit: {},
};

describe('the two model meters do not overlap', () => {
  const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions });
  const u1 = b.accounts.find((r) => r.userId === 'u1');

  it("counts Svarg's own calls and the delivered app's calls separately", () => {
    /*
     * UsageLedger is fed by observeLlmCalls inside the control plane;
     * HostedDeployment.usage by requests arriving at the gateway from a
     * tenant. A delivered application holds no provider key, so it cannot
     * appear in both — but nothing in the shape of the data says so, which is
     * why it is asserted rather than assumed.
     */
    expect(u1.metered.svargUsd).toBe(1.0);
    expect(u1.metered.gatewayUsd).toBe(0.5);
    expect(u1.metered.totalUsd).toBe(1.5);
  });

  it('adds up to the sum of both meters and nothing else', () => {
    const ledgerThisMonth = 1.0 + 0.25 + 0.5;       // including the guest bucket
    const gateway = 0.5 + 0.25;
    expect(b.totals.meteredUsd).toBeCloseTo(ledgerThisMonth + gateway, 10);
  });

  it('ignores other months entirely', () => {
    // The August row carries $99. If period filtering were wrong, it would be
    // the largest number on the page and would look like a real customer.
    expect(u1.metered.svargUsd).toBe(1.0);
    expect(b.totals.meteredUsd).toBeLessThan(3);
  });
});

describe('measured and assumed stay apart', () => {
  const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions });
  const u1 = b.accounts.find((r) => r.userId === 'u1');

  it('reports each on its own field, and the total as their sum', () => {
    expect(u1.metered.totalInr).toBe(150);              // $1.50 at ₹100
    expect(u1.assumed.totalInr).toBe(u1.assumed.tenantHostingInr + u1.assumed.fixedShareInr);
    expect(u1.costInr).toBeCloseTo(u1.metered.totalInr + u1.assumed.totalInr, 8);
  });

  it('never loses which half a figure came from', () => {
    // The screen must be able to say "₹150 of this we measured". A single
    // costInr with no breakdown is the thing that lets an indefensible number
    // set a price.
    expect(u1.metered).toHaveProperty('totalInr');
    expect(u1.assumed).toHaveProperty('fixedShareInr');
    expect(u1.assumed).toHaveProperty('tenantHostingInr');
  });

  it('itemises the consumption by which layer of the product spent it', () => {
    // This is the bill of materials proper: 32 model calls make a blueprint
    // and one makes an Eame build, so a total alone hides where the money goes.
    expect(u1.metered.byStage.cob.costUsd).toBe(0.8);
    expect(u1.metered.byStage.eame.costUsd).toBe(0.2);
  });
});

describe('a fixed cost is divided by a number that is stated', () => {
  it('amortises over the months given', () => {
    expect(amortisedMonthlyInr({ totalInr: 3600000, overMonths: 36 })).toBe(100000);
  });

  it('charges an unspread cost wholly to this month rather than dividing by zero', () => {
    /*
     * Not Infinity and not free. A one-off nobody has decided how to spread is
     * a cost this month, which is the reading that cannot flatter the margin.
     */
    expect(amortisedMonthlyInr({ totalInr: 50000, overMonths: 0 })).toBe(50000);
    expect(amortisedMonthlyInr({ totalInr: 50000, overMonths: -3 })).toBe(50000);
    expect(amortisedMonthlyInr({ totalInr: 0, overMonths: 0 })).toBe(0);
  });

  it('itemises rather than only totalling', () => {
    const f = fixedMonthlyInr(assumptions);
    const labels = f.lines.map((l) => l.label);
    expect(labels).toContain('Platform development');
    expect(labels).toContain('Zoho CRM');
    expect(labels).toContain('Exotel');
    expect(labels).toContain('Atlas cluster');
    // 100000 + 10000 + 5000 + 5000 + 1000 + 2000
    expect(f.totalInr).toBe(123000);
  });

  it('carries the divisor and its name beside the result', () => {
    const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions });
    expect(b.fixed.basisCount).toBe(2);
    expect(b.fixed.basis).toMatch(/consumed/);
    expect(b.fixed.perAccountInr).toBe(61500);
  });

  it('divides across paying accounts once anybody is paying', () => {
    const plans = [{ userId: 'u1', plan: 'pro', status: 'active' }];
    const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, plans, assumptions });
    expect(b.fixed.basis).toMatch(/paying/);
    expect(b.fixed.basisCount).toBe(1);
    // The whole fixed cost falls on the one account carrying revenue, and none
    // of it on the free ones.
    expect(b.accounts.find((r) => r.userId === 'u1').assumed.fixedShareInr).toBe(123000);
    expect(b.accounts.find((r) => r.userId === 'u2').assumed.fixedShareInr).toBe(0);
  });

  it('does not divide by zero when nothing has been used at all', () => {
    const b = buildBom({ period: PERIOD, ledgerRows: [], deployments: [], users, assumptions });
    expect(b.fixed.perAccountInr).toBe(0);
    expect(Number.isFinite(b.fixed.totalInr)).toBe(true);
  });
});

describe('margin, only where there is a price', () => {
  it('computes it against the plan the account is actually on', () => {
    const plans = [{ userId: 'u1', plan: 'pro', status: 'active' }];
    const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, plans, assumptions });
    const u1 = b.accounts.find((r) => r.userId === 'u1');
    expect(u1.priceInrMonthly).toBe(16999);
    expect(u1.marginInr).toBeCloseTo(16999 - u1.costInr, 8);
  });

  it('leaves it unknown on Hobby rather than reporting the cost as a loss', () => {
    /*
     * null, not a negative number. A free account showing "-₹1,247" reads as a
     * problem to fix on a screen built for pricing decisions, when it is the
     * demonstration working as designed. The cost is still there to be read.
     */
    const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions });
    const u1 = b.accounts.find((r) => r.userId === 'u1');
    expect(u1.planLabel).toBe('Hobby');
    expect(u1.marginInr).toBeNull();
    expect(u1.marginPct).toBeNull();
    expect(u1.costInr).toBeGreaterThan(0);
  });

  it('leaves it unknown on Enterprise, which is negotiated and not free', () => {
    const plans = [{ userId: 'u1', plan: 'enterprise', status: 'active' }];
    const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, plans, assumptions });
    const u1 = b.accounts.find((r) => r.userId === 'u1');
    expect(u1.priceInrMonthly).toBeNull();
    expect(u1.marginInr).toBeNull();
  });

  it('treats an unknown tier as Hobby, the same as every gate does', () => {
    // A typo in an AccountPlan row must not price an account as Ultra.
    expect(priceOf('platinum').key).toBe('hobby');
    expect(priceOf(undefined).label).toBe('Hobby');
  });
});

describe('what the page is made to admit', () => {
  it('says so when no exchange rate is set, because every rupee would read zero', () => {
    const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions: { inrPerUsd: 0 } });
    expect(b.totals.meteredUsd).toBeGreaterThan(0);
    expect(b.totals.meteredInr).toBe(0);
    expect(b.caveats.join(' ')).toMatch(/exchange rate/i);
  });

  it('says so when no fixed costs have been entered', () => {
    const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions: { inrPerUsd: 100 } });
    expect(b.caveats.join(' ')).toMatch(/No fixed costs/i);
  });

  it('says so when running applications are being counted as free to host', () => {
    const b = buildBom({
      period: PERIOD, ledgerRows, deployments, users,
      assumptions: { inrPerUsd: 100, perAccount: { tenantHostingInr: 0 } },
    });
    expect(b.caveats.join(' ')).toMatch(/hosting/i);
  });

  it('says nothing about hosting once a figure is given', () => {
    const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions });
    expect(b.caveats.join(' ')).not.toMatch(/counted as free/i);
  });

  it('reports an empty month as empty rather than as healthy', () => {
    const b = buildBom({ period: PERIOD, ledgerRows: [], deployments: [], users: [], assumptions: null });
    expect(b.accounts).toEqual([]);
    expect(b.totals.meteredUsd).toBe(0);
    expect(b.totals.costInr).toBe(0);
    // With no assumptions at all, the rate is absent too — so the loudest
    // caveat must be the one that says the rupee figures mean nothing.
    expect(b.caveats.length).toBeGreaterThan(0);
  });
});

describe('the guest bucket is a cost, not a customer', () => {
  const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions });

  it('is kept out of the account rows', () => {
    // A null userId row is every anonymous preview in the month collapsed into
    // one. Listed as an account it would be the platform's busiest customer.
    expect(b.accounts.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('is reported on its own, because the free preview is what it pays for', () => {
    expect(b.guest.costUsd).toBe(0.5);
    expect(b.guest.calls).toBe(67);
    expect(b.guest.costInr).toBe(50);
  });

  it('still counts towards what the month cost', () => {
    expect(b.totals.meteredUsd).toBeCloseTo(1.0 + 0.25 + 0.5 + 0.75, 10);
  });
});

describe('the plan baseline travels with the consumption', () => {
  const b = buildBom({ period: PERIOD, ledgerRows, deployments, users, assumptions });

  it('lists every tier with its price and what it buys', () => {
    const byKey = Object.fromEntries(b.plans.map((p) => [p.key, p]));
    expect(byKey.pro.priceInrMonthly).toBe(16999);
    expect(byKey.pro.dataConnections).toBe(5);
    expect(byKey.pro.deploymentCostUsd).toBe(5);
    expect(byKey.hobby.accounts).toBe(2);
    expect(byKey.pro.accounts).toBe(0);
  });

  it('marks a plan nobody chose as the default rather than a decision', () => {
    /*
     * No AccountPlan row means Hobby — the same default entitlements.js
     * applies. Read off this board without the flag, "every account is Hobby"
     * looks like a finding when it is an absence of rows.
     */
    expect(b.accounts.every((r) => r.planImplicit)).toBe(true);
    const plans = [{ userId: 'u1', plan: 'pro', status: 'active' }];
    const withPlan = buildBom({ period: PERIOD, ledgerRows, deployments, users, plans, assumptions });
    expect(withPlan.accounts.find((r) => r.userId === 'u1').planImplicit).toBe(false);
  });
});

describe('how it is reached', () => {
  const routes = read('../routes/financeRoutes.js');
  const server = read('../server.js');

  it('is admin-only on every route', () => {
    // This board names each customer beside what they cost and earn, which is
    // more sensitive than the sales board.
    const lines = routes.split('\n').filter((l) => /^router\.(get|put|post|patch|delete)/.test(l.trim()));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/protect, adminOnly/);
  });

  it('is mounted', () => {
    expect(server).toContain('app.use("/api/admin/finance", financeRoutes)');
  });
});

describe('the period', () => {
  it('is the calendar month the ledger keys on', () => {
    expect(periodOf(new Date('2026-09-30T23:59:00Z'))).toBe('2026-09');
    expect(periodOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });
});
