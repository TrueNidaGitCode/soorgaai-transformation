/**
 * SoorgaAI — Eame Project Builder
 *
 * Assembles the file manifest for the real, deployable defect-matching
 * project Window 5 (Eame) pushes to the user's GitHub. Two sources:
 *  - CORE_FILES: real, already-working files copied verbatim from this repo
 *    (same relative layout: models/, services/, controllers/, routes/,
 *    middleware/, scripts/, frontend/) — nothing here is regenerated or
 *    LLM-authored, it's the actual tested code.
 *  - eame-template/: new files written specifically for the standalone
 *    package (entrypoint, package.json, docs, dev-token frontend shell).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FIXED_PATHS } from './eameSpec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');           // backend/trunida-backend/
const TEMPLATE_ROOT = path.join(ROOT, 'eame-template');

// [sourcePath relative to ROOT, destPath in the pushed repo]
const CORE_FILES = [
  ['models/DefectRecord.js', 'models/DefectRecord.js'],
  ['models/KnowledgeChunk.js', 'models/KnowledgeChunk.js'],
  ['services/hybridRetrievalService.js', 'services/hybridRetrievalService.js'],
  ['services/embeddingService.js', 'services/embeddingService.js'],
  ['services/llmService.js', 'services/llmService.js'],
  ['services/modelSelectionService.js', 'services/modelSelectionService.js'],
  ['config/modelCatalog.js', 'config/modelCatalog.js'],
  ['services/defectMatchingService.js', 'services/defectMatchingService.js'],
  ['controllers/defectMatchingController.js', 'controllers/defectMatchingController.js'],
  ['routes/defectMatchingRoutes.js', 'routes/defectMatchingRoutes.js'],
  ['middleware/authMiddleware.js', 'middleware/authMiddleware.js'],
  ['scripts/seed_defect_records.mjs', 'scripts/seed_defect_records.mjs'],
  ['../../frontend/defect-matching/defect-matching.js', 'frontend/defect-matching.js'],
  ['../../frontend/defect-matching/defect-matching.css', 'frontend/defect-matching.css'],
];

// The Jira, Confluence and GitHub connectors ship with every application as
// part of the template (services/connectors/), with credentials kept in the
// application's own database. The older OAuth Jira module that depended on
// Svarg's Atlassian app is gone with it.

// Every file under eame-template/ is pushed at the same relative path,
// minus the eame-template/ prefix — walked recursively so adding a file
// there doesn't require touching this builder.
function walkTemplateFiles(dir, baseDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walkTemplateFiles(fullPath, baseDir));
    } else {
      const destPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      files.push([fullPath, destPath, /* isAbsolute */ true]);
    }
  }
  return files;
}

