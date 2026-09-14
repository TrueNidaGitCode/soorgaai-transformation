/**
 * The admin account is not a customer: every gate runs and none refuses.
 *
 * Everything else about entitlements is unchanged, so the second half pins
 * that a Hobby account at its limit is still refused -- the exemption is
 * keyed on the User's role, not on the absence of a plan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { role: 'user', plan: null, counts: { newBp: 0, activeBp: 0, apps: 0, launches: 0, capabilityBuilds: 0 } };

const q = (v) => ({ lean: async () => v, select: () => q(v), sort: () => q(v) });

vi.mock('../models/user.js', () => ({ User: { findById: () => q(state.role ? { role: state.role } : null) } }));
vi.mock('../models/AccountPlan.js', () => ({ default: { findOne: () => q(state.plan) } }));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: {
  countDocuments: async (f) => (f.createdAt ? state.counts.newBp : state.counts.activeBp),
  findOne: () => q(state.counts.newBp ? { createdAt: new Date() } : null),
} }));
vi.mock('../models/GeneratedApplication.js', () => ({ default: { countDocuments: async () => state.counts.apps } }));
vi.mock('../models/HostedDeployment.js', () => ({ default: { countDocuments: async () => state.counts.launches } }));
vi.mock('../models/CapabilityRequest.js', () => ({ default: { countDocuments: async () => state.counts.capabilityBuilds } }));

const { checkEntitlement, usageSummary, deploymentCeilingUsd, PLANS } = await import('../services/entitlements.js');

const USER = '000000000000000000000abc';

beforeEach(() => {
  state.role = 'user'; state.plan = null;
  state.counts = { newBp: 0, activeBp: 0, apps: 0, launches: 0, capabilityBuilds: 0 };
});

describe('the admin account', () => {
  beforeEach(() => {
    state.role = 'admin';
    // Well past every Hobby limit, and no AccountPlan row at all.
    state.counts = { newBp: 40, activeBp: 40, apps: 40, launches: 40, capabilityBuilds: 40 };
  });

  it('is never refused a blueprint, an application or a launch', async () => {
    for (const action of ['blueprint', 'application', 'launch']) {
      const v = await checkEntitlement(USER, action);
      expect(v.allowed, action).toBe(true);
      expect(v.plan).toBe('enterprise');
    }
  });

  it('reads as Enterprise, marked as coming from the role', async () => {
    const s = await usageSummary(USER);
    expect(s.effective).toBe('enterprise');
    expect(s.viaAdmin).toBe(true);
    expect(s.lapsed).toBe(false);
    expect(s.limits).toEqual(PLANS.enterprise);
    // Usage is still counted honestly; it just never bites.
    expect(s.used.newBlueprints).toBe(40);
  });

  it('gets the Enterprise deployment ceiling, not Hobby\'s', async () => {
    expect(await deploymentCeilingUsd(USER)).toBe(PLANS.enterprise.deploymentCostUsd);
  });

  it('is exempt even when a lapsed paid plan is on record', async () => {
    state.plan = { plan: 'pro', status: 'past_due' };
    const v = await checkEntitlement(USER, 'blueprint');
    expect(v.allowed).toBe(true);
    expect((await usageSummary(USER)).lapsed).toBe(false);
  });
});

describe('everyone else', () => {
  it('a Hobby account at its monthly limit is still refused', async () => {
    state.counts.newBp = 1;
    const v = await checkEntitlement(USER, 'blueprint');
    expect(v.allowed).toBe(false);
    expect(v.upgradeTo).toBe('pro');
    expect((await usageSummary(USER)).viaAdmin).toBe(false);
  });

  it('an account with no User record resolves as Hobby, never as admin', async () => {
    state.role = null;
    state.counts.launches = 1;
    const v = await checkEntitlement(USER, 'launch');
    expect(v.allowed).toBe(false);
  });
});

/**
 * Building what the Learner planned.
 *
 * The loop notices and plans for every account; building rewrites a running
 * application and spends real money, so it is a press by a person and a paid
 * plan. Hobby sees the capability and the reason it cannot build it.
 */
describe('who may build a capability', () => {
  it('refuses Hobby, and names the plan that would', async () => {
    const v = await checkEntitlement(USER, 'capability');
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/Pro/);
    expect(PLANS.hobby.capabilityBuilds).toBe(0);
  });

  it('allows Pro until its monthly number is used', async () => {
    state.plan = { plan: 'pro', status: 'active' };
    expect((await checkEntitlement(USER, 'capability')).allowed).toBe(true);
    state.counts.capabilityBuilds = PLANS.pro.capabilityBuilds;
    const spent = await checkEntitlement(USER, 'capability');
    expect(spent.allowed).toBe(false);
    expect(spent.reason).toMatch(/builds \d+ of these a month/);
  });

  it('never refuses the admin account', async () => {
    state.role = 'admin';
    state.counts.capabilityBuilds = 999;
    expect((await checkEntitlement(USER, 'capability')).allowed).toBe(true);
  });

  it('counts a build that was asked for, not one merely planned', async () => {
    // A planned request has cost nothing; charging a slot for it would refuse
    // the customer a build they never had.
    const src = await import('fs').then(fs => fs.readFileSync(
      new URL('../services/entitlements.js', import.meta.url), 'utf8'));
    expect(src).toMatch(/status: \{ \$in: \['building', 'ready', 'live', 'failed'\] \}/);
  });
});
