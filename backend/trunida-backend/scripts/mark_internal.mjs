/**
 * Allow one deployment to read Svarg's own operations data.
 *
 * Svarg runs itself on Svarg: one tenant whose agents watch deployments,
 * leads and blueprints. That tenant needs to read data no customer's
 * application may ever see, and the gateway token it holds is the same kind
 * every customer application holds — so something has to say which one is
 * Svarg's.
 *
 * This is that something, and it is deliberately a command rather than a
 * setting. No API writes the flag. There is no admin toggle. Turning it on
 * takes a person, a shell and this file, which is the right amount of
 * friction for a switch that opens every customer's deployment record and the
 * whole pipeline to one container.
 *
 *   node scripts/mark_internal.mjs                    # who has it now
 *   node scripts/mark_internal.mjs <url|email>        # show what would change
 *   node scripts/mark_internal.mjs <url|email> --on   # allow it
 *   node scripts/mark_internal.mjs <url|email> --off  # take it away
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import HostedDeployment from '../models/HostedDeployment.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import User from '../models/User.js';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || '';
const on = args.includes('--on');
const off = args.includes('--off');

if (on && off) {
  console.log('Pick one of --on or --off.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const describe = async (d) => {
  const [bp, u] = await Promise.all([
    TransformationBlueprint.findById(d.blueprintId).select('appName').lean().catch(() => null),
    User.findById(d.userId).select('email').lean().catch(() => null),
  ]);
  return `${String(bp?.appName || '(unnamed)').padEnd(24)} ${String(u?.email || '?').padEnd(32)} ${d.railway?.url || '(no url)'}`;
};

// ── Who has it now ──────────────────────────────────────────────────────────

const allowed = await HostedDeployment.find({ internal: true });
console.log(`${allowed.length} deployment(s) may read Svarg operations data:`);
for (const d of allowed) console.log('  ' + await describe(d));

if (!target) {
  console.log('\nPass a deployment URL or an owner email to change one.');
  await mongoose.disconnect();
  process.exit(0);
}

// ── Which one is meant ──────────────────────────────────────────────────────

const all = await HostedDeployment.find({});
const matches = [];
for (const d of all) {
  const url = d.railway?.url || '';
  if (url && url.includes(target)) { matches.push(d); continue; }
  const u = await User.findById(d.userId).select('email').lean().catch(() => null);
  if (u?.email && String(u.email).toLowerCase() === target.toLowerCase()) matches.push(d);
}

if (matches.length !== 1) {
  // Refusing to guess: the wrong deployment flagged here is every customer's
  // record readable by somebody else's container.
  console.log(`\n${matches.length ? matches.length + ' deployments match' : 'Nothing matches'} "${target}". Refusing to guess.`);
  for (const d of matches) console.log('  ' + await describe(d));
  await mongoose.disconnect();
  process.exit(1);
}

const dep = matches[0];
console.log(`\n${await describe(dep)}`);
console.log(`  internal is currently ${dep.internal ? 'ON' : 'off'}`);

if (!on && !off) {
  console.log('\nPass --on or --off to change it.');
  await mongoose.disconnect();
  process.exit(0);
}

dep.internal = !!on;
await dep.save();
console.log(`\ninternal is now ${dep.internal ? 'ON — this application can read every deployment and the whole pipeline' : 'off'}.`);

await mongoose.disconnect();
