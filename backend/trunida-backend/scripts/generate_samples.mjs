/**
 * Generate the sample data for every dataset on a blueprint that has none.
 *
 * The same path Aria's button takes, one dataset at a time and in order, so
 * each generation is told what identifiers the previous ones used. That
 * ordering is the whole point: generated independently, one dataset calls
 * somebody M1 and the next calls them MEM-001, nothing joins, and every
 * application built on them looks at absent signals and scores everything the
 * same.
 *
 * For a customer whose application was delivered before their datasets were
 * ever named — they cannot be asked to click through Aria again, and an
 * application that opens with nothing in it teaches them it does not work.
 *
 * A dataset the customer has really uploaded is never touched.
 *
 *   node scripts/generate_samples.mjs <blueprintId>            # say what is missing
 *   node scripts/generate_samples.mjs <blueprintId> --generate
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import crypto from 'crypto';

const args = process.argv.slice(2);
const id = args.find(a => !a.startsWith('--'));
const go = args.includes('--generate');
if (!id) { console.log('Usage: node scripts/generate_samples.mjs <blueprintId> [--generate]'); process.exit(1); }

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const { default: TransformationBlueprint } = await import('../models/TransformationBlueprint.js');
const { default: LinkedProjectDocument } = await import('../models/LinkedProjectDocument.js');
const { readDatasets } = await import('../services/eameSpec.js');
const { generateSampleDataset, sharedKeys } = await import('../services/syntheticDatasetService.js');

const bp = await TransformationBlueprint.findById(id).lean();
if (!bp) { console.log('No such blueprint.'); await mongoose.disconnect(); process.exit(1); }

const datasets = readDatasets(bp);
const have = await LinkedProjectDocument.find({ blueprintId: bp._id }).select('datasetName sourceType').lean();
const bySet = new Map(have.map(d => [d.datasetName, d.sourceType]));

console.log(`${bp.appName || '(unnamed)'} — ${datasets.length} dataset(s)\n`);
const todo = [];
for (const d of datasets) {
  const at = bySet.get(d.name);
  console.log(`  ${(at || 'nothing').padEnd(10)} ${d.name}`);
  // Their own upload is theirs. Only a dataset with nothing behind it.
  if (!at) todo.push(d);
}

if (!todo.length) { console.log('\nNothing to generate.'); await mongoose.disconnect(); process.exit(0); }
console.log(`\n${todo.length} to generate.`);
if (!go) { console.log('Add --generate to spend real model calls on this.'); await mongoose.disconnect(); process.exit(0); }

const hashText = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

for (const dataset of todo) {
  // Read afresh each time: the point of ordering is that this call is told
  // what the previous ones named things.
  const siblings = await LinkedProjectDocument
    .find({ blueprintId: bp._id, sourceType: 'synthetic', datasetName: { $ne: dataset.name } })
    .select('rawText').lean().catch(() => []);
  const existingKeys = sharedKeys(siblings.map(d => d.rawText));

  process.stdout.write(`  ${dataset.name} … `);
  try {
    const { csv, rowCount, columns, model } = await generateSampleDataset({
      dataset,
      objective: bp.businessObjective || '',
      industry: bp.industry || '',
      companyName: bp.companyName || '',
      existingKeys,
    });

    const sourceId = `synthetic:${dataset.name}`;
    await LinkedProjectDocument.findOneAndUpdate(
      { blueprintId: bp._id, sourceId },
      {
        blueprintId: bp._id,
        linkedByUserId: bp.userId,
        sourceType: 'synthetic',
        sourceId,
        title: `${dataset.name} — sample data (generated)`,
        datasetName: dataset.name,
        rawText: csv,
        summary: `Generated sample data illustrating the shape of "${dataset.name}". `
               + `${rowCount} invented rows, columns: ${columns.join(', ')}. `
               + 'The customer does not have this data.',
        contentHash: hashText(csv),
        synthetic: { generatedAt: new Date(), model, rowCount },
        extractionStatus: 'extracted',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`${rowCount} rows  [${columns.slice(0, 4).join(', ')}${columns.length > 4 ? ', …' : ''}]`);
  } catch (err) {
    // One dataset failing is not a reason to leave the rest ungenerated.
    console.log(`FAILED — ${err.message}`);
  }
}

const after = await LinkedProjectDocument.countDocuments({ blueprintId: bp._id, sourceType: 'synthetic' });
console.log(`\n${after} of ${datasets.length} datasets now have sample data.`);
await mongoose.disconnect();
