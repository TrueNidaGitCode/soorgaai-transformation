/**
 * The continuous builder, one full cycle, watched.
 *
 * Somebody uses their application, says something a coach would say, and the
 * application changes because of it. That is the loop Svarg sells, and until
 * now nobody had seen it run. This drives it stage by stage and prints what
 * each one did:
 *
 *   1  a question asked inside the application
 *   2  a correction reported back, the way a live application reports one
 *   3  the Learner reads the signals and updates what it understands
 *   4  the planner decides whether that is worth building, and plans it
 *   5  the build runs                              (only with --build)
 *   6  it appears on the Blueprints page as a journey
 *
 * ── Why it does not touch your real objective ─────────────────────────────
 *
 * Stages 3 to 5 write to SVARG's database, not the tenant's — CustomerUnder-
 * standing, CapabilityRequest, and a build that pushes to GitHub and redeploys
 * a running application. So this invents a THROWAWAY blueprint and deployment,
 * runs the cycle against those, and deletes them afterwards. Your cricket
 * objective is never read, never decided about and never rebuilt.
 *
 * Stage 5 is opt-in for the same reason: a build spends real money and takes
 * minutes. Without --build the run stops at a planned capability, which is the
 * decision the loop exists to make.
 *
 * Usage, from backend/trunida-backend:
 *   node scripts/app-checks/cycle_check.mjs
 *   node scripts/app-checks/cycle_check.mjs --build          also run the build
 *   node scripts/app-checks/cycle_check.mjs --keep           leave the rows behind
 *   node scripts/app-checks/cycle_check.mjs --provider=openai
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BEU = BE.split(path.sep).join('/');
dotenv.config({ path: path.join(BE, '.env') });

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3) || d;
const has = (n) => process.argv.includes(`--${n}`);
if (arg('provider', '')) process.env.PROVIDER_CHAIN = arg('provider', '');

const say = (n, what) => console.log(`\n${n}. ${what}`);
const ok = (m) => console.log(`   ✓ ${m}`);
const no = (m) => console.log(`   ✗ ${m}`);
const note = (m) => console.log(`     ${m}`);

await mongoose.connect(process.env.MONGO_URI);

const TransformationBlueprint = (await import(`file:///${BEU}/models/TransformationBlueprint.js`)).default;
const HostedDeployment = (await import(`file:///${BEU}/models/HostedDeployment.js`)).default;
const CapabilityRequest = (await import(`file:///${BEU}/models/CapabilityRequest.js`)).default;
const CustomerUnderstanding = (await import(`file:///${BEU}/models/CustomerUnderstanding.js`)).default;
const TenantSignal = (await import(`file:///${BEU}/models/TenantSignal.js`)).default;
const { User } = await import(`file:///${BEU}/models/user.js`);
const { learnFromConversation } = await import(`file:///${BEU}/services/customerUnderstandingService.js`);
const { considerCapabilities } = await import(`file:///${BEU}/services/capabilityDecisionService.js`);
const { runNextPlannedBuild } = await import(`file:///${BEU}/services/capabilityBuildService.js`);
const { blueprintsOverview } = await import(`file:///${BEU}/services/blueprintOverviewService.js`);
const GeneratedApplication = (await import(`file:///${BEU}/models/GeneratedApplication.js`)).default;

// An account to hang it on: the admin, so entitlement gates never refuse and
// the run is about the loop rather than about billing.
const user = await User.findOne({ role: 'admin' }).lean() || await User.findOne({}).lean();
if (!user) { console.error('No user to run as.'); process.exit(1); }

/*
 * Anything a previous run left behind, swept first.
 *
 * --keep leaves its objective alive on purpose, and a need attached to a LIVE
 * objective is not an orphan — so the next run found it already planned and
 * quietly stopped testing the decision. One QA objective at a time, always.
 */
{
  const old = await TransformationBlueprint.find({ businessObjective: /^QA CYCLE CHECK/ }).select('_id').lean();
  if (old.length) {
    const ids = old.map(o => o._id);
    await CapabilityRequest.deleteMany({ blueprintId: { $in: ids.map(String) } });
    await GeneratedApplication.deleteMany({ blueprintId: { $in: ids } });
    await TenantSignal.deleteMany({ blueprintId: { $in: ids } });
    await HostedDeployment.deleteMany({ blueprintId: { $in: ids } });
    await TransformationBlueprint.deleteMany({ _id: { $in: ids } });
    console.log(`swept ${ids.length} objective(s) left by an earlier run`);
  }
  // Their needs are orphans now, and an orphan marked planned blocks the next
  // decision, so they go with them.
  const cu = await CustomerUnderstanding.findOne({ userId: user._id }).lean();
  if (cu?.needs?.length) {
    const keep = [];
    for (const n of cu.needs) {
      const alive = n.blueprintId ? await TransformationBlueprint.exists({ _id: n.blueprintId }).catch(() => null) : true;
      if (alive) keep.push(n);
    }
    if (keep.length !== cu.needs.length) {
      await CustomerUnderstanding.updateOne({ userId: user._id }, { $set: { needs: keep, signalsReadAt: null } });
      console.log(`pruned ${cu.needs.length - keep.length} orphaned need(s)`);
    }
  }
}

