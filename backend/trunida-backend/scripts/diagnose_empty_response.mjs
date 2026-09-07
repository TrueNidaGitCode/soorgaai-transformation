/**
 * Svarg — why did a provider answer 200 with nothing in it?
 *
 * Cob's capability generation failed twelve times out of thirteen with "No
 * JSON in LLM response", which is thrown only when the reply contains no
 * opening brace at all. A truncated object would have matched and failed to
 * parse with a different message, so the content was empty — HTTP 200, no
 * error, nothing there.
 *
 * Two things produce that, and they belong to different people:
 *
 *   1. reasoning consumed the whole max_tokens budget and the visible answer
 *      was never reached — the provider's behaviour to explain
 *   2. the answer came back in a field other than message.content — ours to
 *      fix, in the provider implementation
 *
 * This tells them apart by printing the entire response rather than the one
 * field the client reads. Run it against whichever provider is configured:
 *
 *   node scripts/diagnose_empty_response.mjs [max_tokens]
 */

import 'dotenv/config';

const SARVAM = !!process.env.SARVAM_API_KEY;
const BASE = (SARVAM
  ? (process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai/v1')
  : (process.env.SELFHOSTED_BASE_URL || '')).replace(/\/+$/, '');
const KEY = SARVAM ? process.env.SARVAM_API_KEY : (process.env.SELFHOSTED_API_KEY || '');
const MODEL = SARVAM
  ? (process.env.SARVAM_MODEL || 'sarvam-105b')
  : (process.env.SELFHOSTED_MODEL || '');
const MAX = parseInt(process.argv[2] || '6048', 10);

if (!BASE || !KEY) {
  console.error('Set SARVAM_API_KEY (or SELFHOSTED_BASE_URL) in .env first.');
  process.exit(2);
}

// The shape that actually failed: a structural system prompt demanding one
// JSON object, not a toy question. A trivial prompt reasons briefly and
// answers, which is why the small probes passed while Cob did not.
const system = [
  'You are an AI transformation consultant producing structured analysis.',
  '',
  'Return ONLY a single JSON object. No prose before or after it, no markdown fences.',
  '',
  'REQUIRED KEYS:',
  '  businessProblems     3 to 4 items, each a specific problem this company faces',
  '  workflowSteps        the steps of the workflow AI would act on, in order',
  '  highEffortActivities the activities inside it that cost the most human time',
  '  aiOpportunities      3 to 4 items, each naming a concrete AI intervention',
  '',
  'Every item must be specific to the company described. Generic statements that',
  'would be true of any business are rejected.',
].join('\n');

const user = [
  'Company: builds academy management software for classical music, dance and art schools.',
  'Studio owners spend hours weekly on attendance, fee collection, scheduling and parent',
  'communication. Administration is the main reason academies abandon the platform.',
  '',
  'Produce the JSON object.',
].join('\n');

console.log('\nProvider : ' + BASE);
console.log('Model    : ' + MODEL);
console.log('max_tokens: ' + MAX);
console.log('prompt   : ' + system.length + ' + ' + user.length + ' chars\n');

const started = Date.now();
const res = await fetch(BASE + '/chat/completions', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL, max_tokens: MAX,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }),
});
const ms = Date.now() - started;
const raw = await res.text();

console.log('HTTP ' + res.status + '  (' + (ms / 1000).toFixed(1) + 's)\n');

let body;
try { body = JSON.parse(raw); }
catch {
  console.log('Response was not JSON:\n' + raw.slice(0, 800));
  process.exit(1);
}

const choice = (body.choices || [])[0] || {};
const message = choice.message || {};

console.log('finish_reason : ' + JSON.stringify(choice.finish_reason));
console.log('usage         : ' + JSON.stringify(body.usage));
console.log('message keys  : ' + Object.keys(message).join(', '));

for (const [k, v] of Object.entries(message)) {
  const text = typeof v === 'string' ? v : JSON.stringify(v);
  console.log('\n--- message.' + k + ' (' + String(text || '').length + ' chars) ---');
  console.log(String(text || '').slice(0, 600));
}

// ── The verdict ─────────────────────────────────────────────────────────────
const content = String(message.content || '');
const otherFields = Object.entries(message)
  .filter(([k, v]) => k !== 'content' && k !== 'role' && typeof v === 'string' && v.trim());

console.log('\n' + '─'.repeat(70));
if (content.trim()) {
  console.log('content is NOT empty. This request worked — the failure is load- or');
  console.log('prompt-dependent rather than absolute. Try a larger prompt or a lower');
  console.log('max_tokens to find where it tips.');
} else if (otherFields.length) {
  console.log('OURS TO FIX. content is empty but the answer is in message.'
    + otherFields.map(([k]) => k).join('/') + '.');
  console.log('The sarvam provider in services/llmService.js reads message.content only.');
} else if (choice.finish_reason === 'length' || (body.usage?.completion_tokens || 0) >= MAX * 0.95) {
  console.log('THEIRS TO EXPLAIN. content is empty and the completion budget was spent —');
  console.log('reasoning consumed it before any answer was written. Ask whether reasoning');
  console.log('is charged against max_tokens, and whether it can be capped or disabled.');
} else {
  console.log('UNEXPLAINED. content is empty, nothing else holds text, and the budget was');
  console.log('not exhausted. This is the strongest thing to send them: a 200 with no');
  console.log('output and no reason given.');
}
console.log('─'.repeat(70) + '\n');
