/**
 * Svarg — what one generation costs, and how long each product takes
 *
 * The usage ledger aggregates per user per month, so it answers "what have we
 * spent" and not "what does one customer cost". A month that included four
 * rebuilds and a failed provider swap says nothing useful about unit economics.
 *
 * This snapshots the ledger before a run and diffs it after, so the numbers
 * belong to exactly one journey through the products.
 *
 *   node scripts/measure_run.mjs before <email>
 *   ... run Cob, Aria, Arth, Eame, Yusu ...
 *   node scripts/measure_run.mjs after  <email> [blueprintId]
 *
 * Timing comes from the records themselves rather than a stopwatch: the
 * blueprint, its datasets, the build and the deployment each carry timestamps,
 * and the gaps between them are the stages.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const [mode, email, blueprintId] = process.argv.slice(2);
if (!['before', 'after'].includes(mode) || !email) {
  console.error('Usage: node scripts/measure_run.mjs before|after <email> [blueprintId]');
  process.exit(2);
}

const SNAP = path.join(process.cwd(), '.baselines', 'run-snapshot.json');

await mongoose.connect(process.env.MONGO_URI);
const { User } = await import('../models/User.js');
const UsageLedger = (await import('../models/UsageLedger.js')).default;

const user = await User.findOne({ email: new RegExp('^' + email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
if (!user) { console.error('No such user: ' + email); process.exit(1); }

/** The ledger flattened to plain numbers, so two snapshots can be subtracted. */
async function readLedger() {
  const rows = await UsageLedger.find({ userId: user._id }).lean();
  const total = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const byStage = {};
  for (const r of rows) {
    total.calls += r.calls || 0;
    total.inputTokens += r.inputTokens || 0;
    total.outputTokens += r.outputTokens || 0;
    total.costUsd += r.costUsd || 0;
    const entries = r.byStage instanceof Map ? [...r.byStage.entries()] : Object.entries(r.byStage || {});
    for (const [name, s] of entries) {
      const b = byStage[name] || (byStage[name] = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
      b.calls += s.calls || 0;
      b.inputTokens += s.inputTokens || 0;
      b.outputTokens += s.outputTokens || 0;
      b.costUsd += s.costUsd || 0;
    }
  }
  return { total, byStage };
}

if (mode === 'before') {
  fs.mkdirSync(path.dirname(SNAP), { recursive: true });
  const snap = { email, at: new Date().toISOString(), ledger: await readLedger() };
  fs.writeFileSync(SNAP, JSON.stringify(snap, null, 2));
  console.log('\nSnapshot taken for ' + email);
  console.log('  calls so far this month: ' + snap.ledger.total.calls
    + '  ($' + snap.ledger.total.costUsd.toFixed(4) + ')');
  console.log('\nRun the journey, then: node scripts/measure_run.mjs after ' + email + ' <blueprintId>\n');
  await mongoose.disconnect();
  process.exit(0);
}

// ── after ───────────────────────────────────────────────────────────────────
if (!fs.existsSync(SNAP)) {
  console.error('No snapshot found. Run "before" first.');
  process.exit(1);
}
const before = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
const now = await readLedger();

const STAGE_ORDER = ['cob', 'aria', 'arth', 'eame', 'yusu', 'other'];
const delta = {};
for (const name of new Set([...Object.keys(now.byStage), ...Object.keys(before.ledger.byStage)])) {
  const a = now.byStage[name] || { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const b = before.ledger.byStage[name] || { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const d = {
    calls: a.calls - b.calls,
    inputTokens: a.inputTokens - b.inputTokens,
    outputTokens: a.outputTokens - b.outputTokens,
    costUsd: a.costUsd - b.costUsd,
  };
  if (d.calls || d.costUsd) delta[name] = d;
}

console.log('\nOne run — ' + email);
console.log('from ' + before.at.slice(0, 19) + ' to ' + new Date().toISOString().slice(0, 19) + '\n');

console.log('  stage       calls      in       out        cost');
console.log('  ' + '─'.repeat(52));
let totalCost = 0, totalCalls = 0;
for (const name of [...STAGE_ORDER, ...Object.keys(delta).filter(n => !STAGE_ORDER.includes(n))]) {
  const d = delta[name];
  if (!d) continue;
  totalCost += d.costUsd; totalCalls += d.calls;
  console.log('  ' + name.padEnd(10)
    + String(d.calls).padStart(6)
    + String(d.inputTokens).padStart(9)
    + String(d.outputTokens).padStart(10)
    + ('$' + d.costUsd.toFixed(4)).padStart(12));
}
console.log('  ' + '─'.repeat(52));
console.log('  ' + 'TOTAL'.padEnd(10) + String(totalCalls).padStart(6) + ' '.repeat(19)
  + ('$' + totalCost.toFixed(4)).padStart(12));

// ── How long each stage took ────────────────────────────────────────────────
if (blueprintId) {
  const BP = (await import('../models/TransformationBlueprint.js')).default;
  const LPD = (await import('../models/LinkedProjectDocument.js')).default;
  const GA = (await import('../models/GeneratedApplication.js')).default;
  const HD = (await import('../models/HostedDeployment.js')).default;

  const bp = await BP.findById(blueprintId).lean();
  if (bp) {
    const docs = await LPD.find({ blueprintId }).select('createdAt updatedAt').lean();
    const build = await GA.findOne({ blueprintId }).select('createdAt updatedAt').lean();
    const dep = await HD.findOne({ blueprintId }).select('createdAt preparedAt liveAt').lean();

    const span = (from, to) => (from && to) ? ((new Date(to) - new Date(from)) / 1000).toFixed(1) + 's' : '—';
    const first = arr => arr.length ? new Date(Math.min(...arr.map(d => +new Date(d.createdAt)))) : null;
    const last = arr => arr.length ? new Date(Math.max(...arr.map(d => +new Date(d.updatedAt)))) : null;

    console.log('\n  stage          elapsed   (from record timestamps)');
    console.log('  ' + '─'.repeat(52));
    console.log('  cob' + ' '.repeat(11) + span(bp.createdAt, bp.updatedAt).padStart(8)
      + '   blueprint created -> last written');
    console.log('  aria' + ' '.repeat(10) + span(first(docs), last(docs)).padStart(8)
      + '   ' + docs.length + ' dataset(s)');
    console.log('  eame' + ' '.repeat(10) + span(build?.createdAt, build?.updatedAt).padStart(8)
      + '   generate + verify');
    console.log('  yusu' + ' '.repeat(10) + span(dep?.preparedAt || dep?.createdAt, dep?.liveAt).padStart(8)
      + '   prepared -> live');
  }
}

// ── Unit economics ──────────────────────────────────────────────────────────
const RATE = parseFloat(process.env.INR_PER_USD || '0');
console.log('\n  ' + '─'.repeat(52));
if (RATE > 0) {
  console.log('  model cost this run: $' + totalCost.toFixed(4)
    + '  =  Rs ' + (totalCost * RATE).toFixed(2) + '  (at Rs ' + RATE + '/$)');
} else {
  console.log('  model cost this run: $' + totalCost.toFixed(4));
  console.log('  set INR_PER_USD in .env to see this in rupees');
}
console.log('  This is INFERENCE ONLY. Hosting, the tenant database and the');
console.log('  Railway tenant a customer keeps running are not in the ledger.\n');

await mongoose.disconnect();
