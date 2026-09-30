/**
 * Svarg — what each account consumes, and what it costs to serve
 *
 * ── The question this answers ──────────────────────────────────────────────
 *
 * "What does one customer cost us, itemised, against the plan they are on."
 * A price set without that answer is a guess, and the tiers were in fact set
 * from a guess — see UsageLedger, which says so.
 *
 * ── Measured and assumed are never added silently ──────────────────────────
 *
 * Two of the numbers here are facts. UsageLedger counts Svarg's own model
 * calls per account per month, itemised by which layer of the product made
 * them; HostedDeployment counts each delivered application's calls at the
 * gateway. They are disjoint — the ledger is fed by observeLlmCalls inside
 * this process, the gateway meter by requests arriving from a tenant — so they
 * sum without double counting, and financeBom.test.js pins that.
 *
 * Everything else is a judgement held in CostAssumption: what the platform
 * cost to build, what each integration cost, what a container and a share of
 * one Atlas cluster are worth. Those cannot be measured from anything here.
 *
 * So this returns them as separate fields all the way to the screen —
 * `metered` and `assumed` — and never a single cost with the provenance
 * averaged out of it. The one number a reader must be able to challenge is the
 * one that decides a price.
 *
 * ── Where the fixed cost lands ─────────────────────────────────────────────
 *
 * A fixed cost cannot be attributed to an account, only divided across some
 * number of them, and the divisor changes the answer more than any figure in
 * it: platform development over 33 signed-up accounts is a quarter of what it
 * is over the 9 that actually used anything. There is no correct divisor, so
 * this picks one, names it, and reports the count — `basis` and `basisCount`
 * travel with the number so no screen can show the result without the
 * assumption behind it.
 */

import UsageLedger from '../models/UsageLedger.js';
import AccountPlan from '../models/AccountPlan.js';
import HostedDeployment from '../models/HostedDeployment.js';
import { User } from '../models/user.js';
import CostAssumption from '../models/CostAssumption.js';
import { PLANS, planKey } from './entitlements.js';

/** "YYYY-MM", UTC — the same period key the ledger stores. */
export function periodOf(date = new Date()) {
  return new Date(date).toISOString().slice(0, 7);
}

/**
 * A fixed cost as a monthly figure.
 *
 * overMonths of 0 or less is not "divide by zero" and not "free": it is a cost
 * that has not been spread yet, so the whole of it lands on this month. That is
 * the reading that cannot flatter the margin, which is the one to default to.
 */
export function amortisedMonthlyInr(item) {
  const total = Number(item?.totalInr) || 0;
  const months = Number(item?.overMonths) || 0;
  if (!total) return 0;
  return months > 0 ? total / months : total;
}

/**
 * Every fixed cost the business carries this month, itemised.
 *
 * Itemised rather than totalled because the total is the least useful form of
 * it: "₹58,000 a month" prompts no decision, while "₹33,333 of that is
 * platform development spread over 36 months" prompts several.
 */
export function fixedMonthlyInr(assumptions) {
  const a = assumptions || {};
  const lines = [];

  const dev = amortisedMonthlyInr(a.platformDevelopment);
  if (dev) {
    lines.push({
      kind: 'amortised',
      label: a.platformDevelopment?.label || 'Platform development',
      monthlyInr: dev,
      totalInr: Number(a.platformDevelopment?.totalInr) || 0,
      overMonths: Number(a.platformDevelopment?.overMonths) || 0,
      note: a.platformDevelopment?.note || '',
    });
  }

  for (const i of a.integrations || []) {
    const monthly = amortisedMonthlyInr(i);
    if (!monthly) continue;
    lines.push({
      kind: 'amortised',
      label: i.label || 'Integration',
      monthlyInr: monthly,
      totalInr: Number(i.totalInr) || 0,
      overMonths: Number(i.overMonths) || 0,
      note: i.note || '',
    });
  }

  const m = a.monthly || {};
  const recurring = [
    ['Atlas cluster', m.atlasInr, 'Shared by every tenant, so it cannot be metered per account.'],
    ['Control plane hosting', m.controlPlaneInr, "Svarg's own container, serving all accounts."],
    ['Brevo', m.brevoInr, 'Transactional email.'],
    [m.otherNote || 'Other recurring', m.otherInr, m.otherNote ? '' : 'Domains, certificates and the rest.'],
  ];
  for (const [label, value, note] of recurring) {
    const v = Number(value) || 0;
    if (v) lines.push({ kind: 'recurring', label, monthlyInr: v, note });
  }

  return { lines, totalInr: lines.reduce((sum, l) => sum + l.monthlyInr, 0) };
}

