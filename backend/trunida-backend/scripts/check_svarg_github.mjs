/**
 * Preflight for Eame's publishing credentials.
 *
 * Answers the question the 503 cannot: are SVARG_GITHUB_TOKEN and
 * SVARG_GITHUB_OWNER not merely present, but the right ones? Creating a
 * repository is the only way to find out for real, so this checks everything
 * short of that — identity, scope, and the account the repo would land in.
 *
 * Read-only. It creates nothing and pushes nothing.
 *
 *   node scripts/check_svarg_github.mjs
 */
import 'dotenv/config';

const TOKEN = process.env.SVARG_GITHUB_TOKEN || '';
const OWNER = process.env.SVARG_GITHUB_OWNER || '';
const API = 'https://api.github.com';

const ok = (m) => console.log('  PASS  ' + m);
const bad = (m) => { console.log('  FAIL  ' + m); failed = true; };
const warn = (m) => console.log('  WARN  ' + m);
let failed = false;

async function gh(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
}

console.log('\nEame publishing preflight\n');

if (!TOKEN || !OWNER) {
  bad(`missing config — SVARG_GITHUB_TOKEN ${TOKEN ? 'set' : 'MISSING'}, SVARG_GITHUB_OWNER ${OWNER ? `= ${OWNER}` : 'MISSING'}`);
  console.log('\nThis is exactly what makes Yusu answer 503.\n');
  process.exit(1);
}
ok(`config present — owner ${OWNER}`);

// 1. Who does the token actually belong to? This is the check that matters:
//    on a plain account the repo is created under the TOKEN's owner, and
//    SVARG_GITHUB_OWNER never enters the request.
const me = await gh('/user');
if (me.status !== 200) {
  bad(`the token was rejected (${me.status} ${me.body.message || ''}) — it is invalid, expired or revoked`);
  process.exit(1);
}
ok(`token belongs to ${me.body.login}`);

if (me.body.login.toLowerCase() !== OWNER.toLowerCase()) {
  bad(`token owner ${me.body.login} != SVARG_GITHUB_OWNER ${OWNER}`);
  console.log(`        Repos would be created under ${me.body.login}, not ${OWNER}.`);
} else {
  ok('token owner matches SVARG_GITHUB_OWNER');
}

// 2. Which creation endpoint ensureSvargRepo will pick.
const owner = await gh(`/users/${OWNER}`);
if (owner.status !== 200) {
  bad(`cannot read the owner account ${OWNER} (${owner.status})`);
} else {
  const isOrg = owner.body.type === 'Organization';
  ok(`${OWNER} is ${isOrg ? 'an organisation → POST /orgs/' + OWNER + '/repos' : 'a user account → POST /user/repos'}`);
}

// 3. Can it create private repositories? A classic PAT advertises its scopes
//    in a response header; a fine-grained one sends nothing, so absence is
//    not a failure.
const scopes = me.headers.get('x-oauth-scopes');
if (scopes === null) {
  warn('fine-grained token (no scope header) — confirm by hand: All repositories, Contents R/W + Administration R/W');
} else {
  const list = scopes.split(',').map(s => s.trim()).filter(Boolean);
  if (list.includes('repo')) ok('classic PAT carries the `repo` scope');
  else bad(`classic PAT scopes are [${list.join(', ') || 'none'}] — needs \`repo\` to create private repositories`);
}

// 4. Rate limit, because a throttled token fails ownerIsOrg() silently and
//    falls back to the personal creation path.
const rl = await gh('/rate_limit');
const rem = rl.body?.resources?.core?.remaining;
if (typeof rem === 'number' && rem < 100) warn(`only ${rem} API calls left this hour`);

console.log(failed
  ? '\nNot ready — fix the FAIL lines above.\n'
  : '\nReady. Restart the backend fully so the new values are read at module load.\n');
process.exit(failed ? 1 : 0);