function readFile(sourcePath, isAbsolute = false) {
  const fullPath = isAbsolute ? sourcePath : path.join(ROOT, sourcePath);
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * The name the customer gave their application on Eame, substituted into the
 * files that show it to a user. A placeholder rather than a rename of the
 * files themselves: the code keeps working under any name, and a project
 * delivered without one still reads sensibly.
 */
const NAME_TOKEN = /__APP_NAME__/g;

/**
 * The chat shell's copy, filled per delivery.
 *
 * index.html ships to every customer, so anything written into it directly is
 * written into all of them — it asked every customer about ECU flash failures
 * for as long as the only application was defect matching. These come from the
 * blueprint instead, and each falls back to wording that is true of any
 * application rather than to a domain that is true of one.
 */
const COPY_TOKENS = {
  __APP_TAGLINE__:       'Ask a question and I will answer from your data.',
  __APP_WELCOME_TITLE__: 'What would you like to know?',
  __APP_WELCOME_BODY__:  'Ask in your own words. This answers from the data this application was built on.',
  __APP_PROMPT__:        'Ask a question…',
};

function applyName(content, appName, copy = {}) {
  let out = content.replace(NAME_TOKEN, appName || 'AI Assistant');
  for (const [token, fallback] of Object.entries(COPY_TOKENS)) {
    // Escaped for the attribute and text positions these land in. An
    // apostrophe in a use-case name would otherwise close the placeholder's
    // own quote and break the page it is meant to describe.
    const value = String(copy[token] || fallback)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    out = out.split(token).join(value);
  }
  return out;
}

/**
 * @param {{appName?: string}} [opts]  (includeJira is accepted and ignored: the
 *   connectors are part of the template now, not an optional module)
 * @returns {{path:string, content:string}[]}
 */
export function buildManifest({ appName = '', copy = {} } = {}) {
  const manifest = [];

  for (const [source, dest] of CORE_FILES) {
    manifest.push({ path: dest, content: applyName(readFile(source), appName, copy) });
  }

  for (const [fullPath, dest] of walkTemplateFiles(TEMPLATE_ROOT)) {
    manifest.push({ path: dest, content: applyName(readFile(fullPath, true), appName, copy) });
  }

  return manifest;
}

/**
 * The fixed runtime, on its own.
 *
 * What every application Eame builds sits on: the entrypoint, the package, the
 * UI shell, and the wiring that authenticates a request and routes model calls
 * through Svarg's gateway. Identical for every customer, which is exactly why
 * it is not generated — it is what Railway depends on, and re-proving it every
 * build would be re-proving the same thing.
 *
 * Paths come from FIXED_PATHS in eameSpec.js so the generator, the verifier and
 * this cannot disagree about which files are the generator's to write.
 */
export function buildRuntime({ appName = '', copy = {} } = {}) {
  // Where each fixed file is copied from. A path in FIXED_PATHS with no entry
  // here would silently vanish from the delivered project, so the lookup below
  // throws instead.
  const SOURCE = {
    'server.js':                        { template: 'server.js' },
    'package.json':                     { template: 'package.json' },
    '.env.example':                     { template: '.env.example' },
    '.gitignore':                       { template: '.gitignore' },
    'README.md':                        { template: 'README.md' },
    'frontend/index.html':              { template: 'frontend/index.html' },
    'frontend/base.css':                { template: 'frontend/base.css' },
    'frontend/config.js':               { template: 'frontend/config.js' },
    // Styling only. index.html loads it, and frontend/app.js — the one UI file
    // Eame writes — is what actually drives the page.
    'frontend/app.css':                 { template: 'frontend/app.css' },
    'scripts/mint-token.mjs':           { template: 'scripts/mint-token.mjs' },
    'controllers/dataController.js':    { template: 'controllers/dataController.js' },
    'routes/dataRoutes.js':             { template: 'routes/dataRoutes.js' },
    'frontend/data.js':                 { template: 'frontend/data.js' },
    'services/connectorService.js':     { template: 'services/connectorService.js' },
    'services/connectors/jira.js':      { template: 'services/connectors/jira.js' },
    'services/connectors/confluence.js':{ template: 'services/connectors/confluence.js' },
    'services/connectors/github.js':    { template: 'services/connectors/github.js' },
    'controllers/connectorController.js': { template: 'controllers/connectorController.js' },
    'routes/connectorsRoutes.js':       { template: 'routes/connectorsRoutes.js' },
    'services/tenantSignals.js':        { template: 'services/tenantSignals.js' },
    'services/turnLog.js':              { template: 'services/turnLog.js' },
    'controllers/signalController.js':  { template: 'controllers/signalController.js' },
    'routes/signalsRoutes.js':          { template: 'routes/signalsRoutes.js' },
    'frontend/feedback.js':             { template: 'frontend/feedback.js' },
    'middleware/authMiddleware.js':     { repo: 'middleware/authMiddleware.js' },
    'services/llmService.js':           { repo: 'services/llmService.js' },
    'services/modelSelectionService.js':{ repo: 'services/modelSelectionService.js' },
    'config/modelCatalog.js':           { repo: 'config/modelCatalog.js' },
  };

  return FIXED_PATHS.map((dest) => {
    const source = SOURCE[dest];
    if (!source) throw new Error(`No source is configured for the fixed file ${dest}`);
    const content = source.template
      ? readFile(path.join(TEMPLATE_ROOT, source.template), true)
      : readFile(source.repo);
    return { path: dest, content: applyName(content, appName, copy) };
  });
}
