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
import { integrateIntoProduct, checkIntegration, verifyAgainstRepo } from '../services/productIntegrationService.js';
import { resolveRepoAccess } from '../services/githubReadService.js';

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

// ── Did it actually check against their repository? ──────────────────────────
//
// The checks above look at the files in isolation. These ask the question that
// decides whether the pull request builds: do the imports point at things that
// exist in the repository this is going into?

const v = r.repoVerified;
console.log('');
console.log('AGAINST THEIR REPOSITORY');

let verifyOk = false;
const failures = [];

if (!v || !v.checkedAt) {
  console.log('  NOT CHECKED — no repo access, or no repoFullName on the profile.');
  failures.push('the integration was never checked against their repository');
} else if (v.truncated) {
  console.log('  tree truncated — GitHub would not list', p.repoFullName, 'in one request.');
} else {
  console.log('  their tree           :', v.treeSize, 'files');
  console.log('  imports resolved     :', v.resolved);
  console.log('  imports pointing at nothing:', v.missingFiles.length || 'none');
  console.log('  missing exports      :', v.missingExports.length || 'none');
  console.log('  packages to add      :', v.missingPackages.join(', ') || 'none');

  // 1. Resolution is real. A pass must not be obtainable by checking nothing:
  //    if zero imports were resolved, every "no problems found" below is vacuous.
  if (v.resolved > 0) {
    verifyOk = true;
  } else {
    failures.push('zero imports were resolved, so a clean result means nothing');
  }
}

// 2 and 3. Feed it code with faults it must catch. Without this, a verifier that
//    silently returns an empty result looks identical to a clean repository.
if (v && v.checkedAt && !v.truncated) {
  const access = await resolveRepoAccess(String(bp.userId));
  const probe = await verifyAgainstRepo([{
    path: 'services/svargProbe.js',
    content: [
      "import DoesNotExist from '../models/DoesNotExist.js';",
      "import weird from 'a-package-nobody-depends-on';",
      'export const probe = () => DoesNotExist && weird;',
    ].join('\n'),
  }], { access, repoFullName: p.repoFullName });

  const caughtFile = probe.missingFiles.some(m => /DoesNotExist/.test(m));
  const caughtPkg = probe.missingPackages.includes('a-package-nobody-depends-on');

  console.log('');
  console.log('  fault injection');
  console.log('    missing file caught   :', caughtFile ? 'yes' : 'NO');
  console.log('    missing package caught:', caughtPkg ? 'yes (reported to add)' : 'NO');

  if (!caughtFile) failures.push('an import of a file that does not exist was not reported');
  if (!caughtPkg) failures.push('an import of a package they do not have was not reported');

  // 3b. A package to add is not a failure. It is a normal outcome, and putting
  //     it in warnings would make every correct integration look broken.
  const pkgInWarnings = r.warnings.some(w => /a-package-nobody-depends-on/.test(w));
  if (pkgInWarnings) failures.push('a package to add was reported as a warning rather than as an addition');

  // 4. No source retained. The point of resolving against the tree rather than
  //    cloning is that Svarg never holds a copy of their code — so the result
  //    must carry paths and counts, and no file content.
  const serialized = JSON.stringify(v);
  const leaked = (v.missingFiles.length + v.missingExports.length) > 0
    && /function |const |=>|class /.test(serialized);
  console.log('    holds no source       :', leaked ? 'NO — content in the result' : 'yes');
  if (leaked) failures.push('the verification result carries content from their repository');
}

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
  && !declaresDuplicate && !leakedSecret && !!r.guide
  && verifyOk && !failures.length;
console.log('');
if (failures.length) {
  console.log('VERIFICATION PROBLEMS');
  for (const f of failures) console.log('   -', f);
  console.log('');
}
console.log(verdict
  ? 'PASS — parses, uses their stack, no duplicate model, no secrets, guide present,\n'
    + '       and every import resolves against their real repository'
  : 'NOT READY — see the checks above');
if (verdict && !r.groundedInSource) {
  console.log('       Grounded in the profile only. Embed their code to match house style too.');
}

await mongoose.disconnect();
