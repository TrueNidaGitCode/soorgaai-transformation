/**
 * Verifies the zip writer against a real unzip implementation.
 *
 * Round-tripping through my own reader would only prove it is
 * self-consistent. .NET's ZipFile (what Windows Explorer and Expand-Archive
 * use) is an independent parser: if it extracts every file with matching
 * bytes, the archive is genuinely well-formed.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { buildZip } from '../services/zipService.js';
import { buildManifest } from '../services/eameProjectBuilder.js';

const files = buildManifest({ includeJira: true });
const zip = buildZip(files, 'defect-matching-agent');

const raw = files.reduce((n, f) => n + Buffer.byteLength(f.content || '', 'utf8'), 0);
console.log(`manifest : ${files.length} files, ${(raw / 1024).toFixed(1)} KB`);
console.log(`archive  : ${(zip.length / 1024).toFixed(1)} KB (${(100 - zip.length / raw * 100).toFixed(0)}% smaller)`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svarg-zip-'));
const zipPath = path.join(dir, 'project.zip');
fs.writeFileSync(zipPath, zip);

const out = path.join(dir, 'out');
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
  `[System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath}','${out}')`,
], { stdio: 'pipe' });
console.log('\nextracted by .NET ZipFile — the archive parses');

let checked = 0, mismatched = [];
for (const f of files) {
  const p = path.join(out, 'defect-matching-agent', f.path);
  if (!fs.existsSync(p)) { mismatched.push(`${f.path} — missing`); continue; }
  const got = fs.readFileSync(p, 'utf8');
  if (got !== (f.content ?? '')) mismatched.push(`${f.path} — content differs`);
  checked++;
}

console.log(`compared : ${checked}/${files.length} files byte-for-byte`);
if (mismatched.length) {
  console.log('\nFAILURES:');
  mismatched.forEach(m => console.log('  ' + m));
  process.exit(1);
}

// The folder wrapper matters: without it, unzipping scatters 30+ files.
const roots = fs.readdirSync(out);
console.log(`root     : ${roots.join(', ')} ${roots.length === 1 ? '(single folder — good)' : '(SCATTERED)'}`);

// A delivered project has to be runnable, so the entry points must be present.
const need = ['package.json', 'server.js', 'README.md'];
const have = files.map(f => f.path);
const missing = need.filter(n => !have.includes(n));
console.log(`runnable : ${missing.length ? 'MISSING ' + missing.join(', ') : need.join(', ') + ' all present'}`);

fs.rmSync(dir, { recursive: true, force: true });
console.log(missing.length || roots.length !== 1 ? '\nFAILED' : '\nPASS — the download is a valid, complete, runnable project');
process.exit(missing.length || roots.length !== 1 ? 1 : 0);
