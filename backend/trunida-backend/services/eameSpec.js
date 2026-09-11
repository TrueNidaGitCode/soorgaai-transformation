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
/**
 * @param {object} bp
 * @param {object} [opts]
 * @param {string[]} [opts.sampleBacked]  dataset names whose only evidence is
 *   generated sample data. Passed in rather than queried here: this function is
 *   deliberately synchronous and pure, so that when a generation is wrong it is
 *   the generation that is wrong and not the brief.
 */
/**
 * Capabilities the Learner added after the application was first built.
 *
 * This brief describes ONE use case, because that is what Eame was asked for:
 * the application is generated whole, every time, from the objective the
 * customer approved. That is fine while an application is built once.
 *
 * It stops being fine the moment anything rebuilds. The generator rewrites the
 * authored tree from this spec, so a rebuild that mentions only the newest
 * requirement produces an application that only does the newest thing — the
 * violin teacher who asked for WhatsApp messages gets them and loses student
 * management, and under unattended building they find out before we do.
 *
 * So every capability ever added travels with every build, and the brief says
 * plainly that all of them must still work. Empty for an application that has
 * never been extended, which is every application built before this existed —
 * their briefs are byte-identical to what they were.
 */
export function buildSpec(bp, { sampleBacked = [], sampleFiles = [], addedCapabilities = [] } = {}) {
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
    warnings.push('Arth identified no datasets, so the generated model has no shape to follow.');
  }
  // Sample data is a real answer to "we have not collected this yet", but the
  // application built on it is shaped by rows nobody has ever seen. The screen
  // should be able to say which datasets those were.
  if (sampleBacked.length) {
    warnings.push(
      `${sampleBacked.join(', ')} ${sampleBacked.length === 1 ? 'is' : 'are'} backed only by `
      + 'generated sample data, so the model is shaped by data the customer does not have yet.'
    );
  }
  if (!codebase) {
    warnings.push('No repository was read, so the generated code cannot be matched to entities the customer already has.');
  }
  if (!engagement.category) {
    warnings.push('The engagement was not classified, so it is unknown whether their product calls this or their staff open it.');
  }

  return {
    appName: resolveAppName(bp, useCase),
    // The customer's own words. Everything else in this brief is derived from
    // them — the use case, the datasets, the engagement — and the generated
    // application could describe what it does without ever knowing why it
    // existed. Passed through so the app can answer in the terms the person
    // who asked for it would recognise.
    businessObjective: String(bp?.businessObjective || '').trim(),
    useCase,
    engagement: {
      category: engagement.category || '',
      subArea: engagement.subArea || '',
      maturity: engagement.maturity || '',
    },
    datasets,
    codebase,
    sampleFiles,
    // Normalised here so the generator never has to guess at the shape, and a
    // half-filled plan cannot reach the brief as an unnamed capability.
    addedCapabilities: (addedCapabilities || [])
      .filter(c => c && c.title)
      .map(c => ({
        title:   String(c.title).trim(),
        summary: String(c.summary || '').trim(),
        steps:   (c.steps || []).map(s => String(s).trim()).filter(Boolean),
        connectorsNeeded: (c.connectorsNeeded || []).map(s => String(s).trim()).filter(Boolean),
      })),
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

/**
 * What the delivered application is called.
 *
 * bp.appName is what the customer typed on the Eame screen, and it is usually
 * empty — nothing forces it. Every application built without one shipped
 * titled "AI Assistant", which is the template's placeholder: the customer
 * received software named after the tool that made it rather than after the
 * job it does.
 *
 * So it falls back to the approved use case, which is already a sentence
 * somebody agreed to — "Predictive Classification for Student Attrition" is a
 * far better name than a placeholder, and it needs no extra input.
 *
 * Trimmed to the same 48 characters the field allows, so a fallback can never
 * produce a name the customer could not have typed themselves.
 */
export function resolveAppName(bp, useCase = null) {
  const explicit = String(bp?.appName || '').trim();
  if (explicit) return explicit.slice(0, 48);

  const uc = useCase || resolveUseCase(bp);
  // Only an APPROVED use case is a name. When nothing has been approved,
  // resolveUseCase echoes the raw objective back as the name, and using that
  // titles the application with a paragraph the customer wrote about their
  // problem — worse than the placeholder it replaces.
  if (uc?.source !== 'approved-use-case') return '';

  const derived = String(uc.name || '').trim();
  return derived.length && derived.length <= 48 ? derived : '';
}
