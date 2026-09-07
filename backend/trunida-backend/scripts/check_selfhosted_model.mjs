/**
 * Svarg — is this OpenAI-compatible endpoint usable for Svarg's work?
 *
 * The model id is passed straight through to chat.completions.create, so a
 * wrong one fails on the first real call — usually inside a build, minutes
 * later, as something that reads like a Svarg bug. This asks the provider what
 * it has and then tries the two things Svarg actually needs of it.
 *
 *   node scripts/check_selfhosted_model.mjs            # list what is available
 *   node scripts/check_selfhosted_model.mjs <model-id> # and exercise that one
 *
 * Covers both OpenAI-compatible providers: SARVAM_* when a key is present,
 * SELFHOSTED_* otherwise. Read from .env, so no key is pasted anywhere else.
 */

import 'dotenv/config';
import { buildPrompt } from '../services/eameCodeGenerator.js';

// Works for whichever OpenAI-compatible provider is configured. SARVAM_* is
// preferred when present, because a deployment can have both and the named
// provider is the one being adopted.
const SARVAM = !!process.env.SARVAM_API_KEY;
const BASE = (SARVAM
  ? (process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai/v1')
  : (process.env.SELFHOSTED_BASE_URL || '')).replace(/\/+$/, '');
const KEY = SARVAM ? process.env.SARVAM_API_KEY : (process.env.SELFHOSTED_API_KEY || '');
const WANTED = process.argv[2]
  || (SARVAM ? process.env.SARVAM_MODEL : process.env.SELFHOSTED_MODEL) || '';

if (!BASE) {
  console.error('No endpoint configured. Set SARVAM_API_KEY, or SELFHOSTED_BASE_URL, in .env.');
  process.exit(2);
}

const headers = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
let fail = 0;

console.log('\nEndpoint: ' + BASE + (KEY ? '  (key present)' : '  (NO KEY SET)') + '\n');

// ── What does it offer ──────────────────────────────────────────────────────
try {
  const r = await fetch(BASE + '/models', { headers });
  if (r.ok) {
    const body = await r.json();
    const ids = (body.data || body.models || []).map(m => m.id || m.name).filter(Boolean);
    if (ids.length) {
      console.log('Models this key can see:');
      for (const id of ids) console.log('  ' + id + (id === WANTED ? '   <- selected' : ''));
    } else {
      console.log('The models endpoint answered but listed nothing recognisable:');
      console.log('  ' + JSON.stringify(body).slice(0, 300));
    }
  } else {
    // Not every provider exposes this, and not exposing it is not a fault.
    console.log('No usable /models listing (HTTP ' + r.status + ') — check the provider docs for ids.');
  }
} catch (err) {
  console.log('Could not reach ' + BASE + '/models — ' + err.message);
}

if (!WANTED) {
  console.log('\nPass a model id to exercise it: node scripts/check_selfhosted_model.mjs <model-id>\n');
  process.exit(0);
}

// ── Can it hold a short conversation ────────────────────────────────────────
console.log('\nTesting "' + WANTED + '"\n');

async function chat(messages, maxTokens) {
  const started = Date.now();
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({ model: WANTED, messages, max_tokens: maxTokens }),
  });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* keep the text */ }
  return { status: r.status, body, text, ms: Date.now() - started };
}

const small = await chat(
  [{ role: 'system', content: 'Reply with one word.' }, { role: 'user', content: 'Say OK.' }], 20);

if (small.status !== 200) {
  console.log('  FAIL  the model does not answer — HTTP ' + small.status);
  console.log('        ' + (small.text || '').slice(0, 220));
  console.log('\nA wrong model id usually looks exactly like this.\n');
  process.exit(1);
}
console.log('  PASS  answers a short prompt — ' + small.ms + 'ms, "'
  + String(small.body?.choices?.[0]?.message?.content || '').trim().slice(0, 40) + '"');

// ── Can it do the job Svarg actually asks of it ─────────────────────────────
//
// Eame's contract is the largest prompt in the product and the longest output.
// A model that answers "Say OK" and then truncates six files in half is worse
// than one that refuses outright, because the failure arrives inside a build.
const spec = {
  useCase: { name: 'Predictive classification for customer churn' },
  appName: 'Probe', engagement: { category: 'workflow-automation' },
  datasets: [], codebase: null, sampleFiles: [],
  allowedDependencies: ['express', 'mongoose'],
};
const { system, user } = buildPrompt(spec);
console.log('\n  Eame prompt is ' + system.length + ' + ' + user.length + ' chars. Sending it…');

const big = await chat(
  [{ role: 'system', content: system }, { role: 'user', content: user }], 16000);

if (big.status !== 200) {
  console.log('  FAIL  rejected the real prompt — HTTP ' + big.status);
  console.log('        ' + (big.text || '').slice(0, 300));
  console.log('        A context-length or max_tokens limit shows up here.');
  fail++;
} else {
  const outText = String(big.body?.choices?.[0]?.message?.content || '');
  const blocks = (outText.match(/=== FILE:/g) || []).length;
  const closed = (outText.match(/=== END FILE ===/g) || []).length;
  const usage = big.body?.usage || {};

  console.log('  PASS  accepted it — ' + (big.ms / 1000).toFixed(1) + 's, '
    + outText.length + ' chars out'
    + (usage.completion_tokens ? ', ' + usage.completion_tokens + ' completion tokens' : ''));

  if (blocks === 0) {
    console.log('  FAIL  produced no "=== FILE:" blocks — it did not follow the output format');
    fail++;
  } else if (blocks !== closed) {
    console.log('  FAIL  ' + blocks + ' file(s) opened but ' + closed
      + ' closed — the output was truncated, so the last file is incomplete');
    fail++;
  } else {
    console.log('  PASS  ' + blocks + ' complete file block(s) in the expected format');
  }

  const paths = [...outText.matchAll(/=== FILE:\s*([^\s=]+)/g)].map(m => m[1]);
  if (paths.length) console.log('        wrote: ' + paths.join(', '));

  const hasRoute = paths.some(p => p.startsWith('routes/'));
  const hasUi = paths.includes('frontend/app.js');
  if (!hasRoute || !hasUi) {
    console.log('  WARN  missing ' + [!hasRoute && 'a route file', !hasUi && 'frontend/app.js']
      .filter(Boolean).join(' and ') + ' — the completeness gate would reject this build');
  }
}

console.log(fail
  ? '\nNot suitable for Eame as configured. It may still be fine for shorter work.\n'
  : '\nUsable. Set ' + (SARVAM ? 'SARVAM_MODEL' : 'SELFHOSTED_MODEL') + '='
    + WANTED + ' and run a real build.\n');
process.exit(fail ? 1 : 0);
