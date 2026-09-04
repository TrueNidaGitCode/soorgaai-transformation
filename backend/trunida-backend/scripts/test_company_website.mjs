/**
 * The profile-setup path: import a company website against a USER (no
 * blueprint), then confirm Company Context is grounded in it.
 *
 *   node scripts/test_company_website.mjs [url]
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import CompanyWebsitePage from '../models/CompanyWebsitePage.js';
import UserProfile from '../models/UserProfile.js';

const HOST = process.env.LOCAL_HOST || 'http://localhost:3000';
const SITE = process.argv[2] || 'https://padhivu.org/';

await mongoose.connect(process.env.MONGO_URI);

const users = mongoose.connection.db.collection('users');
const user = await users.findOne({ email: 'praneshbabykannan@soorgaai.com' })
  || await users.findOne({ email: 'praneshbabykannan@gmail.com' });
if (!user) { console.error('No test user found.'); process.exit(1); }

console.log(`user: ${user.email}\nsite: ${SITE}\n`);
const token = jwt.sign({ userId: user._id.toString(), role: user.role || 'user' }, process.env.JWT_SECRET, { expiresIn: '30m' });
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

console.log('1. no blueprint required');
{
  const t0 = Date.now();
  const r = await fetch(`${HOST}/api/website/company`, { method: 'POST', headers: H, body: JSON.stringify({ url: SITE }) });
  const b = await r.json().catch(() => ({}));
  check('imported', r.ok, `HTTP ${r.status} in ${Date.now() - t0}ms`);
  (b.results || []).forEach(x => console.log(`        ${x.status.padEnd(10)} ${x.title?.slice(0, 50)}`));
  if (!r.ok) console.log('        ' + JSON.stringify(b));
}

console.log('\n2. stored against the user');
{
  const pages = await CompanyWebsitePage.find({ userId: user._id }).lean();
  check('rows written', pages.length > 0, `${pages.length}`);
  check('summaries present', pages.every(p => (p.summary || '').length > 20));
  pages.forEach(p => console.log(`        ${(p.title || '').slice(0, 46).padEnd(48)} ${p.extractionStatus}  ${(p.keywords || []).length} kw`));
  const prof = await UserProfile.findOne({ userId: user._id }, { websiteUrl: 1, orgName: 1 }).lean();
  console.log(`        profile: orgName=${prof?.orgName || '(none)'}  websiteUrl=${prof?.websiteUrl || '(none)'}`);
}

console.log('\n3. GET returns it');
{
  const r = await fetch(`${HOST}/api/website/company`, { headers: H });
  const b = await r.json().catch(() => ({}));
  check('readable', r.ok && Array.isArray(b.pages), `${b.pages?.length || 0} page(s)`);
}

console.log('\n4. company context is grounded in it');
{
  const { generateCompanyContextDraft } = await import('../services/companyContextService.js');
  const draft = await generateCompanyContextDraft(user._id);
  console.log('  --- profile ---');
  console.log('  ' + (draft.content || '').slice(0, 620).replace(/\n/g, '\n  '));
  check('no automotive framing', !/automotive|vehicle|OEM|Tier-1|ADAS/i.test(draft.content || ''));
  check('reflects the real business', /academ|music|dance|studio|student|attendance|fee/i.test(draft.content || ''));
}

await mongoose.disconnect();
console.log(pass ? '\nPASS' : '\nFAILED');
process.exit(pass ? 0 : 1);
