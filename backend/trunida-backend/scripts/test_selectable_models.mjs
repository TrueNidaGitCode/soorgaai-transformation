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
import 'dotenv/config';
import mongoose from 'mongoose';
import ModelCatalogEntry from '../models/ModelCatalogEntry.js';
import { ADVISORY_CATALOG } from '../config/modelCatalog.js';
import { resolveSelectableModel } from '../services/selectableModelService.js';
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

  const servable = [];
  for (const m of catalog) if (await (async () => (await resolveSelectableModel(m.modelId)).servable)()) servable.push(m.modelId);
  console.log(`  NOTE  ${servable.length} of ${catalog.length} benchmark models carry a providerId`
    + ` — the rest can be chosen and recorded, but the gateway cannot route to them yet.`);
}

await mongoose.disconnect();
console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(pass ? 0 : 1);
