/**
 * Recompute what each deployment has actually spent.
 *
 * ── What went wrong ────────────────────────────────────────────────────────
 *
 * The same model is written two ways: the advisory catalogue calls it
 * 'gemini-3.8-flash' and the benchmark catalogue in the database — which is
 * where a deployment's modelId comes from — calls it 'gemini-3-8-flash'. One
 * dot. Pricing matched neither spelling against the other, so every call was
 * costed at the most expensive row in the catalogue, about forty times the
 * truth, and the per-deployment spend cap was counting that fiction.
 *
 * Three customers' applications had already stopped answering, on money
 * nobody had spent.
 *
 * ── What this does, and does not do ────────────────────────────────────────
 *
 * It recomputes usage.costUsd from the tokens ALREADY RECORDED, at the price
 * the catalogue now resolves. Requests and token counts are not touched: this
 * is an arithmetic correction using the same inputs, not a reset of the
 * meter, and running it twice gives the same answer as running it once.
 *
 * A deployment whose model still has no price is left exactly as it is and
 * reported. There is no honest figure to write, and inventing one here would
 * be the same mistake in the other direction.
 *
 * Usage, from backend/trunida-backend:
 *   node scripts/reprice_deployment_usage.mjs          # report only
 *   node scripts/reprice_deployment_usage.mjs --write  # correct them
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const WRITE = process.argv.includes('--write');

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const { estimateCostUsd, isPriced } = await import('../services/gatewayService.js');

const col = mongoose.connection.collection('hosteddeployments');
const deps = await col.find({}, {
  projection: { 'model.modelId': 1, 'railway.url': 1, usage: 1, limits: 1 },
}).toArray();

let corrected = 0;
let unpriced = 0;
let freed = 0;

for (const d of deps) {
  const u = d.usage || {};
  if (!u.requests) continue;

  const modelId = d.model?.modelId || '';
  const where = String(d.railway?.url || '(not deployed)').replace('https://', '');

  if (!isPriced(modelId)) {
    unpriced++;
    console.log(`  left alone   ${where}  —  "${modelId}" still has no price`);
    continue;
  }

  const was = Number(u.costUsd || 0);
  const now = estimateCostUsd(modelId, u.inputTokens || 0, u.outputTokens || 0);
  const cap = d.limits?.maxCostUsd || 0;
  const wasCapped = cap > 0 && was >= cap;
  const stillCapped = cap > 0 && now >= cap;
  if (wasCapped && !stillCapped) freed++;

  console.log(`  ${WRITE ? 'corrected' : 'would fix'}    ${where}  $${was.toFixed(3)} -> $${now.toFixed(4)}`
    + (cap ? `  (cap $${cap}${wasCapped ? ', was refusing requests' : ''}${wasCapped && !stillCapped ? ' — now serving' : ''})` : ''));

  if (WRITE) await col.updateOne({ _id: d._id }, { $set: { 'usage.costUsd': now } });
  corrected++;
}

console.log(`\n${corrected} deployment(s) ${WRITE ? 'corrected' : 'to correct'}`
  + (freed ? `, ${freed} of them back under their cap` : '')
  + (unpriced ? `; ${unpriced} left alone for want of a price` : ''));
if (!WRITE) console.log('Nothing was written. Re-run with --write to apply.');

await mongoose.disconnect();
