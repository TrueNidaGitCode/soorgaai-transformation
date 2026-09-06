/**
 * Svarg — what each plan actually allows
 *
 * Exercises services/entitlements.js against a real database, because every
 * limit is a count over real collections and a mocked count would only prove
 * the arithmetic, not the queries. Blueprints, applications and deployments
 * are created under throwaway user ids and removed afterwards, so this never
 * touches a real account.
 *
 *   node scripts/test_entitlements.mjs
 *
 * What it is guarding against, specifically:
 *   - a refusal that does not name a way forward, which is a dead end at the
 *     exact moment a customer decides whether to pay
 *   - a lapsed subscription hiding work the customer already made
 *   - an override being wiped by a lapse, or a lapse being ignored
 *   - a limit counting a failed build, which charges for something that does
 *     not run
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import AccountPlan from '../models/AccountPlan.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import HostedDeployment from '../models/HostedDeployment.js';
import {
  checkEntitlement, usageSummary, deploymentCeilingUsd, PLANS, PERIOD_MS,
} from '../services/entitlements.js';

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is not set — this test needs a database.');
  process.exit(2);
}
await mongoose.connect(process.env.MONGO_URI);

let pass = true;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) pass = false;
};

const users = [];
function newUser() {
  const id = new mongoose.Types.ObjectId();
  users.push(id);
  return id;
}

/**
 * The marker every fixture blueprint carries.
 *
 * Cleanup keys on the throwaway user ids this process created, which is right
 * while the process is alive and useless once it is not: a run killed partway
 * leaves rows whose ids nobody remembers, and they sit in the database
 * indefinitely. Four blueprints and two applications were found doing exactly
 * that. So the objective doubles as a durable label, and every run sweeps
 * whatever an earlier one abandoned.
 */
const FIXTURE_OBJECTIVE = 'Entitlement test objective, long enough to be real.';

/** Remove fixtures from THIS run and from any run that did not finish. */
async function sweepFixtures(ids = []) {
  const stale = await TransformationBlueprint
    .find({ businessObjective: FIXTURE_OBJECTIVE }).select('userId').lean().catch(() => []);
  const owners = [...new Set([...ids, ...stale.map(b => b.userId)].map(String))]
    .map(id => new mongoose.Types.ObjectId(id));
  if (!owners.length) return 0;

  await Promise.all([
    TransformationBlueprint.deleteMany({ userId: { $in: owners } }),
    GeneratedApplication.deleteMany({ userId: { $in: owners } }),
    HostedDeployment.deleteMany({ userId: { $in: owners } }),
    AccountPlan.deleteMany({ userId: { $in: owners } }),
  ]);
  return owners.length;
}

async function makeBlueprint(userId, { createdAt = new Date(), archived = false } = {}) {
  const bp = await TransformationBlueprint.create({
    userId, businessObjective: FIXTURE_OBJECTIVE,
    industry: 'General', companyName: 'Test Co', archived,
  });
  // createdAt is set by timestamps, so an "old" blueprint has to be written
  // afterwards — the rolling window is the whole point of the Hobby cap and a
  // test that only ever uses "now" would never exercise it.
  //
  // Through the raw collection, because Mongoose marks createdAt immutable and
  // silently DROPS it from an update rather than erroring. That is exactly how
  // this assertion passed while testing nothing.
  if (createdAt.getTime() !== bp.createdAt?.getTime()) await backdate(bp._id, createdAt);
  return bp;
}

/** Raw driver: Mongoose will not let createdAt be updated through the model. */
const backdate = (id, when) =>
  TransformationBlueprint.collection.updateOne({ _id: id }, { $set: { createdAt: when } });

const makeApp = (userId, blueprintId, status = 'passed') =>
  GeneratedApplication.create({ userId, blueprintId, status });

const makeDeployment = (userId, blueprintId, status = 'live') =>
  HostedDeployment.create({ userId, blueprintId, status });

const setPlan = (userId, plan, extra = {}) =>
  AccountPlan.findOneAndUpdate({ userId }, { $set: { userId, plan, ...extra } }, { upsert: true });

