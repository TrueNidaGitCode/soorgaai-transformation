/**
 * Say what an account really is, when the guess is wrong.
 *
 * accountKindService infers real / internal / test from the address alone, and
 * it cannot know that a gmail address belongs to somebody who was asked to try
 * the product once. Its own rule is that inference proposes and a human
 * decides — the screen has a dropdown for one row at a time, and this is for
 * when the answer is a list.
 *
 * An empty kind clears the override and hands the row back to the guess.
 *
 *   node scripts/mark_accounts.mjs test a@x.com b@y.com      # show what would change
 *   node scripts/mark_accounts.mjs test a@x.com --write
 *   node scripts/mark_accounts.mjs "" a@x.com --write        # back to inferred
 *
 * The three kinds, from accountKindService:
 *
 *   real      somebody outside Svarg
 *   internal  Svarg's own — staff, admins, and the addresses used to build and
 *             test the product
 *   test      fabricated data: example.com, test*, demo*, malformed addresses
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models/user.js';
import { KINDS, classify } from '../services/accountKindService.js';

const args = process.argv.slice(2);
const write = args.includes('--write');
const rest = args.filter((a) => !a.startsWith('--'));
const kind = String(rest[0] ?? '').trim().toLowerCase();
const emails = rest.slice(1).map((e) => e.trim().toLowerCase()).filter(Boolean);

if (!emails.length || (kind !== '' && !KINDS.includes(kind))) {
  console.log(`Usage: node scripts/mark_accounts.mjs <${KINDS.join('|')}|""> <email...> [--write]`);
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const all = await User.find({}).select('_id email accountKind role').lean();
const byEmail = new Map(all.map((u) => [String(u.email || '').toLowerCase(), u]));

console.log(`Setting kind to ${kind ? `"${kind}"` : 'inferred'} on ${emails.length} account(s).`);
console.log(write ? 'Writing.\n' : 'Dry run — pass --write to do it.\n');

const found = [];
const missing = [];
for (const e of emails) {
  const u = byEmail.get(e);
  if (!u) { missing.push(e); continue; }
  // What the guess says today, so a change away from it is visible rather
  // than silent.
  const now = classify(u.email, u);
  found.push({ u, now });
  console.log(`  ${String(u.email).padEnd(34)} ${now.kind}${now.inferred ? ' (guessed)' : ' (set)'} -> ${kind || 'inferred'}`);
}

for (const e of missing) console.log(`  ${e.padEnd(34)} NO SUCH ACCOUNT`);

if (!write || !found.length) {
  await mongoose.disconnect();
  process.exit(missing.length && !found.length ? 1 : 0);
}

const r = await User.updateMany(
  { _id: { $in: found.map((f) => f.u._id) } },
  { $set: { accountKind: kind } },
);
console.log(`\n${r.modifiedCount} account(s) changed, ${missing.length} not found.`);

await mongoose.disconnect();
