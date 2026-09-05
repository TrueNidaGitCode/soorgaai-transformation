/**
 * Engineering — proprietary models.
 *
 * Transcribed from the supplied comparison: score and cost per task, exactly as
 * given. Nothing else is inferred, because nothing else was in the table.
 *
 *   node scripts/seed_engineering_models.mjs [--force]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { seedBenchmarkTable, report } from './lib/seedBenchmarkTable.mjs';

// [rank, model, vendor, score, cost per task]
const ROWS = [
  [1,  'Claude Fable 5.1 (max with fallback)',    'Anthropic', 65, 3.64],
  [2,  'Claude Fable 5.1 (xhigh with fallback)',  'Anthropic', 65, 2.63],
  [3,  'Claude Opus 5 (max)',                     'Anthropic', 63, 2.25],
  [4,  'Claude Fable 5 (with fallback)',          'Anthropic', 62, 3.02],
  [5,  'Claude Fable 5.1 (high with fallback)',   'Anthropic', 62, 1.32],
  [6,  'Claude Opus 5 (xhigh)',                   'Anthropic', 62, 1.69],
  [7,  'GPT-6 Astra (max)',                       'OpenAI',    62, 1.42],
  [8,  'GPT-6 Astra (xhigh)',                     'OpenAI',    62, 0.95],
  [9,  'Muse Spark 1.3 (max)',                    'Muse',      61, 0.58],
  [10, 'Claude Opus 5 (high)',                    'Anthropic', 61, 1.10],
  [11, 'GPT-6 Astra (high)',                      'OpenAI',    61, 0.71],
  [12, 'Muse Spark 1.3 (xhigh)',                  'Muse',      60, 0.45],
  [13, 'Claude Fable 5.1 (medium with fallback)', 'Anthropic', 60, 0.84],
  [14, 'GPT-6 Astra (medium)',                    'OpenAI',    60, 0.53],
  [15, 'GPT-5.6 Sol (max)',                       'OpenAI',    59, 0.90],
  [16, 'Grok 4.6 (xhigh)',                        'xAI',       59, 0.92],
  [17, 'Grok 4.6 (high)',                         'xAI',       59, 0.69],
  [18, 'Grok 4.6 (medium)',                       'xAI',       58, 0.53],
  [19, 'Claude Opus 5 (medium)',                  'Anthropic', 58, 0.56],
  [20, 'GPT-6 Astra (low)',                       'OpenAI',    58, 0.25],
];

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
report('Engineering', await seedBenchmarkTable({
  category: 'engineering',
  label: 'Engineering',
  rows: ROWS,
  force: process.argv.includes('--force'),
}));
await mongoose.disconnect();