/** A plan's list price, or null where there is not one. */
export function priceOf(plan) {
  // planKey treats an unknown tier as Hobby, which is the same rule every gate
  // applies — so a typo in an AccountPlan row cannot price an account as Ultra.
  const key = planKey(plan);
  const p = PLANS[key];
  return { key, label: p.label, monthlyInr: p.priceInrMonthly, yearlyInr: p.priceInrYearly };
}

/**
 * The bill of materials, one row per account.
 *
 * Pure: everything it needs is passed in, so the arithmetic can be tested
 * without a database and the rules can be argued about in a test rather than
 * against production. `bom()` below is the part that reads.
 */
export function buildBom({
  period,
  ledgerRows = [],
  deployments = [],
  plans = [],
  users = [],
  assumptions = null,
} = {}) {
  const inrPerUsd = Number(assumptions?.inrPerUsd) || 0;
  const usdToInr = (usd) => usd * inrPerUsd;

  const userById = new Map(users.map((u) => [String(u._id), u]));
  const planByUser = new Map(plans.map((p) => [String(p.userId), p]));

  /* One row per account, built from whichever source mentions it. */
  const rows = new Map();
  const rowFor = (id) => {
    const key = String(id);
    if (!rows.has(key)) {
      const u = userById.get(key);
      const stored = planByUser.get(key);
      const price = priceOf(stored?.plan || 'hobby');
      rows.set(key, {
        userId: key,
        name: u?.name || '',
        email: u?.email || '',
        // No AccountPlan row means Hobby, the same default entitlements.js
        // applies. Said out loud here, because "every account is Hobby" read
        // off this page should not look like a finding when it is a default.
        plan: price.key,
        planLabel: price.label,
        planImplicit: !stored,
        planStatus: stored?.status || 'active',
        priceInrMonthly: price.monthlyInr,
        metered: {
          svargUsd: 0, gatewayUsd: 0, totalUsd: 0, totalInr: 0,
          calls: 0, gatewayRequests: 0, inputTokens: 0, outputTokens: 0,
          byStage: {},
        },
        assumed: { tenantHostingInr: 0, fixedShareInr: 0, totalInr: 0 },
        deployments: 0,
        costInr: 0,
        marginInr: null,
        marginPct: null,
      });
    }
    return rows.get(key);
  };

  /* Svarg's own calls: the ledger, for this month only. */
  let guest = null;
  for (const r of ledgerRows) {
    if (period && r.period !== period) continue;

    const stageMap = r.byStage instanceof Map ? Object.fromEntries(r.byStage) : (r.byStage || {});
    const stages = {};
    for (const [k, v] of Object.entries(stageMap)) {
      stages[k] = { calls: v?.calls || 0, costUsd: v?.costUsd || 0 };
    }

    if (!r.userId) {
      // Guest previews have no account by design, so they are not an account
      // row. They are still a real cost and the one the free tier is made of.
      guest = {
        calls: r.calls || 0,
        costUsd: r.costUsd || 0,
        costInr: usdToInr(r.costUsd || 0),
        byStage: stages,
      };
      continue;
    }

    const row = rowFor(r.userId);
    row.metered.svargUsd += r.costUsd || 0;
    row.metered.calls += r.calls || 0;
    row.metered.inputTokens += r.inputTokens || 0;
    row.metered.outputTokens += r.outputTokens || 0;
    for (const [k, v] of Object.entries(stages)) {
      row.metered.byStage[k] = row.metered.byStage[k] || { calls: 0, costUsd: 0 };
      row.metered.byStage[k].calls += v.calls;
      row.metered.byStage[k].costUsd += v.costUsd;
    }
  }

  /*
   * The delivered applications: metered at the gateway, not in the ledger.
   *
   * Counted from HostedDeployment.usage, which is a running total since
   * periodStart rather than a per-month row — so it is reported as what it is
   * ("spend to date on this deployment") and the screen says so. Treating it as
   * this month's figure would overstate every month after the first.
   */
  for (const d of deployments) {
    if (!d?.userId) continue;
    const row = rowFor(d.userId);
    row.metered.gatewayUsd += d.usage?.costUsd || 0;
    row.metered.gatewayRequests += d.usage?.requests || 0;
    row.deployments += 1;
    // A container exists per delivered application, so hosting is per
    // deployment rather than per account.
    row.assumed.tenantHostingInr += Number(assumptions?.perAccount?.tenantHostingInr) || 0;
  }

  const all = [...rows.values()];

  /*
   * How the fixed cost is divided.
   *
   * Paying accounts where there are any, because a fixed cost is carried by
   * revenue. Where nothing is paying yet — which is true today — it falls to
   * accounts that actually consumed something, since dividing by every
   * signed-up address would make the per-account figure look small for the
   * reason that most of them are dormant.
   */
  const paying = all.filter((r) => (r.priceInrMonthly || 0) > 0);
  const active = all.filter((r) => r.metered.svargUsd > 0 || r.metered.gatewayUsd > 0);
  const basisRows = paying.length ? paying : active;
  const basis = paying.length ? 'paying accounts' : 'accounts that consumed anything this month';

  const fixed = fixedMonthlyInr(assumptions);
  const perAccountFixed = basisRows.length ? fixed.totalInr / basisRows.length : 0;
  const inBasis = new Set(basisRows.map((r) => r.userId));

  for (const row of all) {
    if (inBasis.has(row.userId)) row.assumed.fixedShareInr = perAccountFixed;

    row.metered.totalUsd = row.metered.svargUsd + row.metered.gatewayUsd;
    row.metered.totalInr = usdToInr(row.metered.totalUsd);
    row.assumed.totalInr = row.assumed.tenantHostingInr + row.assumed.fixedShareInr;
    row.costInr = row.metered.totalInr + row.assumed.totalInr;

    /*
     * Margin only where there is a price to take it from.
     *
     * Null, not zero, for Hobby and Enterprise: Hobby earns nothing by design
     * and Enterprise is whatever the contract says, and printing "-₹1,247" for
     * a free account as though it were a loss to be fixed would make the free
     * tier look like a defect rather than the demonstration it is.
     */
    if (row.priceInrMonthly === null || row.priceInrMonthly === 0) {
      row.marginInr = null;
      row.marginPct = null;
    } else {
      row.marginInr = row.priceInrMonthly - row.costInr;
      row.marginPct = (row.marginInr / row.priceInrMonthly) * 100;
    }
  }

  all.sort((a, b) => b.costInr - a.costInr || String(a.name).localeCompare(String(b.name)));

  const meteredUsd = all.reduce((s, r) => s + r.metered.totalUsd, 0) + (guest?.costUsd || 0);
  const totals = {
    accounts: all.length,
    activeAccounts: active.length,
    payingAccounts: paying.length,
    meteredUsd,
    meteredInr: usdToInr(meteredUsd),
    assumedInr: all.reduce((s, r) => s + r.assumed.totalInr, 0),
    fixedInr: fixed.totalInr,
    revenueInr: all.reduce((s, r) => s + (r.priceInrMonthly || 0), 0),
  };
  totals.costInr = totals.meteredInr + totals.assumedInr;
  totals.marginInr = totals.revenueInr - totals.costInr;

  /*
   * What a reader must be told before trusting any of this.
   *
   * Returned as data rather than written into a template, so the page cannot
   * show a number whose caveat was forgotten — and so a caveat that stops
   * being true disappears on its own.
   */
  const caveats = [];
  if (!inrPerUsd) {
    caveats.push('No exchange rate is set, so every metered cost converts to ₹0. Set it before reading any rupee figure here.');
  }
  if (!fixed.totalInr) {
    caveats.push('No fixed costs have been entered — platform development, integrations, hosting and Atlas are all absent, so cost per account is model spend alone.');
  }
  if (!paying.length) {
    caveats.push(`Nothing is on a paid plan yet, so fixed cost is divided across ${active.length} ${active.length === 1 ? 'account' : 'accounts'} that consumed something rather than across paying ones.`);
  }
  if (all.some((r) => r.deployments > 0) && !(Number(assumptions?.perAccount?.tenantHostingInr) || 0)) {
    caveats.push('Delivered applications are running but no per-tenant hosting cost is set, so their containers are counted as free.');
  }

  return {
    period,
    inrPerUsd,
    accounts: all,
    guest,
    fixed: { ...fixed, basis, basisCount: basisRows.length, perAccountInr: perAccountFixed },
    totals,
    caveats,
    // Every tier, so the page can show the baseline beside the consumption
    // rather than making a reader hold the pricing page in their head.
    plans: Object.entries(PLANS).map(([key, p]) => ({
      key,
      label: p.label,
      priceInrMonthly: p.priceInrMonthly,
      priceInrYearly: p.priceInrYearly,
      businessCategories: p.businessCategories,
      dataConnections: p.dataConnections,
      monitoringFrequency: p.monitoringFrequency,
      seats: p.seats,
      deploymentCostUsd: p.deploymentCostUsd,
      accounts: all.filter((r) => r.plan === key).length,
    })),
  };
}

