/**
 * When does the customer actually see something?
 *
 * The point of streaming here is not that the answer arrives sooner — it does
 * not. It is that the EVIDENCE does: who, how many, from which dataset, all
 * computed and validated by code before the model is asked for a word. This
 * measures the gap between the two, which is the whole of the improvement.
 *
 * Boots the real application against a copy of the tenant's data, exactly as
 * qa_suite does, and times each event.
 *
 * Usage, from backend/trunida-backend:
 *   node scripts/app-checks/stream_check.mjs
 *   node scripts/app-checks/stream_check.mjs --q="Who is absent today?"
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BEU = BE.split(path.sep).join('/');
dotenv.config({ path: path.join(BE, '.env') });

const arg = (n, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const QUESTION = arg('q', 'Who has not confirmed attendance?');
const PORT = Number(arg('port', 4411));

console.log(`question: ${QUESTION}\n`);
console.log('This measures WHEN each part of the answer reaches the page.');
console.log('The evidence is code-computed and final; the sentence is the model.\n');

/*
 * Composed, not run in place.
 *
 * The template imports middleware/authMiddleware.js and services/llmCore.js
 * from paths that only exist once a project has been assembled — they are
 * copied in from Svarg's own checkout by the builder. Booting eame-template
 * directly fails on the first of them.
 */
const { buildManifest } = await import(`file:///${BEU}/services/eameProjectBuilder.js`);
const files = buildManifest({ includeJira: true, appName: 'Stream Check' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svarg-stream-'));
for (const f of files) {
  const full = path.join(dir, f.path);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, f.content);
}
// Its own dependencies, the way a delivered project gets them.
const inst = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, stdio: 'ignore', shell: true });
await new Promise((res) => inst.on('close', res));
console.log(`composed ${files.length} files into ${dir}\n`);

const child = spawn(process.execPath, ['server.js'], {
  cwd: dir,
  env: {
    PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(PORT),
    // Point this at a tenant's database to time a real answer:
    //   --mongo="mongodb+srv://…/tenant_132d1925744c779d"
    // Without it the application has no records and says so, which exercises
    // the stream but measures nothing.
    MONGO_URI: arg('mongo', process.env.MONGO_URI),
    JWT_SECRET: 'stream-check-secret',
    APP_PUBLIC_ACCESS: 'true', APP_NAME: 'Stream Check', APP_OWNER_KEY: 'sok_stream',
    PROVIDER_CHAIN: process.env.PROVIDER_CHAIN || 'gemini',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
    // A boot seed embeds its records and exits the process without these,
    // taking the application down a second after it starts listening.
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    LLM_LOG_USAGE: '1',
    LLM_MAX_SPEND_USD: arg('budget', '0.05'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let boot = '';
child.stdout.on('data', d => { boot += d; });
child.stderr.on('data', d => { boot += d; });
const base = `http://127.0.0.1:${PORT}`;

/*
 * Wait for the socket, not for a line in the log.
 *
 * Scraping stdout for "listening on port" said the application was up while
 * the port was still refusing connections, and the probe then failed with
 * ECONNREFUSED against a server that was starting normally. Asking the port
 * is the thing actually being waited for.
 */
const started = Date.now();
let up = false;
while (Date.now() - started < 90000) {
  try {
    await fetch(base, { signal: AbortSignal.timeout(1500) });
    up = true;
    break;
  } catch { await new Promise(r => setTimeout(r, 400)); }
}
if (!up) {
  console.error('the application did not start:\n' + boot.slice(-1500));
  child.kill(); process.exit(1);
}
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(2) + 's';

// A session, the way the page gets one when the application has no sign-in.
const ses = await fetch(`${base}/api/session`, { method: 'POST' });
const token = (await ses.json().catch(() => ({}))).token || '';
if (!token) { console.error('no session — is APP_PUBLIC_ACCESS set?'); child.kill(); process.exit(1); }

const r = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    Authorization: 'Bearer ' + token,
  },
  body: JSON.stringify({ message: QUESTION, kind: 'own', stream: true }),
});

console.log('content-type:', r.headers.get('content-type'), '\n');
if (!r.ok) {
  console.error('the application refused the question:', r.status, await r.text().catch(() => ''));
  child.kill(); process.exit(1);
}
const reader = r.body.getReader();
const dec = new TextDecoder();
let buf = '';
let evidenceAt = null;
let doneAt = null;

while (true) {
  const step = await reader.read();
  if (step.done) break;
  buf += dec.decode(step.value, { stream: true });
  const blocks = buf.split('\n\n');
  buf = blocks.pop();
  for (const b of blocks) {
    let name = '', payload = '';
    for (const line of b.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) payload += line.slice(5).trim();
    }
    if (!name) continue;
    let data = {};
    try { data = payload ? JSON.parse(payload) : {}; } catch { /* keep going */ }

    if (name === 'stage') console.log(`  ${at().padStart(6)}  stage: ${data.stage}`);
    if (name === 'evidence') {
      evidenceAt = Date.now() - t0;
      const people = (data.groups || []).flatMap(g => (g.items || []).map(i => i.name)).filter(Boolean);
      console.log(`  ${at().padStart(6)}  EVIDENCE — ${(data.groups || []).length} group(s), ${people.length} named`);
      if (people.length) console.log(`            ${people.slice(0, 6).join(', ')}${people.length > 6 ? ` and ${people.length - 6} more` : ''}`);
    }
    if (name === 'done') {
      doneAt = Date.now() - t0;
      console.log(`  ${at().padStart(6)}  DONE — "${String(data.answer || '').slice(0, 90)}"`);
    }
  }
}

console.log('');
if (evidenceAt && doneAt) {
  console.log(`The customer sees the answer at ${(evidenceAt / 1000).toFixed(2)}s instead of ${(doneAt / 1000).toFixed(2)}s.`);
  console.log(`${((doneAt - evidenceAt) / 1000).toFixed(2)}s of waiting removed from the part that matters.`);
} else if (doneAt) {
  console.log(`Only the final answer arrived, at ${(doneAt / 1000).toFixed(2)}s — no evidence event.`);
  console.log('That happens when nothing matched, or the model could not be reached.');
}

child.kill();
await mongoose.disconnect().catch(() => {});
process.exit(0);
