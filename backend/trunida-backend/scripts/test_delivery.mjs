/**
 * Exercises the delivery endpoints against a locally-running server with a
 * real token and a real blueprint: route wiring, auth, ownership, and the
 * bytes that actually come back.
 *
 * Read-only — it downloads. Publishing needs Svarg's GitHub credentials and
 * is checked separately.
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { execFileSync } from 'child_process';
import TransformationBlueprint from '../models/TransformationBlueprint.js';

const ID = process.env.DRIVE_BLUEPRINT || '6a4f37751d281fa2742797a6';
const HOST = process.env.DELIVERY_HOST || 'http://localhost:3000';

await mongoose.connect(process.env.MONGO_URI);
const bp = await TransformationBlueprint.findById(ID).lean();
if (!bp) { console.error('blueprint not found'); process.exit(1); }

const token = jwt.sign({ userId: bp.userId.toString(), role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30m' });
const url = `${HOST}/api/delivery/download?blueprintId=${ID}&slug=defect-matching-agent`;

let pass = true;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) pass = false;
};

console.log('1. anonymous caller');
const anon = await fetch(url);
check('is refused', anon.status === 401 || anon.status === 403, `HTTP ${anon.status}`);

console.log('\n2. a different user\'s token');
const other = jwt.sign({ userId: '000000000000000000000009', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30m' });
const wrong = await fetch(url, { headers: { Authorization: 'Bearer ' + other } });
check('cannot download this blueprint', wrong.status === 404 || wrong.status === 401, `HTTP ${wrong.status}`);

console.log('\n3. the owner');
const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
check('is served', res.ok, `HTTP ${res.status}`);
check('is a zip', res.headers.get('content-type') === 'application/zip', res.headers.get('content-type'));
check('downloads as a file',
  /attachment; filename="defect-matching-agent\.zip"/.test(res.headers.get('content-disposition') || ''),
  res.headers.get('content-disposition'));

const buf = Buffer.from(await res.arrayBuffer());
check('has a real size', buf.length > 10000, `${(buf.length / 1024).toFixed(1)} KB`);
check('declares its length', Number(res.headers.get('content-length')) === buf.length);
check('starts with the zip signature', buf.subarray(0, 2).toString() === 'PK');

if (buf.length > 1000) {
  console.log('\n4. the downloaded bytes, extracted by .NET');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svarg-dl-'));
  const zipPath = path.join(dir, 'p.zip');
  fs.writeFileSync(zipPath, buf);
  const out = path.join(dir, 'out');
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath}','${out}')`,
    ], { stdio: 'pipe' });
    const root = fs.readdirSync(out);
    check('extracts', true, root.join(', '));
    const proj = path.join(out, root[0]);
    const files = fs.readdirSync(proj);
    check('contains package.json', files.includes('package.json'));
    check('contains server.js', files.includes('server.js'));
    const pkg = JSON.parse(fs.readFileSync(path.join(proj, 'package.json'), 'utf8'));
    check('package.json is valid JSON with a start script', !!pkg.scripts?.start, pkg.scripts?.start);
  } catch (e) {
    check('extracts', false, e.message.split('\n')[0]);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

await mongoose.disconnect();
console.log(pass ? '\nPASS — the download works end to end' : '\nFAILED');
process.exit(pass ? 0 : 1);
