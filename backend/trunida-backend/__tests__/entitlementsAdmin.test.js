/**
 * Which plan an account resolves to, and what that plan says.
 *
 * ── What this file used to be ──────────────────────────────────────────────
 *
 * Four monthly quotas — blueprints, applications, launches, capability builds
 * — each with its own refusal, and most of this file was about the arithmetic
 * of running out. That was a second pricing model sitting beside the first: a
 * customer paid monthly AND spent from an allowance, and the allowance was
 * what they felt.
 *
 * One price buys coverage now, and coverage is enforced where it is spent —
 * business areas and connections inside the customer's own application, seats
 * beside the people they invite. Nothing here refuses anything any more, so
 * what is left to pin is resolution: which tier an account is on, that the
 * admin account is not a customer, and that a lapsed subscription falls back
 * without taking away what was already made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { role: 'user', plan: null };

const q = (v) => ({ lean: async () => v, select: () => q(v), sort: () => q(v) });

vi.mock('../models/user.js', () => ({ User: { findById: () => q(state.role ? { role: state.role } : null) } }));
vi.mock('../models/AccountPlan.js', () => ({ default: { findOne: () => q(state.plan) } }));

const { checkEntitlement, usageSummary, deploymentCeilingUsd, PLANS } = await import('../services/entitlements.js');

const USER = '000000000000000000000abc';

beforeEach(() => { state.role = 'user'; state.plan = null; });

describe('the admin account is not a customer', () => {
  beforeEach(() => { state.role = 'admin'; });

  it('reads as Enterprise, marked as coming from the role', async () => {
    const s = await usageSummary(USER);
    expect(s.effective).toBe('enterprise');
    expect(s.viaAdmin).toBe(true);
    expect(s.lapsed).toBe(false);
    expect(s.limits).toEqual(PLANS.enterprise);
  });

  it('gets the Enterprise deployment ceiling, not Hobby\'s', async () => {
    // The one limit that survived, and it is Svarg's exposure rather than
    // anything the customer is billed on.
    expect(await deploymentCeilingUsd(USER)).toBe(PLANS.enterprise.deploymentCostUsd);
    expect(PLANS.enterprise.deploymentCostUsd).toBeGreaterThan(PLANS.hobby.deploymentCostUsd);
  });

  it('is exempt even when a lapsed paid plan is on record', async () => {
    state.plan = { plan: 'pro', status: 'past_due' };
    expect((await usageSummary(USER)).lapsed).toBe(false);
    expect((await usageSummary(USER)).effective).toBe('enterprise');
  });
});

describe('everyone else resolves to the tier they are on', () => {
  it('has no plan row, and is Hobby', async () => {
    const s = await usageSummary(USER);
    expect(s.effective).toBe('hobby');
    expect(s.viaAdmin).toBe(false);
    expect(s.limits.businessCategories).toBe(PLANS.hobby.businessCategories);
  });

  it('never resolves as admin without a User record saying so', async () => {
    state.role = null;
    expect((await usageSummary(USER)).effective).toBe('hobby');
  });

  it('falls back to Hobby limits while a subscription is unpaid', async () => {
    /*
     * For NEW work only, and nothing here hides what a customer already made.
     * Under coverage pricing that means a lapsed account watches less, not
     * that its watchers are deleted.
     */
    state.plan = { plan: 'ultra', status: 'past_due' };
    const s = await usageSummary(USER);
    expect(s.plan).toBe('ultra');
    expect(s.effective).toBe('hobby');
    expect(s.lapsed).toBe(true);
    expect(s.limits.businessCategories).toBe(PLANS.hobby.businessCategories);
  });

  it('takes a per-account override, which is how Enterprise is narrowed', async () => {
    // The mechanism a custom contract uses: any key the plan has, overridden
    // on the account. It needed no new code when coverage was added.
    state.plan = { plan: 'enterprise', status: 'active', overrides: { businessCategories: 4, seats: 25 } };
    const s = await usageSummary(USER);
    expect(s.limits.businessCategories).toBe(4);
    expect(s.limits.seats).toBe(25);
    // And everything not overridden stays the tier's own.
    expect(s.limits.monitoringFrequency).toBe(PLANS.enterprise.monitoringFrequency);
  });
});

describe('nothing is refused on a plan any more', () => {
  it('allows every action it is asked about', async () => {
    /*
     * checkEntitlement is kept because a plan will have something to say
     * again and callers already know how to ask. Today every answer is yes —
     * and this pins that, so a quota cannot be reintroduced by accident and
     * start refusing customers who are paying one price a month.
     */
    for (const action of ['blueprint', 'application', 'launch', 'capability', 'anything-at-all']) {
      const v = await checkEntitlement(USER, action);
      expect(v.allowed, action).toBe(true);
    }
  });

  it('allows the guest journey, which has no account to charge', async () => {
    const v = await checkEntitlement(null, 'blueprint');
    expect(v.allowed).toBe(true);
    expect(v.plan).toBe('guest');
  });

  it('holds no monthly quota on any tier', async () => {
    const gone = ['newBlueprintsPerMonth', 'activeBlueprints', 'applications', 'launches', 'capabilityBuilds'];
    for (const [name, plan] of Object.entries(PLANS)) {
      for (const k of gone) expect(plan, `${name}.${k}`).not.toHaveProperty(k);
    }
  });
});
