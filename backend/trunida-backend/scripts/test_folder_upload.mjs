/**
 * Folder upload and classification.
 *
 * The properties worth pinning are about honesty, not plumbing: a file that
 * matches nothing must be KEPT and marked unclassified rather than discarded
 * or forced into the nearest dataset, and a re-run must be able to unset a
 * match it no longer stands behind.
 *
 *   node scripts/test_folder_upload.mjs
 */
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import { uploadFolder, classifyUploadedFiles, listDatasetFiles } from '../controllers/uploadController.js';

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const owner = new mongoose.Types.ObjectId();
let blueprintId = null, server = null;

try {
  const bp = await TransformationBlueprint.create({
    userId: owner,
    businessObjective: 'Throwaway objective for the folder upload test.',
    companyName: 'Test Co',
    status: 'completed',
    domains: [{
      domainId: 'data-readiness', domainName: 'Data Readiness', status: 'completed',
      capabilities: [{
        capabilityId: 'critical-data', capabilityName: 'Critical Data Identification', status: 'completed',
        sections: [{ title: 'Critical Data Identification', brief: { datasets: [
          { name: 'Class Attendance Logs', purpose: 'Who attended which class' },
          { name: 'Billing Records', purpose: 'Fees and payments' },
        ] } }],
      }],
    }],
  });
  blueprintId = String(bp._id);

  const app = express();
  app.use((req, _res, next) => { req.user = { _id: owner }; next(); });
  app.post('/folder', express.json({ limit: '2mb' }), uploadFolder);
  app.post('/classify', express.json(), classifyUploadedFiles);
  app.get('/list/:blueprintId', listDatasetFiles);
  server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  console.log('1. a folder of mixed files is stored, unsupported types reported');
  {
    const r = await post('/folder', { blueprintId, files: [
      { path: 'exports/attendance_q1.csv', text: 'student,class,present,marked_at\nAsha,Piano 1,yes,2024-01-05\n' },
      { path: 'exports/invoices_2024.csv', text: 'invoice_id,guardian,amount_cents,paid_at\n1,Ravi,4500,2024-01-09\n' },
      { path: 'exports/office-photo.png',  text: 'binaryish' },
      { path: 'exports/notes.md',          text: '# Studio policy\nParents are contacted weekly.\n' },
    ] });
    const body = await r.json();
    check('accepted', r.status === 200, JSON.stringify(body).slice(0, 100));
    check('three text files stored', body.stored === 3, `stored ${body.stored}`);
    check('the image is reported as rejected',
      body.rejected?.some(x => x.path.endsWith('.png')), JSON.stringify(body.rejected));

    const stored = await LinkedProjectDocument.countDocuments({ blueprintId, sourceType: 'upload' });
    check('nothing extra written', stored === 3, `got ${stored}`);
  }

  console.log('\n2. the folder path is kept, since it says what a file is');
  {
    const doc = await LinkedProjectDocument.findOne({ blueprintId, sourceId: 'upload:exports/attendance_q1.csv' }).lean();
    check('stored under its relative path', !!doc);
    check('title is the filename', doc?.title === 'attendance_q1.csv', doc?.title);
    check('unclassified until classification runs', doc?.datasetName === '', `got "${doc?.datasetName}"`);
  }

  console.log('\n3. classification places what it can and keeps what it cannot');
  {
    const r = await post('/classify', { blueprintId });
    const body = await r.json();
    check('classify succeeded', r.status === 200, JSON.stringify(body).slice(0, 140));
    console.log(`        matched: ${JSON.stringify(body.matches?.map(m => m.file + ' -> ' + m.dataset))}`);

    check('every match names a real dataset',
      (body.matches || []).every(m => ['Class Attendance Logs', 'Billing Records'].includes(m.dataset)),
      JSON.stringify(body.matches));
    check('every match names a file that was uploaded',
      (body.matches || []).every(m => m.file.startsWith('exports/')),
      JSON.stringify(body.matches));

    // The point of the design: nothing is thrown away.
    const total = await LinkedProjectDocument.countDocuments({ blueprintId, sourceType: 'upload' });
    check('all three files still stored after classification', total === 3, `got ${total}`);
    check('classified + unclassified accounts for everything',
      body.classified + body.unclassified === 3, `${body.classified} + ${body.unclassified}`);
  }

  console.log('\n4. the listing reports both, so unplaced files stay visible');
  {
    const body = await (await fetch(`${base}/list/${blueprintId}`)).json();
    check('lists every uploaded file', body.uploads?.length === 3, `got ${body.uploads?.length}`);
    check('each carries its path', body.uploads?.every(u => !!u.path));
    check('datasetName present (may be empty)', body.uploads?.every(u => 'datasetName' in u));
  }

  console.log('\n5. re-running classification can unset a stale match');
  {
    await LinkedProjectDocument.updateOne(
      { blueprintId, sourceId: 'upload:exports/notes.md' },
      { $set: { datasetName: 'Billing Records' } }     // a match nothing supports
    );
    await post('/classify', { blueprintId });
    const doc = await LinkedProjectDocument.findOne({ blueprintId, sourceId: 'upload:exports/notes.md' }).lean();
    check('a match the model no longer stands behind is cleared',
      doc?.datasetName !== 'Billing Records', `got "${doc?.datasetName}"`);
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