try {
  // ── 1. Hobby: one blueprint a month ──────────────────────────────────────
  console.log('1. Hobby is capped at one new blueprint a month');
  {
    const u = newUser();
    const first = await checkEntitlement(u, 'blueprint');
    check('the first is allowed', first.allowed === true, first.reason || '');

    await makeBlueprint(u);
    const second = await checkEntitlement(u, 'blueprint');
    check('the second is refused', second.allowed === false);
    check('the refusal names Pro', second.upgradeTo === 'pro', `named "${second.upgradeTo}"`);
    check('the refusal says when it frees up', /frees up on \d{4}-\d{2}-\d{2}/.test(second.reason || ''),
      second.reason || '');

    // The window is what makes this a monthly cap rather than a lifetime one.
    const old = await TransformationBlueprint.findOne({ userId: u }).select('_id').lean();
    await backdate(old._id, new Date(Date.now() - PERIOD_MS - 60000));
    const moved = await TransformationBlueprint.findById(old._id).select('createdAt').lean();
    check('the fixture actually moved',
      Date.now() - new Date(moved.createdAt).getTime() > PERIOD_MS,
      `createdAt is ${moved.createdAt.toISOString()}`);
    const later = await checkEntitlement(u, 'blueprint');
    check('a blueprint older than the window does not count', later.allowed === true, later.reason || '');
  }

  // ── 2. Hobby: one application ────────────────────────────────────────────
  console.log('\n2. Hobby builds one application');
  {
    const u = newUser();
    const bp = await makeBlueprint(u);
    check('the first is allowed', (await checkEntitlement(u, 'application')).allowed === true);

    await makeApp(u, bp._id, 'passed');
    const second = await checkEntitlement(u, 'application');
    check('the second is refused', second.allowed === false);
    check('the refusal names Pro', second.upgradeTo === 'pro', `named "${second.upgradeTo}"`);
  }

  console.log('\n3. a build that failed does not spend the slot');
  {
    const u = newUser();
    const bp = await makeBlueprint(u);
    await makeApp(u, bp._id, 'failed');
    const verdict = await checkEntitlement(u, 'application');
    check('still allowed after a failed build', verdict.allowed === true, verdict.reason || '');
  }

  // ── 4. Pro ───────────────────────────────────────────────────────────────
  console.log('\n4. Pro lifts the monthly cap but holds one active objective');
  {
    const u = newUser();
    await setPlan(u, 'pro');
    const bp = await makeBlueprint(u);

    const second = await checkEntitlement(u, 'blueprint');
    check('a second objective is refused', second.allowed === false, second.reason || '');
    check('the refusal names Ultra', second.upgradeTo === 'ultra', `named "${second.upgradeTo}"`);

    // Archiving is the escape hatch the refusal message promises.
    await TransformationBlueprint.updateOne({ _id: bp._id }, { $set: { archived: true } });
    const afterArchive = await checkEntitlement(u, 'blueprint');
    check('archiving the first frees a slot', afterArchive.allowed === true, afterArchive.reason || '');

    // Every opportunity in that objective, which is what Pro sells.
    await TransformationBlueprint.updateOne({ _id: bp._id }, { $set: { archived: false } });
    for (let i = 0; i < 5; i++) await makeApp(u, bp._id, 'passed');
    check('five applications are allowed', (await checkEntitlement(u, 'application')).allowed === true);
  }

  // ── 5. Launches ──────────────────────────────────────────────────────────
  console.log('\n5. launches are capped per tier');
  {
    for (const [plan, cap] of [['hobby', 1], ['pro', 3], ['ultra', 10]]) {
      const u = newUser();
      if (plan !== 'hobby') await setPlan(u, plan);
      for (let i = 0; i < cap; i++) {
        const bp = await makeBlueprint(u, { createdAt: new Date(Date.now() - PERIOD_MS - 1000) });
        await makeDeployment(u, bp._id, 'live');
      }
      const verdict = await checkEntitlement(u, 'launch');
      check(`${plan} refuses launch ${cap + 1}`, verdict.allowed === false, verdict.reason || '');

      // A destroyed deployment is not running, so it must not hold a slot.
      await HostedDeployment.updateOne({ userId: u }, { $set: { status: 'destroyed' } });
      check(`${plan} frees a slot when one is destroyed`,
        (await checkEntitlement(u, 'launch')).allowed === true);
    }
  }

  console.log('\n6. the inference ceiling comes from the plan, not the model default');
  {
    const hobby = newUser();
    const pro = newUser();
    await setPlan(pro, 'pro');
    check('Hobby is $2', await deploymentCeilingUsd(hobby) === 2);
    check('Pro is $5', await deploymentCeilingUsd(pro) === 5);
  }

  // ── 7. A lapsed subscription ─────────────────────────────────────────────
  console.log('\n7. a lapsed subscription blocks new work and hides nothing');
  {
    const u = newUser();
    await setPlan(u, 'pro', { status: 'past_due' });
    const bp = await makeBlueprint(u);
    for (let i = 0; i < 3; i++) await makeApp(u, bp._id, 'passed');

    const s = await usageSummary(u);
    check('the tier they bought is still Pro', s.plan === 'pro', s.plan);
    check('what applies is Hobby', s.effective === 'hobby', s.effective);
    check('their work is still counted, not hidden', s.used.applications === 3, String(s.used.applications));

    const verdict = await checkEntitlement(u, 'application');
    check('a fourth application is refused', verdict.allowed === false);
    check('the refusal explains why', /past due/i.test(verdict.reason || ''), verdict.reason || '');
  }

  // ── 8. Overrides ─────────────────────────────────────────────────────────
  console.log('\n8. an override lifts a limit without changing the tier');
  {
    const u = newUser();
    await setPlan(u, 'hobby', { overrides: { newBlueprintsPerMonth: 5 }, overrideNote: 'design partner' });
    for (let i = 0; i < 3; i++) await makeBlueprint(u);

    const s = await usageSummary(u);
    check('still on Hobby', s.plan === 'hobby', s.plan);
    check('the limit reads 5', s.limits.newBlueprintsPerMonth === 5, String(s.limits.newBlueprintsPerMonth));
    check('a fourth is allowed', (await checkEntitlement(u, 'blueprint')).allowed === true);
    check('other Hobby limits are untouched', s.limits.applications === PLANS.hobby.applications);
  }

  console.log('\n9. an override survives a lapse');
  {
    const u = newUser();
    await setPlan(u, 'pro', { status: 'cancelled', overrides: { applications: 4 } });
    const bp = await makeBlueprint(u);
    for (let i = 0; i < 3; i++) await makeApp(u, bp._id, 'passed');
    const verdict = await checkEntitlement(u, 'application');
    check('the granted exception still applies', verdict.allowed === true, verdict.reason || '');
  }

  console.log('\n10. a guest is never gated');
  {
    check('no user id means allowed', (await checkEntitlement(null, 'blueprint')).allowed === true);
  }

} finally {
  // Always, even on a thrown assertion. Sweeps this run's fixtures and any an
  // earlier run abandoned — see sweepFixtures for why the second half matters.
  await sweepFixtures(users);
  await mongoose.disconnect();
}

console.log(pass ? '\nPASS — every plan allows and refuses what it says it does' : '\nFAILED');
process.exit(pass ? 0 : 1);
