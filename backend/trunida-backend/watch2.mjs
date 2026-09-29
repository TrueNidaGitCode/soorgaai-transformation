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
const SINCE = new Date('2026-09-29T06:04:00Z');
for (let i = 1; i <= 24; i++) {
  const agents = await t.collection('svarg_agents').find({}).toArray();
  const ok = agents.filter(a => a.lastRunAt && new Date(a.lastRunAt) > SINCE && !a.lastError);
  const bad = agents.filter(a => a.lastRunAt && new Date(a.lastRunAt) > SINCE && a.lastError);
  const findings = await t.collection('svarg_findings').countDocuments({});
  console.log(`${String(i).padStart(2)}  answered:${ok.length}  failed:${bad.length}  findings:${findings}`);
  if (ok.length + bad.length >= 13) break;
  await sleep(30000);
}
console.log('\n--- findings ---');
for (const f of await t.collection('svarg_findings').find({}).toArray()) {
  console.log(JSON.stringify({ title: f.title, key: f.key, state: f.state, evidence: String(f.evidence || '').slice(0, 200) }));
}
console.log('\n--- agents ---');
for (const a of await t.collection('svarg_agents').find({}).sort({ name: 1 }).toArray()) {
  console.log('  ' + a.name.padEnd(22) + ' run=' + (a.lastRunAt ? new Date(a.lastRunAt).toISOString().slice(11,19) : 'DUE')
    + ' found=' + (a.lastFoundAt ? new Date(a.lastFoundAt).toISOString().slice(11,19) : '-')
    + ' err=' + String(a.lastError || '').slice(0, 55));
}
await c.close();
