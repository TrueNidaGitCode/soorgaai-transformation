/**
 * Finish a blueprint that was left half-generated, and rebuild its application.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * A customer entered an objective as a guest, was shown the AI Opportunities,
 * signed in, approved one, and walked straight through to a delivered
 * application — on one domain of six. Data Readiness never ran, so the build
 * had no datasets, so the application went live able to answer nothing. It
 * reported itself healthy for a day and was never opened.
 *
 * Claiming a preview now finishes the blueprint (claimGuestBlueprint), and the
 * build refuses outright when there are no datasets. Neither helps somebody
 * whose application was delivered before those existed, and that customer
 * cannot be asked to sit through the flow again. This is for them.
 *
 * ── What it does ───────────────────────────────────────────────────────────
 *
 *   1. generates every domain still pending, in registry order, so each is
 *      grounded on the ones before it
 *   2. rebuilds the application from the finished blueprint
 *   3. pushes it, so the running deployment picks it up
 *
 * Steps 2 and 3 are opt-in: generation is the expensive part and is worth
 * seeing before anything is rebuilt on top of it.
 *
 *   node scripts/repair_blueprint.mjs <blueprintId>           # what it would do
 *   node scripts/repair_blueprint.mjs <blueprintId> --generate
 *   node scripts/repair_blueprint.mjs <blueprintId> --generate --rebuild
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { enabledDomains } from '../config/domainRegistry.js';
import { whyNoDatasets } from '../services/eameBuildService.js';
import { readDatasets } from '../services/eameSpec.js';

const args = process.argv.slice(2);
const id = args.find(a => !a.startsWith('--'));
const doGenerate = args.includes('--generate');
const doRebuild = args.includes('--rebuild');

if (!id) {
  console.log('Usage: node scripts/repair_blueprint.mjs <blueprintId> [--generate] [--rebuild]');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const { default: TransformationBlueprint } = await import('../models/TransformationBlueprint.js');

const load = () => TransformationBlueprint.findById(id).lean();
let bp = await load();
if (!bp) { console.log('No such blueprint.'); await mongoose.disconnect(); process.exit(1); }

const show = (b) => {
  console.log(`\n${b.appName || '(unnamed)'}  status=${b.status}`);
  for (const d of enabledDomains()) {
    const on = (b.domains || []).find(x => x.domainId === d.id);
    const caps = (on?.capabilities || []);
    const done = caps.filter(c => c.status === 'completed').length;
    console.log(`  ${(on?.status || 'absent').padEnd(10)} ${d.name}${caps.length ? `  (${done}/${caps.length} capabilities)` : ''}`);
  }
  console.log(`  datasets: ${readDatasets(b).length}`);
  const why = whyNoDatasets(b);
  if (why) console.log(`  BUILD WOULD REFUSE: ${why}`);
};

show(bp);

const missing = enabledDomains()
  .filter(d => ((bp.domains || []).find(x => x.domainId === d.id)?.status) !== 'completed')
  .map(d => d.id);

if (!missing.length) {
  console.log('\nEvery enabled domain is already complete.');
} else {
  console.log(`\nStill to generate: ${missing.join(', ')}`);
  if (!doGenerate) {
    console.log('Nothing done. Add --generate to spend real model calls on this.');
  } else {
    // The provider is asked once, cheaply, before committing to a long run —
    // a spend cap that is already exhausted should not be discovered six
    // domains in, with half a blueprint written.
    const { generate } = await import('../services/llmService.js');
    try {
      await generate({ systemPrompt: 'Reply with one word.', userMessage: 'ok', maxTokens: 5, label: 'repair:preflight' });
    } catch (err) {
      console.log(`\nThe model provider is not answering, so nothing was started:\n  ${err.message}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    const { generateSpecificDomainsAsync } = await import('../services/blueprintGenerationService.js');
    console.log('\ngenerating — this takes minutes and costs real money…');
    await generateSpecificDomainsAsync(String(bp._id), bp.userId, bp.businessObjective, missing);
    bp = await load();
    show(bp);
  }
}

if (doRebuild) {
  const why = whyNoDatasets(bp);
  if (why) {
    console.log(`\nNot rebuilding: ${why}`);
  } else {
    console.log('\nrebuilding the application from the finished blueprint…');
    const { buildApplication } = await import('../services/eameBuildService.js');
    const result = await buildApplication(bp, {
      onProgress: ({ attempt, phase, detail }) => console.log(`  [${attempt}] ${phase} ${detail || ''}`),
    });
    console.log(result.ok
      ? `  built: ${result.files.length} files, verified to ${result.verifiedTo}`
      : `  build failed: ${result.reason}`);
    if (result.ok) {
      console.log('\nPush it with the delivery path (Yusu), so the repository and the running');
      console.log('deployment are the same bytes that were just verified.');
    }
  }
}

await mongoose.disconnect();
