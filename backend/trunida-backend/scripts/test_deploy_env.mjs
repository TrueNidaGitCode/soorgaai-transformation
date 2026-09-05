/**
 * Checks the seam between Arth's decision and the tenant's environment.
 * A mistake here is silent: the app boots, and either bills the wrong way,
 * shares a database, or builds a vector index that can never match a query.
 */
import { buildTenantEnv, tenantDbName, tenantMongoUri, assertDestroyable, tenantProjectName, TENANT_PREFIX } from '../services/deployTargetService.js';
import { classifyUpstreamError } from '../services/gatewayService.js';
import { ADVISORY_CATALOG } from '../config/modelCatalog.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
}
function throws(name, fn, re) {
  try { fn(); check(name, 'no error', 'an error'); }
  catch (e) { check(name, re.test(e.message), true); }
}

const CLUSTER = 'mongodb+srv://u:p@cluster.mongodb.net/?appName=X';
const dep = (over = {}) => ({
  blueprintId: '6a4f37751d281fa2742797a6',
  model: { modelId: 'claude-sonnet', providerId: 'claude' },
  ...over,
});
const env = ({ deployment, ...over } = {}) => buildTenantEnv({
  gatewayToken: 'svd_abc', gatewayBaseUrl: 'https://svarg.example/api/gateway',
  clusterUri: CLUSTER, jwtSecret: 'fixed', ...over,
  deployment: dep(deployment || {}),
});

// ── Tenant database ─────────────────────────────────────────────────────────
check('a db name is legal for mongo', /^tenant_[a-zA-Z0-9]+$/.test(tenantDbName('6a4f37751d281fa2742797a6')), true);
check('different blueprints get different databases',
  tenantDbName('6a4f37751d281fa2742797a6') === tenantDbName('6a4f37751d281fa2742797b7'), false);
check('the db is placed in the uri path',
  tenantMongoUri(CLUSTER, 'tenant_x'), 'mongodb+srv://u:p@cluster.mongodb.net/tenant_x?appName=X');
check('an existing db path is replaced, not appended',
  tenantMongoUri('mongodb+srv://u:p@c.net/olddb?x=1', 'tenant_x'), 'mongodb+srv://u:p@c.net/tenant_x?x=1');
check('a uri with no query still works',
  tenantMongoUri('mongodb+srv://u:p@c.net', 'tenant_x'), 'mongodb+srv://u:p@c.net/tenant_x');
throws('no cluster uri is refused', () => tenantMongoUri('', 'tenant_x'), /cluster URI/i);

// ── The key must never reach the tenant ─────────────────────────────────────
const e = env();
check('no provider key is in the tenant environment',
  Object.keys(e).some(k => /ANTHROPIC|OPENAI_API_KEY|GOOGLE_API_KEY|GEMINI/.test(k)), false);
check('generation is routed through the gateway', e.SELFHOSTED_BASE_URL, 'https://svarg.example/api/gateway/v1');
check('...using the deployment token as its key', e.SELFHOSTED_API_KEY, 'svd_abc');
check('...and the chain pinned so nothing bypasses it', e.PROVIDER_CHAIN, 'selfhosted');
check('the model is the one Arth resolved', e.SELFHOSTED_MODEL, 'claude-sonnet-5');
// Reads the catalog rather than repeating a model name. Pinning the literal
// left this red when gemini-2.5-flash was retired and the catalog moved to
// 3.8 — the code was right and the test was asserting last year's answer.
const geminiFlash = ADVISORY_CATALOG.find(m => m.id === 'gemini-flash');
check('a different pick yields a different model',
  env({ deployment: { model: { modelId: 'gemini-flash' } } }).SELFHOSTED_MODEL, geminiFlash.apiModel);
check('...and that model is the one the catalog actually names',
  geminiFlash.apiModel !== undefined && geminiFlash.apiModel.length > 0, true);

