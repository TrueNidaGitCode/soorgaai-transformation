/**
 * Seed the Strategy & Ops comparison into the model catalog.
 *
 * Transcribed from the published Artificial Analysis comparison — score and
 * cost per task, exactly as given. Nothing is inferred: models here have a
 * Strategy & Ops score and a cost and no other figures, because no other
 * figures were in the table.
 *
 * Two rows quote two prices; the first is taken and the second recorded in the
 * note rather than silently averaged.
 *
 * Idempotent, and it never touches a score an admin has since edited by hand
 * unless --force is passed.
 *
 *   node scripts/seed_strategy_ops_models.mjs [--force]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import ModelCatalogEntry from '../models/ModelCatalogEntry.js';

const FORCE = process.argv.includes('--force');

// [rank, model, vendor, strategyOps score, cost per task, note]
const ROWS = [
  [1,  'Claude Fable 5.1 (xhigh, with fallback)',  'Anthropic', 59, 4.23],
  [2,  'Claude Opus 5 (max)',                      'Anthropic', 55, 3.01],
  [3,  'Claude Fable 5.1 (high, with fallback)',    'Anthropic', 55, 1.79],
  [4,  'Claude Fable 5 (xhigh)',                    'Anthropic', 55, 2.30],
  [6,  'Claude Fable 5 (with fallback)',            'Anthropic', 54, 3.85],
  [7,  'Claude Opus 5 (high)',                      'Anthropic', 54, 1.55],
  [8,  'GPT-5.6 Sol (max)',                         'OpenAI',    53, 1.40],
  [9,  'Claude Fable 5.1 (medium, with fallback)',  'Anthropic', 52, 1.29],
  [10, 'Grok 4.6 (high)',                           'xAI',       52, 1.45],
  [11, 'Muse Spark 1.3 (xhigh)',                    'Muse',      50, 0.65],
  [12, 'Claude Opus 5 (medium)',                    'Anthropic', 50, 0.89],
  [13, 'Claude Fable 5.1 (low, with fallback)',     'Anthropic', 50, 0.99],
  [14, 'Gemini 3.8 Flash (high)',                   'Google',    50, 0.77],
  [15, 'GPT-5.6 Sol (high)',                        'OpenAI',    49, 0.03],
  [16, 'Grok 4.6 (xhigh)',                          'xAI',       48, 1.89],
  [17, 'GPT-5.6 Sol (medium)',                      'OpenAI',    48, 0.01],
  [18, 'Grok 4.6 (medium)',                         'xAI',       48, 1.18],
  [19, 'Qwen3.8 Max',                               'Alibaba',   47, 0.80, 'table quotes $0.80 / $1.23'],
  [20, 'GPT-5.5 (xhigh)',                           'OpenAI',    47, 1.46, 'table quotes $1.46 / $1.53'],
];

const slug = (s) => s.toLowerCase()
  .replace(/[()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

let created = 0, updated = 0, skipped = 0;
for (const [rank, name, vendor, score, cost, note] of ROWS) {
  const modelId = slug(name);
  const existing = await ModelCatalogEntry.findOne({ modelId }).lean();

  // An admin's own edit is not overwritten by a re-seed. Getting a score wrong
  // and having it silently restored on the next run is worse than a stale row.
  if (existing && existing.updatedBy && !FORCE) { skipped++; continue; }

  await ModelCatalogEntry.updateOne(
    { modelId },
    { $set: {
      modelId,
      displayName: name,
      vendor,
      type: 'frontier',
      providers: [vendor],
      indexCost: cost,
      'scores.strategyOps': score,
      source: 'Artificial Analysis — Strategy & Ops comparison'
        + (note ? ` (${note})` : '') + ` · rank ${rank}`,
    } },
    { upsert: true }
  );
  existing ? updated++ : created++;
}

const scored = await ModelCatalogEntry.countDocuments({ 'scores.strategyOps': { $ne: null } });
console.log(`created ${created}, updated ${updated}, skipped ${skipped} (edited by an admin)`);
console.log(`${scored} models now carry a Strategy & Ops score`);

await mongoose.disconnect();
