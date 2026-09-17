/** Every deployment Svarg knows about, and which blueprint and owner it belongs to. */
import 'dotenv/config';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const db = mongoose.connection;

const deps = await db.collection('hosteddeployments').find({}).sort({ createdAt: 1 }).toArray();
console.log(`${deps.length} deployment(s)\n`);

for (const d of deps) {
  const bp = await db.collection('transformationblueprints')
    .findOne({ _id: d.blueprintId }, { projection: { appName: 1, businessObjective: 1, companyName: 1 } });
  const u = await db.collection('users').findOne({ _id: d.userId }, { projection: { email: 1, role: 1 } });
  console.log(`${d.railway?.url || '(no url)'}`);
  console.log(`  status      ${d.status}   ${d.statusMessage ? '— ' + String(d.statusMessage).slice(0, 80) : ''}`);
  console.log(`  app         ${bp?.appName || '(unnamed)'}   blueprint ${d.blueprintId}`);
  console.log(`  owner       ${u?.email || '(unknown)'}${u?.role ? ' [' + u.role + ']' : ''}`);
  console.log(`  db          ${d.dbName || '(none)'}`);
  console.log(`  created     ${d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 16) : '-'}   live ${d.liveAt ? new Date(d.liveAt).toISOString().slice(0, 16) : 'never'}`);
  console.log(`  requests    ${d.usage?.requests ?? 0}   last ${d.usage?.lastRequestAt ? new Date(d.usage.lastRequestAt).toISOString().slice(0, 16) : 'never'}`);
  console.log(`  conformance ${d.conformance ? (d.conformance.ran ? `${d.conformance.passed}/${d.conformance.passed + d.conformance.failed} at ${d.conformance.at}` : d.conformance.reason) : 'never run'}`);
  console.log();
}

await mongoose.disconnect();
