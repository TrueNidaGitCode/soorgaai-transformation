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
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import HostedDeployment from '../models/HostedDeployment.js';

/** Same window as the gateway meter, for the same reason. */
export const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** null is unlimited. 0 would be a real limit meaning "none allowed". */
const UNLIMITED = null;

/**
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
    newBlueprintsPerMonth: 1,
    activeBlueprints:      UNLIMITED,
    applications:          1,
    launches:              1,
    deploymentCostUsd:     2,
  },
  pro: {
    label: 'Pro',
    newBlueprintsPerMonth: UNLIMITED,
    activeBlueprints:      1,
    applications:          UNLIMITED,
    launches:              3,
    deploymentCostUsd:     5,
  },
  ultra: {
    label: 'Ultra',
    newBlueprintsPerMonth: UNLIMITED,
    activeBlueprints:      UNLIMITED,
    applications:          UNLIMITED,
    launches:              10,
    deploymentCostUsd:     5,
  },
  enterprise: {
    label: 'Enterprise',
    newBlueprintsPerMonth: UNLIMITED,
    activeBlueprints:      UNLIMITED,
    applications:          UNLIMITED,
    launches:              UNLIMITED,
    deploymentCostUsd:     5,
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
  const doc = userId
    ? await AccountPlan.findOne({ userId }).lean().catch(() => null)
    : null;

  const plan = planKey(doc?.plan);
  const status = doc?.status || 'active';
  const lapsed = plan !== 'hobby' && status !== 'active';
  const effective = lapsed ? 'hobby' : plan;

  // Overrides are applied on top of the EFFECTIVE tier, so a granted exception
  // survives a lapsed card — an admin who lifted a limit for a reason did not
  // mean "until their payment bounces".
  const limits = { ...PLANS[effective] };
  for (const [key, value] of Object.entries(doc?.overrides || {})) {
    if (value !== null && value !== undefined && key in limits) limits[key] = value;
  }

  return { plan, status, effective, lapsed, limits, currentPeriodEnd: doc?.currentPeriodEnd || null };
}

// ── Counting what exists ────────────────────────────────────────────────────

function windowStart(now = new Date()) {
  return new Date(now.getTime() - PERIOD_MS);
}

/**
 * What this account is using, against what it is allowed.
 *
 * A single object rather than four calls because the usage panel needs all of
 * it and a gate needs one line of it — and because four separate round trips
 * would let the numbers disagree with each other mid-render.
 */
export async function usageSummary(userId, now = new Date()) {
  const { plan, status, effective, lapsed, limits, currentPeriodEnd } = await resolvePlan(userId);
  const since = windowStart(now);

  const [newBlueprints, activeBlueprints, applications, launches, oldest] = await Promise.all([
    TransformationBlueprint.countDocuments({ userId, createdAt: { $gte: since } }),
    TransformationBlueprint.countDocuments({ userId, archived: { $ne: true } }),
    // A build that failed verification does not consume a slot. It cost Svarg
    // real money, but charging a customer a slot for something that does not
    // run is the kind of billing nobody forgives.
    GeneratedApplication.countDocuments({ userId, status: { $ne: 'failed' } }),
    HostedDeployment.countDocuments({ userId, status: { $nin: ['destroyed', 'failed'] } }),
    // When the window frees up: the oldest blueprint still inside it.
    TransformationBlueprint.findOne({ userId, createdAt: { $gte: since } })
      .sort({ createdAt: 1 }).select('createdAt').lean(),
  ]);

  return {
    plan, status, effective, lapsed, limits, currentPeriodEnd,
    used: { newBlueprints, activeBlueprints, applications, launches },
    // Null when nothing is in the window — there is nothing to wait for.
    windowResetsAt: oldest ? new Date(new Date(oldest.createdAt).getTime() + PERIOD_MS) : null,
  };
}

// ── The gate ────────────────────────────────────────────────────────────────

function refusal(effective, limit, used, reason) {
  const upgradeTo = UPGRADE_PATH[effective];
  return {
    allowed: false,
    code: 'limit_reached',
    reason,
    limit, used,
    plan: effective,
    upgradeTo,
    upgradeLabel: upgradeTo ? PLANS[upgradeTo].label : '',
  };
}

function whenText(date) {
  if (!date) return '';
  return ` The limit frees up on ${date.toISOString().slice(0, 10)}.`;
}

/**
 * May this account do `action` right now?
 *
 * @param {string} userId
 * @param {'blueprint'|'application'|'launch'} action
 * @returns {Promise<{allowed:boolean, reason?:string, upgradeTo?:string, limit?:number, used?:number}>}
 */
export async function checkEntitlement(userId, action) {
  // No user means the guest journey, which has its own IP-based rate limit and
  // no account to charge. Gating it here would refuse the one thing the free
  // preview exists to do.
  if (!userId) return { allowed: true, plan: 'guest' };

  const s = await usageSummary(userId);
  const { limits, used, effective } = s;
  const lapsedNote = s.lapsed
    ? ` Your ${PLANS[planKey(s.plan)].label} subscription is ${s.status.replace('_', ' ')}, so ${PLANS.hobby.label} limits apply until it is renewed.`
    : '';

  if (action === 'blueprint') {
    if (limits.newBlueprintsPerMonth !== null && used.newBlueprints >= limits.newBlueprintsPerMonth) {
      return refusal(effective, limits.newBlueprintsPerMonth, used.newBlueprints,
        `${PLANS[effective].label} includes ${limits.newBlueprintsPerMonth} new blueprint`
        + `${limits.newBlueprintsPerMonth === 1 ? '' : 's'} a month, and you have used `
        + `${used.newBlueprints}.${whenText(s.windowResetsAt)}${lapsedNote}`);
    }
    if (limits.activeBlueprints !== null && used.activeBlueprints >= limits.activeBlueprints) {
      return refusal(effective, limits.activeBlueprints, used.activeBlueprints,
        `${PLANS[effective].label} covers ${limits.activeBlueprints} active business objective`
        + `${limits.activeBlueprints === 1 ? '' : 's'}. Archive the one you have, or move up to carry `
        + `more than one at a time.${lapsedNote}`);
    }
    return { allowed: true, plan: effective };
  }

  if (action === 'application') {
    if (limits.applications !== null && used.applications >= limits.applications) {
      return refusal(effective, limits.applications, used.applications,
        `${PLANS[effective].label} builds ${limits.applications} application`
        + `${limits.applications === 1 ? '' : 's'}. Move up to build the remaining AI opportunities `
        + `in your blueprint.${lapsedNote}`);
    }
    return { allowed: true, plan: effective };
  }

  if (action === 'launch') {
    if (limits.launches !== null && used.launches >= limits.launches) {
      return refusal(effective, limits.launches, used.launches,
        `${PLANS[effective].label} keeps ${limits.launches} application`
        + `${limits.launches === 1 ? '' : 's'} running. Shut one down, or move up for more.${lapsedNote}`);
    }
    return { allowed: true, plan: effective };
  }

  // An unrecognised action is a coding mistake, not a customer's. Refusing it
  // would break a feature in production for a typo; allowing it silently would
  // leave a gate that never fires. Allow, and say so loudly.
  console.warn(`[entitlements] unknown action "${action}" — allowing it`);
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
