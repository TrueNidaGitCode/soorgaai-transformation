/**
 * Call every model in the catalog, and report which ones answer.
 *
 * The catalog can be wrong in three different ways, and only the last is
 * visible without making a real request:
 *
 *   - the apiModel is not an identifier the provider recognises
 *   - the identifier is right but the account cannot use it (no credit, no
 *     access to that model, key revoked)
 *   - no provider or apiModel is configured at all
 *
 * A configured row is not a working one. This is the difference, and it is
 * worth having as a command because the answer changes without the code
 * changing — a key expires, a balance runs out, a model is retired.
 *
 * Costs a few tokens per model. Sends one short prompt and asks for a handful
 * of tokens back.
 *
 *   node scripts/verify_model_endpoints.mjs
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import mongoose from 'mongoose';
import ModelCatalogEntry from '../models/ModelCatalogEntry.js';

const PROMPT = 'Reply with the single word: ready';

async function anthropic(apiModel) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: apiModel, max_tokens: 16, messages: [{ role: 'user', content: PROMPT }] }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, detail: r.ok ? (j.content?.[0]?.text || '').trim() : (j.error?.message || `HTTP ${r.status}`) };
}

async function openai(apiModel) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: apiModel, max_completion_tokens: 16, messages: [{ role: 'user', content: PROMPT }] }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, detail: r.ok ? (j.choices?.[0]?.message?.content || '').trim() : (j.error?.message || `HTTP ${r.status}`) };
}

async function gemini(apiModel) {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'content-type': 'application/json' },
      // Gemini 3.x bills thinking tokens against this budget, so a budget sized
      // for the visible answer alone comes back empty with no error.
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }],
                             generationConfig: { maxOutputTokens: 2048 } }) });
  const j = await r.json().catch(() => ({}));
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text).join('').trim();
  if (!r.ok) return { ok: false, detail: j.error?.message || `HTTP ${r.status}` };
  return { ok: !!text, detail: text || 'empty response — thinking consumed the whole budget' };
}

const CALLERS = { claude: anthropic, openai, gemini };

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const rows = await ModelCatalogEntry.find({ active: true }).sort({ displayName: 1 }).lean();

console.log(`Calling ${rows.length} model(s) in the catalog.\n`);

let working = 0, unconfigured = 0, failing = 0;
for (const m of rows) {
  const label = m.displayName.padEnd(20);
  if (!m.providerId || !m.apiModel) {
    unconfigured++;
    console.log(`  ---   ${label}no endpoint configured`);
    continue;
  }
  const call = CALLERS[m.providerId];
  if (!call) {
    unconfigured++;
    console.log(`  ---   ${label}provider "${m.providerId}" is not one this script can call`);
    continue;
  }
  try {
    const r = await call(m.apiModel);
    if (r.ok) working++; else failing++;
    console.log(`  ${r.ok ? 'OK   ' : 'FAIL '} ${label}${m.apiModel.padEnd(20)}${String(r.detail).slice(0, 70)}`);
  } catch (e) {
    failing++;
    console.log(`  FAIL  ${label}${m.apiModel.padEnd(20)}${e.message.slice(0, 70)}`);
  }
}

console.log(`\n${working} working, ${failing} failing, ${unconfigured} unconfigured.`);
if (failing) {
  console.log('\nA failing row is configured but unusable. Check the message above:'
    + ' a billing or access error means the identifier is right and the account is not.');
}
await mongoose.disconnect();
// Non-zero only when something is configured and broken. Unconfigured rows are
// a known state, not a regression, and should not block a deploy on their own.
process.exit(failing ? 1 : 0);
