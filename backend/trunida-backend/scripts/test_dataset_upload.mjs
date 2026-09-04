/**
 * Dataset file upload — the one route by which a company whose data no
 * connector reaches can supply it.
 *
 * Exercises the real controller against a real database, through a minimal
 * express app, so the route's own body limit and auth shape are what run.
 * Creates a throwaway blueprint and deletes everything it made.
 *
 *   node scripts/test_dataset_upload.mjs
 */
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import { uploadDatasetFile, listDatasetFiles } from '../controllers/uploadController.js';

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const owner    = new mongoose.Types.ObjectId();
const stranger = new mongoose.Types.ObjectId();
let blueprintId = null;
let server = null;

try {
  const bp = await TransformationBlueprint.create({
    userId: owner,
    businessObjective: 'Throwaway objective for the dataset upload test.',
    companyName: 'Test Co',
    status: 'completed',
  });
  blueprintId = String(bp._id);

  // Same wiring as routes/uploadRoutes.js — the 2 MB limit is part of what is
  // under test, so it must not be replaced with a default here.
  const app = express();
  let actingAs = owner;
  app.use((req, _res, next) => { req.user = { _id: actingAs }; next(); });
  app.post('/dataset-file', express.json({ limit: '2mb' }), uploadDatasetFile);
  app.get('/dataset-files/:blueprintId', listDatasetFiles);
  server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;

  const post = (body) => fetch(`${base}/dataset-file`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  console.log('1. a CSV export is stored as a redacted upload document');
  {
    const r = await post({
      blueprintId, datasetName: 'Class Attendance Logs', filename: 'attendance.csv',
      // Contains an email, which must not survive into storage.
      text: 'student,guardian_email,present\nAsha,parent@example.com,yes\n',
    });
    const body = await r.json();
    check('accepted', r.status === 200, `${r.status} ${JSON.stringify(body).slice(0, 90)}`);

    const doc = await LinkedProjectDocument.findOne({ blueprintId, sourceId: 'upload:Class Attendance Logs' }).lean();
    check('stored as sourceType upload', doc?.sourceType === 'upload', `got ${doc?.sourceType}`);
    check('title is the filename', doc?.title === 'attendance.csv', `got ${doc?.title}`);
    check('redaction ran', doc?.redactionApplied === true, `notes: ${JSON.stringify(doc?.redactionNotes)}`);
    check('the email did not survive', !String(doc?.rawText).includes('parent@example.com'),
      `rawText: ${String(doc?.rawText).slice(0, 80)}`);
    check('content hash written', !!doc?.contentHash);
  }

  console.log('\n2. re-uploading for the same dataset replaces, never accumulates');
  {
    await post({ blueprintId, datasetName: 'Class Attendance Logs', filename: 'attendance-v2.csv', text: 'a,b\n1,2\n' });
    const n = await LinkedProjectDocument.countDocuments({ blueprintId, sourceId: 'upload:Class Attendance Logs' });
    check('still one document', n === 1, `got ${n}`);
    const doc = await LinkedProjectDocument.findOne({ blueprintId, sourceId: 'upload:Class Attendance Logs' }).lean();
    check('it is the newer file', doc?.title === 'attendance-v2.csv', `got ${doc?.title}`);
  }

  console.log('\n3. formats without a parser are refused, not mangled');
  {
    const r = await post({ blueprintId, datasetName: 'Billing Records', filename: 'report.pdf', text: '%PDF-1.4 binary junk' });
    check('.pdf rejected', r.status === 400, `got ${r.status}`);
    const body = await r.json();
    check('the message names what to upload instead', /csv/i.test(body.error || ''), body.error);
  }

  console.log('\n4. an empty file is refused');
  {
    const r = await post({ blueprintId, datasetName: 'Billing Records', filename: 'empty.csv', text: '   \n ' });
    check('rejected', r.status === 400, `got ${r.status}`);
  }

  console.log('\n5. a file over the body limit does not reach the handler');
  {
    const r = await post({ blueprintId, datasetName: 'Billing Records', filename: 'huge.csv', text: 'x'.repeat(3_000_000) });
    check('rejected by the route body limit', r.status === 413 || r.status >= 400, `got ${r.status}`);
  }

  console.log('\n6. another user cannot attach a file to this blueprint');
  {
    actingAs = stranger;
    const r = await post({ blueprintId, datasetName: 'Billing Records', filename: 'theirs.csv', text: 'a,b\n1,2\n' });
    check('rejected as not found', r.status === 404, `got ${r.status}`);
    const n = await LinkedProjectDocument.countDocuments({ blueprintId, sourceId: 'upload:Billing Records' });
    check('nothing was written', n === 0, `got ${n}`);
    actingAs = owner;
  }

  console.log('\n7. the owner can list what has been uploaded');
  {
    const r = await fetch(`${base}/dataset-files/${blueprintId}`);
    const body = await r.json();
    check('one upload listed', body.uploads?.length === 1, JSON.stringify(body.uploads));
    check('dataset name round-trips', body.uploads?.[0]?.datasetName === 'Class Attendance Logs',
      body.uploads?.[0]?.datasetName);
  }

} finally {
  if (blueprintId) {
    await LinkedProjectDocument.deleteMany({ blueprintId });
    await TransformationBlueprint.deleteOne({ _id: blueprintId });
  }
  if (server) server.close();
  await mongoose.disconnect();
}

console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(pass ? 0 : 1);
