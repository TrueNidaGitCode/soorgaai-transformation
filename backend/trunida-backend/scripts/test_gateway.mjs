/**
 * Unit checks for the LLM gateway. This surface spends Svarg's own money on
 * behalf of a tenant, so the things asserted here are the ones that decide
 * whether a runaway loop in a customer's app is bounded or not.
 *
 * No network and no database — the request path is exercised separately by
 * probe_gateway.mjs against a running server.
 */
import {
  issueToken, hashToken, checkAllowance, estimateCostUsd, estimateEmbeddingCostUsd,
  messagesToPrompt, toChatCompletion, findCatalogModel,
} from '../services/gatewayService.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
}

const live = (over = {}) => ({
  status: 'live',
  usage: { requests: 0, costUsd: 0, periodStart: new Date(), ...(over.usage || {}) },
  limits: { maxCostUsd: 5, maxRequests: 20000, ...(over.limits || {}) },
  ...over,
});

// ── Tokens ──────────────────────────────────────────────────────────────────
const { token, hash } = issueToken();
check('a token is prefixed so it is recognisable', token.startsWith('svd_'), true);
check('...and long enough to not be guessable', token.length >= 50, true);
check('the stored value is the hash, not the token', hash === token, false);
check('hashing is stable', hashToken(token), hash);
check('two tokens differ', issueToken().token === issueToken().token, false);

// ── The cap ─────────────────────────────────────────────────────────────────
check('a fresh deployment may call', checkAllowance(live()).allowed, true);
check('at the spend limit it may not',
  checkAllowance(live({ usage: { costUsd: 5 } })).allowed, false);
check('...and is reported as a cap hit',
  checkAllowance(live({ usage: { costUsd: 5 } })).cap, true);
check('over the spend limit it may not',
  checkAllowance(live({ usage: { costUsd: 5.01 } })).allowed, false);
check('just under the limit it may',
  checkAllowance(live({ usage: { costUsd: 4.99 } })).allowed, true);
check('the request limit also stops it',
  checkAllowance(live({ usage: { requests: 20000 } })).allowed, false);
check('a suspended deployment may not call',
  checkAllowance(live({ status: 'suspended' })).allowed, false);
check('a destroyed deployment is gone, not throttled',
  checkAllowance(live({ status: 'destroyed' })).status, 410);
check('no token at all is rejected', checkAllowance(null).allowed, false);
check('...as an auth failure, not a cap failure', checkAllowance(null).status, 401);

// A spent-out deployment whose 30-day window has passed starts clean.
const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
check('an expired period rolls over instead of blocking',
  checkAllowance(live({ usage: { costUsd: 999, periodStart: old } })).allowed, true);
check('...and is flagged so usage resets rather than accumulating',
  checkAllowance(live({ usage: { costUsd: 999, periodStart: old } })).rollover, true);
check('a period still inside 30 days does not roll over',
  !!checkAllowance(live({ usage: { costUsd: 1, periodStart: new Date() } })).rollover, false);

// maxCostUsd = 0 means "no ceiling" — asserted so it is a deliberate setting
// rather than an accident that silently uncaps a tenant.
check('a zero limit means uncapped',
  checkAllowance(live({ usage: { costUsd: 999 }, limits: { maxCostUsd: 0, maxRequests: 0 } })).allowed, true);

// ── Cost ────────────────────────────────────────────────────────────────────
// Sonnet: $3/M in, $15/M out. 1M in + 1M out = $18.
check('cost uses the catalog rate', estimateCostUsd('claude-sonnet', 1e6, 1e6), 18);
check('input and output are priced separately', estimateCostUsd('claude-sonnet', 1e6, 0), 3);
check('a cheap model costs less than an expensive one',
  estimateCostUsd('gemini-flash', 1e6, 1e6) < estimateCostUsd('claude-opus', 1e6, 1e6), true);
check('zero tokens cost nothing', estimateCostUsd('claude-sonnet', 0, 0), 0);
// An unpriced model must not become an uncapped one.
check('an unknown model is costed at the highest rate, not zero',
  estimateCostUsd('who-knows', 1e6, 1e6), estimateCostUsd('claude-opus', 1e6, 1e6));
check('embeddings are metered too', estimateEmbeddingCostUsd(1e6) > 0, true);

// ── Wire format ─────────────────────────────────────────────────────────────
// The delivered app sends exactly one system and one user message; that case
// must survive untouched.
check('the app\'s own shape round-trips losslessly',
  messagesToPrompt([{ role: 'system', content: 'Be terse.' }, { role: 'user', content: 'Why?' }]),
  { systemPrompt: 'Be terse.', userMessage: 'Why?' });
check('multi-turn is labelled rather than collapsed',
  messagesToPrompt([
    { role: 'system', content: 'S' },
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' },
  ]).userMessage,
  'User: a\n\nAssistant: b\n\nUser: c');
check('array-of-parts content is flattened',
  messagesToPrompt([{ role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'text', text: 'y' }] }]).userMessage,
  'xy');
check('no system message yields an empty prompt, not undefined',
  messagesToPrompt([{ role: 'user', content: 'q' }]).systemPrompt, '');
check('an empty list does not throw', messagesToPrompt([]), { systemPrompt: '', userMessage: '' });

const c = toChatCompletion({ text: 'hi', model: 'claude-sonnet-5', inputTokens: 10, outputTokens: 4 });
check('the response is OpenAI-shaped', c.object, 'chat.completion');
check('...with the reply where an SDK looks for it', c.choices[0].message.content, 'hi');
check('...and totals that add up', c.usage.total_tokens, 14);

// ── Catalog wiring ──────────────────────────────────────────────────────────
check('every frontier model has an api id the gateway can call',
  ['claude-opus', 'claude-sonnet', 'gpt-5', 'gemini-pro', 'gemini-flash']
    .every(id => !!findCatalogModel(id)?.apiModel), true);
check('Opus and Sonnet resolve to different api models',
  findCatalogModel('claude-opus').apiModel === findCatalogModel('claude-sonnet').apiModel, false);
check('open-weight models carry no api id — Svarg does not serve them',
  findCatalogModel('llama-3-3-70b').apiModel, undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
