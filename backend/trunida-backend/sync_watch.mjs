import fs from 'fs';
import { MongoClient } from 'mongodb';
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const c = new MongoClient(env.MONGO_URI); await c.connect();
const t = c.db('tenant_4a766c6406c0ef32');
let syncedAt = null;
for (let i = 1; i <= 70; i++) {
  const conn = await t.collection('svarg_connectors').findOne({ datasetName: 'Meetings (Zoho CRM)' });
  const rows = await t.collection('svarg_rows').countDocuments({ datasetName: 'Meetings (Zoho CRM)' });
  const ns = await t.collection('svarg_agents').findOne({ name: 'No Show' });
  const found = await t.collection('svarg_findings').countDocuments({ agentId: ns._id });
  const sAt = conn.lastSyncAt ? new Date(conn.lastSyncAt) : null;
  if (sAt && sAt > new Date('2026-09-29T07:10:00Z')) syncedAt = sAt;
  console.log(`${String(i).padStart(2)}  sync=${sAt ? sAt.toISOString().slice(11,19) : '-'} meetingRows=${rows} noShowRun=${ns.lastRunAt ? new Date(ns.lastRunAt).toISOString().slice(11,19) : 'DUE'} noShowFindings=${found}`);
  if (found > 0) { console.log('>>> NO SHOW FIRED'); break; }
  if (syncedAt && ns.lastRunAt && new Date(ns.lastRunAt) > syncedAt) { console.log('>>> ran after the fresh sync, found nothing'); break; }
  await sleep(30000);
}
const d = await t.collection('svarg_datasets').findOne({ name: 'Meetings (Zoho CRM)' });
const i = (n) => d.columns.indexOf(n);
console.log('\nMeetings rows now:');
for (const r of await t.collection('svarg_rows').find({ datasetName: 'Meetings (Zoho CRM)' }).toArray()) {
  console.log('  ' + String(r.cells[i('Event_Title')] || '').padEnd(36)
    + ' who=' + String(r.cells[i('Who_Id')] || '(empty)').padEnd(16)
    + ' status=' + JSON.stringify(r.cells[i('Appointment_Status')]));
}
const names = new Map((await t.collection('svarg_agents').find({}).toArray()).map(a => [String(a._id), a.name]));
console.log('\nboard:');
for (const f of await t.collection('svarg_findings').find({}).toArray()) console.log('  [' + names.get(String(f.agentId)) + '] ' + (f.title || f.key));
await c.close();
