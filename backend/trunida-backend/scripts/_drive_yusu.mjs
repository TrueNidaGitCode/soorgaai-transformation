/**
 * Drives the whole Yusu flow against production, the way the screen does:
 * remove, prepare, push, deploy, then poll until it settles.
 *
 * Creates and destroys real Railway resources. Run deliberately.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import PersonalGithubConnection from '../models/PersonalGithubConnection.js';

const ID = process.env.DRIVE_BLUEPRINT || '6a4f37751d281fa2742797a6';
const HOST = 'https://truenidawebsite-production.up.railway.app';
const BP_URL = `${HOST}/api/strategy-canvas/transformation-blueprint/${ID}`;

await mongoose.connect(process.env.MONGO_URI);
const bp = await TransformationBlueprint.findById(ID).lean();
const gh = await PersonalGithubConnection.findOne({ userId: bp.userId }).lean();
const token = jwt.sign({ userId: bp.userId.toString(), role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30m' });
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

const call = async (url, opts = {}) => {
  const r = await fetch(url, { headers: H, ...opts });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, b };
};
const slug = t => String(t || 'svarg-project').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// The name Yusu derives: the recommended use case.
const sec = (bp.domains || []).flatMap(d => d.capabilities || []).flatMap(c => c.sections || [])
  .find(s => /AI (Implementation|Use Case) Prioritization/.test(s.title || ''));
const brief = sec?.brief || {};
const all = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
const rec = brief.recommendedStartingPoint || '';
const repoName = slug(all.find(n => n && rec.includes(n)) || rec || bp.businessObjective);

console.log(`GitHub account : ${gh?.githubLogin}`);
console.log(`Repo name      : ${repoName}`);
console.log(`Current record : ${bp.eameDelivery?.repoOwner || '(none)'}/${bp.eameDelivery?.repoName || ''}\n`);

console.log('1. remove any existing environment');
let r = await call(`${BP_URL}/deployment`, { method: 'DELETE' });
console.log(`   -> ${r.status} ${r.b.error || 'removed'}`);

console.log('2. prepare a fresh environment');
r = await call(`${BP_URL}/infrastructure`, { method: 'POST', body: JSON.stringify({ hosting: 'svarg' }) });
console.log(`   -> ${r.status} ${r.b.error || `${r.b.deployment?.environmentName} (${r.b.deployment?.status})`}`);
if (r.status >= 400) { await mongoose.disconnect(); process.exit(1); }

console.log('3. push the project (what Yusu autoRun does)');
r = await call(`${HOST}/api/github/personal/push-project`, {
  method: 'POST',
  body: JSON.stringify({ repoName, isPrivate: true, blueprintId: ID }),
});
console.log(`   -> ${r.status} ${r.b.error || `${r.b.owner}/${r.b.name} (${r.b.created ? 'created' : 'adopted'}, ${r.b.fileCount} files)`}`);
if (r.status >= 400) { await mongoose.disconnect(); process.exit(1); }
const pushedOwner = r.b.owner;

console.log('4. deploy');
r = await call(`${BP_URL}/deploy`, { method: 'POST', body: JSON.stringify({}) });
console.log(`   -> ${r.status} ${r.b.error || `${r.b.deployment?.status} at ${r.b.deployment?.url || '(no url yet)'}`}`);
if (r.status >= 400) { await mongoose.disconnect(); process.exit(1); }

// Confirm the service was wired to the repo we just pushed, not an older one.
const after = await (await import('../models/HostedDeployment.js')).default
  .findOne({ blueprintId: ID }).lean();
console.log(`\n   service repo : ${after?.repo?.owner}/${after?.repo?.name}`);
console.log(`   matches push : ${after?.repo?.owner === pushedOwner ? 'YES' : 'NO — wired to the wrong account'}`);

console.log('\n5. polling until it settles (up to 4 minutes)');
for (let i = 1; i <= 24; i++) {
  await new Promise(res => setTimeout(res, 10000));
  const s = await call(`${BP_URL}/deployment`);
  const d = s.b.deployment;
  console.log(`   ${String(i * 10).padStart(3)}s  ${d?.status} — ${d?.statusMessage || ''}`);
  if (d?.status === 'live') { console.log(`\nLIVE at ${d.url}`); break; }
  if (d?.status === 'failed') { console.log(`\nFAILED: ${d.statusMessage}`); break; }
}

await mongoose.disconnect();
