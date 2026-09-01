/**
 * Reproduce classifyDocument on a real stored Jira document.
 *
 * All six Jira issues stored keywords:[] and summary:'' while every
 * Confluence page classified fine. classifyDocument swallows every failure
 * into that same empty fallback, so the stored rows cannot tell us whether
 * the LLM call failed, returned unparseable text, or genuinely produced
 * nothing. This calls it directly and prints the raw model output.
 *
 * Run from backend/trunida-backend:
 *   node scripts/repro_jira_classification.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import { classifyDocument } from '../services/confluenceContentService.js';
import { generate } from '../services/llmService.js';

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const doc = await LinkedProjectDocument.findOne({ sourceType: 'jira' })
  .select('sourceId title rawText').lean();

if (!doc) { console.log('no jira docs'); await mongoose.disconnect(); process.exit(0); }

console.log('document :', doc.sourceId, '—', doc.title);
console.log('text len :', (doc.rawText || '').length);
console.log('text     :', JSON.stringify((doc.rawText || '').slice(0, 220)));
console.log('');

// 1) The real call, exactly as the linking code makes it.
console.log('--- classifyDocument() ---');
const result = await classifyDocument(doc.title, doc.rawText);
console.log('docType :', result.docType);
console.log('summary :', JSON.stringify(result.summary));
console.log('keywords:', result.keywords.length, JSON.stringify(result.keywords));
console.log('');

// 2) The same prompt, raw, so we can see what the model actually returns
//    when the parse fails.
console.log('--- raw model output for the same prompt ---');
const systemPrompt = `You are SoorgaAI, classifying an internal company document to ground AI transformation strategy generation.

Given a document's title and text, produce:
1. docType — exactly one of: architecture, requirements, design, presentation, meeting_notes, other
2. summary — 3-5 sentences capturing the concrete, specific content
3. keywords — 5-10 exact terms copied verbatim from the source text

OUTPUT — valid JSON only, no markdown fences:
{ "docType": "...", "summary": "...", "keywords": ["...", "..."] }`;

try {
  const { text } = await generate({
    systemPrompt,
    userMessage: `TITLE: ${doc.title}\n\nTEXT:\n${doc.rawText}`,
    maxTokens: 600,
  });
  console.log(JSON.stringify(text.slice(0, 700)));
} catch (err) {
  console.log('generate() THREW:', err.message);
}

await mongoose.disconnect();
