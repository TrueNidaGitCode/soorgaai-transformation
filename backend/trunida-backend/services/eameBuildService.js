/**
 * Svarg — Eame's build: write it, run it, fix it, deliver it
 *
 * The loop that turns a blueprint into a project someone can deploy:
 *
 *   spec  ->  generate  ->  compose with the fixed runtime  ->  verify
 *                              ^                                  |
 *                              +------ repair, with the error -----+
 *
 * The promise this exists to keep is that **a build that never passes is
 * reported as failed, not delivered**. Handing over a project that does not
 * start, with a screen saying "Application generated", is worse than saying it
 * could not be built: the customer finds out later and further from the cause.
 *
 * ── Why whole files on repair ──────────────────────────────────────────────
 *
 * A failing file is regenerated in full rather than patched. Asking a model for
 * a diff against code it wrote a moment ago invites a patch that does not
 * apply, and a half-applied patch is a worse state than the original error.
 */

import { buildSpec } from './eameSpec.js';
import LinkedProjectDocument from '../models/LinkedProjectDocument.js';
import { generateApplication } from './eameCodeGenerator.js';
import { buildRuntime } from './eameProjectBuilder.js';
import { verifyProject } from './generatedProjectVerifier.js';

/** Attempts before a build is called failed. Each one costs a full generation. */
const DEFAULT_ATTEMPTS = 3;

/**
 * The application, on top of the runtime.
 *
 * Runtime first, generated second, and a generated file can never take a fixed
 * path — isAuthoredPath already refused those, and this ordering means that
 * even if it had not, the runtime would win.
 */
export function composeProject(runtimeFiles, generatedFiles) {
  const fixed = new Set(runtimeFiles.map(f => f.path));
  return [...runtimeFiles, ...generatedFiles.filter(f => !fixed.has(f.path))];
}

/**
 * @param {object} bp   the blueprint
 * @param {object} opts
 * @param {number}  [opts.attempts]
 * @param {boolean} [opts.staticOnly]  skip the gates that execute code
 * @param {string}  [opts.mongoUri]    throwaway database for the boot gate
 * @param {string}  [opts.provider]    override which model writes the code
 * @param {function} [opts.onProgress] ({ attempt, phase, detail })
 */
export async function buildApplication(bp, {
  attempts = DEFAULT_ATTEMPTS,
  staticOnly = false,
  mongoUri = '',
  provider,
  onProgress = () => {},
} = {}) {
  // Which datasets are backed only by generated rows. Queried here rather than
  // inside buildSpec so that stays synchronous and pure.
  const sampleBacked = await LinkedProjectDocument
    .find({ blueprintId: bp._id, sourceType: 'synthetic' })
    .select('datasetName').lean()
    .then(rows => rows.map(r => r.datasetName).filter(Boolean))
    .catch(() => []);

  const spec = buildSpec(bp, { sampleBacked });
  const runtimeFiles = buildRuntime({ appName: spec.appName });

  const history = [];
  let repair = null;
  // Every file the model has written across all attempts, latest wins. See the
  // note at composeProject below for why this cannot be per-attempt.
  const written = new Map();

  for (let attempt = 1; attempt <= attempts; attempt++) {
    onProgress({ attempt, phase: 'generating' });

    let generated;
    try {
      generated = await generateApplication(spec, { provider, repair });
    } catch (err) {
      // A provider failure is not a bad generation, and retrying the same
      // prompt against a dead provider only wastes the remaining attempts.
      history.push({ attempt, stage: 'generation', failures: [err.message] });
      return { ok: false, spec, files: [], history,
               reason: 'The model that writes the code could not be reached: ' + err.message };
    }

    if (!generated.files.length) {
      const detail = generated.malformed.length
        ? generated.malformed
        : ['the model returned no files in the expected format'];
      history.push({ attempt, stage: 'generation', failures: detail });
      repair = { failures: detail, files: [] };
      continue;
    }

    // Accumulated, not replaced. A repair is asked to rewrite only the files
    // the errors named, so composing the project from that attempt alone
    // DELETED everything it was not asked to fix: a one-file repair produced a
    // project of one file, whose imports then failed because its siblings were
    // gone. The loop could report the same class of error for three attempts
    // while making the project worse each time.
    for (const f of generated.files) written.set(f.path, f);
    const authored = [...written.values()];

    const files = composeProject(runtimeFiles, authored);
    onProgress({ attempt, phase: 'verifying', detail: `${generated.files.length} files written` });

    const result = await verifyProject(files, { staticOnly, mongoUri });
    history.push({
      attempt,
      stage: result.stage,
      failures: result.failures || [],
      rejected: generated.rejected,
      malformed: generated.malformed,
      wrote: generated.files.map(f => f.path),
    });

    if (result.ok) {
      onProgress({ attempt, phase: 'passed', detail: result.stage });
      return {
        ok: true, spec, files,
        // Everything authored across the run, not just the last attempt's —
        // otherwise a build repaired on attempt 2 reports one file and the
        // delivery drops the rest.
        generatedPaths: authored.map(f => f.path),
        verifiedTo: result.stage,
        skipped: result.skipped || [],
        history,
      };
    }

    onProgress({ attempt, phase: 'failed', detail: `${result.stage}: ${(result.failures || [])[0] || ''}` });

    // Only the files the errors actually name go back. Resending everything
    // invites the model to rewrite code that was already correct.
    //
    // Chosen from everything authored so far, not just this attempt: after a
    // repair, "this attempt" is one file, and an error naming any other file
    // would find nothing to send.
    const named = authored.filter(f =>
      (result.failures || []).some(msg => msg.includes(f.path)));
    repair = {
      failures: result.failures || [],
      stage: result.stage,
      files: named.length ? named : authored,
      // What else exists, so the model stops importing files it cannot see.
      projectPaths: authored.map(f => f.path),
    };
  }

  return {
    ok: false, spec, files: [], history,
    reason: `The application did not pass verification in ${attempts} attempts. `
          + `Last failure at the ${history[history.length - 1]?.stage} stage.`,
  };
}
