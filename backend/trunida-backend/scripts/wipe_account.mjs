/**
 * Empty an account, keeping the login.
 *
 * For starting again: the person keeps their sign-in and everything they made
 * is removed — deployments destroyed, tenant databases dropped, blueprints and
 * canvases deleted.
 *
 * ── The order is the safety ────────────────────────────────────────────────
 *
 * Railway first, then the database, then the records. A deployment record is
 * the only thing that knows a Railway project exists; delete the record first
 * and a failed teardown leaves a container running that nothing will ever
 * point at again, costing money nobody can trace. So if the teardown refuses,
 * this stops and changes nothing else.
 *
 * Destroy goes through the same guards the product uses — assertDestroyable
 * refuses a protected project, and refuses anything whose project name is not
 * a Svarg tenant. This script does not reimplement them.
 *
 *   node scripts/wipe_account.mjs <email>            # show what would go
 *   node scripts/wipe_account.mjs <email> --write    # do it
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { getDeployTarget } from '../services/deployTargetService.js';

const args = process.argv.slice(2);
const email = String(args.find((a) => !a.startsWith('--')) || '').toLowerCase();
const write = args.includes('--write');

if (!email) {
  console.log('Usage: node scripts/wipe_account.mjs <email> [--write]');
  process.exit(1);
}

/**
 * Everything a person's work lives in, and the field that ties it to them.
 * The user document itself is deliberately absent: the login survives.
 */
const OWNED = [
  ['hosteddeployments',     'userId'],
  ['transformationblueprints', 'userId'],
  ['generatedapplications', 'userId'],
  ['domaincanvas',          'userId'],
  ['companywebsitepages',   'userId'],
  ['usageledgers',          'userId'],
  ['userprofiles',          'userId'],
];

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const db = mongoose.connection.db;

const users = (await db.collection('users').find({}).toArray())
  .filter((u) => String(u.email || '').toLowerCase() === email);

if (users.length !== 1) {
  console.log(users.length ? `${users.length} accounts share that address. Refusing to guess.` : 'No account with that address.');
  await mongoose.disconnect();
  process.exit(1);
}

const user = users[0];
const ids = [user._id];
console.log(`${user.email}   _id=${user._id}   role=${user.role || '-'}`);
console.log(write ? '\nWiping. The login stays.\n' : '\nDry run — pass --write to do it.\n');

// ── What is there ───────────────────────────────────────────────────────────

const deps = await db.collection('hosteddeployments').find({ userId: { $in: ids } }).toArray();
const tenantDbs = [...new Set(deps.map((d) => d.dbName).filter(Boolean))];

console.log('Deployments');
if (!deps.length) console.log('  none');
for (const d of deps) {
  console.log(`  ${String(d.status).padEnd(10)} ${d.railway?.url || '(no url)'}`);
  console.log(`      project ${d.railway?.projectId || '(none)'}   db ${d.dbName || '(none)'}`);
}

console.log('\nRecords');
for (const [name, field] of OWNED) {
  const n = await db.collection(name).countDocuments({ [field]: { $in: ids } });
  if (n) console.log(`  ${String(n).padStart(4)}  ${name}`);
}
console.log(`\nTenant databases to drop: ${tenantDbs.length ? tenantDbs.join(', ') : 'none'}`);

if (!write) { await mongoose.disconnect(); process.exit(0); }

// ── 1. Railway, first, so a refusal costs nothing ───────────────────────────

for (const d of deps) {
  if (d.status === 'destroyed') { console.log(`\nalready destroyed: ${d.railway?.url || d._id}`); continue; }
  if (d.hosting === 'self' || !d.railway?.projectId) { console.log(`\nnothing hosted to tear down: ${d._id}`); continue; }
  try {
    await getDeployTarget().destroy({ deployment: d });
    console.log(`\ndestroyed Railway project ${d.railway.projectId}`);
  } catch (err) {
    console.error(`\nTeardown refused for ${d.railway.projectId}: ${err.message}`);
    console.error('Nothing else was changed. The record still points at the project, which is the only');
    console.error('thing that can find it again.');
    await mongoose.disconnect();
    process.exit(1);
  }
}

// ── 2. The tenant databases ─────────────────────────────────────────────────

for (const name of tenantDbs) {
  try {
    await mongoose.connection.getClient().db(name).dropDatabase();
    console.log(`dropped database ${name}`);
  } catch (err) {
    console.error(`could not drop ${name}: ${err.message}`);
  }
}

// ── 3. The records ──────────────────────────────────────────────────────────

let removed = 0;
for (const [name, field] of OWNED) {
  const r = await db.collection(name).deleteMany({ [field]: { $in: ids } });
  if (r.deletedCount) { console.log(`deleted ${r.deletedCount} from ${name}`); removed += r.deletedCount; }
}

console.log(`\n${removed} record(s) removed. ${user.email} can still sign in, and has nothing.`);

await mongoose.disconnect();
