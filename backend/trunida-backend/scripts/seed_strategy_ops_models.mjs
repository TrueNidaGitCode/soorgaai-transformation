/**
 * Strategy & Ops — proprietary models.
 *
 * Transcribed from the supplied comparison: score and cost per task, exactly
 * as given. Nothing else is inferred, because nothing else was in the table.
 *
 * This is the authoritative list for the proprietary side of Strategy & Ops.
 * Rows seeded from an earlier version of the comparison that are NOT in this
 * one are removed rather than left behind — two rows for the same model with
 * different scores is worse than either being missing, and a stale row is
 * indistinguishable from a current one once it is in the table.
 *
 * An admin's own edits are never overwritten unless --force is passed.
 *
 *   node scripts/seed_strategy_ops_models.mjs [--force]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { seedBenchmarkTable, report } from './lib/seedBenchmarkTable.mjs';

// [rank, model, vendor, score, cost per task]
const ROWS = [
  [1,  'Claude Fable 5.1 (max with fallback)',    'Anthropic', 58, 4.33],
  [2,  'Claude Fable 5.1 (xhigh with fallback)',  'Anthropic', 57, 3.25],
  [3,  'Claude Opus 5 (max)',                     'Anthropic', 54, 3.01],
  [4,  'Claude Fable 5.1 (high with fallback)',   'Anthropic', 54, 1.79],
  [5,  'Claude Opus 5 (xhigh)',                   'Anthropic', 54, 2.30],
  [6,  'Muse Spark 1.3 (max)',                    'Muse',      53, 0.87],
  [7,  'Claude Fable 5 (with fallback)',          'Anthropic', 53, 3.85],
  [8,  'Claude Opus 5 (high)',                    'Anthropic', 52, 1.55],
  [9,  'GPT-5.6 Sol (max)',                       'OpenAI',    52, 1.40],
  [10, 'Claude Fable 5.1 (medium with fallback)', 'Anthropic', 51, 1.29],
  [11, 'GPT-6 Astra (xhigh)',                     'OpenAI',    51, 1.77],
  [12, 'GPT-6 Astra (max)',                       'OpenAI',    51, 2.45],
  [13, 'Grok 4.6 (high)',                         'xAI',       51, 1.45],
  [14, 'GPT-5.6 Sol (xhigh)',                     'OpenAI',    49, 0.95],
  [15, 'Muse Spark 1.3 (xhigh)',                  'Muse',      49, 0.65],
  [16, 'GPT-6 Astra (high)',                      'OpenAI',    49, 1.47],
  [17, 'Claude Opus 5 (medium)',                  'Anthropic', 48, 0.89],
  [18, 'Claude Fable 5.1 (low with fallback)',    'Anthropic', 48, 0.99],
  [19, 'Gemini 3.8 Flash (high)',                 'Google',    48, 0.77],
  [20, 'Gemini 3.8 Flash (medium)',               'Google',    48, 0.56],
];

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
report('Strategy & Ops', await seedBenchmarkTable({
  category: 'strategyOps',
  label: 'Strategy & Ops',
  rows: ROWS,
  force: process.argv.includes('--force'),
}));
await mongoose.disconnect();
