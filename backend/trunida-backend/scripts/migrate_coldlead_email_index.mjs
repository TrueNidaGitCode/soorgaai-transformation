/**
 * Svarg — make the cold-lead email index partial
 *
 * A warm introduction starts with a mobile number, not an email address. The
 * index that was on this collection was `{email: 1}, unique: true` with no
 * sparse or partial clause, which treats "no email" as a value: the first lead
 * without one saves fine and the SECOND fails with a duplicate key error on
 * null. That is not a validation message anyone can act on — it reads like the
 * database is broken.
 *
 * This replaces it with a partial unique index that only covers documents where
 * email is actually a string. The guarantee that matters — two leads can never
 * share an address — is kept; the claim about leads that have no address is
 * dropped, because there was never anything to claim.
 *
 * Mongoose cannot do this on its own. Changing index options in a schema does
 * not alter an index that already exists; it either throws IndexOptionsConflict
 * or quietly leaves the old one in place. So it is done here, deliberately.
 *
 *   node scripts/migrate_coldlead_email_index.mjs          report only
 *   node scripts/migrate_coldlead_email_index.mjs --apply  make the change
 *
 * Safe to re-run: it checks the current shape first and does nothing if the
 * index is already partial.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const WANT = { email: { $type: 'string' } };

await mongoose.connect(process.env.MONGO_URI);
const col = mongoose.connection.collection('coldleads');

const before = await col.indexes();
const email = before.find(ix => JSON.stringify(ix.key) === JSON.stringify({ email: 1 }));

console.log('collection : coldleads');
console.log('documents  :', await col.countDocuments());
console.log('no email   :', await col.countDocuments({ email: { $not: { $type: 'string' } } }));
console.log('email index:', email
  ? `${email.name} unique=${!!email.unique} partial=${JSON.stringify(email.partialFilterExpression || null)}`
  : '(none)');

if (email && JSON.stringify(email.partialFilterExpression || null) === JSON.stringify(WANT)) {
  console.log('\nAlready partial. Nothing to do.');
  await mongoose.disconnect();
  process.exit(0);
}

// Never drop a uniqueness guarantee without first proving it is not currently
// doing any work. If two leads already share an address the old index is the
// only thing holding the line, and recreating it would fail anyway — better to
// stop here and say which addresses, than to drop it and find out afterwards.
const dupes = await col.aggregate([
  { $match: { email: { $type: 'string' } } },
  { $group: { _id: '$email', n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
]).toArray();

if (dupes.length) {
  console.log('\nREFUSING — these addresses appear more than once:');
  for (const d of dupes) console.log('  ', d._id, 'x' + d.n);
  await mongoose.disconnect();
  process.exit(1);
}
console.log('duplicates : none');

if (!APPLY) {
  console.log('\nWould drop', email ? email.name : '(nothing)', 'and create a partial unique index.');
  console.log('Re-run with --apply to make the change.');
  await mongoose.disconnect();
  process.exit(0);
}

if (email) {
  await col.dropIndex(email.name);
  console.log('\ndropped', email.name);
}
await col.createIndex({ email: 1 }, { unique: true, partialFilterExpression: WANT, name: 'email_1' });
console.log('created email_1 unique, partial on email:{$type:"string"}');

const after = (await col.indexes()).find(ix => ix.name === 'email_1');
console.log('now        :', `unique=${!!after.unique} partial=${JSON.stringify(after.partialFilterExpression)}`);

await mongoose.disconnect();
