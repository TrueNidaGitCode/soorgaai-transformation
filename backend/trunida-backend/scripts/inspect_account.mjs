/**
 * Svarg — why is this account blocked?
 *
 * Everything one account owns, against everything its plan allows, and the
 * verdict each gate would give right now.
 *
 * Written during cloud testing, when "should I delete the old blueprint or
 * make a new one?" turned out to have a third answer neither option covered:
 * the Hobby cap counts blueprints by CREATION DATE inside a rolling 30 days,
 * so archiving one does not free the slot and deleting one only would by
 * destroying the work. The fix is an override, and the first step is seeing
 * the actual numbers rather than reasoning about them.
 *
 *   node scripts/inspect_account.mjs someone@example.com
 *
 * Read-only.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models/user.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import HostedDeployment from '../models/HostedDeployment.js';
import { usageSummary, checkEntitlement } from '../services/entitlements.js';

await mongoose.connect(process.env.MONGO_URI);
const email = process.argv[2];
const u = await User.findOne({ email }).select('_id email role createdAt').lean();
if (!u) { console.log('No account for ' + email); await mongoose.disconnect(); process.exit(1); }
console.log(`account ${u.email}  role=${u.role}  id=${u._id}`);

const bps = await TransformationBlueprint.find({ userId: u._id })
  .select('businessObjective status archived createdAt opportunityApproval').sort({ createdAt: -1 }).lean();
console.log(`\nblueprints: ${bps.length}`);
for (const b of bps) {
  const days = ((Date.now() - new Date(b.createdAt)) / 86400000).toFixed(1);
  console.log(`  ${b.createdAt.toISOString().slice(0,10)} (${days}d ago)  ${b.status}`
    + `${b.archived ? ' ARCHIVED' : ''}${b.opportunityApproval?.approved ? ' approved' : ''}`
    + `  ${String(b.businessObjective).slice(0,60)}`);
  console.log(`      id ${b._id}`);
}

const apps = await GeneratedApplication.find({ userId: u._id }).select('status blueprintId useCase').lean();
console.log(`\napplications: ${apps.length}` + apps.map(a => `\n  ${a.status}  ${a.useCase || '(no use case)'}`).join(''));
const deps = await HostedDeployment.find({ userId: u._id }).select('status blueprintId').lean();
console.log(`deployments: ${deps.length}` + deps.map(d => `\n  ${d.status}`).join(''));

const s = await usageSummary(u._id);
console.log(`\nplan: ${s.plan} (${s.status})  effective: ${s.effective}`);
console.log(`limits: ${JSON.stringify(s.limits)}`);
console.log(`used:   ${JSON.stringify(s.used)}`);
console.log(`window resets: ${s.windowResetsAt ? s.windowResetsAt.toISOString().slice(0,10) : 'n/a'}`);
for (const a of ['blueprint', 'application', 'launch']) {
  const v = await checkEntitlement(u._id, a);
  console.log(`  ${a.padEnd(12)} ${v.allowed ? 'ALLOWED' : 'REFUSED — ' + v.reason}`);
}
await mongoose.disconnect();
