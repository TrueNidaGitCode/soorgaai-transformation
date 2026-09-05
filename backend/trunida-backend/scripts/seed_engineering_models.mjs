/**
 * Engineering — the models Svarg can actually run.
 *
 * Four, not five: Gemini 3.8 Flash carries no Engineering score in the
 * published comparison, and inventing one to round the list up would be the
 * fabrication this catalog exists to prevent. Arth shows four here.
 *
 * Same collapse as Strategy & Ops — one row per model, `variant` recording
 * which published run the numbers came from.
 *
 *   node scripts/seed_engineering_models.mjs [--force]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { seedBenchmarkTable, report } from './lib/seedBenchmarkTable.mjs';

const ROWS = [
  { rank: 1, name: 'Claude Fable 5.1', vendor: 'Anthropic', score: 60, cost: 0.84,
    providerId: 'claude', apiModel: 'claude-fable-5-1', variant: 'medium with fallback' },
  { rank: 2, name: 'Claude Opus 5',    vendor: 'Anthropic', score: 58, cost: 0.56,
    providerId: 'claude', apiModel: 'claude-opus-5',    variant: 'medium' },
  { rank: 3, name: 'GPT-5.6 Sol',      vendor: 'OpenAI',    score: 59, cost: 0.90,
    providerId: 'openai', apiModel: 'gpt-5.6-sol',      variant: 'max — the only run published' },
  { rank: 4, name: 'GPT-6 Astra',      vendor: 'OpenAI',    score: 58, cost: 0.25,
    providerId: 'openai', apiModel: 'gpt-6-astra',      variant: 'low' },
];

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
report('Engineering', await seedBenchmarkTable({
  category: 'engineering',
  label: 'Engineering',
  rows: ROWS,
  force: process.argv.includes('--force'),
}));
await mongoose.disconnect();
