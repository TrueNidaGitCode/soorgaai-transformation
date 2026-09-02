/**
 * Drives the running gateway the way a hosted tenant does — with the real
 * OpenAI SDK pointed at /api/gateway/v1 — and asserts the paths that decide
 * whether Svarg's spend is bounded.
 *
 * Requires the server running locally (npm start) and MONGO_URI set.
 *
 * NOT covered here: a successful chat forward. That needs a working upstream
 * provider, and locally there is none (no Gemini key; OpenAI and Anthropic are
 * out of credit). The wire format either side of the forward is unit-tested in
 * test_gateway.mjs; the forward itself must be confirmed on Railway.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import OpenAI from 'openai';
import HostedDeployment from '../models/HostedDeployment.js';
import { issueToken } from '../services/gatewayService.js';

const BASE = process.env.PROBE_BASE || 'http://localhost:3000';
const GW = `${BASE}/api/gateway/v1`;

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
}

async function post(path, body, token) {
  const res = await fetch(GW + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

await mongoose.connect(process.env.MONGO_URI);

const { token, hash } = issueToken();
const userId = new mongoose.Types.ObjectId();
const blueprintId = new mongoose.Types.ObjectId();

const dep = await HostedDeployment.create({
  userId, blueprintId,
  status: 'live',
  gatewayTokenHash: hash,
  dbName: 'probe_tenant',
  model: { modelId: 'claude-sonnet', displayName: 'Claude Sonnet', providerId: 'claude' },
  limits: { maxCostUsd: 5, maxRequests: 100 },
});
console.log('probe deployment:', dep._id.toString(), '\n');

const CHAT = { messages: [{ role: 'system', content: 'Be terse.' }, { role: 'user', content: 'ping' }], max_tokens: 16 };

// ── Auth ────────────────────────────────────────────────────────────────────
let r = await post('/chat/completions', CHAT, null);
check('no token is rejected', r.status === 401, `got ${r.status}`);
r = await post('/chat/completions', CHAT, 'svd_' + '0'.repeat(48));
check('an unknown token is rejected', r.status === 401, `got ${r.status}`);
r = await post('/chat/completions', CHAT, 'not-even-a-token');
check('a malformed token is rejected', r.status === 401, `got ${r.status}`);
r = await post('/embeddings', { input: 'x' }, null);
check('embeddings also require a token', r.status === 401, `got ${r.status}`);

// ── Validation ──────────────────────────────────────────────────────────────
r = await post('/chat/completions', {}, token);
check('a body with no messages is a 400', r.status === 400, `got ${r.status}`);
r = await post('/embeddings', { input: [] }, token);
check('an empty embeddings input is a 400', r.status === 400, `got ${r.status}`);

// ── Nothing is spent on a failed call ───────────────────────────────────────
const before = await HostedDeployment.findById(dep._id).lean();
r = await post('/chat/completions', CHAT, token);
check('an unreachable provider is a 502, not a 500', r.status === 502, `got ${r.status}`);
const after = await HostedDeployment.findById(dep._id).lean();
check('a failed call records no usage',
  after.usage.requests === before.usage.requests && after.usage.costUsd === before.usage.costUsd,
  `requests ${before.usage.requests} -> ${after.usage.requests}`);

// ── An open-weight deployment is refused up front ───────────────────────────
await HostedDeployment.updateOne({ _id: dep._id },
  { $set: { 'model.modelId': 'llama-3-3-70b', 'model.providerId': 'selfhosted' } });
r = await post('/chat/completions', CHAT, token);
check('an open-weight deployment is refused with 501', r.status === 501, `got ${r.status}`);
check('...and says what to do instead',
  /own inference endpoint/i.test(r.body?.error?.message || ''), r.body?.error?.message?.slice(0, 60));

await HostedDeployment.updateOne({ _id: dep._id },
  { $set: { 'model.modelId': 'nonsense-model', 'model.providerId': 'claude' } });
r = await post('/chat/completions', CHAT, token);
check('an unrecognised model does not fall through to its provider', r.status === 501, `got ${r.status}`);

// ── The cap ─────────────────────────────────────────────────────────────────
await HostedDeployment.updateOne({ _id: dep._id }, {
  $set: { 'model.modelId': 'claude-sonnet', 'model.providerId': 'claude', 'usage.costUsd': 5, 'usage.periodStart': new Date() },
});
const t0 = Date.now();
r = await post('/chat/completions', CHAT, token);
const capMs = Date.now() - t0;
check('a capped deployment is refused', r.status === 429, `got ${r.status}`);
check('...as a rate-limit error the SDK understands', r.body?.error?.type === 'rate_limit_error', r.body?.error?.type);
check('...without calling the provider first', capMs < 1500, `${capMs}ms`);
r = await post('/embeddings', { input: 'x' }, token);
check('the cap covers embeddings too', r.status === 429, `got ${r.status}`);

await HostedDeployment.updateOne({ _id: dep._id }, { $set: { status: 'suspended', suspendedReason: 'Unpaid.' } });
r = await post('/chat/completions', CHAT, token);
check('a suspended deployment is refused', r.status === 429, `got ${r.status}`);
check('...with the suspension reason', /unpaid/i.test(r.body?.error?.message || ''), r.body?.error?.message);

// ── The real OpenAI SDK, which is what the tenant actually runs ─────────────
await HostedDeployment.updateOne({ _id: dep._id }, { $set: { status: 'live', 'usage.costUsd': 99 } });
const sdk = new OpenAI({ apiKey: token, baseURL: GW });
try {
  await sdk.chat.completions.create({ model: 'claude-sonnet-5', messages: CHAT.messages, max_tokens: 16 });
  check('the SDK surfaces the cap as an error', false, 'no error raised');
} catch (err) {
  check('the SDK reaches the gateway and gets a typed error', err.status === 429, `status ${err.status}`);
  check('...carrying our message, not a generic one',
    /spend limit/i.test(err.message || ''), (err.message || '').slice(0, 70));
}

await HostedDeployment.deleteOne({ _id: dep._id });
await mongoose.disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
