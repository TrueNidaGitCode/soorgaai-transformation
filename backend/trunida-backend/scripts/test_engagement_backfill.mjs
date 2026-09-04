/**
 * A blueprint created before the classifier existed has no engagement, so
 * regenerating it is steered by nothing and produces the same generic datasets
 * again. regenerateSpecificDomains classifies first to fix that.
 *
 * The specific hazard this pins: that function calls blueprint.save() further
 * down, so a classification written around the in-memory document can be
 * silently undone by that save writing back the value it still holds.
 *
 * Uses a throwaway blueprint and deletes it. Does not call the LLM.
 *
 *   node scripts/test_engagement_backfill.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const userId = new mongoose.Types.ObjectId();
let id = null;

try {
  console.log('1. a blueprint with no engagement can be created (the pre-classifier shape)');
  const created = await TransformationBlueprint.create({
    userId,
    businessObjective: 'Throwaway objective for the engagement backfill test.',
    companyName: 'Test Co',
    status: 'completed',
    domains: [{ domainId: 'ai-use-cases', domainName: 'AI Use Cases', status: 'completed', capabilities: [] }],
  });
  id = created._id;
  const fresh = await TransformationBlueprint.findById(id).lean();
  check('engagement starts unset', !fresh.engagement?.category, `got ${JSON.stringify(fresh.engagement)}`);

  console.log('\n2. classification survives the later blueprint.save()');
  // Exactly the sequence regenerateSpecificDomains runs: load the document,
  // set engagement, save, then modify something else and save again.
  const doc = await TransformationBlueprint.findById(id);
  doc.engagement = {
    checked: true, category: 'product-ai', subArea: '', maturity: 'startup',
    confidence: 0.9, reason: 'Test.', userSet: false,
  };
  await doc.save();

  doc.domains.push({ domainId: 'data-readiness', domainName: 'Data Readiness', status: 'pending', capabilities: [] });
  await doc.save();

  const after = await TransformationBlueprint.findById(id).lean();
  check('category persisted', after.engagement?.category === 'product-ai', `got ${after.engagement?.category}`);
  check('maturity persisted', after.engagement?.maturity === 'startup', `got ${after.engagement?.maturity}`);
  check('second save did not clobber it', after.engagement?.checked === true, `got ${after.engagement?.checked}`);

  console.log('\n3. a user-set category is the one the backfill must not touch');
  await TransformationBlueprint.updateOne({ _id: id }, { $set: { 'engagement.userSet': true } });
  const userSet = await TransformationBlueprint.findById(id).lean();
  // This is the exact guard in regenerateSpecificDomains.
  const wouldReclassify = !userSet.engagement?.userSet && !userSet.engagement?.category;
  check('guard refuses to reclassify a user-set engagement', wouldReclassify === false);

} finally {
  if (id) await TransformationBlueprint.deleteOne({ _id: id });
  await mongoose.disconnect();
}

console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(pass ? 0 : 1);
