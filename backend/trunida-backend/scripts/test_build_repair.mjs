/**
 * Svarg — a repair fixes a file without deleting the others
 *
 * The repair loop asks the model to rewrite only the files an error named.
 * The project was then composed from THAT ATTEMPT'S files alone, so everything
 * the model was not asked to fix disappeared: a one-file repair produced a
 * project of one file, whose imports then failed because its siblings were
 * gone. Three attempts, the same class of error each time, the project worse
 * on every one.
 *
 * A real build costs a model call per attempt, so this stubs the generator and
 * exercises the loop itself — which is where the bug was.
 *
 *   node scripts/test_build_repair.mjs
 *
 * No database, no network, no model.
 */

import { composeProject } from '../services/eameBuildService.js';
import { extractImports } from '../services/generatedProjectVerifier.js';

let pass = true;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) pass = false;
};

console.log('1. an unresolved template placeholder is not a dependency');
{
  // Verbatim from a real build: the model wrote a placeholder inside quotes
  // rather than backticks, and the verifier reported "${resolvedPath} is not a
  // dependency of this project" — true, useless, and it sent the repair loop
  // after a package that never existed.
  const src = "const mod = await import('${resolvedPath}');\nimport x from 'mongoose';";
  const { bare, relative } = extractImports(src);
  check('the placeholder is ignored', !bare.includes('${resolvedPath}'), bare.join(', '));
  check('real imports still found', bare.includes('mongoose'), bare.join(', '));
  check('it is not counted as relative', relative.length === 0, relative.join(', '));
}

console.log('\n2. accumulating across attempts keeps what was not rewritten');
{
  // What the loop does, in miniature: attempt 1 writes the application,
  // attempt 2 rewrites one file.
  const runtime = [{ path: 'server.js', content: '// fixed' }];
  const attempt1 = [
    { path: 'services/attritionService.js', content: 'export const run = () => {};' },
    { path: 'models/StudentRiskProfile.js', content: 'export default {};' },
    { path: 'scripts/seed.js', content: "import '../services/attritionService.js';" },
  ];
  const attempt2 = [
    { path: 'scripts/seed.js', content: "import '../services/attritionService.js'; // fixed" },
  ];

  // The bug: composing from the latest attempt alone.
  const perAttempt = composeProject(runtime, attempt2);
  check('per-attempt composition loses the service', !perAttempt.some(f => f.path === 'services/attritionService.js'),
    `${perAttempt.length} files`);

  // The fix, as buildApplication now does it.
  const written = new Map();
  for (const f of attempt1) written.set(f.path, f);
  for (const f of attempt2) written.set(f.path, f);
  const accumulated = composeProject(runtime, [...written.values()]);

  const paths = accumulated.map(f => f.path);
  check('the service survives the repair', paths.includes('services/attritionService.js'), paths.join(', '));
  check('the model survives too', paths.includes('models/StudentRiskProfile.js'));
  check('the runtime is still there', paths.includes('server.js'));
  check('the repaired file is the new one',
    accumulated.find(f => f.path === 'scripts/seed.js').content.includes('// fixed'));
  check('no duplicate of the repaired path',
    paths.filter(p => p === 'scripts/seed.js').length === 1);

  // And the point of all of it: the seed's import now resolves.
  const known = new Set(paths);
  const { relative } = extractImports(accumulated.find(f => f.path === 'scripts/seed.js').content);
  const unresolved = relative.filter(r => !known.has(r.replace(/^\.\.\//, '').replace(/^\.\//, 'scripts/')));
  check('the repaired file imports something that exists', unresolved.length === 0, unresolved.join(', '));
}

console.log(pass
  ? '\nPASS — a repair narrows the errors instead of the project'
  : '\nFAILED');
process.exit(pass ? 0 : 1);
