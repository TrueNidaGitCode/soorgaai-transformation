// Usage, from backend/trunida-backend:  node scripts/app-checks/e2e_app.mjs
// Needs .env with MONGO_URI (or TENANT_CLUSTER_URI); uses the svarg_e2e_scratch database.
//
// End to end on a composed application: build the runtime as Eame does for
// a sports blueprint, boot it against a real database, and walk every door:
// sign-in rules, areas and rows, a folder-style import twice (the merge
// rule), the chat writing a record, the WhatsApp webhook verifying and then
// delivering a signed message that lands as attendance.
import dotenv from 'dotenv';
import crypto from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..').split(path.sep).join('/');
dotenv.config({ path: BE + '/.env' });
const { buildRuntime } = await import('file:///' + BE + '/services/eameProjectBuilder.js');
const { tenantMongoUri } = await import('file:///' + BE + '/services/deployTargetService.js');
const { sourcesForBlueprint, connectorKindsFor, sourcesFile } = await import('file:///' + BE + '/services/sourceCatalogService.js');
const { tenantAuthSecret, signAssertion } = await import('file:///' + BE + '/services/tenantAuthService.js');

const DEP = { _id: '66f1a2b3c4d5e6f708192a3b', railway: { url: 'http://localhost' } };
const bp = { industryFit: { industry: 'Sports Academies' }, domains: [{ domainId: 'data-readiness', capabilities: [{ sections: [{ brief: { datasets: [{ name: 'Attendance', typicalSource: 'WhatsApp groups' }] } }] }] }] };
const sources = sourcesForBlueprint(bp);
const SAMPLE = 'student_id,name,batch,_source\nX1,Sample One,U12,sample\nX2,Sample Two,U14,sample\n';
const ATT = 'date,time,name,reply,status,_source\n01/09/2026,06:00,Sample One,yes,present,sample\n';
const files = buildRuntime({ appName: 'E2E Academy', connectors: connectorKindsFor(sources) }).concat([
  sourcesFile(sources),
  { path: 'frontend/app.js', content: '// ui' },
  { path: 'routes/rollcallRoutes.js', content: 'import express from "express"; const r = express.Router(); r.get("/", (q, s) => s.json({ ok: true })); export default r;' },
  { path: 'scripts/seedRoster.js', content: `import fs from 'fs'; import mongoose from 'mongoose';
const Row = mongoose.models.E2ERow || mongoose.model('E2ERow', new mongoose.Schema({ dataset: String, cells: [String], _source: String }, { strict: false }));
export default async function seed({ datasetName, filePath } = {}) {
  if (!datasetName) return { message: 'boot' };
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\\n'); const header = lines.shift().split(',');
  const src = (lines[0] || '').split(',').pop();
  await Row.deleteMany({ dataset: datasetName, _source: { $in: ['sample', src] } });
  await Row.insertMany(lines.map(l => ({ dataset: datasetName, cells: l.split(','), _source: src })));
  return { message: 'seeded ' + datasetName + ' from ' + filePath + ': ' + lines.length };
}` },
  { path: 'data/samples/students.sample.csv', content: SAMPLE },
  { path: 'data/samples/attendance.sample.csv', content: ATT },
  { path: 'data/datasets.json', content: JSON.stringify([
    { name: 'Students', slug: 'students', file: 'data/samples/students.sample.csv', sampleRows: 2, columns: ['student_id', 'name', 'batch', '_source'] },
    { name: 'Attendance', slug: 'attendance', file: 'data/samples/attendance.sample.csv', sampleRows: 1, columns: ['date', 'time', 'name', 'reply', 'status', '_source'] },
  ]) },
]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svarg-e2e-'));
for (const f of files) { const full = path.join(dir, f.path); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, f.content); }
console.log('composed', files.length, 'files; connectors:', files.map(f => f.path).filter(p => p.includes('connectors/')).join(', '));

const run = (cmd, args, opts) => new Promise((res) => { const p = spawn(cmd, args, { ...opts, shell: true }); let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d); p.on('close', code => res({ code, out: o })); });
const inst = await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir });
console.log('install', inst.code);