// ── Embeddings ──────────────────────────────────────────────────────────────
check('embeddings go through the gateway too', e.SELFHOSTED_EMBEDDING_BASE_URL, 'https://svarg.example/api/gateway/v1');
// Selfhosted mode defaults to 768 and the vector index is built from it; the
// gateway returns 1536. Unpinned, the index can never match a query.
check('embedding width is pinned to what the gateway returns', e.SELFHOSTED_EMBEDDING_DIMENSIONS, '1536');

// ── Isolation ───────────────────────────────────────────────────────────────
check('the tenant gets its own database', /\/tenant_[a-zA-Z0-9]+\?/.test(e.MONGO_URI), true);
check('two tenants do not share a database',
  env({ deployment: { blueprintId: 'aaaaaaaaaaaaaaaaaaaaaaaa' } }).MONGO_URI === e.MONGO_URI, false);
check('a jwt secret is always set', !!e.JWT_SECRET, true);
check('...and is generated when not supplied',
  !!env({ jwtSecret: undefined }).JWT_SECRET, true);

// ── Refusals ────────────────────────────────────────────────────────────────
throws('an open-weight pick is refused with the reason',
  () => env({ deployment: { model: { modelId: 'llama-3-3-70b' } } }), /does not host GPUs/i);
throws('an unknown model is refused',
  () => env({ deployment: { model: { modelId: 'nope' } } }), /no model from the catalog/i);
throws('a missing gateway token is refused', () => env({ gatewayToken: '' }), /gateway token/i);

// ── Upstream error categories ───────────────────────────────────────────────
check('a credit failure is named as Svarg\'s problem',
  /Svarg/.test(classifyUpstreamError('429 You have no credits remaining')), true);
check('a rate limit tells them to retry',
  /retry/i.test(classifyUpstreamError('rate limit exceeded')), true);
check('a missing key is named as Svarg\'s problem',
  /Svarg/.test(classifyUpstreamError('OPENAI_API_KEY is not configured.')), true);
check('anything else stays generic',
  classifyUpstreamError('socket hang up'), 'The upstream model provider could not be reached.');
check('no provider name leaks to the tenant',
  /anthropic|openai|gemini|google/i.test(classifyUpstreamError('Anthropic 400 credit balance too low')), false);

// ── Destroy guards ──────────────────────────────────────────────────────────
// projectDelete is irreversible, and an account token can delete ANY project
// in the workspace — including the one running Svarg. These checks run before
// any call is made, and work only from what Svarg itself wrote down.
const tenant = (over = {}) => ({
  railway: {
    projectId: 'proj-abc',
    projectName: tenantProjectName('6a4f37751d281fa2742797a6'),
    ...(over.railway || {}),
  },
});

check('a real tenant project may be destroyed', assertDestroyable(tenant()), true);
throws('a deployment with no project id is refused',
  () => assertDestroyable({ railway: { projectName: TENANT_PREFIX + 'x' } }), /nothing to destroy/i);
throws('a project without the tenant prefix is refused',
  () => assertDestroyable(tenant({ railway: { projectName: 'svarg-production' } })), /not a Svarg tenant project/i);
throws('a project with no name recorded is refused',
  () => assertDestroyable(tenant({ railway: { projectName: '' } })), /not a Svarg tenant project/i);
throws('a deployment with no railway block is refused',
  () => assertDestroyable({}), /nothing to destroy/i);

process.env.RAILWAY_PROTECTED_PROJECT_IDS = 'proj-abc, proj-svarg';
throws('a protected id is refused even when the name looks right',
  () => assertDestroyable(tenant()), /protected list/i);
check('...while other projects stay destroyable',
  assertDestroyable(tenant({ railway: { projectId: 'proj-other' } })), true);
delete process.env.RAILWAY_PROTECTED_PROJECT_IDS;

check('tenant project names carry the prefix',
  tenantProjectName('6a4f37751d281fa2742797a6').startsWith(TENANT_PREFIX), true);
check('two blueprints get different project names',
  tenantProjectName('6a4f37751d281fa2742797a6') === tenantProjectName('aaaaaaaaaaaaaaaaaaaaaaaa'), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
