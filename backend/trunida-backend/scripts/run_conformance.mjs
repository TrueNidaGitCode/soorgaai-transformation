/**
 * Run the AI conformance checks against a delivered application, end to end.
 *
 * The real path, not a simulation of it: it finds the deployment, derives the
 * same tenant secret Svarg derives, signs the same short-lived token the
 * server signs, and calls the running application's own /api/conformance.
 *
 * Costs three real model calls against that tenant's cap (~₹0.60), which is
 * why it is a script somebody runs rather than a sweep.
 *
 *   node scripts/run_conformance.mjs                 # the only live app
 *   node scripts/run_conformance.mjs "Six Cricket"   # by name
 *   node scripts/run_conformance.mjs --dry           # find it, sign, send nothing
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { tenantAuthSecret } from '../services/tenantAuthService.js';
import jwt from 'jsonwebtoken';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const wanted = args.filter(a => !a.startsWith('--')).join(' ').trim();

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const db = mongoose.connection;

const deps = await db.collection('hosteddeployments')
  .find({ status: { $in: ['live', 'degraded'] } })
  .project({ _id: 1, status: 1, blueprintId: 1, 'railway.url': 1 })
  .toArray();

if (!deps.length) {
  console.log('No running deployment to check.');
  await mongoose.disconnect();
  process.exit(0);
}

// Name each one from its blueprint, so a choice can be made by name.
for (const d of deps) {
  const bp = await db.collection('transformationblueprints')
    .findOne({ _id: d.blueprintId }, { projection: { appName: 1 } });
  d.appName = bp?.appName || '';
}

// Matched on the address as well as the name: two customers can have an
// application of the same name, and telling them apart is the whole point.
const pick = wanted
  ? deps.find(d => (d.appName || '').toLowerCase().includes(wanted.toLowerCase())
                || String(d.railway?.url || '').toLowerCase().includes(wanted.toLowerCase()))
  : deps[0];

if (!pick) {
  console.log(`No running application matching "${wanted}". Running: ${deps.map(d => d.appName || d._id).join(', ')}`);
  await mongoose.disconnect();
  process.exit(1);
}

const url = String(pick.railway?.url || '').replace(/\/+$/, '');
console.log(`${pick.appName || '(unnamed)'}  ${pick.status}  ${url}`);

const secret = tenantAuthSecret(String(pick._id));
if (!secret) {
  console.log('No JWT_SECRET in this environment, so the tenant secret cannot be derived.');
  await mongoose.disconnect();
  process.exit(1);
}
const token = jwt.sign({ purpose: 'conformance' }, secret, {
  issuer: 'svarg', audience: String(pick._id), expiresIn: '2m',
});
console.log(`token signed (${token.length} chars), audience ${pick._id}`);

if (dry) {
  console.log('--dry: nothing sent, nothing spent.');
  await mongoose.disconnect();
  process.exit(0);
}

console.log('asking the application to check itself — three real questions, this takes a minute…');
const started = Date.now();
const res = await fetch(`${url}/api/conformance`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: '{}',
  signal: AbortSignal.timeout(120_000),
});
const report = await res.json().catch(() => null);
console.log(`HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

if (!report) {
  console.log('The application did not answer with a report.');
} else if (!Array.isArray(report.checks)) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const mark = (c) => (c.skipped ? 'SKIP' : c.passed ? 'PASS' : 'FAIL');
  let standard = '';
  for (const c of report.checks) {
    if (c.standard !== standard) { standard = c.standard; console.log(`\n${standard}`); }
    console.log(`  ${mark(c).padEnd(5)} ${c.name}`);
    console.log(`        ${c.detail || ''}`);
  }
  console.log(`\n${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`
    + `${report.dataset ? `  (counted against ${report.dataset.name}: ${report.dataset.records} records)` : ''}`);
}

await mongoose.disconnect();
