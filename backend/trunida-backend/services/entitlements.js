/**
 * Svarg — what this account may do next
 *
 * One place where a tier becomes a number. Every gate calls checkEntitlement()
 * and every screen reads usageSummary(); nothing else is allowed to know that
 * Hobby means one blueprint a month, so changing the pricing page and changing
 * the product are the same edit.
 *
 * ── Why these are the countable things ─────────────────────────────────────
 *
 * The pricing page sells artefacts, not tokens: a blueprint, an application, a
 * running deployment. Each already exists as a record, so the count is a query
 * rather than a meter that can drift from reality. Model spend is measured too
 * — see UsageLedger — but it is never enforced here, because a customer cannot
 * predict a token bill and being cut off mid-objective by a number they cannot
 * see is the worst thing a limit can do.
 *
 * ── Rolling window, not calendar month ─────────────────────────────────────
 *
 * "One a month" is one per rolling 30 days, matching gatewayService's meter. A
 * calendar month hands anyone who signs up on the 30th two blueprints in two
 * days, and the cheapest way to farm a free tier is to know when it resets.
 * The cost is that the reset is a moving date, so usageSummary() returns it
 * explicitly rather than leaving the customer to guess.
 *
 * ── The admin account is not a customer ────────────────────────────────────
 *
 * An account whose role is admin is the one running the platform: it tests
 * every journey, rehearses every demo, and was running out of accounts to do
 * it with. It is resolved as Enterprise -- every limit unlimited -- whatever
 * AccountPlan says, and the summary marks it viaAdmin so a screen can say
 * why. Nothing else about it is special: the same gates run, they just never
 * refuse. Role is read from the User record, not the token, so promoting or
 * demoting an account takes effect on its next request.
 *
 * ── Failure is closed for paid, open for free ──────────────────────────────
 *
 * No AccountPlan row means Hobby. That is the default for every account that
 * has never paid, so the common case needs no write, and a read failure can
 * never promote someone. A lapsed subscription (status past_due/cancelled)
 * falls back to Hobby limits for NEW work only — nothing here ever hides or
 * deletes what a customer already made. Losing access to work already paid for
 * is the one failure worth designing around.
 */

import AccountPlan from '../models/AccountPlan.js';
import { User } from '../models/user.js';

/** Same window as the gateway meter, for the same reason. */

/** null is unlimited. 0 would be a real limit meaning "none allowed". */
const UNLIMITED = null;

/**
 * ── What a plan sells ──────────────────────────────────────────────────────
 *
 * Coverage, not consumption. A customer buys how much of their business is
 * watched, never how much AI does the watching:
 *
 *   businessCategories   PRIMARY   — how many areas of the business
 *   dataConnections      secondary — how many places records come from
 *   monitoringFrequency  tertiary  — how often those areas are checked
 *   seats                          — how many people can use it
 *
 * Watchers are deliberately absent. They are generated from the customer's
 * own business knowledge and data, so two customers with the same coverage
 * get different numbers of them, and charging for the difference would give
 * everybody a reason to switch watchers off -- in a product whose entire
 * promise is that nothing gets missed. Inside purchased coverage, watchers
 * are unlimited and always will be.
 *
 * Model spend stays where it was: measured, capped per deployment, and never
 * shown to a customer. It is an operating cost, not a meter.
 *
 * The tiers, exactly as the pricing page states them.
 *
 * Hobby caps new blueprints but not how many you keep: the blueprint is the
 * demonstration, and deleting last month's to see this month's would be
 * punitive. Pro is the reverse — it lifts the monthly cap but holds you to one
 * live objective, because "every opportunity inside one objective" is what it
 * sells. Ultra removes both.
 */