/*
 * A throwaway objective, shaped like the academy's so the planner has
 * something real to reason about, but its own row that can be deleted.
 */
const bp = await TransformationBlueprint.create({
  userId: user._id,
  businessObjective: 'QA CYCLE CHECK — a cricket academy tracking batches, roll calls and fee collection.',
  status: 'completed',
  appName: 'QA Cycle Academy',
  industryFit: { industry: 'Sports Academies' },
  opportunityApproval: { approved: true, approvedAt: new Date() },
});
const dep = await HostedDeployment.create({
  userId: user._id, blueprintId: bp._id, hosting: 'svarg', status: 'live',
  railway: { url: 'https://qa-cycle.invalid' }, dbName: 'tenant_qa_cycle', liveAt: new Date(),
});
/*
 * CustomerUnderstanding is ONE document per user, not one per objective, so
 * deleting it would throw away what Svarg has learned about every real
 * blueprint this account owns — and NOT deleting it leaves this run's needs
 * behind, marked planned, so the next run finds no candidate and the check
 * quietly stops testing anything. Snapshot it, and put it back exactly.
 */
const before = await CustomerUnderstanding.findOne({ userId: user._id }).lean();

console.log(`throwaway objective ${bp._id} — deleted at the end${has('keep') ? ' (kept: --keep)' : ''}`);

let exitCode = 0;
const cleanup = async () => {
  if (has('keep')) return;
  await CapabilityRequest.deleteMany({ blueprintId: String(bp._id) });
  // --build writes one of these; without it a throwaway objective leaves a
  // generated application behind that nothing will ever deliver.
  await GeneratedApplication.deleteMany({ blueprintId: bp._id });
  if (before) {
    await CustomerUnderstanding.updateOne({ userId: user._id }, { $set: {
      needs: before.needs || [],
      signalsReadAt: before.signalsReadAt || null,
      lastLearnedAt: before.lastLearnedAt || null,
      learnCount: before.learnCount || 0,
    } });
  } else {
    await CustomerUnderstanding.deleteOne({ userId: user._id });
  }
  // A need whose objective no longer exists is this check's litter, and left
  // behind it is marked planned — so the next run finds no candidate and
  // silently stops testing the decision at all.
  const left = await CustomerUnderstanding.findOne({ userId: user._id }).lean();
  if (left?.needs?.length) {
    const keep = [];
    for (const n of left.needs) {
      const alive = n.blueprintId ? await TransformationBlueprint.exists({ _id: n.blueprintId }).catch(() => null) : true;
      if (alive) keep.push(n);
    }
    if (keep.length !== left.needs.length) {
      await CustomerUnderstanding.updateOne({ userId: user._id }, { $set: { needs: keep, signalsReadAt: null } });
    }
  }
  await TenantSignal.deleteMany({ blueprintId: bp._id });
  await HostedDeployment.deleteOne({ _id: dep._id });
  await TransformationBlueprint.deleteOne({ _id: bp._id });
  console.log('\nthrowaway objective deleted.');
};

