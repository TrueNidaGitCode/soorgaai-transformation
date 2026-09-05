/**
 * Svarg — what Eame is being asked to build
 *
 * Everything the generator needs, read off the blueprint. No model call: this
 * is the part that must be the same every time, so that when a generation is
 * wrong it is the generation that is wrong and not the brief.
 *
 * ── The contract the generated code has to keep ────────────────────────────
 *
 * Eame authors the application; the runtime around it is fixed, because that
 * is what makes the project deployable on Railway and it is identical for
 * every customer. The split is enforced, not requested — see AUTHORED_DIRS and
 * FIXED_PATHS, which the generator and the verifier both read from here so
 * they cannot disagree about it.
 */

import { resolveUseCase } from './blueprintUseCase.js';

/**
 * Directories the generator may write into. A path outside these is rejected
 * rather than corrected: a model asking to write `server.js` has misunderstood
 * the brief, and quietly relocating the file would hide that.
 */
export const AUTHORED_DIRS = ['models/', 'services/', 'controllers/', 'routes/', 'scripts/'];

/** Individually authored files outside those directories. */
export const AUTHORED_FILES = ['frontend/app.js'];

/**
 * The runtime. Generated code may import these but never replace them — they
 * are what boots the process, authenticates a request, and routes model calls
 * through Svarg's gateway.
 */
export const FIXED_PATHS = [
  'server.js',
  'package.json',
  '.env.example',
  '.gitignore',
  'README.md',
  'middleware/authMiddleware.js',
  'services/llmService.js',
  'services/modelSelectionService.js',
  'config/modelCatalog.js',
  'frontend/index.html',
  'frontend/base.css',
  'frontend/config.js',
  'frontend/app.css',
  'scripts/mint-token.mjs',
];

/**
 * What the generated project is allowed to import. Anything else cannot be
 * installed, so it is a build that fails at `npm install` — caught earlier and
 * more legibly by the dependency gate.
 */
export const ALLOWED_DEPENDENCIES = [
  '@anthropic-ai/sdk', '@google/generative-ai', 'axios', 'cors',
  'dotenv', 'express', 'jsonwebtoken', 'mongoose', 'openai',
];

/** Aria's required datasets, from the data-readiness domain. */
function readDatasets(bp) {
  const domain = (bp?.domains || []).find(d => d.domainId === 'data-readiness');
  if (!domain) return [];
  for (const cap of domain.capabilities || []) {
    for (const section of cap.sections || []) {
      const rows = section.brief?.datasets;
      if (Array.isArray(rows) && rows.length) {
        return rows.map(d => ({
          name: String(d.name || '').trim(),
          purpose: String(d.purpose || '').trim(),
          typicalSource: String(d.typicalSource || '').trim(),
        })).filter(d => d.name);
      }
    }
  }
  return [];
}

/**
 * What Aria found in the customer's own repository.
 *
 * Used to shape the generated model after data they actually have — an entity
 * named for their table, with their columns — rather than after a name a model
 * invented. Absent for a customer who connected no repository, and the
 * generator must cope with that rather than filling it in.
 */
function readCodebase(bp) {
  const profile = bp?.codebaseProfile;
  if (!profile?.checked) return null;
  return {
    repo: profile.repoFullName || '',
    languages: profile.languages || [],
    frameworks: profile.frameworks || [],
    database: profile.database || '',
    entities: (profile.entities || []).map(e => ({
      name: e.name, definedIn: e.definedIn, fields: e.fields || [], describes: e.describes || '',
    })),
    datasetMatches: (profile.datasetMatches || []).map(m => ({
      dataset: m.dataset, entity: m.entity, definedIn: m.definedIn,
    })),
  };
}

/**
 * @returns {{
 *   appName: string, useCase: object, engagement: object,
 *   datasets: object[], codebase: object|null,
 *   authoredDirs: string[], authoredFiles: string[],
 *   fixedPaths: string[], allowedDependencies: string[],
 *   warnings: string[]
 * }}
 */
export function buildSpec(bp) {
  const useCase = resolveUseCase(bp);
  const datasets = readDatasets(bp);
  const codebase = readCodebase(bp);
  const engagement = bp?.engagement || {};
  const warnings = [];

  // Stated, not silently tolerated. Each of these makes the generated
  // application weaker in a specific way, and the screen should be able to say
  // which — a build from an unapproved objective is a different thing from a
  // build with no data behind it.
  if (useCase.source !== 'approved-use-case') {
    warnings.push('No use case has been approved yet, so this builds from the original business objective.');
  }
  if (!datasets.length) {
    warnings.push('Aria identified no datasets, so the generated model has no shape to follow.');
  }
  if (!codebase) {
    warnings.push('No repository was read, so the generated code cannot be matched to entities the customer already has.');
  }
  if (!engagement.category) {
    warnings.push('The engagement was not classified, so it is unknown whether their product calls this or their staff open it.');
  }

  return {
    appName: String(bp?.appName || '').trim(),
    useCase,
    engagement: {
      category: engagement.category || '',
      subArea: engagement.subArea || '',
      maturity: engagement.maturity || '',
    },
    datasets,
    codebase,
    authoredDirs: AUTHORED_DIRS,
    authoredFiles: AUTHORED_FILES,
    fixedPaths: FIXED_PATHS,
    allowedDependencies: ALLOWED_DEPENDENCIES,
    warnings,
  };
}

/**
 * Whether the generator is allowed to write this path.
 *
 * Rejects, in order: traversal, absolute paths, anything that would overwrite
 * the runtime, and anything outside the authored directories. A generated path
 * is untrusted input — it lands on Svarg's disk during verification.
 */
export function isAuthoredPath(p) {
  const clean = String(p || '').trim().split('\\').join('/');
  if (!clean) return false;
  if (clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) return false;
  if (clean.split('/').includes('..')) return false;
  if (FIXED_PATHS.includes(clean)) return false;
  if (AUTHORED_FILES.includes(clean)) return true;
  return AUTHORED_DIRS.some(d => clean.startsWith(d)) && clean.length > 0;
}
