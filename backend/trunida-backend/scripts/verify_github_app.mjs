/**
 * Is the read-only GitHub App configured and working?
 *
 * Run after setting GITHUB_APP_ID / SLUG / PRIVATE_KEY, before trying the UI.
 * Every failure here has a specific cause and a specific fix, and saying which
 * is the whole point — "Connect GitHub does nothing" is not a diagnosis.
 *
 *   node scripts/verify_github_app.mjs
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { isGithubAppConfigured, buildInstallUrl } from '../services/githubAppService.js';

let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!pass) ok = false;
};

console.log('1. environment');
const id   = process.env.GITHUB_APP_ID;
const slug = process.env.GITHUB_APP_SLUG;
const key  = (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\n/g, '\n');

check('GITHUB_APP_ID set', !!id, id ? `id ${id}` : 'missing');
check('GITHUB_APP_SLUG set', !!slug, slug || 'missing');
check('GITHUB_APP_PRIVATE_KEY set', !!key, key ? `${key.length} chars` : 'missing');
check('service reports configured', isGithubAppConfigured());
if (!ok) { console.log('\nSet these in backend/trunida-backend/.env — see .env.example.'); process.exit(1); }

console.log('\n2. the private key is a usable PEM');
let appJwt = null;
try {
  const now = Math.floor(Date.now() / 1000);
  appJwt = jwt.sign({ iat: now - 60, exp: now + 540, iss: id }, key, { algorithm: 'RS256' });
  check('signs an RS256 token', true);
} catch (err) {
  check('signs an RS256 token', false, err.message);
  console.log('\n  The PEM is malformed. Paste it with literal \n between lines,');
  console.log('  or as a real multi-line value. It must be the whole file,');
  console.log('  including the BEGIN and END lines.');
  process.exit(1);
}

console.log('\n3. GitHub accepts it');
const res = await fetch('https://api.github.com/app', {
  headers: {
    Authorization: `Bearer ${appJwt}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Svarg',
  },
});
if (!res.ok) {
  check('authenticates as the app', false, `HTTP ${res.status}`);
  if (res.status === 401) console.log('\n  401 means the App ID and the private key do not belong together.');
  process.exit(1);
}
const app = await res.json();
check('authenticates as the app', true, `"${app.name}"`);
check('slug matches the App', app.slug === slug, `GitHub says "${app.slug}", .env says "${slug}"`);

const perms = app.permissions || {};
console.log(`\n4. permissions: ${JSON.stringify(perms)}`);
check('contents is read-only', perms.contents === 'read',
  perms.contents ? `contents=${perms.contents}` : 'contents permission not granted');
const writes = Object.entries(perms).filter(([, v]) => v === 'write').map(([k]) => k);
check('nothing has write', writes.length === 0, writes.length ? `write on: ${writes.join(', ')}` : '');

console.log('\n5. installations');
const insRes = await fetch('https://api.github.com/app/installations', {
  headers: { Authorization: `Bearer ${appJwt}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Svarg' },
});
const installs = insRes.ok ? await insRes.json() : [];
if (!installs.length) {
  console.log('  none yet — that is expected before anyone installs it.');
  console.log(`  Install URL: ${buildInstallUrl('test-state')}`);
} else {
  for (const i of installs) {
    console.log(`  ${i.account?.login} (${i.account?.type}) — ${i.repository_selection} repositories`);
  }
}

console.log(ok ? '\nReady. The Connect GitHub button will appear on Aria.' : '\nFix the failures above.');
process.exit(ok ? 0 : 1);