try {
  // ── 1 & 2. What the customer's people did ────────────────────────────────
  say(1, 'Somebody asks inside the application');
  note('"who has not paid their fees this month?"');
  ok('answered by the application (the QA suite covers the answer itself)');

  say(2, 'The application reports what happened, the way a live one does');
  const at = new Date();
  const signals = [
    { kind: 'question_asked', capability: 'fees', at },
    { kind: 'feedback', vote: 'down', capability: 'fees', at },
    { kind: 'correction', capability: 'fees', at,
      correction: 'we keep having to chase parents for fees by hand every month — I want it to draft the reminders' },
    { kind: 'correction', capability: 'fees', at,
      correction: 'again this month, I had to write to every parent who owes money myself' },
    { kind: 'correction', capability: 'fees', at,
      correction: 'please can it prepare the fee reminders for the parents who have not paid' },
  ];
  await TenantSignal.insertMany(signals.map(s => ({
    ...s, deploymentId: dep._id, blueprintId: bp._id, userId: user._id, receivedAt: new Date(),
  })));
  ok(`${signals.length} signals recorded — 1 question, 1 downvote, 3 corrections`);
  note('a correction or a downvote is what wakes the Learner; a question alone does not');

  // ── 3. The Learner ───────────────────────────────────────────────────────
  say(3, 'The Learner reads them and updates what it understands');
  const learned = await learnFromConversation({ userId: user._id, blueprintId: bp._id, force: true });
  if (learned?.learned) {
    const cu = await CustomerUnderstanding.findOne({ userId: user._id }).lean();
    const needs = cu?.needs || [];
    ok(`understanding updated — ${needs.length} need(s) held`);
    needs.slice(0, 5).forEach(n => note(`· "${String(n.text || '').slice(0, 90)}" — mentioned ${n.mentions || 1}, ${n.status}`));
  } else {
    no(`the Learner did not run: ${learned?.reason || 'no reason given'}`);
    note('with no model capacity the cycle stops here — the stages below are not reached');
  }

  // ── 4. The decision ──────────────────────────────────────────────────────
  say(4, 'The planner decides whether that is worth building');
  const decided = await considerCapabilities({ userId: user._id, blueprintId: bp._id, blueprint: bp.toObject() });
  if (decided?.decided) {
    ok(`decided to build: "${decided.plan?.title || decided.need}"`);
    note(`from the need: "${String(decided.need || '').slice(0, 90)}"`);
    if (decided.plan?.summary) note(decided.plan.summary);
    (decided.plan?.steps || []).slice(0, 4).forEach(x => note(`· ${x}`));
    if (decided.plan?.dataNeeded?.length) note(`data it needs: ${decided.plan.dataNeeded.join(', ')}`);
    if (decided.plan?.connectorsNeeded?.length) note(`needs connected: ${decided.plan.connectorsNeeded.join(', ')}`);
  } else {
    no(`nothing decided: ${decided?.reason || 'no reason given'}`);
    if (decided?.reason === 'nothing-learned') note('there is no understanding to act on, because stage 3 did not run');
  }

  // ── 5. The build ─────────────────────────────────────────────────────────
  say(5, 'The build');
  if (!has('build')) {
    note('skipped — a build spends real money and rewrites an application. Pass --build to run it.');
  } else {
    const built = await runNextPlannedBuild({ blueprintId: String(bp._id) });
    if (built?.built) ok(`built and verified: ${built.title || ''}`);
    else {
      no(`not built: ${built?.reason || 'no reason given'}`);
      if (built?.error) note(String(built.error).slice(0, 700));
      // The summary alone says a stage failed, not what the stage saw. The
      // generated application row holds the verifier's own words.
      const ga = await GeneratedApplication.findOne({ blueprintId: bp._id }).lean();
      if (ga) {
        if (ga.reason) note(`verifier: ${String(ga.reason).slice(0, 600)}`);
        if (ga.progress?.detail) note(`last detail: ${String(ga.progress.detail).slice(0, 400)}`);
        if (ga.skipped?.length) note(`skipped: ${ga.skipped.join(', ').slice(0, 300)}`);
        note(`attempts: ${ga.progress?.attempt ?? '?'}, files kept: ${(ga.files || []).length}`);
        for (const h of ga.history || []) {
          note(`attempt ${h.attempt} — ${h.stage}: ${(h.failures || []).join(' | ').slice(0, 400) || '(no detail)'}`);
        }
      }
    }
  }

  // ── 6. What the customer sees ────────────────────────────────────────────
  say(6, 'What appears on the Blueprints page');
  const view = await blueprintsOverview(user._id);
  const mine = (view.blueprints || []).find(b => b.id === String(bp._id));
  const features = mine?.features || [];
  if (!features.length) {
    no('nothing on the pipeline yet — there is no capability to show');
  } else {
    ok(`${features.length} on the pipeline`);
    for (const f of features) {
      note(`· ${f.title} — ${f.status}, asked for ${f.mentions} time(s)`);
      if (f.need) note(`    their words: "${String(f.need).slice(0, 80)}"`);
      if (f.connectorsNeeded?.length) note(`    waiting on: ${f.connectorsNeeded.join(', ')}`);
    }
    note('this is exactly what "How your application is evolving" draws');
  }
} catch (err) {
  console.error('\ncycle check failed —', err.message);
  exitCode = 1;
} finally {
  await cleanup();
  await mongoose.disconnect();
}
process.exit(exitCode);
