/**
 * Svarg — the runtime Eame ships still stands on its own
 *
 * eameProjectBuilder copies a dozen of Svarg's own source files verbatim into
 * every generated application (CORE_FILES). Those files therefore may not
 * import anything that only exists in Svarg — and nothing stopped anyone from
 * adding such an import, because the failure appears three steps away, inside
 * a customer's build, minutes later.
 *
 * It happened: adding the usage ledger to services/llmService.js and
 * middleware/authMiddleware.js broke every Eame build. The local-imports gate
 * caught it correctly, but only after two full generations had been paid for,
 * and the message a customer saw was "the model returned no files" — which
 * points at the model rather than at Svarg.
 *
 * This runs the same gate against the runtime ALONE, before any model call, so
 * the mistake is caught by whoever made it.
 *
 *   node scripts/test_eame_runtime.mjs
 *
 * No database, no network, no model. Runs in a second.
 */

import { buildRuntime } from '../services/eameProjectBuilder.js';
import { staticGates } from '../services/generatedProjectVerifier.js';
import { FIXED_PATHS } from '../services/eameSpec.js';

let pass = true;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) pass = false;
};

console.log('1. the runtime composes');
const files = buildRuntime({ appName: 'Runtime check' });
check('files were produced', files.length > 0, `${files.length} files`);

// Every path the generator is told it may rely on has to actually be there.
// A FIXED_PATH that stopped being shipped is a build that fails at boot with
// a module-not-found nobody can trace back to here.
const shipped = new Set(files.map(f => f.path));
const missing = FIXED_PATHS.filter(p => !shipped.has(p));
check('every FIXED_PATH is shipped', missing.length === 0, missing.join(', '));

console.log('\n2. nothing imports a file that is not in the project');
{
  // The gate the customer's build would run, run here instead. syntax and
  // local-imports are the two that do not need node_modules.
  const result = await staticGates(files);
  const importFailures = (result.failures || []).filter(f => /which is not in the project/.test(f));

  check('no unresolvable local imports', importFailures.length === 0,
    importFailures.slice(0, 6).join(' | '));

  // Everything else the static gates found, reported rather than swallowed —
  // a syntax error in a shipped file is just as fatal.
  const others = (result.failures || []).filter(f => !/which is not in the project/.test(f));
  check('no other static failures', others.length === 0, others.slice(0, 4).join(' | '));
}

console.log('\n3. the shipped files carry no Svarg-only dependency');
{
  // Belt and braces, and a clearer message than the gate's: these two are the
  // ones that broke, and naming them makes the next mistake obvious.
  const SVARG_ONLY = ['usageContext', 'usageLedgerService', 'usageAttribution', 'entitlements', 'AccountPlan'];
  const offenders = [];
  for (const f of files) {
    for (const name of SVARG_ONLY) {
      if (new RegExp(`from ['"][^'"]*${name}`).test(f.content)) {
        offenders.push(`${f.path} imports ${name}`);
      }
    }
  }
  check('none found', offenders.length === 0, offenders.join(' | '));
}

console.log(pass
  ? '\nPASS — a generated project can stand on its own'
  : '\nFAILED — an Eame build would fail on this');
process.exit(pass ? 0 : 1);
