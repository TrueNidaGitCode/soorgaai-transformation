/**
 * Run the REAL classification prompt against a locally-hosted model.
 *
 * classifyDocument demands strict JSON back. Small open-weight models
 * often wrap it in prose or markdown fences, which parses as a failure —
 * so the question is not "does Ollama respond" but "does this model hold
 * the JSON contract on our actual prompt". This runs it against real
 * stored documents and reports the pass rate.
 *
 * Run from backend/trunida-backend:
 *   node scripts/test_local_model_classification.mjs [model]
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const model = process.argv[2] || process.env.SELFHOSTED_MODEL || 'llama3.2:3b';

process.env.SELFHOSTED_BASE_URL = process.env.SELFHOSTED_BASE_URL || 'http://localhost:11434/v1';
process.env.SELFHOSTED_MODEL = model;
process.env.PROVIDER_CHAIN = 'selfhosted';

const { classifyDocument } = await import('../services/confluenceContentService.js');
const LinkedProjectDocument = (await import('../models/LinkedProjectDocument.js')).default;

console.log(`model    : ${model}`);
console.log(`endpoint : ${process.env.SELFHOSTED_BASE_URL}\n`);

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

// Real stored text, not invented samples — a short Jira ticket and a
// longer Confluence page, since length is the usual thing that breaks
// small models' JSON discipline.
const docs = [
  ...(await LinkedProjectDocument.find({ sourceType: 'jira' }).select('title rawText').limit(3).lean()),
  ...(await LinkedProjectDocument.find({ sourceType: 'confluence' }).select('title rawText').limit(2).lean()),
];

if (!docs.length) { console.log('no linked documents to test against'); await mongoose.disconnect(); process.exit(0); }

let ok = 0;
for (const d of docs) {
  const started = Date.now();
  const r = await classifyDocument(d.title, d.rawText || '');
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const good = !r.failed && r.keywords.length > 0 && !!r.summary;
  if (good) ok++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${(d.title || '').slice(0, 46)}  (${secs}s, ${(d.rawText || '').length} chars)`);
  if (!good) console.log(`      ${r.failed ? 'error: ' + r.error : 'parsed but empty — keywords:' + r.keywords.length + ' summary:' + (r.summary ? 'yes' : 'no')}`);
  else console.log(`      ${r.keywords.length} keywords: ${JSON.stringify(r.keywords.slice(0, 4))}`);
}

console.log(`\n${ok}/${docs.length} usable. ${ok === docs.length ? 'This model holds the JSON contract.' : 'Consider qwen2.5:7b — better at strict JSON than llama3.2:3b.'}`);

await mongoose.disconnect();