const port = 3900 + Math.floor(Math.random() * 500);
process.env.JWT_SECRET = 'svarg-root-e2e';
const authSecret = tenantAuthSecret(DEP._id);
const APP_SECRET = 'e2e-app-secret';
// A clean scratch database: the owner's rows from an earlier run would be restored at boot and merged against.
{ const pre = await (await import('mongoose')).default.createConnection(tenantMongoUri(process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI, 'svarg_e2e_scratch')).asPromise(); for (const c of ['svarg_rows', 'svarg_imports', 'svarg_provenance', 'e2erows']) await pre.collection(c).deleteMany({}); await pre.close(); }
const child = spawn(process.execPath, ['server.js'], {
  cwd: dir,
  env: {
    PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port),
    MONGO_URI: tenantMongoUri(process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI, 'svarg_e2e_scratch'),
    JWT_SECRET: APP_SECRET, APP_OWNER_KEY: 'sok_e2e', APP_PUBLIC_ACCESS: 'true',
    SVARG_AUTH_URL: 'https://svarg.example/api/auth/oauth/google?tenant=' + DEP._id, SVARG_AUTH_SECRET: authSecret,
    CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'), APP_PUBLIC_URL: 'http://localhost:' + port,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
const started = Date.now();
while (Date.now() - started < 90000 && !/listening on port/.test(out)) await new Promise(r => setTimeout(r, 500));
console.log('boot:', out.trim().split('\n').filter(l => /Mounted|listening|seed\]/.test(l)).join(' | '));

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const base = `http://localhost:${port}`;
const j = async (p, o) => { const r = await fetch(base + p, o); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch { body = text; } return { status: r.status, body }; };
try {
  // Sign-in rules
  const prov = await j('/api/auth/providers'); check('door offers Google and email, not the open session', prov.body?.google && prov.body?.email && prov.body?.public === false, JSON.stringify(prov.body));
  check('open session refused while sign-in is configured', (await j('/api/session', { method: 'POST' })).status === 403);
  const g = await fetch(base + '/api/auth/google?hint=a@gmail.com', { redirect: 'manual' });
  check('Google goes to Svarg with tenant, return_to and hint', g.status === 302 && /tenant=66f1a2b3c4d5e6f708192a3b/.test(g.headers.get('location')) && /return_to=http/.test(g.headers.get('location')) && /login_hint=a%40gmail.com/.test(g.headers.get('location')), g.headers.get('location'));
  // Back from Svarg with an assertion -> the application's own session
  const assertion = signAssertion({ deployment: DEP, profile: { sub: '1', email: 'coach@e2e.in', name: 'Coach Ravi' } });
  const cb = await fetch(base + '/api/auth/callback?assertion=' + encodeURIComponent(assertion), { redirect: 'manual' });
  const frag = new URLSearchParams(String(cb.headers.get('location') || '').split('#')[1] || '');
  const token = frag.get('token') || '';
  check('assertion becomes a session', cb.status === 302 && !!token, (cb.headers.get('location') || '').slice(0, 60));
  const me = await j('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
  check('/me names the person', me.body?.name === 'Coach Ravi' && me.body?.email === 'coach@e2e.in', JSON.stringify(me.body));
  const badCb = await fetch(base + '/api/auth/callback?assertion=' + encodeURIComponent(signAssertion({ deployment: { ...DEP, _id: '66f1a2b3c4d5e6f708192a3c' }, profile: { email: 'x@y.z' } })), { redirect: 'manual' });
  check('another application\'s assertion refused', /signin-error/.test(badCb.headers.get('location') || ''));
  const U = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Areas and rows for a signed-in person
  check('areas refused without a session', (await j('/api/data/areas')).status === 401);
  const areas = await j('/api/data/areas', { headers: U });
  check('areas: two datasets, sample counts, keys', areas.body?.areas?.length === 2 && areas.body.areas[0].sample === 2 && areas.body.areas[0].key === 'student_id' && areas.body.areas[1].key === 'date + name', JSON.stringify(areas.body?.areas?.map(a => [a.name, a.own, a.sample, a.key])));
  const sampleRows = await j('/api/data/rows?dataset=Students&kind=sample', { headers: U });
  check('simulated rows read apart', sampleRows.body?.total === 2 && sampleRows.body.rows[0].source === 'sample');
  check('a signed-in person may not import', (await j('/api/data/import', { method: 'POST', headers: U, body: JSON.stringify({ datasetName: 'Students', rows: [['S1', 'A', 'U14']] }) })).status === 403);
  check('a signed-in person is not yet a writer', (await j('/api/data/intent', { method: 'POST', headers: U, body: JSON.stringify({ message: 'add x' }) })).status === 403);

  // The owner key, unlocked while signed in: the account becomes the owner
  const own = await j('/api/data/owner-session', { method: 'POST', headers: U, body: JSON.stringify({ key: 'sok_e2e' }) });
  check('owner key gives an owner session and promotes the account', own.status === 200 && own.body?.promoted === true, JSON.stringify(own.body));
  const O = { Authorization: 'Bearer ' + own.body.token, 'Content-Type': 'application/json' };
  check('promoted account is now a writer', (await j('/api/data/intent', { method: 'POST', headers: U, body: JSON.stringify({ message: 'Which learners are at risk?' }) })).status === 200);
  const srcs = await j('/api/data/sources', { headers: O });
  check('sources are the industry\'s: folder, WhatsApp', JSON.stringify(srcs.body?.sources?.map(s => s.kind)) === '["folder","whatsapp"]', JSON.stringify(srcs.body?.sources?.map(s => s.kind)));
  const kinds = await j('/api/connectors', { headers: O });
  check('only the WhatsApp Business connector shipped', JSON.stringify(kinds.body?.kinds?.map(k => k.kind)) === '["whatsapp-business"]', JSON.stringify(kinds.body?.kinds?.map(k => k.kind)));

  // A folder import, twice: the rule
  const imp1 = await j('/api/data/import', { method: 'POST', headers: O, body: JSON.stringify({ datasetName: 'Students', source: 'folder', origin: 'Students.xlsx', mode: 'merge', complete: true, rows: [['S1', 'Priya Nair', 'U14'], ['S2', 'Arjun Sharma', 'U16']] }) });
  check('first folder import adds two', imp1.body?.added === 2 && imp1.body?.key === 'student_id', JSON.stringify(imp1.body));
  const imp2 = await j('/api/data/import', { method: 'POST', headers: O, body: JSON.stringify({ datasetName: 'Students', source: 'folder', origin: 'Students.xlsx', mode: 'merge', complete: true, rows: [['S1', 'Priya Nair', 'U16'], ['S3', 'Meera Iyer', 'U12']] }) });
  check('second import: one changed, one added, one gone-and-kept', imp2.body?.updated === 1 && imp2.body?.added === 1 && imp2.body?.missing === 1, JSON.stringify(imp2.body));
  const ownRows = await j('/api/data/rows?dataset=Students&kind=own', { headers: U });
  check('three rows held, S1 now U16', ownRows.body?.total === 3 && ownRows.body.rows.find(r => r.cells[0] === 'S1')?.cells[2] === 'U16', JSON.stringify(ownRows.body?.rows?.map(r => r.cells.join('/'))));
  // The chat adds a record that the sheet later carries: one row, not two
  const rec = await j('/api/data/records', { method: 'POST', headers: U, body: JSON.stringify({ dataset: 'Students', row: { student_id: 'S4', name: 'Dev Kumar', batch: 'U12' } }) });
  check('chat record lands as chat', rec.body?.added === 1 && rec.body?.file?.includes('students.chat.csv'), JSON.stringify(rec.body));
  const imp3 = await j('/api/data/import', { method: 'POST', headers: O, body: JSON.stringify({ datasetName: 'Students', source: 'folder', origin: 'Students.xlsx', mode: 'merge', complete: false, rows: [['S4', 'Dev Kumar', 'U14']] }) });
  check('the sheet then updates the chat\'s row: moved from chat, one row per key', imp3.body?.moved?.[0]?.from === 'chat' && imp3.body?.moved?.[0]?.rows === 1, JSON.stringify(imp3.body?.moved));
  const after = await j('/api/data/rows?dataset=Students&kind=own', { headers: U });
  check('S4 held once, from the folder', after.body.rows.filter(r => r.cells[0] === 'S4').length === 1 && after.body.rows.find(r => r.cells[0] === 'S4').source === 'folder');
  const areas2 = await j('/api/data/areas', { headers: U });
  check('areas count theirs and sample apart', areas2.body.areas[0].own === 4 && areas2.body.areas[0].sample === 2, JSON.stringify(areas2.body.areas[0]));

  // WhatsApp Business: the setup lines, the verification, a signed delivery
  const setup = await j('/api/whatsapp/setup', { headers: O });
  check('setup gives the webhook address and verify token', /\/api\/whatsapp\/webhook$/.test(setup.body?.webhookUrl) && setup.body?.verifyToken?.length === 32, JSON.stringify(setup.body));
  const ver = await j('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=' + setup.body.verifyToken + '&hub.challenge=8675309');
  check('Meta\'s verification answered with the challenge', ver.status === 200 && String(ver.body) === '8675309', String(ver.body));
  check('wrong verify token refused', (await j('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1')).status === 403);
  // Connect a business number without reaching Meta: the connector's test would; here the sealed config is what matters, so create through the service's shape by faking the test with an unreachable id is not possible -- instead land through the webhook with no connection and expect a polite no-op.
  const noconn = await j('/api/whatsapp/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry: [] }) });
  check('webhook with no connection answers 200 and does nothing', noconn.status === 200 && noconn.body === 'no connection');
  // Create the connection directly in the application's database, sealed the way the service seals it, so the webhook path can be walked without Meta.
  const conn = await j('/api/connectors', { method: 'POST', headers: O, body: JSON.stringify({ kind: 'whatsapp-business', datasetName: 'Attendance', config: { phoneNumberId: '111', accessToken: 'EAAB.test', appSecret: APP_SECRET, mode: 'attendance' } }) });
  check('connecting a business number without Meta is refused with a reason', conn.status >= 400 && /Meta|reach|token|id/i.test(conn.body?.error || ''), conn.body?.error);
} catch (err) { check('probe ran to the end', false, err.stack); }

// The webhook's delivery path, with a connection put in place the way the service stores it.
try {
  const mongoose = (await import('mongoose')).default;
  const conn = await mongoose.createConnection(tenantMongoUri(process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI, 'svarg_e2e_scratch')).asPromise();
  // Seal like the service: AES-256-GCM under CONNECTOR_ENCRYPTION_KEY.
  const key = Buffer.alloc(32, 3);
  const seal = (plain) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]); return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ciphertext: ct.toString('base64') }; };
  await conn.collection('svarg_connectors').deleteMany({ kind: 'whatsapp-business' });
  await conn.collection('svarg_connectors').insertOne({ kind: 'whatsapp-business', datasetName: 'Attendance', schedule: 'manual', status: 'connected', createdAt: new Date(),
    config: { phoneNumberId: '111', mode: 'attendance', accessToken: seal('EAAB.test'), appSecret: seal(APP_SECRET) },
    mapping: { date: 'date', time: 'time', name: 'name', reply: 'message', status: 'status' } });
  const payload = { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '111' }, contacts: [{ wa_id: '919800000001', profile: { name: 'Priya' } }], messages: [
    { id: 'wamid.e2e.1', from: '919800000001', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Yes coach, coming' } },
    { id: 'wamid.e2e.2', from: '919800000002', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Is there practice tomorrow?' } },
  ] } }] }] };
  const raw = JSON.stringify(payload);
  const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
  const bad = await fetch(base + '/api/whatsapp/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) }, body: raw });
  check('unsigned delivery refused when an app secret is set', bad.status === 403);
  const good = await fetch(base + '/api/whatsapp/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body: raw });
  check('signed delivery accepted', good.status === 200);
  await new Promise(r => setTimeout(r, 2500));
  const inbox = await conn.collection('svarg_whatsapp_inbox').countDocuments({ messageId: /wamid\.e2e/ });
  check('both messages kept once in the inbox', inbox === 2, String(inbox));
  const again = await fetch(base + '/api/whatsapp/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body: raw });
  await new Promise(r => setTimeout(r, 1000));
  check('a retried delivery adds nothing', again.status === 200 && (await conn.collection('svarg_whatsapp_inbox').countDocuments({ messageId: /wamid\.e2e/ })) === 2);
  const att = await j('/api/data/rows?dataset=Attendance&kind=own', { headers: { Authorization: 'Bearer ' + (await j('/api/data/owner-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'sok_e2e' }) })).body.token } });
  check('the reply landed as attendance (present), the question did not', att.body?.total === 1 && att.body.rows[0].source === 'whatsapp-business' && att.body.rows[0].cells[4] === 'present' && att.body.rows[0].cells[2] === 'Priya', JSON.stringify(att.body?.rows?.map(r => r.cells)));
  await conn.collection('svarg_whatsapp_inbox').deleteMany({ messageId: /wamid\.e2e/ });
  await conn.collection('svarg_connectors').deleteMany({ kind: 'whatsapp-business' });
  await conn.collection('svarg_imports').deleteMany({});
  await conn.collection('svarg_rows').deleteMany({});
  await conn.collection('svarg_provenance').deleteMany({});
  await conn.collection('svarg_users').deleteMany({ email: 'coach@e2e.in' });
  await conn.collection('e2erows').deleteMany({});
  await conn.close();
} catch (err) { check('webhook delivery path', false, err.stack); }

child.kill();
await new Promise(r => setTimeout(r, 800));
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* handles */ }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? '; failed: ' + failed.map(f => f.name).join(' | ') : ''}`);
if (failed.length) console.log(out.trim().split('\n').slice(-30).join('\n'));
