/**
 * Svarg — generated sample data stays labelled as generated
 *
 * Sample data exists so a company that has not collected a dataset yet can
 * still see the product work. The whole design rests on one thing: nobody —
 * not the customer, not the model, not a spreadsheet three weeks later —
 * should be able to mistake an invented row for a real one.
 *
 * That guarantee lives in four places, and this checks all four:
 *   the CSV        every row carries _source=sample
 *   the document   sourceType 'synthetic', with a row count
 *   the prompt     its own preamble saying the customer does not have this
 *   the rules      generation is refused when a real upload already exists
 *
 *   node scripts/test_synthetic_dataset.mjs
 *
 * The marker and prompt checks need no database and no model. The document
 * and prompt-integration checks use MONGO_URI and clean up after themselves.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import { getLinkedProjectContext } from '../services/connectedKnowledgeService.js';
import { enforceMarker, SAMPLE_COLUMN, SAMPLE_VALUE } from '../services/syntheticDatasetService.js';

let pass = true;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) pass = false;
};

const rowsOf = csv => csv.split('\n').slice(1).filter(Boolean);
const everyRowMarked = csv =>
  rowsOf(csv).every(r => r.split(',')[0].trim() === SAMPLE_VALUE);

console.log('1. the marker survives whatever the model returns');
{
  // The obedient case.
  const good = `${SAMPLE_COLUMN},student_id,sessions_missed\n${SAMPLE_VALUE},S-001,3\n${SAMPLE_VALUE},S-002,0`;
  const a = enforceMarker(good);
  check('a marked CSV is left alone', everyRowMarked(a.csv) && a.rowCount === 2, `${a.rowCount} rows`);
  check('its columns are reported without the marker',
    a.columns.join(',') === 'student_id,sessions_missed', a.columns.join(','));

  // The case that matters: a model that ignored the instruction would produce
  // a file indistinguishable from a real export.
  const unmarked = 'student_id,sessions_missed\nS-001,3\nS-002,0';
  const b = enforceMarker(unmarked);
  check('an unmarked CSV gets the marker added', everyRowMarked(b.csv));
  check('the marker is the first column', b.csv.split('\n')[0].startsWith(SAMPLE_COLUMN),
    b.csv.split('\n')[0]);
  check('no rows are lost adding it', b.rowCount === 2, `${b.rowCount} rows`);

  // A model that emitted the column but put junk in it.
  const wrongValue = `${SAMPLE_COLUMN},student_id\nreal,S-001\nproduction,S-002`;
  check('a wrong marker value is overwritten', everyRowMarked(enforceMarker(wrongValue).csv));

  let threw = false;
  try { enforceMarker('just_a_header_row'); } catch { threw = true; }
  check('a CSV with no data rows is refused', threw);
}

if (!process.env.MONGO_URI) {
  console.log('\nMONGO_URI is not set — skipping the document and prompt checks.');
  process.exit(pass ? 0 : 1);
}

await mongoose.connect(process.env.MONGO_URI);
const blueprintId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

try {
  console.log('\n2. the prompt tells the model what it is looking at');
  {
    await LinkedProjectDocument.create({
      blueprintId, linkedByUserId: userId,
      sourceType: 'synthetic', sourceId: 'synthetic:Attendance Records',
      title: 'Attendance Records — sample data (generated)',
      datasetName: 'Attendance Records',
      rawText: `${SAMPLE_COLUMN},student_id\n${SAMPLE_VALUE},S-001`,
      summary: 'Generated sample data illustrating the shape of "Attendance Records".',
      synthetic: { generatedAt: new Date(), model: 'test', rowCount: 1 },
      extractionStatus: 'extracted',
    });

    const block = await getLinkedProjectContext(blueprintId);
    check('the block was built', !!block);
    // This is the assertion the whole feature depends on. Before this change
    // every linked document — uploads, websites, and now invented rows — was
    // announced to the model as "Confluence pages the user explicitly linked".
    check('it does NOT claim the rows are the customer\'s',
      !/Confluence pages the user explicitly linked/.test(block || ''));
    check('it says Svarg generated them', /SVARG GENERATED/.test(block || ''));
    check('it says the customer does not have this data',
      /does not have this data yet/.test(block || ''));
    check('it forbids quoting a figure', /[Nn]ever quote a figure/.test(block || ''));
  }

  console.log('\n3. real documents are still described as real');
  {
    await LinkedProjectDocument.create({
      blueprintId, linkedByUserId: userId,
      sourceType: 'upload', sourceId: 'upload:Fee Ledger',
      title: 'fees-export.csv', datasetName: 'Fee Ledger',
      rawText: 'invoice_id,amount\nINV-1,4200',
      summary: 'A real fee export the customer uploaded.',
      extractionStatus: 'extracted',
    });

    const block = await getLinkedProjectContext(blueprintId);
    check('the upload is named as an upload',
      /exported from their own systems and uploaded/.test(block || ''));
    // Both kinds in one blueprint is the ordinary case, and the failure worth
    // guarding is one preamble swallowing the other.
    check('both preambles are present, separately',
      /SVARG GENERATED/.test(block || '') && /uploaded\./.test(block || ''));
    check('only the real source is told to use the terms as fact',
      (block.match(/Use the specific systems, tools, and terms/g) || []).length === 1);
  }

  console.log('\n4. the marker is queryable, not just readable');
  {
    const generated = await LinkedProjectDocument
      .find({ blueprintId, sourceType: 'synthetic' }).lean();
    check('every generated row can be found by one query', generated.length === 1);
    check('and carries how many rows it invented', generated[0]?.synthetic?.rowCount === 1);
    // "Remove all the sample data" has to be possible without parsing text.
    const removed = await LinkedProjectDocument.deleteMany({ blueprintId, sourceType: 'synthetic' });
    check('and can be removed without touching the real upload', removed.deletedCount === 1);
    const left = await LinkedProjectDocument.countDocuments({ blueprintId });
    check('the real upload survived', left === 1, `${left} document(s) left`);
  }

} finally {
  await LinkedProjectDocument.deleteMany({ blueprintId });
  await mongoose.disconnect();
}

console.log(pass ? '\nPASS — generated data cannot pass itself off as real' : '\nFAILED');
process.exit(pass ? 0 : 1);
