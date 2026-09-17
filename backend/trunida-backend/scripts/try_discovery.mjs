/**
 * What AI Opportunity Discovery actually produces for one objective.
 *
 * A prompt change is the one kind of change a unit test cannot verify. Tests
 * can hold the words of an instruction in place; only a real call says whether
 * the instruction works — whether "as many as the work supports" produces eight
 * distinct opportunities or three padded ones.
 *
 * One call, about ₹0.30, eight seconds. Cheap enough to run on every edit to
 * the instruction, which is the point: the alternative is a whole blueprint
 * run, and nobody iterates on a prompt at that price.
 *
 * Reads the instruction out of the source rather than importing it, because
 * SECTION_TEMPLATES is module-private — the same bytes the generator sends.
 *
 *   node scripts/try_discovery.mjs
 *   node scripts/try_discovery.mjs "We run a gym in Bengaluru and members quietly stop coming."
 */
import 'dotenv/config';
import fs from 'fs';
import { generate } from '../services/llmService.js';

const DEFAULT_OBJECTIVE =
  'In SIX Cricket Academy, where we coach close to 400 to 500 students, we have 30-plus coaches '
  + 'and four to five admins who spend hours on attendance, fee follow-ups, batch scheduling and '
  + 'parent communication. We only find out a student has stopped coming weeks later.';

const objective = process.argv.slice(2).join(' ').trim() || DEFAULT_OBJECTIVE;

const src = fs.readFileSync(new URL('../services/blueprintGenerationService.js', import.meta.url), 'utf8');
const start = src.indexOf("  'AI Opportunity Discovery': {");
const block = src.slice(start, src.indexOf('\n  },', start));
const body = block.slice(block.indexOf('promptInstruction:'));
const instruction = body.slice(body.indexOf('`') + 1, body.lastIndexOf('`'));

const t0 = Date.now();
const { text, model } = await generate({
  systemPrompt: `You are an AI transformation strategist.\n\n${instruction}\n\nRespond ONLY with valid JSON.`,
  userMessage: `BUSINESS OBJECTIVE: ${objective}\nGenerate the section as specified.`,
  maxTokens: 6000,
  label: 'cob:section',
});

let json;
try {
  json = JSON.parse(text.replace(/```json?|```/g, '').trim());
} catch (err) {
  console.log(`The answer could not be read: ${err.message}\n\n${text.slice(0, 800)}`);
  process.exit(1);
}

const opps = json.aiOpportunities || [];
console.log(`${model} in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${opps.length} opportunities\n`);
for (const o of opps) console.log(`  ${o.plain}\n      ${o.name}`);

console.log(`\nworkflow:    ${(json.workflowSteps || []).join(' -> ')}`);
console.log(`high effort: ${(json.highEffortActivities || []).join(', ')}`);

// The failure mode of asking for coverage is the same system under two names.
const key = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const names = opps.map(o => key(o.name));
const distinct = new Set(names).size;
console.log(`distinct:    ${distinct} of ${names.length}${distinct < names.length ? '  ← repeated' : ''}`);

// AI vocabulary in the plain line is the other one: it is meant to be what the
// person who runs the business would say to a colleague.
const JARGON = /\b(model|embedding|retrieval|semantic|classifier|anomaly|predictive|inference|pipeline|agent|LLM|NLP|vector)\b/i;
const leaky = opps.filter(o => JARGON.test(o.plain || ''));
if (leaky.length) {
  console.log(`\nAI vocabulary in the plain line (${leaky.length}):`);
  for (const o of leaky) console.log(`  ${o.plain}`);
}
