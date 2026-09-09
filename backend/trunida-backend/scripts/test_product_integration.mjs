/**
 * Svarg — does the integration actually fit their codebase?
 *
 * Runs the port against a real profiled repository and asks the only questions
 * that matter about the output:
 *
 *   Does it parse?
 *   Does it use THEIR framework, or the one the standalone build happened to use?
 *   Does it reuse THEIR entities, or quietly declare a second copy?
 *   Did it leak a secret?
 *   Does the guide say what a reviewer has to change?
 *
 * A port that merely produces files is not evidence of anything. These are the
 * checks that separate "it wrote something" from "a human could open this as a
 * pull request".
 *
 *   node scripts/test_product_integration.mjs [blueprintId]
 *
 * With no argument it picks the most recent blueprint that has both a codebase
 * profile and a passed build. Read-only: prints, stores nothing.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import { integrateIntoProduct, checkIntegration } from '../services/productIntegrationService.js';

await mongoose.connect(process.env.MONGO_URI);

let bp;
if (process.argv[2]) {
  bp = await TransformationBlueprint.findById(process.argv[2]).lean();
} else {
  const candidates = await TransformationBlueprint
    .find({ 'codebaseProfile.checked': true }).sort({ createdAt: -1 }).lean();
  for (const c of candidates) {
    const app = await GeneratedApplication.findOne({ blueprintId: c._id, status: 'passed' }).lean();
    if (app) { bp = c; break; }
  }
}

if (!bp) {
  console.log('No blueprint has both a profiled repository and a passed build.');
  console.log('The integration needs both: the architecture to fit into, and the implementation to port.');
  await mongoose.disconnect();
  process.exit(0);
}

const p = bp.codebaseProfile;
console.log('BLUEPRINT  ', String(bp._id));
console.log('objective  ', String(bp.businessObjective).slice(0, 70));
console.log('their repo ', p.repoFullName, '|', (p.frameworks || []).join(', '), '|', p.database);
console.log('entities   ', (p.entities || []).map(e => e.name).join(', ') || '(none)');
console.log('');

const t0 = Date.now();
const r = await integrateIntoProduct(String(bp._id), {
  userId: String(bp.userId),
  onProgress: s => console.log('  …', s),
});
console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('');

console.log('FILES WRITTEN', r.files.length, '| grounded in', r.groundedInSource, 'of their own files');
for (const f of r.files) console.log('   ' + f.path.padEnd(46), Buffer.byteLength(f.content, 'utf8') + ' bytes');

// ── The checks that decide whether this is reviewable ────────────────────────

const all = r.files.map(f => f.content).join('\n');
const theirFrameworks = (p.frameworks || []).map(s => s.toLowerCase());
const theirEntities = (p.entities || []).map(e => e.name);

const usesTheirFramework = theirFrameworks.some(fw => new RegExp(fw, 'i').test(all));
const reusedEntities = theirEntities.filter(e => new RegExp(`\\b${e}\\b`).test(all));
const declaresDuplicate = r.warnings.some(w => /already exists in their codebase/.test(w));
const leakedSecret = r.warnings.some(w => /must read from their environment/.test(w));
const parseErrors = r.warnings.filter(w => /does not parse/.test(w));

console.log('');
console.log('CHECKS');
console.log('  parses                :', parseErrors.length ? 'NO — ' + parseErrors.length + ' file(s)' : 'yes');
console.log('  uses their framework  :', usesTheirFramework ? 'yes (' + theirFrameworks.join(', ') + ')' : 'NO');
console.log('  reuses their entities :', reusedEntities.length ? reusedEntities.join(', ') : 'NONE referenced');
console.log('  duplicate model       :', declaresDuplicate ? 'YES — would split their data' : 'none');
console.log('  secrets inlined       :', leakedSecret ? 'YES' : 'none');
console.log('  guide produced        :', r.guide ? r.guide.split('\n').length + ' lines' : 'NO');

if (r.warnings.length) {
  console.log('');
  console.log('WARNINGS');
  for (const w of r.warnings) console.log('   -', w);
}

console.log('');
console.log('─── INTEGRATION GUIDE ───');
console.log(r.guide || '(none)');

// One file in full, because a byte count says nothing about whether the code
// belongs in their repository.
const sample = r.files.find(f => /service|controller|route/i.test(f.path)) || r.files[0];
if (sample) {
  console.log('');
  console.log(`─── ${sample.path} ───`);
  console.log(sample.content.slice(0, 2200));
}

// Entity reuse is reported, not required. It only applies when their entities
// are relevant to the objective — this fixture pairs a defect-matching
// repository with an academy-management objective, so DefectRecord and
// JiraConnection have nothing to do with student churn, and demanding reuse
// would fail a port that behaved correctly.
if (!reusedEntities.length && theirEntities.length) {
  console.log('');
  console.log(`NOTE  none of their entities (${theirEntities.join(', ')}) appear in the port.`);
  console.log('      Correct when the profiled repository is a different domain from the objective —');
  console.log('      worth reading the guide if it is not.');
}

const verdict = !parseErrors.length && usesTheirFramework
  && !declaresDuplicate && !leakedSecret && !!r.guide;
console.log('');
console.log(verdict
  ? 'PASS — parses, uses their stack, no duplicate model, no secrets, guide present'
  : 'NOT READY — see the checks above');
if (verdict && !r.groundedInSource) {
  console.log('       Grounded in the profile only. Embed their code to match house style too.');
}

await mongoose.disconnect();
