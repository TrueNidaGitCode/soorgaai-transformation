/**
 * Everything Arth offers must be something the save path accepts.
 *
 * This is the invariant that broke. The picker was switched to the benchmark
 * catalog while PATCH /arth-selection still validated against the advisory ten,
 * so every model on screen failed with "That model is not in the catalog" —
 * a message about a catalog page that listed all of them.
 *
 * Asserted against the live catalog rather than a fixture, because the failure
 * was a disagreement between two real data sources. A fixture would have had to
 * reproduce the disagreement to catch it, which means already knowing about it.
 *
 *   node scripts/test_selectable_models.mjs
 */
// Loaded relative to this file, not the working directory. `dotenv/config`
// resolves .env against cwd, so the test passed from backend/trunida-backend
// and died with "uri must be a string" from the repo root — which is where the
// rest of the checks are run from, so it would simply have stopped being run.
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import mongoose from 'mongoose';
import ModelCatalogEntry from '../models/ModelCatalogEntry.js';
import { ADVISORY_CATALOG } from '../config/modelCatalog.js';
import { resolveSelectableModel, runnableModels, pickRunnable } from '../services/selectableModelService.js';
import { recommendModels, deriveRecommendationInputs, FOCUS_INDICES } from '../services/modelRecommenderService.js';

let pass = true;
const check = (l, ok, d = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`);
  if (!ok) pass = false;
};

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const catalog = await ModelCatalogEntry.find({ active: true }).lean();

console.log('1. every model in the benchmark catalog can be saved');
{
  const unresolvable = [];
  for (const m of catalog) {
    if (!await resolveSelectableModel(m.modelId)) unresolvable.push(m.modelId);
  }
  check(`all ${catalog.length} resolve`, unresolvable.length === 0,
    unresolvable.length ? unresolvable.join(', ') : `${catalog.length} models`);
}

console.log('\n2. every model in the advisory catalog still resolves');
{
  const missing = [];
  for (const m of ADVISORY_CATALOG) {
    if (!await resolveSelectableModel(m.id)) missing.push(m.id);
  }
  check(`all ${ADVISORY_CATALOG.length} resolve`, missing.length === 0,
    missing.length ? missing.join(', ') : `${ADVISORY_CATALOG.length} models`);
}

console.log('\n3. everything the recommender can actually return is saveable');
{
  // The real path: what Arth puts on screen for each benchmark, at the limit
  // the picker asks for.
  const offered = new Set();
  for (const focus of FOCUS_INDICES) {
    for (const confidence of ['very-high', 'high', 'medium']) {
      const r = recommendModels(catalog, { focus, confidence, limit: 5 });
      r.picks.forEach(p => offered.add(p.modelId));
    }
  }
  const rejected = [];
  for (const id of offered) {
    if (!await resolveSelectableModel(id)) rejected.push(id);
  }
  check(`${offered.size} models can be offered, none rejected`, rejected.length === 0,
    rejected.length ? rejected.join(', ') : 'none rejected');
}

console.log('\n4. an id no catalog knows is still refused');
{
  check('a made-up id resolves to nothing',
    (await resolveSelectableModel('not-a-real-model')) === null);
  check('an empty id resolves to nothing', (await resolveSelectableModel('')) === null);
}

console.log('\n5. servability is reported, not assumed');
{
  // Saving a decision and being able to route traffic to it are different
  // facts. This does not assert that everything is servable — most of the
  // benchmark catalog is not — only that the answer is present and honest,
  // so the gap is visible here rather than as a 501 after deployment.
  const sample = await resolveSelectableModel(catalog[0].modelId);
  check('a resolved model says whether it can be served',
    typeof sample.servable === 'boolean', `${sample.id} servable=${sample.servable}`);
  check('and where it came from', sample.source === 'benchmark' || sample.source === 'advisory', sample.source);

  // The requirement, asserted rather than noted: every model Arth can put on
  // screen must be one a customer can actually be put onto. This is what
  // "all of them should be working" means as a check, and it fails the moment
  // a table is added whose endpoints have not been configured.
  const notServable = [];
  for (const m of catalog) {
    if (!(await resolveSelectableModel(m.modelId)).servable) notServable.push(m.displayName);
  }
  check(`all ${catalog.length} models in the catalog can be run`, notServable.length === 0,
    notServable.length ? notServable.join(', ') : catalog.map(m => m.displayName).join(', '));

  // Configured is not the same as reachable. Whether the account can actually
  // use these endpoints changes without the code changing — a balance runs
  // out, a key is revoked — so that is checked by
  // scripts/verify_model_endpoints.mjs, which makes a real call.
  console.log('  NOTE  this asserts an endpoint is configured, not that the provider'
    + ' account can currently use it. Run verify_model_endpoints.mjs for that.');
}

console.log('\n6. what can actually be run');
{
  const runnable = runnableModels();
  check('there is something to run', runnable.length > 0, runnable.map(m => m.id).join(', '));
  check('every runnable model has a provider behind it',
    runnable.every(m => m.providerId), runnable.map(m => m.id + '=' + m.providerId).join(', '));
  check('none of them is open weight — Svarg runs no GPUs for tenants',
    runnable.every(m => m.type === 'frontier'));

  // The bug this whole split exists for: a picker offering models nothing can
  // serve. Whatever is runnable must also resolve, or Confirm fails again.
  const unresolvable = [];
  for (const m of runnable) if (!await resolveSelectableModel(m.id)) unresolvable.push(m.id);
  check('and every one of them can be saved', unresolvable.length === 0,
    unresolvable.join(', ') || 'all resolve');
}

console.log('\n7. Auto lands on something runnable, at the cheapest that clears the band');
{
  const runnableIds = new Set(runnableModels().map(m => m.id));
  for (const confidence of ['very-high', 'high', 'medium']) {
    const picked = pickRunnable(confidence);
    check(`${confidence} picks a model that can be run`,
      !!picked && runnableIds.has(picked.id), picked ? picked.id : 'nothing');
  }

  // The rule, not just the outcome: a band that demands more quality must never
  // come back cheaper than one that demands less.
  const blended = (m) => (m.priceIn ?? 0) * 0.35 + (m.priceOut ?? 0) * 0.65;
  const vh = pickRunnable('very-high');
  const med = pickRunnable('medium');
  check('a lower band is never more expensive than a higher one',
    blended(med) <= blended(vh),
    `medium ${med.id} $${blended(med).toFixed(2)} vs very-high ${vh.id} $${blended(vh).toFixed(2)}`);

  check('the top band only returns a model graded best',
    pickRunnable('very-high').quality === 'best', vh.quality);

  // Coarse on purpose, and worth saying so: these five are graded by adjective
  // because that is the only data they have. Scoring them on the same
  // benchmarks as the tables is the real fix, whenever those numbers exist.
  console.log('  NOTE  the band-to-quality mapping is a bridge between a measured scale'
    + ' and an adjective, not a measurement.');
}

await mongoose.disconnect();
console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(pass ? 0 : 1);
