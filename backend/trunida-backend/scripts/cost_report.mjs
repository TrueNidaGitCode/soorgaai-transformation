/**
 * Svarg — what has this cost, by month
 *
 * Reads the usage ledger: every model call Svarg has made, grouped by month,
 * split by account, broken down by stage. Guest previews are their own row
 * (userId null) because the free tier is the one thing that spends without
 * anyone paying, and it needs a number rather than an intuition.
 *
 *   node scripts/cost_report.mjs           the current month
 *   node scripts/cost_report.mjs --all     every month on record
 *
 * ── Two numbers, and they answer different questions ───────────────────────
 *
 * This is the running total. For "what did THAT run cost", read the [cost]
 * line the generation logs when it finishes — one per blueprint, naming
 * calls, tokens, dollars and seconds. The ledger tells you the month; the log
 * line tells you the unit.
 *
 * ── The figure is an estimate ──────────────────────────────────────────────
 *
 * Prices come from config/modelCatalog.js, whose Gemini 3.x rates are flagged
 * in-code as carried over from 2.5 and not reconciled. 3.x also bills thinking
 * tokens as output. So treat this as a floor to check a provider invoice
 * against, not as the invoice.
 *
 * Read-only.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import UsageLedger from '../models/UsageLedger.js';
import { User } from '../models/user.js';

const ALL = process.argv.includes('--all');
const THIS_MONTH = new Date().toISOString().slice(0, 7);

const usd = n => '$' + Number(n || 0).toFixed(4);
const num = n => Number(n || 0).toLocaleString('en-US');

await mongoose.connect(process.env.MONGO_URI);

const q = ALL ? {} : { period: THIS_MONTH };
const rows = await UsageLedger.find(q).sort({ period: -1 }).lean();

if (!rows.length) {
  console.log(ALL ? 'The ledger is empty.' : `Nothing recorded for ${THIS_MONTH}.`);
  await mongoose.disconnect();
  process.exit(0);
}

// One lookup for every account named, rather than one per row.
const ids = [...new Set(rows.map(r => r.userId).filter(Boolean).map(String))];
const users = ids.length
  ? await User.find({ _id: { $in: ids } }).select('email').lean()
  : [];
const emailOf = new Map(users.map(u => [String(u._id), u.email]));

let totalCost = 0, totalCalls = 0;
let period = null;

for (const r of rows) {
  if (r.period !== period) {
    period = r.period;
    console.log(`\n${period}`);
    console.log('─'.repeat(72));
  }

  const who = r.userId
    ? (emailOf.get(String(r.userId)) || String(r.userId))
    : 'guest previews (no account)';

  console.log(`  ${who}`);
  console.log(`    ${String(r.calls).padStart(5)} calls   `
    + `${num(r.inputTokens).padStart(10)} in / ${num(r.outputTokens).padStart(9)} out   `
    + `${usd(r.costUsd).padStart(10)}`);

  // byStage is a Mongoose Map in a lean doc — a plain object here.
  const stages = Object.entries(r.byStage || {})
    .sort((a, b) => (b[1]?.costUsd || 0) - (a[1]?.costUsd || 0));
  for (const [stage, s] of stages) {
    console.log(`      ${stage.padEnd(6)} ${String(s.calls || 0).padStart(4)} calls  ${usd(s.costUsd).padStart(10)}`);
  }

  totalCost += r.costUsd || 0;
  totalCalls += r.calls || 0;
}

console.log('\n' + '═'.repeat(72));
console.log(`  ${ALL ? 'all time' : THIS_MONTH}: ${totalCalls} calls, ${usd(totalCost)}`);
// Roughly, for a sense of scale against an INR provider bill. Not a rate
// anyone should reconcile against — it is here so the number means something
// to someone reading a rupee invoice.
console.log(`  ≈ ₹${(totalCost * 88).toFixed(2)} at ₹88/$ — indicative only`);

await mongoose.disconnect();
