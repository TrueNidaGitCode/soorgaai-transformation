/**
 * Seed ModelCatalogEntry from the code-owned ADVISORY_CATALOG.
 *
 * Carries over everything that file genuinely knows — prices, parameters,
 * vendor, type, and the providerId where Svarg can run the model itself.
 *
 * It does NOT invent benchmark scores. The advisory catalog graded models with
 * adjectives ('best', 'good'), and turning an adjective into a number would
 * manufacture exactly the false precision this replaces. Scores stay null until
 * someone enters a published figure through the admin screen, and a model with
 * no score on the axis being ranked is excluded from that ranking with a reason
 * rather than silently treated as zero.
 *
 * So after seeding, Arth will correctly recommend nothing. That is the honest
 * state of a catalog with no evidence in it.
 *
 * Idempotent: re-running updates structure and never overwrites a score.
 *
 *   node scripts/seed_model_catalog.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import ModelCatalogEntry from '../models/ModelCatalogEntry.js';
import { ADVISORY_CATALOG } from '../config/modelCatalog.js';

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

let created = 0, updated = 0;
for (const m of ADVISORY_CATALOG) {
  const existing = await ModelCatalogEntry.findOne({ modelId: m.id }).lean();

  // Structure only. `scores` is deliberately absent from this object so an
  // update cannot clear figures an admin has already entered.
  const doc = {
    modelId:     m.id,
    displayName: m.displayName,
    vendor:      m.vendor || '',
    type:        m.type || 'frontier',
    providerId:  m.providerId || '',
    providers:   m.vendor ? [m.vendor] : [],
    priceIn:     typeof m.priceIn === 'number' ? m.priceIn : null,
    priceOut:    typeof m.priceOut === 'number' ? m.priceOut : null,
    paramsB:       typeof m.paramsB === 'number' ? m.paramsB : null,
    activeParamsB: typeof m.activeParamsB === 'number' ? m.activeParamsB : null,
    source: 'seeded from ADVISORY_CATALOG — scores not yet entered',
  };

  await ModelCatalogEntry.updateOne({ modelId: m.id }, { $set: doc }, { upsert: true });
  existing ? updated++ : created++;
}

const total = await ModelCatalogEntry.countDocuments({});
const scored = await ModelCatalogEntry.countDocuments({ 'scores.intelligence': { $ne: null } });

console.log(`created ${created}, updated ${updated} — ${total} models in the catalog`);
console.log(`${scored} of ${total} have an intelligence score`);
if (scored < total) {
  console.log('');
  console.log('Models without scores cannot be ranked and will be excluded with a');
  console.log('reason. Enter published figures via the admin catalog screen.');
}

await mongoose.disconnect();
