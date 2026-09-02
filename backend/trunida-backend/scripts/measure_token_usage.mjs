/**
 * What does one customer cost?
 *
 * Runs each stage that calls an LLM against a real blueprint, reads the token
 * counts llmService now accumulates, and prices the result at every model in
 * the catalog. Point it at whatever provider is configured — a local model is
 * fine, and is the point: input tokens barely move between tokenizers, so a
 * free local run gives a usable estimate of what a paid run would cost.
 *
 *   node scripts/measure_token_usage.mjs
 *
 * Output tokens are the soft number: a 3B model is terser than Claude, so
 * treat output as a floor rather than a forecast. Input dominates here
 * anyway — these prompts carry a lot of context and ask for little back.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import { getUsageStats, resetUsageStats } from '../services/llmService.js';
import { ADVISORY_CATALOG } from '../config/modelCatalog.js';

const money = n => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const num   = n => n.toLocaleString('en-US');

async function stage(name, fn) {
  const before = getUsageStats();
  const t = Date.now();
  let note = '';
  try { note = (await fn()) || 'ok'; }
  catch (err) { note = 'FAILED: ' + err.message.slice(0, 70); }
  const after = getUsageStats();
  return {
    name, note,
    calls:  after.calls - before.calls,
    input:  after.inputTokens - before.inputTokens,
    output: after.outputTokens - before.outputTokens,
    secs:   (Date.now() - t) / 1000,
  };
}

await mongoose.connect(process.env.MONGO_URI);
resetUsageStats();

const bp = await TransformationBlueprint.findOne({ status: 'completed' }).sort({ updatedAt: -1 }).lean();
if (!bp) { console.log('No completed blueprint to measure against.'); process.exit(1); }
console.log(`Blueprint:  ${bp._id}`);
console.log(`Objective:  ${(bp.businessObjective || '').slice(0, 68)}…`);
console.log(`Provider:   ${process.env.PROVIDER_CHAIN || 'gemini,claude,openai (default)'}\n`);

const rows = [];

// ── Aria: classifying one linked document ───────────────────────────────────
const doc = await LinkedProjectDocument.findOne({ blueprintId: bp._id, rawText: { $ne: '' } }).lean();
rows.push(await stage('Aria — classify 1 document', async () => {
  if (!doc) return 'skipped: no linked document with text';
  const { classifyDocument } = await import('../services/confluenceContentService.js');
  const r = await classifyDocument(doc.title || 'Untitled', (doc.rawText || '').slice(0, 12000));
  return r.failed ? 'classification failed' : `docType=${r.docType}, ${r.keywords?.length || 0} keywords`;
}));

// ── Cob: one real blueprint section ─────────────────────────────────────────
// The number that decides cost per customer. Extrapolating it from a chat
// message understates it badly — a section call carries the whole KB
// grounding and asks for 4000 tokens back, where a chat carries a paragraph.
// runBriefGeneration is pure (it returns parsed content and writes nothing),
// so this measures the real prompt without touching the blueprint.
rows.push(await stage('Cob — one real blueprint section', async () => {
  const { runBriefGeneration, loadCompanyProfile } = await import('../services/blueprintGenerationService.js');
  const { getDomainCapabilityBlueprint } = await import('../services/strategyCanvasService.js');
  const { enabledDomains } = await import('../config/domainRegistry.js');
  const { getDomainCapabilities } = await import('../services/strategyCanvasService.js');

  const domain = enabledDomains()[0];
  const cap = getDomainCapabilities(domain.kbPath)[0];
  const capBlueprint = getDomainCapabilityBlueprint(cap.id, domain.kbPath, 'Automotive');
  const profile = await loadCompanyProfile(bp.userId);

  await runBriefGeneration(
    { id: cap.id, name: cap.name, objective: cap.objective },
    profile, bp.businessObjective || '', 'Automotive',
    capBlueprint.sections, capBlueprint.automotiveBlueprint, '',
  );
  return `${domain.name} / ${cap.name} — ${capBlueprint.sections.length} sections`;
}));

// ── Arth: one Auto recommendation ───────────────────────────────────────────
rows.push(await stage('Arth — one Auto recommendation', async () => {
  const { recommendModel } = await import('../services/modelAdvisorService.js');
  const r = await recommendModel({
    useCase: 'Retrieval-Augmented Semantic Matching for Defects',
    businessObjective: bp.businessObjective || '',
    priority: 'quality',
  });
  return `picked ${r.displayName}`;
}));

// ── Chat: one message on each screen ────────────────────────────────────────
for (const screen of ['cob', 'aria', 'arth']) {
  rows.push(await stage(`Chat — one message to ${screen}`, async () => {
    const { askScreenChat } = await import('../services/screenChatService.js');
    const ctx = {
      businessObjective: bp.businessObjective || '',
      selectedUseCase: 'Retrieval-Augmented Semantic Matching for Defects',
      datasets: [], options: ADVISORY_CATALOG.filter(m => m.type === 'frontier'),
    };
    const r = await askScreenChat({ screen, context: ctx, message: 'What should I do next and why?' });
    return `${r.reply.length} chars back`;
  }));
}

// ── Report ──────────────────────────────────────────────────────────────────
const W = 34;
console.log('MEASURED'.padEnd(W) + 'calls'.padStart(6) + 'input'.padStart(10) + 'output'.padStart(9) + 'time'.padStart(8));
console.log('─'.repeat(W + 33));
for (const r of rows) {
  console.log(r.name.padEnd(W) + String(r.calls).padStart(6) + num(r.input).padStart(10)
    + num(r.output).padStart(9) + (r.secs.toFixed(0) + 's').padStart(8));
  if (r.note && !/^ok$/.test(r.note)) console.log('  ↳ ' + r.note);
}

const t = getUsageStats();
console.log('─'.repeat(W + 33));
console.log('TOTAL MEASURED'.padEnd(W) + String(t.calls).padStart(6) + num(t.inputTokens).padStart(10)
  + num(t.outputTokens).padStart(9) + ((t.ms / 1000).toFixed(0) + 's').padStart(8));

// A full blueprint is one call per capability. Running all of them against a
// local model takes far too long, so scale the ONE real section call measured
// above — not the average across chat calls, which are an order of magnitude
// smaller and would understate the answer badly.
const { enabledDomains } = await import('../config/domainRegistry.js');
const { getDomainCapabilities } = await import('../services/strategyCanvasService.js');
const CAPS = enabledDomains().reduce((n, d) => n + getDomainCapabilities(d.kbPath).length, 0);

const sectionRow = rows.find(r => r.name.startsWith('Cob'));
const sectionCall = sectionRow && sectionRow.calls
  ? { input: sectionRow.input, output: sectionRow.output, calls: sectionRow.calls }
  : null;

if (!sectionCall) {
  console.log('\nCannot project a blueprint cost: the section measurement did not complete.');
  await mongoose.disconnect();
  process.exit(1);
}

const perCallIn  = sectionCall.input  / sectionCall.calls;
const perCallOut = sectionCall.output / sectionCall.calls;

// One call per capability, except AI Opportunity Discovery which runs staged
// (industry problems, then opportunities) — which is why the measured
// capability reported two.
const CALLS = CAPS + 1;

console.log(`\nPROJECTED — one full blueprint`);
console.log(`  ${CAPS} capabilities across ${enabledDomains().length} enabled domains = ~${CALLS} calls`);
console.log(`  measured per call: ${num(Math.round(perCallIn))} in / ${num(Math.round(perCallOut))} out`);

const projIn = perCallIn * CALLS;
console.log(`  projected input: ${num(Math.round(projIn))} tokens`);

// Input is the trustworthy half — prompt size barely moves between tokenizers.
// Output does not transfer at all: a 3B model writes far less than a frontier
// model asked for the same 4000-token structured schema, so pricing the run at
// the measured output would understate it. Both are shown rather than picking.
const REALISTIC_OUT = Number(process.env.MEASURE_OUTPUT_PER_CALL || 2000);
const projOutFloor    = perCallOut * CALLS;
const projOutExpected = REALISTIC_OUT * CALLS;
console.log(`  projected output: ${num(Math.round(projOutFloor))} (measured floor)`);
console.log(`                    ${num(projOutExpected)} (at ${num(REALISTIC_OUT)}/call, nearer a frontier model against a 4000-token budget)\n`);

const cost = (m, i, o) => (i / 1e6) * m.priceIn + (o / 1e6) * m.priceOut;

console.log('COST OF ONE FULL BLUEPRINT');
console.log('  model'.padEnd(24) + 'floor'.padStart(10) + 'expected'.padStart(11) + 'x100 expected'.padStart(16));
for (const m of ADVISORY_CATALOG.filter(x => x.type === 'frontier')) {
  const lo = cost(m, projIn, projOutFloor);
  const hi = cost(m, projIn, projOutExpected);
  console.log('  ' + m.displayName.padEnd(22) + money(lo).padStart(10) + money(hi).padStart(11) + money(hi * 100).padStart(16));
}

console.log('\nCaveats, in order of how much they move the number:');
console.log('  1. Context was empty. A real run adds enterprise, vertical and linked-document');
console.log('     context to every prompt, so measured input is a FLOOR on input too.');
console.log('  2. Output came from the local model and does not transfer — see the two columns.');
console.log('  3. Catalog prices are estimates and drive the gateway cap, not a bill.');

await mongoose.disconnect();
