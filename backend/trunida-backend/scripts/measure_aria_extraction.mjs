/**
 * What Aria's extraction actually consumes.
 *
 * Replays the real work against the text already read from a repository, with
 * usage accounting reset first, so the numbers are measured rather than
 * estimated. Running locally costs nothing but reports the same token counts a
 * hosted provider would bill, which is the point: this is the projection.
 *
 *   node scripts/measure_aria_extraction.mjs [blueprintId]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import CustomerCodeChunk from '../models/CustomerCodeChunk.js';
import { deriveProfile, matchDatasets } from '../services/codebaseProfileService.js';
import { getUsageStats, resetUsageStats } from '../services/llmService.js';
import { productProviderName } from '../services/productLlm.js';

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const bp = process.argv[2]
  ? await TransformationBlueprint.findById(process.argv[2]).lean()
  : await TransformationBlueprint.findOne({ 'codebaseProfile.checked': true }).sort({ updatedAt: -1 }).lean();

if (!bp?.codebaseProfile?.checked) {
  console.error('No blueprint with a completed repository read. Run one from Aria first.');
  process.exit(1);
}

// The stored chunks are the redacted text that was actually sent.
const chunks = await CustomerCodeChunk
  .find({ blueprintId: bp._id })
  .select('path content chunkIndex')
  .sort({ path: 1, chunkIndex: 1 })
  .lean();

const byPath = new Map();
for (const c of chunks) byPath.set(c.path, (byPath.get(c.path) || '') + c.content);
const files = [...byPath].map(([path, content]) => ({ path, content }));

const datasets = (bp.domains || [])
  .flatMap(d => d.capabilities || [])
  .flatMap(c => c.sections || [])
  .flatMap(s => s.brief?.datasets || [])
  .map(d => ({ name: d.name, purpose: d.purpose }));

const chars = files.reduce((n, f) => n + f.content.length, 0);
console.log(`repo      : ${bp.codebaseProfile.repoFullName}`);
console.log(`provider  : ${productProviderName() || '(default chain)'} / ${process.env.SELFHOSTED_MODEL || 'hosted'}`);
console.log(`replaying : ${files.length} files, ${chars.toLocaleString()} chars, against ${datasets.length} datasets\n`);

resetUsageStats();
const t0 = Date.now();
const profile = await deriveProfile(files);
const tProfile = Date.now();
await matchDatasets(datasets, profile.entities);
const done = Date.now();

const u = getUsageStats();
console.log('MEASURED');
for (const [label, b] of Object.entries(u.byLabel)) {
  console.log(`  ${label.padEnd(34)} ${b.calls} call(s)  ${String(b.inputTokens).padStart(7)} in  ${String(b.outputTokens).padStart(6)} out  ${(b.ms / 1000).toFixed(1)}s`);
}
console.log(`  ${'TOTAL'.padEnd(34)} ${u.calls} call(s)  ${String(u.inputTokens).padStart(7)} in  ${String(u.outputTokens).padStart(6)} out  ${((done - t0) / 1000).toFixed(1)}s`);
console.log(`  (profile ${((tProfile - t0) / 1000).toFixed(1)}s, match ${((done - tProfile) / 1000).toFixed(1)}s)`);

// Per 1,000 characters of source, which is what scales.
if (chars) {
  console.log(`\nPER 1,000 CHARS OF SOURCE`);
  console.log(`  input  : ${(u.inputTokens / chars * 1000).toFixed(0)} tokens`);
  console.log(`  output : ${(u.outputTokens / chars * 1000).toFixed(0)} tokens`);
  console.log(`\nAT THE 60-FILE / 300,000-CHAR CAP, roughly:`);
  console.log(`  input  : ${Math.round(u.inputTokens / chars * 300_000).toLocaleString()} tokens`);
  console.log(`  output : ${Math.round(u.outputTokens / chars * 300_000).toLocaleString()} tokens`);
  console.log(`\nMultiply by your provider's per-token rate for the cloud figure.`);
}

await mongoose.disconnect();
