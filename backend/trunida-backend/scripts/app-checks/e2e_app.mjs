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
{ const pre = await (await import('mongoose')).default.createConnection(tenantMongoUri(process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI, 'svarg_e2e_scratch')).asPromise(); for (const c of ['svarg_rows', 'svarg_imports', 'svarg_provenance', 'e2erows', 'svarg_churn_patterns', 'svarg_churn_settings', 'svarg_app_events', 'svarg_app_users']) await pre.collection(c).deleteMany({}); await pre.collection('svarg_connectors').deleteMany({ kind: 'app-events' }); await pre.collection('svarg_datasets').deleteMany({ name: 'App Activity' }); await pre.collection('svarg_agents').deleteMany({ watcherId: 'learned-pattern' }); await pre.close(); }
// A stand-in for Meta's Graph API: the number lookup the connect makes.
const metaHits = [];
const meta = (await import('http')).createServer((req, res) => { metaHits.push(req.url); res.setHeader('Content-Type', 'application/json'); if (req.url.startsWith("/111222333444555?") && /Bearer EAAB[.]test/.test(req.headers.authorization || '')) res.end(JSON.stringify({ display_phone_number: '+91 98000 00000', verified_name: 'E2E Academy', quality_rating: 'GREEN' })); else { res.statusCode = 400; res.end(JSON.stringify({ error: { message: 'Invalid OAuth access token' } })); } });
await new Promise(r => meta.listen(0, r));
const META_URL = 'http://127.0.0.1:' + meta.address().port;
const child = spawn(process.execPath, ['server.js'], {
  cwd: dir,
  env: {
    PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port),
    MONGO_URI: tenantMongoUri(process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI, 'svarg_e2e_scratch'),
    JWT_SECRET: APP_SECRET, APP_OWNER_KEY: 'sok_e2e', APP_PUBLIC_ACCESS: 'true',
    SVARG_AUTH_URL: 'https://svarg.example/api/auth/oauth/google?tenant=' + DEP._id, SVARG_AUTH_SECRET: authSecret,
    CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'), WHATSAPP_GRAPH_URL: META_URL, APP_PUBLIC_URL: 'http://localhost:' + port, APP_EVENTS_GATHER_MS: '300',
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
  // The database card is offered to every application, after the industry's own.
  check('sources are the industry\'s, then the database', JSON.stringify(srcs.body?.sources?.map(s => s.kind)) === '["folder","whatsapp","database"]', JSON.stringify(srcs.body?.sources?.map(s => s.kind)));
  const kinds = await j('/api/connectors', { headers: O });
  // WhatsApp Business is the industry's; the database, the CRMs (Zoho, LeadSquared, Clinicea) and the phone ship to everyone.
  check('WhatsApp Business plus what every application gets', JSON.stringify(kinds.body?.kinds?.map(k => k.kind)) === '["app-events","clinicea","database","leadsquared","phone","whatsapp-business","zoho-crm"]', JSON.stringify(kinds.body?.kinds?.map(k => k.kind)));

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
  // The record itself, not the file: a host that loses its disk on the next
  // restart must still have every row the owner brought in.
  {
    const mongoose = (await import('mongoose')).default;
    const c = await mongoose.createConnection(tenantMongoUri(process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI, 'svarg_e2e_scratch')).asPromise();
    const kept = await c.collection('svarg_rows').countDocuments({ datasetName: 'Students' });
    check('the owner rows survive in the database, not only on disk (svarg_rows)', kept >= 3, 'svarg_rows=' + kept);
    await c.close();
  }
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
  // Connect a business number the way the card does, against the stand-in Meta.
  const bad = await j('/api/connectors', { method: 'POST', headers: O, body: JSON.stringify({ kind: 'whatsapp-business', datasetName: 'Attendance', config: { phoneNumberId: '111222333444555', accessToken: 'wrong', appSecret: APP_SECRET, mode: 'attendance' } }) });
  check('a wrong token is refused with the reason Meta gives', bad.status === 400 && /Invalid OAuth/.test(bad.body?.error || ''), bad.body?.error);
  const conn = await j('/api/connectors', { method: 'POST', headers: O, body: JSON.stringify({ kind: 'whatsapp-business', datasetName: 'Attendance', config: { phoneNumberId: '111222333444555', accessToken: 'EAAB.test', appSecret: APP_SECRET, mode: 'attendance' } }) });
  check('Test and connect saves the connection (201, connected, Meta asked once for the number)', conn.status === 201 && conn.body?.connector?.status === 'connected' && conn.body.connector.datasetName === 'Attendance' && metaHits.filter(u => u.startsWith('/111222333444555')).length >= 1, JSON.stringify(conn.body) + ' hits=' + metaHits.join(','));
  const listed = await j('/api/connectors', { headers: O });
  check('the card then lists it, without the credentials', listed.body?.connectors?.length === 1 && !JSON.stringify(listed.body).includes('EAAB.test'), JSON.stringify(listed.body?.connectors));
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

// Detect → Explain → Recommend → Act → Measure → Learn, per customer, on a real database.
try {
  const mongoose = (await import('mongoose')).default;
  const conn = await mongoose.createConnection(tenantMongoUri(process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI, 'svarg_e2e_scratch')).asPromise();
  const F = conn.collection('svarg_findings');
  await F.deleteMany({ key: /^e2e-spine/ });
  const agentId = new mongoose.Types.ObjectId();
  const at = new Date(Date.now() - 3 * 86400000);
  const ins = await F.insertMany([
    { agentId, key: 'e2e-spine-1', state: 'open', title: 'Meera Iyer', watcherId: 'stopped-coming', agentName: 'Stopped Coming', severity: 'medium', firstSeenAt: at, lastSeenAt: new Date(), evidence: { rule: 'no visit in 14 days' } },
    { agentId, key: 'e2e-spine-2', state: 'open', title: 'Meera Iyer', watcherId: 'package-overused', agentName: 'Package Over-used', severity: 'high', firstSeenAt: at, lastSeenAt: new Date(), evidence: { rule: 'sessions used above sessions bought' } },
  ]);
  const id1 = String(ins.insertedIds[0]);
  const tok = (await j('/api/data/owner-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'sok_e2e' }) })).body.token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  const board = await j('/api/agents/findings', { headers: H });
  const meera = (board.body?.customers || []).find(c => c.person === 'Meera Iyer');
  check('the board tags the customer with all six stages', meera && meera.findings === 2 && meera.kinds.sort().join() === 'growth,retention'
    && Object.keys(meera.stages).join() === 'detect,explain,recommend,act,measure,learn' && meera.stages.act.state === 'waiting',
    JSON.stringify(meera && { k: meera.kinds, s: Object.fromEntries(Object.entries(meera.stages).map(([k, v]) => [k, v.state])) }));
  const one = await j('/api/agents/findings/' + id1, { headers: H });
  check('a finding carries its why and its next step', one.body?.guidance?.recommend?.action === 'call' && /drift away/.test(one.body.guidance.why || ''), JSON.stringify(one.body?.guidance?.recommend));
  check('a step outside the vocabulary is refused', (await j('/api/agents/findings/' + id1 + '/acted', { method: 'POST', headers: H, body: JSON.stringify({ action: 'email-blast' }) })).status === 400);
  // A front-desk reader, not the owner: they are who makes the call.
  const cb2 = await fetch(base + '/api/auth/callback?assertion=' + encodeURIComponent(signAssertion({ deployment: DEP, profile: { sub: '2', email: 'desk@e2e.in', name: 'Front Desk' } })), { redirect: 'manual' });
  const deskTok = new URLSearchParams(String(cb2.headers.get('location') || '').split('#')[1] || '').get('token') || '';
  const R = { Authorization: 'Bearer ' + deskTok, 'Content-Type': 'application/json' };
  const acted = await j('/api/agents/findings/' + id1 + '/acted', { method: 'POST', headers: R, body: JSON.stringify({ action: 'call' }) });
  await conn.collection('svarg_users').deleteMany({ email: 'desk@e2e.in' });
  check('a signed-in reader can mark a step as done', acted.status === 200 && acted.body?.acted?.action === 'call', JSON.stringify(acted.body));
  const after = (await j('/api/agents/findings', { headers: H })).body?.customers?.find(c => c.person === 'Meera Iyer');
  check('Act is partly done and Measure waits on the acted finding', after?.stages?.act?.state === 'part' && after.stages.measure.state === 'waiting' && /come in again/.test(after.stages.measure.line), JSON.stringify(after?.stages?.measure));
  // What the watcher run does when it stops finding it: resolve, with the outcome.
  await F.updateOne({ _id: ins.insertedIds[0] }, { $set: { state: 'resolved', resolvedAt: new Date() }, $push: { outcomes: { action: 'call', actedAt: new Date(), resolvedAt: new Date() } } });
  const won = (await j('/api/agents/findings', { headers: H })).body?.customers?.find(c => c.person === 'Meera Iyer');
  check('Measure counts it once the finding resolved after the team acted', won?.stages?.measure?.state === 'done', JSON.stringify(won?.stages?.measure));
  /*
   * The AI's analysis. This application has no model behind it, so the
   * refresh the board triggered must fail and leave the labelled playbook in
   * place -- then a stored analysis must take over every written line.
   */
  check('without an AI answer the card says it is the standard guidance', won?.source === 'standard', JSON.stringify({ source: won?.source, pending: won?.pending }));
  const A = conn.collection('svarg_customer_analyses');
  await A.updateOne({ _id: 'own|Meera Iyer' }, { $set: { person: 'Meera Iyer', simulated: false, fingerprint: 'older', at: new Date(), error: '', analysis: {
    kind: 'growth', explain: 'Meera has used sessions her package did not cover.', learn: 'Nothing recorded here yet.',
    recommend: { action: 'offer', step: 'Offer Meera the next package when she is in.', why: 'She is already using more than she bought.' },
    act: 'Hi Meera, would you like to move to the next package?', measure: 'A paid package for Meera appears in the records.',
  } } }, { upsert: true });
  const ai = (await j('/api/agents/findings', { headers: H })).body?.customers?.find(c => c.person === 'Meera Iyer');
  check('a stored AI analysis writes the card, and the states stay counted', ai?.source === 'ai' && ai.current === false && ai.stages.recommend.line === 'Offer Meera the next package when she is in.'
    && ai.stages.explain.line.startsWith('Meera has used') && ai.stages.measure.state === 'done', JSON.stringify({ s: ai?.source, r: ai?.stages?.recommend?.line, m: ai?.stages?.measure?.state }));
  const g2 = (await j('/api/agents/findings/' + String(ins.insertedIds[1]), { headers: H })).body?.guidance;
  check('the finding page carries the AI\'s step and message', g2?.source === 'ai' && g2.recommend.action === 'offer' && /next package/.test(g2.draft || ''), JSON.stringify(g2 && { s: g2.source, a: g2.recommend?.action }));
  await A.deleteMany({ _id: 'own|Meera Iyer' });
  await F.deleteMany({ key: /^e2e-spine/ });
  await conn.close();
} catch (err) { check('customer spine', false, err.stack); }

// Learned churn patterns: a year of attendance with a planted pattern — the
// players who left were absent twice in their last month — learned, listed,
// redefined and approved over the application's own API.
try {
  const tok = (await j('/api/data/owner-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'sok_e2e' }) })).body.token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  const DAYMS = 86400000;
  const today = Date.now();
  const dmy = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
  let seed = 5;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const rows = [];
  const player = (name, leaves) => {
    const end = leaves ? today - (100 + Math.floor(rand() * 100)) * DAYMS : today - 2 * DAYMS;
    let absences = 0;
    for (let t = today - 360 * DAYMS + Math.floor(rand() * 7) * DAYMS; t <= end; t += 7 * DAYMS) {
      let status = rand() < 0.03 ? 'absent' : 'present';
      if (leaves && end - t < 30 * DAYMS && absences < 2) { status = 'absent'; absences++; }
      rows.push([dmy(t), '06:00', name, 'yes', status]);
    }
    rows.push([dmy(end), '06:00', name, 'yes', 'present']);
  };
  for (let i = 0; i < 30; i++) player(`Left Player ${i}`, true);
  for (let i = 0; i < 40; i++) player(`Stays Player ${i}`, false);
  // A player's last visit can fall on a weekly date already there; the
  // import merges on date + name, so a handful collapse. That is the rule.
  const imp = await j('/api/data/import', { method: 'POST', headers: H, body: JSON.stringify({ datasetName: 'Attendance', source: 'folder', origin: 'Attendance.xlsx', mode: 'merge', rows }) });
  check('a year of attendance imports', imp.status === 200 && imp.body?.added >= rows.length * 0.99, JSON.stringify({ s: imp.status, added: imp.body?.added, n: rows.length }));

  const before = await j('/api/patterns', { headers: H });
  check('the definition reads as one sentence before anything is learned', /^A customer counts as lost when/.test(before.body?.definition?.sentence || ''), before.body?.definition?.sentence);
  check('a reader without a session is refused', (await j('/api/patterns')).status === 401);

  const learned = await j('/api/patterns/learn', { method: 'POST', headers: H });
  check('learning reads who left and who stayed', learned.status === 200 && learned.body?.status?.churned >= 20 && learned.body?.status?.enough === true && learned.body?.status?.simulated === false, JSON.stringify(learned.body?.status));
  const listed = await j('/api/patterns', { headers: H });
  const absent = (listed.body?.patterns || []).find((p) => /absent in Attendance/i.test(p.label));
  check('the planted pattern is found, with its numbers', absent && absent.state === 'candidate' && absent.withChurned >= 20 && /Seen before \d+ of the \d+ customers who left/.test(absent.sentence), JSON.stringify(listed.body?.patterns?.map((p) => [p.label, p.withChurned, p.strength])));

  const redef = await j('/api/patterns/definition', { method: 'PUT', headers: H, body: JSON.stringify({ inactiveDays: 60, statusWords: 'withdrawn, left' }) });
  check('the owner can change what lost means, and it learns again', redef.status === 200 && redef.body?.definition?.inactiveDays === 60 && /60 days/.test(redef.body?.definition?.sentence || '') && redef.body?.status?.churned >= 20, JSON.stringify(redef.body?.definition));

  const again = (await j('/api/patterns', { headers: H })).body?.patterns?.find((p) => /absent in Attendance/i.test(p.label));
  const ok = again && await j('/api/patterns/' + again.id + '/approve', { method: 'POST', headers: H, body: '{}' });
  check('approving starts an agent', ok?.status === 200 && !!ok.body?.agentId, JSON.stringify(ok?.body));
  const ags = await j('/api/agents', { headers: H });
  check('the agent is on the map as a learned pattern', (ags.body?.agents || []).some((a) => a.watcherId === 'learned-pattern' && /Learned: .*absent/i.test(a.name)), JSON.stringify((ags.body?.agents || []).map((a) => a.name)));
  check('and the pattern now says it is being watched', (await j('/api/patterns', { headers: H })).body?.patterns?.find((p) => p.id === again.id)?.state === 'approved');
} catch (err) { check('learned churn patterns', false, err.stack); }

// Your app's events: a business's own app sending what its users do, in
// Segment's shape, with this application's key -- kept once, landed as rows.
try {
  const tok = (await j('/api/data/owner-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'sok_e2e' }) })).body.token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  check('the developers\' setup is the owner\'s only', (await j('/api/app-events/setup')).status === 401);
  const st = await j('/api/app-events/setup', { headers: H });
  check('setup gives the address and a key', /\/api\/app-events$/.test(st.body?.url || '') && /^sk_app_[0-9a-f]{40}$/.test(st.body?.key || ''), JSON.stringify(st.body).slice(0, 120));
  const made = await j('/api/connectors', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'app-events', datasetName: '', config: { appName: '' } }) });
  check('connecting your app defines its own dataset', made.status < 300 && made.body?.connector?.datasetName === 'App Activity', JSON.stringify(made.body).slice(0, 200));
  const send = (body, key = st.body.key) => j('/api/app-events/batch', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  check('a wrong key is refused', (await send({ batch: [] }, 'sk_app_wrong')).status === 401);
  const batch = { batch: [
    { type: 'identify', userId: 't-1', traits: { name: 'Asha Rao', email: 'asha@hillview.edu', school: 'Hillview School' } },
    { type: 'track', userId: 't-1', event: 'Lesson Created', messageId: 'e2e-ev-1', timestamp: '2026-10-01T08:00:00Z', properties: { school: 'Hillview School' } },
    { type: 'track', userId: 't-1', event: 'Subscription Cancelled', messageId: 'e2e-ev-2', timestamp: '2026-10-02T08:00:00Z', properties: { status: 'cancelled', plan: 'pro' } },
    { type: 'track', event: 'No user' },
  ] };
  const sent = await send(batch);
  check('a batch is accepted, the event without a user refused', sent.status === 200 && sent.body?.accepted === 3 && sent.body?.rejected === 1, JSON.stringify(sent.body));
  await send(batch); // a sender's retry
  // Basic auth with the key as the username: how Segment sends a write key.
  const basic = await j('/api/app-events/track', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(st.body.key + ':').toString('base64'), 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 't-2', event: 'Quiz Shared', messageId: 'e2e-ev-3' }) });
  check('Segment\'s Basic write key works too', basic.status === 200 && basic.body?.accepted === 1, JSON.stringify(basic.body));
  let rows = null;
  for (let i = 0; i < 30 && !(rows?.total >= 3); i++) { await new Promise((r) => setTimeout(r, 500)); rows = (await j('/api/data/rows?dataset=' + encodeURIComponent('App Activity'), { headers: H })).body; }
  // Then once the landings the sends asked for have all finished.
  await new Promise((r) => setTimeout(r, 2500));
  rows = (await j('/api/data/rows?dataset=' + encodeURIComponent('App Activity'), { headers: H })).body;
  const flat = JSON.stringify(rows?.rows || []);
  check('events land once each, with who the user is', rows?.total === 3 && /Asha Rao/.test(flat) && /Hillview School/.test(flat) && /cancelled/.test(flat), JSON.stringify({ total: rows?.total, ids: (rows?.rows || []).map((r) => r.cells[10] + '/' + r.cells[11]) }));
} catch (err) { check('your app\'s events', false, err.stack); }

child.kill(); meta.close();
await new Promise(r => setTimeout(r, 800));
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* handles */ }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? '; failed: ' + failed.map(f => f.name).join(' | ') : ''}`);
if (failed.length) console.log(out.trim().split('\n').slice(-30).join('\n'));