export const PLANS = {
  hobby: {
    label: 'Hobby',
    // Monitor a small part of your business.
    businessCategories:    2,
    dataConnections:       2,
    monitoringFrequency:   'daily',
    deploymentCostUsd:     2,
    // Hobby sees what its team asked for and cannot build it. The demonstration
    // is the blueprint and one working application; a build that rewrites a
    // running application every time somebody complains is what Pro buys.
    seats:                 1,
  },
  pro: {
    label: 'Pro',
    // Keep the core operations of your business under continuous watch.
    businessCategories:    3,
    dataConnections:       5,
    monitoringFrequency:   'daily',
    // One running application, like Hobby: what Pro buys is building every
    // opportunity inside the objective, not keeping several of them alive at
    // once. Hosting is the constraint, and a promise the platform cannot keep
    // is worse than a smaller one it can.
    deploymentCostUsd:     5,
    /*
     * Three, not one.
     *
     * Pro used to be a single account, on the argument that it is one person
     * running one objective and a team is Ultra. Coverage pricing moves that
     * line: what Pro now sells is the core of a business under continuous
     * watch, and the people who act on a finding -- the front desk, the
     * person who chases the invoice -- are not the person who bought it. A
     * plan whose findings only one person can read is a plan whose findings
     * go unactioned.
     */
    seats:                 3,
  },
  ultra: {
    label: 'Ultra',
    // Monitor your business end to end.
    businessCategories:    UNLIMITED,
    dataConnections:       10,
    monitoringFrequency:   'hourly',
    deploymentCostUsd:     5,
    // Where "we need the team in here" is answered.
    seats:                 10,
  },
  enterprise: {
    label: 'Enterprise',
    // Continuous operational intelligence across the organisation. Every
    // coverage limit is negotiated, so every one of them is unlimited here
    // and narrowed per account on the AccountPlan row when a contract says
    // something narrower.
    businessCategories:    UNLIMITED,
    dataConnections:       UNLIMITED,
    monitoringFrequency:   'custom',
    // Not five. A custom tier on the same ceiling as Pro is a contract the
    // platform cannot keep; it is set per account alongside the coverage.
    deploymentCostUsd:     50,
    // Thirty coaches and four admins.
    seats:                 UNLIMITED,
  },
};

/**
 * Which tier a refusal should name.
 *
 * A limit with no way forward is a dead end, and this is the moment a customer
 * decides whether to pay — so every refusal names the next tier up rather than
 * just saying no.
 */
export const UPGRADE_PATH = { hobby: 'pro', pro: 'ultra', ultra: 'enterprise', enterprise: null };

/** An unknown or missing tier is Hobby. Never the other way round. */
export function planKey(name) {
  const k = String(name || '').trim().toLowerCase();
  return PLANS[k] ? k : 'hobby';
}

// ── Reading the plan ────────────────────────────────────────────────────────

/**
 * The account's tier and its effective limits.
 *
 * `plan` is what they bought; `effective` is what they can use right now. The
 * two differ only while a subscription is unpaid, and keeping both means the
 * screen can say "your Pro subscription is past due" rather than silently
 * showing Hobby's numbers.
 */
export async function resolvePlan(userId) {
  const [doc, user] = userId
    ? await Promise.all([
        AccountPlan.findOne({ userId }).lean().catch(() => null),
        User.findById(userId).select('role').lean().catch(() => null),
      ])
    : [null, null];

  if (user?.role === 'admin') {
    return {
      plan: 'enterprise', status: 'active', effective: 'enterprise', lapsed: false,
      limits: { ...PLANS.enterprise }, currentPeriodEnd: null, viaAdmin: true,
    };
  }

  const plan = planKey(doc?.plan);
  const status = doc?.status || 'active';
  /*
   * Cancelling is not lapsed.
   *
   * A cancelled subscription keeps everything it paid for until the period
   * ends — somebody who cancels on a Tuesday must not find their academy's
   * application dark that afternoon. Every status that was not 'active' used
   * to mean an immediate drop to Hobby, so recording a cancellation would
   * have taken the plan away at the moment it was recorded, which is the
   * opposite of what the cancellation message promises.
   *
   * Once the paid period is genuinely over it lapses like anything else.
   */
  const periodOver = doc?.currentPeriodEnd
    ? new Date(doc.currentPeriodEnd).getTime() <= Date.now()
    : false;
  const cancelling = status === 'cancelling' && !periodOver;
  const lapsed = plan !== 'hobby' && status !== 'active' && !cancelling;
  const effective = lapsed ? 'hobby' : plan;

  // Overrides are applied on top of the EFFECTIVE tier, so a granted exception
  // survives a lapsed card — an admin who lifted a limit for a reason did not
  // mean "until their payment bounces".
  const limits = { ...PLANS[effective] };
  for (const [key, value] of Object.entries(doc?.overrides || {})) {
    if (value !== null && value !== undefined && key in limits) limits[key] = value;
  }

  return { plan, status, effective, lapsed, limits, currentPeriodEnd: doc?.currentPeriodEnd || null, viaAdmin: false };
}