/** The current assumptions, or the defaults, without writing anything. */
export async function assumptions() {
  const found = await CostAssumption.findOne({ key: 'default' }).lean();
  return found || new CostAssumption({ key: 'default' }).toObject();
}

/** The whole board, read for one month. */
export async function bom(period = periodOf()) {
  const [ledgerRows, plans, deployments, users, a] = await Promise.all([
    UsageLedger.find({ period }).lean(),
    AccountPlan.find({}).lean(),
    // A destroyed deployment costs nothing and should not carry hosting.
    HostedDeployment.find({ status: { $nin: ['destroyed'] } })
      .select('userId usage limits status railway.url').lean(),
    User.find({}).select('name email role').lean(),
    assumptions(),
  ]);

  return buildBom({ period, ledgerRows, deployments, plans, users, assumptions: a });
}

/** The months that have any usage at all, newest first, for the period picker. */
export async function periods() {
  const found = await UsageLedger.distinct('period');
  return found.sort().reverse();
}

/** Replace the assumptions. Returns what is now stored. */
export async function saveAssumptions(patch = {}, by = '') {
  const clean = {};

  if (patch.inrPerUsd !== undefined) clean.inrPerUsd = Math.max(0, Number(patch.inrPerUsd) || 0);

  const one = (x, fallbackLabel) => ({
    label: String(x?.label || fallbackLabel || '').slice(0, 80),
    totalInr: Math.max(0, Number(x?.totalInr) || 0),
    overMonths: Math.max(0, Math.round(Number(x?.overMonths) || 0)),
    note: String(x?.note || '').slice(0, 300),
  });

  if (patch.platformDevelopment) clean.platformDevelopment = one(patch.platformDevelopment, 'Platform development');
  if (Array.isArray(patch.integrations)) {
    // Bounded, because this is a typed list on an admin page and nothing
    // downstream expects a thousand of them.
    clean.integrations = patch.integrations.slice(0, 50).map((i) => one(i, 'Integration'));
  }

  if (patch.monthly) {
    clean.monthly = {
      atlasInr: Math.max(0, Number(patch.monthly.atlasInr) || 0),
      controlPlaneInr: Math.max(0, Number(patch.monthly.controlPlaneInr) || 0),
      brevoInr: Math.max(0, Number(patch.monthly.brevoInr) || 0),
      otherInr: Math.max(0, Number(patch.monthly.otherInr) || 0),
      otherNote: String(patch.monthly.otherNote || '').slice(0, 120),
    };
  }

  if (patch.perAccount) {
    clean.perAccount = {
      tenantHostingInr: Math.max(0, Number(patch.perAccount.tenantHostingInr) || 0),
      tenantHostingNote: String(patch.perAccount.tenantHostingNote || '').slice(0, 300),
    };
  }

  if (patch.perUnit) {
    clean.perUnit = {
      transcriptionInrPerCall: Math.max(0, Number(patch.perUnit.transcriptionInrPerCall) || 0),
      emailInr: Math.max(0, Number(patch.perUnit.emailInr) || 0),
    };
  }

  clean.updatedBy = String(by || '').slice(0, 120);

  const saved = await CostAssumption.findOneAndUpdate(
    { key: 'default' },
    { $set: clean, $setOnInsert: { key: 'default' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return saved;
}
