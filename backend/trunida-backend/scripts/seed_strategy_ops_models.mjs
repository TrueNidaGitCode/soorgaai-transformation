/**
 * Strategy & Ops — the models Svarg can actually run.
 *
 * Five models, one row each, every one with a configured endpoint. The
 * published table listed twenty rows, but those were five models at four
 * reasoning-effort settings each; `variant` records which run each score and
 * cost was read from. See lib/seedBenchmarkTable.mjs for why they collapse.
 *
 * Every apiModel here was confirmed against the provider's own model list, not
 * guessed: GET /v1/models on Anthropic and OpenAI, and the Gemini models
 * endpoint. An invented identifier produces a deployment that looks configured
 * and fails on its first request, which is the failure this whole catalog
 * exists to prevent.
 *
 *   node scripts/seed_strategy_ops_models.mjs [--force]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { seedBenchmarkTable, report } from './lib/seedBenchmarkTable.mjs';

// Where a model had several runs, the CHEAPEST is kept. Svarg sends no effort
// parameter, so a call gets the provider default — at or below the lowest
// measured setting. Taking a higher run's numbers would overstate both what
// the model scores and what it costs.
const ROWS = [
  { rank: 1, name: 'Claude Fable 5.1', vendor: 'Anthropic', score: 48, cost: 0.99,
    providerId: 'claude', apiModel: 'claude-fable-5-1', variant: 'low with fallback' },
  { rank: 2, name: 'Claude Opus 5',    vendor: 'Anthropic', score: 48, cost: 0.89,
    providerId: 'claude', apiModel: 'claude-opus-5',    variant: 'medium' },
  { rank: 3, name: 'GPT-5.6 Sol',      vendor: 'OpenAI',    score: 49, cost: 0.95,
    providerId: 'openai', apiModel: 'gpt-5.6-sol',      variant: 'xhigh' },
  { rank: 4, name: 'GPT-6 Astra',      vendor: 'OpenAI',    score: 49, cost: 1.47,
    providerId: 'openai', apiModel: 'gpt-6-astra',      variant: 'high' },
  { rank: 5, name: 'Gemini 3.8 Flash', vendor: 'Google',    score: 48, cost: 0.56,
    providerId: 'gemini', apiModel: 'gemini-3.8-flash', variant: 'medium' },
];

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
report('Strategy & Ops', await seedBenchmarkTable({
  category: 'strategyOps',
  label: 'Strategy & Ops',
  rows: ROWS,
  force: process.argv.includes('--force'),
}));
await mongoose.disconnect();
