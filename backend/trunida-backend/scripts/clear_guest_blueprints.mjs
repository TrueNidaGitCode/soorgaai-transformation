/**
 * Svarg — remove guest preview blueprints
 *
 * A guest preview is keyed on an unguessable id held only in the visitor's
 * localStorage. Clear that and the document is unreachable for ever: nobody
 * can open it, and nobody can claim it. So orphaned previews accumulate, and
 * during testing they accumulate quickly.
 *
 *   node scripts/clear_guest_blueprints.mjs <guestId>   one specific preview
 *   node scripts/clear_guest_blueprints.mjs --failed    every preview whose
 *                                                       capabilities all errored
 *   node scripts/clear_guest_blueprints.mjs --failed --yes    actually delete
 *
 * Prints what it would remove and stops, unless --yes is given. Deleting the
 * wrong blueprint is not recoverable, and a guest id is easy to mistype.
 *
 * ── It only ever touches guest previews ────────────────────────────────────
 *
 * Every query here requires a guestId to be present. A claimed blueprint has
 * had guestId unset and userId set, so no owned work can match — which is the
 * one guarantee worth having in a script whose whole job is deletion.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';

const args = process.argv.slice(2);
const FAILED = args.includes('--failed');
const CONFIRM = args.includes('--yes');
const guestId = args.find(a => !a.startsWith('--'));

if (!FAILED && !guestId) {
  console.error('Give a guestId, or --failed. See the header for usage.');
  process.exit(2);
}

await mongoose.connect(process.env.MONGO_URI);

// guestId present is the guard: a claimed blueprint has had it unset.
const base = { guestId: { $exists: true, $ne: null } };
const query = guestId ? { ...base, guestId } : base;

const rows = await TransformationBlueprint.find(query)
  .select('guestId status createdAt businessObjective domains').lean();

const allErrored = bp => {
  const caps = (bp.domains || []).flatMap(d => d.capabilities || []);
  const touched = caps.filter(c => c.status !== 'pending');
  return touched.length > 0 && touched.every(c => c.status === 'error');
};

const targets = FAILED ? rows.filter(allErrored) : rows;

if (!targets.length) {
  console.log(FAILED ? 'No wholly-failed guest previews found.' : `No guest preview with id ${guestId}.`);
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`${targets.length} guest preview(s):`);
for (const b of targets) {
  const caps = (b.domains || []).flatMap(d => d.capabilities || []);
  const errored = caps.filter(c => c.status === 'error').length;
  console.log(`  ${b.createdAt.toISOString().slice(0, 16)}  ${b.guestId}`);
  console.log(`     ${errored}/${caps.length} capabilities errored — ${String(b.businessObjective).slice(0, 60)}`);
}

if (!CONFIRM) {
  console.log('\nNothing deleted. Re-run with --yes to remove these.');
  await mongoose.disconnect();
  process.exit(0);
}

const res = await TransformationBlueprint.deleteMany({ _id: { $in: targets.map(t => t._id) } });
console.log(`\nDeleted ${res.deletedCount}.`);
console.log('The visitor\'s browser still holds the guest id — clear it there too:');
console.log("  localStorage.removeItem('soorgaai_guest_id')");

await mongoose.disconnect();
