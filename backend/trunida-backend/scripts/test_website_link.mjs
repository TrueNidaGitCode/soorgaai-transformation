/**
 * Links a real website to a real blueprint through the running local API,
 * then checks what was actually stored — classification, redaction, and the
 * company context that should now be grounded rather than invented.
 *
 *   node scripts/test_website_link.mjs <blueprintId> [url]
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';

const HOST = process.env.LOCAL_HOST || 'http://localhost:3000';
const URL_TO_LINK = process.argv[3] || 'https://padhivu.org/';

await mongoose.connect(process.env.MONGO_URI);

// Guest blueprints have no userId and cannot be owner-checked, so skip them.
const bp = process.argv[2]
  ? await TransformationBlueprint.findById(process.argv[2]).lean()
  : await TransformationBlueprint.findOne({ userId: { $exists: true, $ne: null } })
      .sort({ createdAt: -1 }).lean();

if (!bp) { console.error('No blueprint found. Pass a blueprintId.'); process.exit(1); }
if (!bp.userId) { console.error('That blueprint is a guest blueprint (no userId).'); process.exit(1); }
console.log(`blueprint: ${bp._id}\nobjective: ${String(bp.businessObjective).slice(0, 70)}\n`);

const token = jwt.sign({ userId: bp.userId.toString(), role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30m' });
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

console.log('1. rejects a private address through the API');
{
  const r = await fetch(`${HOST}/api/website/link`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ blueprintId: bp._id, url: 'http://169.254.169.254/latest/meta-data/' }),
  });
  const b = await r.json().catch(() => ({}));
  check('cloud metadata refused', r.status === 400, `HTTP ${r.status} ${b.error || ''}`);
}

console.log('\n2. links the real site');
{
  const t0 = Date.now();
  const r = await fetch(`${HOST}/api/website/link`, {
    method: 'POST', headers: H, body: JSON.stringify({ blueprintId: bp._id, url: URL_TO_LINK }),
  });
  const b = await r.json().catch(() => ({}));
  check('accepted', r.ok, `HTTP ${r.status} in ${Date.now() - t0}ms`);
  if (r.ok) {
    console.log(`        origin: ${b.origin}`);
    (b.results || []).forEach(x => console.log(`        ${x.status.padEnd(10)} ${String(x.keywords ?? '').padStart(2)} kw  ${x.title?.slice(0, 44)}`));
    check('at least one page linked', (b.results || []).some(x => x.status === 'linked'));
  } else {
    console.log('        ' + JSON.stringify(b));
  }
}

console.log('\n3. what was actually stored');
{
  const docs = await LinkedProjectDocument.find({ blueprintId: bp._id, sourceType: 'website' }).lean();
  check('rows written', docs.length > 0, `${docs.length}`);
  docs.forEach(d => {
    console.log(`        ${d.title?.slice(0, 40).padEnd(42)} ${d.extractionStatus}  ${(d.keywords || []).length} keywords  ${d.rawText?.length || 0} chars`);
    if (d.summary) console.log(`          summary: ${d.summary.slice(0, 120)}`);
  });
  check('summaries are non-empty', docs.every(d => (d.summary || '').length > 20));
  check('keywords extracted', docs.some(d => (d.keywords || []).length > 0));
}

console.log('\n4. company context is now grounded, not invented');
{
  const { generateCompanyContextDraft } = await import('../services/companyContextService.js');
  const draft = await generateCompanyContextDraft(bp.userId);
  const text = draft.content || '';
  console.log('  --- generated profile ---');
  console.log('  ' + text.slice(0, 700).replace(/\n/g, '\n  '));
  check('mentions nothing automotive', !/automotive|vehicle|OEM|Tier-1/i.test(text));
  check('reflects the real business', /academ|music|dance|student|studio|attendance|fee/i.test(text));
}

await mongoose.disconnect();
console.log(pass ? '\nPASS' : '\nFAILED');
process.exit(pass ? 0 : 1);