// ── Counting what exists ────────────────────────────────────────────────────

/**
 * What this account's plan allows.
 *
 * It used to count as well as allow: blueprints made this month, applications
 * built, deployments running, capabilities requested — five queries on every
 * read, because five monthly quotas needed to know how much was left.
 *
 * None of that is a limit now. One price buys coverage, and coverage is
 * counted where it is spent: business areas and connections inside the
 * customer's own application, seats beside the people they invite. Counting
 * those things here would be five round trips to produce numbers nothing
 * compares anything to.
 *
 * So this reads the plan and stops. The shape is unchanged for the callers
 * that read `limits`, which is all of them.
 */
export async function usageSummary(userId) {
  const { plan, status, effective, lapsed, limits, currentPeriodEnd, viaAdmin } = await resolvePlan(userId);
  return { plan, status, effective, lapsed, limits, currentPeriodEnd, viaAdmin };
}

// ── The gate ────────────────────────────────────────────────────────────────

/**
 * Whether this account may do something.
 *
 * ── What is left to refuse, and what is not ────────────────────────────────
 *
 * There used to be four gates here — a blueprint, an application, a launch, a
 * capability build — each a monthly quota, each its own reason to be turned
 * away. That was a second pricing model running alongside the first: a
 * customer paid a monthly price AND spent from an allowance, and the
 * allowance was what they actually felt.
 *
 * There is one price now, and it buys coverage: how much of the business is
 * watched, from how many sources, how often, for how many people. Those are
 * enforced where the thing being limited actually is — coverage and
 * connections inside the customer's own application, seats beside the people
 * they invite — so nothing is left for this function to refuse.
 *
 * It is kept rather than deleted because a plan will have something to say
 * again, and callers already know how to ask. Today every answer is yes.
 */
export async function checkEntitlement(userId, action) {
  // No user means the guest journey, which has its own IP-based rate limit.
  if (!userId) return { allowed: true, plan: 'guest' };
  const { effective } = await resolvePlan(userId);
  return { allowed: true, plan: effective };
}

/**
 * The inference ceiling a new deployment should carry.
 *
 * Read at prepare time rather than defaulted in the model, because the ceiling
 * is a property of what the customer is paying, not of the deployment. A
 * Hobby account's runaway loop should stop at $2, not at the model default.
 */
export async function deploymentCeilingUsd(userId) {
  const { limits } = await resolvePlan(userId);
  return limits.deploymentCostUsd;
}

/**
 * Express helper: refuse with 402 and a named upgrade, or call through.
 *
 * 402 rather than 403: this is not "you may not", it is "not on this plan",
 * and the client shows a different thing for each.
 */
export async function requireEntitlement(req, res, action) {
  const verdict = await checkEntitlement(req.user?._id, action);
  if (verdict.allowed) return true;
  res.status(402).json({
    error: verdict.reason,
    code: verdict.code,
    plan: verdict.plan,
    upgradeTo: verdict.upgradeTo,
    upgradeLabel: verdict.upgradeLabel,
    limit: verdict.limit,
    used: verdict.used,
  });
  return false;
}
