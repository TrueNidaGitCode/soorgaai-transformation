/**
 * Who may have an account, and how to stop paying.
 *
 * A delivered application had no seat limit at all. Anyone Svarg could sign in
 * was upserted into the tenant's users on first arrival, so an academy on a
 * one-person plan could put thirty coaches into its application and no part of
 * Svarg noticed — the plan said one account and the application had never been
 * told there was a limit.
 *
 * And there was no way to cancel. The only paths were an admin setting a tier
 * and a card eventually failing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PLANS } from '../services/entitlements.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('seats are part of the plan', () => {
  it('gives Pro one account, because Pro is one person', () => {
    expect(PLANS.hobby.seats).toBe(1);
    expect(PLANS.pro.seats).toBe(1);
  });

  it('makes Ultra the answer to "we need the team in here"', () => {
    expect(PLANS.ultra.seats).toBe(5);
    expect(PLANS.ultra.seats).toBeGreaterThan(PLANS.pro.seats);
  });

  it('leaves Enterprise unlimited, for thirty coaches and four admins', () => {
    expect(PLANS.enterprise.seats).toBeNull();
  });

  it('travels to the application, because only it can count its accounts', () => {
    const deploy = read('../services/deployTargetService.js');
    expect(deploy).toContain('APP_SEATS: String(seats)');
    expect(deploy).toContain('APP_PLAN_LABEL: String(planLabel)');
    // And the go-live path actually supplies them.
    const ctrl = read('../controllers/deploymentController.js');
    expect(ctrl).toContain('seats: plan?.limits?.seats ?? null');
    expect(ctrl).toContain("planLabel: plan?.limits?.label || ''");
  });
});

describe('the gate in the delivered application', () => {
  const auth = read('../eame-template/controllers/authController.js');

  it('checks before creating the account, not after', () => {
    // The upsert is what grants access; a check after it has already granted.
    const gateAt = auth.indexOf('const seatCheck = await seatFor(email)');
    const upsertAt = auth.indexOf('findOneAndUpdate');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(upsertAt);
  });

  it('never turns away somebody who already has an account', () => {
    // Locking a coach out mid-season over billing is a support incident, not
    // a nudge. The limit stops the NEXT person.
    expect(auth).toMatch(/const existing = await usersCollection\(\)\.findOne\(\{ email \}/);
    expect(auth).toMatch(/if \(existing\) return \{ refused: false \}/);
  });

  it('says which plan it is and that a person will follow up', () => {
    expect(auth).toContain('The SvargAI team will get back to you about adding more people.');
    expect(auth).toContain('APP_PLAN_LABEL');
  });

  it('treats no limit as unlimited, so older applications are unchanged', () => {
    expect(auth).toMatch(/Absent means unlimited/);
    expect(auth).toMatch(/if \(!limit\) return \{ refused: false \}/);
  });

  it('lets people in when the check itself breaks', () => {
    // A seat check that cannot run must not become a locked door.
    expect(auth).toContain('seat check failed, letting them in');
  });
});

describe('cancelling', () => {
  const billing = read('../controllers/billingController.js');
  const routes = read('../routes/billingRoutes.js');
  const ent = read('../services/entitlements.js');

  it('is reachable, and so is changing your mind', () => {
    expect(routes).toContain("router.post('/cancel',                 protect, cancelSubscription)");
    expect(routes).toContain("router.post('/resume',                 protect, resumeSubscription)");
  });

  it('does NOT take the plan away the moment it is recorded', () => {
    /*
     * This is the bug the feature would have shipped with. lapsed was
     * `status !== 'active'`, so writing 'cancelling' dropped the account to
     * Hobby immediately — the opposite of what the cancellation message
     * promises, and it would have taken a running application down the same
     * afternoon somebody cancelled.
     */
    expect(ent).toContain("const cancelling = status === 'cancelling' && !periodOver;");
    expect(ent).toContain("const lapsed = plan !== 'hobby' && status !== 'active' && !cancelling;");
  });

  it('lapses once the paid period is genuinely over', () => {
    expect(ent).toMatch(/const periodOver = doc\?\.currentPeriodEnd/);
    expect(ent).toContain('<= Date.now()');
  });

  it('says there is nothing to cancel on a free account', () => {
    expect(billing).toContain('This account is on Hobby, which is free');
  });

  it('tells them when it ends rather than only that it ended', () => {
    expect(billing).toContain('will not renew. Everything keeps working until');
  });
});

describe('asking for a bigger plan', () => {
  const billing = read('../controllers/billingController.js');
  const routes = read('../routes/billingRoutes.js');

  it('records the request instead of pretending to take money', () => {
    expect(routes).toContain("router.post('/upgrade-request',");
    expect(billing).toContain('upgradeRequest');
    expect(billing).toContain('the SvargAI team will get back to you about enabling');
  });

  it('keeps it on the account, where it cannot quietly disappear', () => {
    const model = read('../models/AccountPlan.js');
    expect(model).toContain('upgradeRequest');
    expect(model).toMatch(/askedAt: \{ type: Date,   default: null \}/);
  });

  it('names the seats the asked-for plan actually carries', () => {
    expect(billing).toContain('seats: PLANS[wanted].seats');
  });
});
