// What a live application holds about its WhatsApp Business connection:
// the connector record (never the credentials), the inbox, and the rows it
// landed. Usage, from backend/trunida-backend:
//   node scripts/app-checks/inspect_whatsapp.mjs [app url]
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(BE, '.env') });
const { tenantMongoUri } = await import('file:///' + BE.split(path.sep).join('/') + '/services/deployTargetService.js');
const HostedDeployment = (await import('file:///' + BE.split(path.sep).join('/') + '/models/HostedDeployment.js')).default;

const wanted = process.argv[2] || 'app-production-94d4';
await mongoose.connect(process.env.MONGO_URI);
const dep = await HostedDeployment.findOne({ 'railway.url': new RegExp(wanted) }).lean();
if (!dep) { console.log('no deployment matching', wanted); process.exit(1); }
console.log('app:', dep.railway?.url, '| status:', dep.status, '| db:', dep.dbName);

const t = await mongoose.createConnection(tenantMongoUri(process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI, dep.dbName)).asPromise();
const conns = await t.collection('svarg_connectors').find({ kind: 'whatsapp-business' }).toArray();
console.log('\nconnections:', conns.length);
for (const c of conns) {
  console.log(' -', { dataset: c.datasetName, status: c.status, schedule: c.schedule, createdAt: c.createdAt, lastSyncAt: c.lastSyncAt, lastRows: c.lastRows, lastError: c.lastError, hasSecret: !!(c.config?.appSecret || c.encrypted), summary: c.summary });
}
const inbox = await t.collection('svarg_whatsapp_inbox').find({}).sort({ receivedAt: -1 }).limit(10).toArray();
console.log('\ninbox (latest 10 of', await t.collection('svarg_whatsapp_inbox').countDocuments(), '):');
for (const m of inbox) console.log(' -', m.receivedAt, m.from, JSON.stringify(m.text || m.type).slice(0, 80), m.landed ? 'landed' : '');
const rows = await t.collection('svarg_rows').find({ source: 'whatsapp-business' }).sort({ n: -1 }).limit(5).toArray();
console.log('\nrows from whatsapp-business:', await t.collection('svarg_rows').countDocuments({ source: 'whatsapp-business' }));
for (const r of rows) console.log(' -', r.datasetName, JSON.stringify(r.cells));
const imports = await t.collection('svarg_imports').find({ source: 'whatsapp-business' }).sort({ at: -1 }).limit(5).toArray();
console.log('\nimports:', imports.map(i => `${i.at?.toISOString?.() || i.at} ${i.datasetName} ${i.rows} rows`).join(' | ') || 'none');
await t.close(); await mongoose.disconnect();
