/**
 * Why a delivered application stopped answering, in its own words.
 *
 * Svarg's status probe asks the URL whether anything is listening, which is
 * the right question for "is it live" and useless for "why is it not". When a
 * tenant's app is crashed, the only account of what happened is on the
 * platform, and getting at it meant opening the Railway dashboard by hand.
 *
 * Usage, from backend/trunida-backend:
 *   node scripts/app-checks/railway_logs.mjs <deploymentId | app-host | email>
 *   node scripts/app-checks/railway_logs.mjs arthmano@gmail.com --lines=150
 */
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(BE, '.env') });

const arg = (n, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const who = process.argv.slice(2).find(a => !a.startsWith('--'));
const LINES = Number(arg('lines', 100));
if (!who) { console.error('give a deployment id, an app host, or the owner\'s email'); process.exit(1); }

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';
async function gql(query, variables) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('RAILWAY_API_TOKEN is not set.');
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors?.length) {
    throw new Error('Railway API: ' + (body.errors?.map(e => e.message).join('; ') || res.status));
  }
  return body.data;
}

await mongoose.connect(process.env.MONGO_URI);
const { default: HostedDeployment } = await import(`file:///${BE.split(path.sep).join('/')}/models/HostedDeployment.js`);
const { User } = await import(`file:///${BE.split(path.sep).join('/')}/models/User.js`);

let dep = null;
if (/^[0-9a-f]{24}$/i.test(who)) dep = await HostedDeployment.findById(who).lean();
if (!dep) dep = await HostedDeployment.findOne({ 'railway.url': new RegExp(who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).lean();
if (!dep) {
  const u = await User.findOne({ email: new RegExp('^' + who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
  if (u) dep = await HostedDeployment.findOne({ userId: u._id }).sort({ createdAt: -1 }).lean();
}
if (!dep) { console.error('no deployment found for', who); await mongoose.disconnect(); process.exit(1); }

const { projectId, serviceId, environmentId, url } = dep.railway || {};
console.log(`deployment ${dep._id}  ${dep.appName || ''}`);
console.log(`  status ${dep.status}  —  ${dep.statusMessage || ''}`);
console.log(`  ${url}`);
console.log(`  service ${serviceId}\n`);

// Which deployment is actually current, and what did Railway make of it.
const list = await gql(`
  query deployments($serviceId: String!, $environmentId: String!) {
    deployments(first: 5, input: { serviceId: $serviceId, environmentId: $environmentId }) {
      edges { node { id status createdAt staticUrl canRedeploy } }
    }
  }`, { serviceId, environmentId });

const nodes = (list?.deployments?.edges || []).map(e => e.node);
if (!nodes.length) { console.log('Railway reports no deployments for this service.'); }
for (const n of nodes) console.log(`  ${n.createdAt}  ${String(n.status).padEnd(10)} ${n.id}`);

const current = nodes[0];
if (!current) { await mongoose.disconnect(); process.exit(0); }

console.log(`\n── build log — ${current.id} (${current.status}) ─────────────────────────\n`);
for (const q of [
  { name: 'build',   query: `query l($id: String!, $limit: Int) { buildLogs(deploymentId: $id, limit: $limit) { message severity timestamp } }`,   pick: d => d?.buildLogs },
  { name: 'runtime', query: `query l($id: String!, $limit: Int) { deploymentLogs(deploymentId: $id, limit: $limit) { message severity timestamp } }`, pick: d => d?.deploymentLogs },
]) {
  try {
    const data = await gql(q.query, { id: current.id, limit: LINES });
    const rows = q.pick(data) || [];
    console.log(`\n── ${q.name} log (${rows.length} lines) ───────────────────────────────\n`);
    for (const r of rows) console.log(`${(r.severity || '').padEnd(5)} ${r.message}`);
  } catch (err) {
    console.log(`\n(${q.name} log unavailable: ${err.message})`);
  }
}

await mongoose.disconnect();
