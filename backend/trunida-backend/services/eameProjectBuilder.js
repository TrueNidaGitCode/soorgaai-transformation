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
import { CONNECTOR_MODULES } from './sourceCatalogService.js';

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
  // The front door (services/frontDoorService.js writes these per blueprint).
  __APP_EYEBROW__:       'Ask • Know • Act',
  __APP_HEADLINE__:      'Your business,',
  __APP_ACCENT__:        'answered.',
  __APP_ACCENT_COLOR__:  '#F2C94C',
  __APP_INITIAL__:       'A',
  __APP_HERO_IMAGE__:    'none',
  __APP_HERO_CREDIT__:   '',
  __APP_HERO_CREDIT_URL__: '',
};

// Tokens that land inside a <script type="application/json"> and must not be
// HTML-escaped: JSON with &quot; in it is not JSON. Made safe for a script
// element the one way that matters -- no "<" survives, so no "</script>".
const RAW_TOKENS = {
  __APP_PREVIEW_JSON__: '{}',
};

function applyName(content, appName, copy = {}) {
  let out = content.replace(NAME_TOKEN, appName || 'AI Assistant');
  for (const [token, fallback] of Object.entries(RAW_TOKENS)) {
    const value = String(copy[token] || fallback).replace(/</g, '\\u003c');
    out = out.split(token).join(value);
  }
  for (const [token, fallback] of Object.entries(COPY_TOKENS)) {
    // Escaped for the attribute and text positions these land in. An
    // apostrophe in a use-case name would otherwise close the placeholder's
    // own quote and break the page it is meant to describe.
    const chosen = copy[token] || (token === '__APP_INITIAL__' && appName ? appName.trim().charAt(0).toUpperCase() : fallback);
    const value = String(chosen)
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
  const byPath = new Map();
  const put = (dest, content) => byPath.set(dest, { path: dest, content });

  for (const [source, dest] of CORE_FILES) {
    put(dest, applyName(readFile(source), appName, copy));
  }

  for (const [fullPath, dest] of walkTemplateFiles(TEMPLATE_ROOT)) {
    put(dest, applyName(readFile(fullPath, true), appName, copy));
  }

  /*
   * llmCore.js is Svarg's provider module, not the template's stand-in.
   *
   * The copy in eame-template/services/llmCore.js exists so the template can
   * be run and tested where it lives: it re-exports ../../services/llmService.js,
   * a path that exists in THIS repository and in no delivered project. Walking
   * the template shipped that stand-in verbatim, so any application delivered
   * this way died on boot with "Cannot find module" — the same failure, from
   * the same cause, as the WhatsApp connector that took Arthi's application
   * down for a week.
   *
   * buildRuntime got this right through its SOURCE map. buildManifest walks
   * the directory instead, so it has to be told. It matters because projectFor
   * falls back to this whenever a blueprint has no verified build.
   */
  put('services/llmCore.js', applyName(readFile('services/llmService.js'), appName, copy));

  const manifest = [...byPath.values()];
  assertImportsResolve(manifest);
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
/*
 * Connector modules that ship whether or not the application asked for them.
 *
 * Leaving a connector out is normally harmless: connectorService discovers
 * what is in services/connectors/ at boot, so an absent module is simply not
 * offered on the Data page. WhatsApp broke that rule — whatsappController.js
 * ships with every application and imports it STATICALLY, so an application
 * that did not ask for WhatsApp got a controller importing a file that was
 * not there and died on boot with "Cannot find module".
 *
 * It cost a customer's application a week of downtime. The assertion below
 * now catches the general case; this set is the specific answer for the one
 * connector that has a statically imported surface.
 */
const ALWAYS_SHIPPED = new Set(['services/connectors/whatsapp.js', 'services/connectors/database.js']);

/**
 * Asked for by name, or not shipped at all.
 *
 * "No connector list" means "give it everything", which is right for the
 * ordinary sources: a module left out is simply not offered. It is wrong for
 * Svarg's own operations, which every application but one is refused — an
 * application that shipped it would show a source on its Data page that can
 * only ever say no.
 */
const OPT_IN_ONLY = new Set(['services/connectors/svarg.js']);

export function buildRuntime({ appName = '', copy = {}, connectors = null } = {}) {
  // Which connector modules this application gets: the ones its sources
  // call for (sourceCatalogService), or all of them when nobody said.
  // The runtime discovers what is in services/connectors/ at boot, so a
  // module left out is simply not offered on the Data page.
  const wanted = Array.isArray(connectors) ? new Set(connectors.map(k => CONNECTOR_MODULES[k]).filter(Boolean)) : null;
  const connectorPaths = new Set(Object.values(CONNECTOR_MODULES));
  const shipped = FIXED_PATHS.filter((p) => {
    if (!connectorPaths.has(p)) return true;
    if (OPT_IN_ONLY.has(p)) return !!wanted && wanted.has(p);
    return ALWAYS_SHIPPED.has(p) || !wanted || wanted.has(p);
  });
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
    'services/connectors/whatsapp.js':  { template: 'services/connectors/whatsapp.js' },
    'services/connectors/svarg.js':     { template: 'services/connectors/svarg.js' },
    'services/connectors/database.js':  { template: 'services/connectors/database.js' },
    'controllers/whatsappController.js': { template: 'controllers/whatsappController.js' },
    'routes/whatsappRoutes.js':         { template: 'routes/whatsappRoutes.js' },
    'controllers/connectorController.js': { template: 'controllers/connectorController.js' },
    'routes/connectorsRoutes.js':       { template: 'routes/connectorsRoutes.js' },
    'services/tenantSignals.js':        { template: 'services/tenantSignals.js' },
    // Agents: the application noticing something without being asked. Shipped
    // with every application because server.js imports the scheduler
    // unconditionally — the lesson of the WhatsApp outage is that an import in a
    // file every application gets must resolve in every application.
    'services/agentService.js':          { template: 'services/agentService.js' },
    'services/agentCatalogue.js':        { template: 'services/agentCatalogue.js' },
    'services/draftService.js':          { template: 'services/draftService.js' },
    'services/notifyService.js':         { template: 'services/notifyService.js' },
    'controllers/agentsController.js':   { template: 'controllers/agentsController.js' },
    'routes/agentsRoutes.js':            { template: 'routes/agentsRoutes.js' },
    'frontend/agents.js':                { template: 'frontend/agents.js' },
    'frontend/findings.js':              { template: 'frontend/findings.js' },
    'services/turnLog.js':              { template: 'services/turnLog.js' },
    'services/selfCheck.js':            { template: 'services/selfCheck.js' },
    'services/conformance.js':          { template: 'services/conformance.js' },
    'services/securityControls.js':     { template: 'services/securityControls.js' },
    'controllers/signalController.js':  { template: 'controllers/signalController.js' },
    'routes/signalsRoutes.js':          { template: 'routes/signalsRoutes.js' },
    'controllers/authController.js':    { template: 'controllers/authController.js' },
    'controllers/accessController.js':  { template: 'controllers/accessController.js' },
    'controllers/conformanceController.js': { template: 'controllers/conformanceController.js' },
    'routes/authRoutes.js':             { template: 'routes/authRoutes.js' },
    'routes/accessRoutes.js':           { template: 'routes/accessRoutes.js' },
    'routes/conformanceRoutes.js':      { template: 'routes/conformanceRoutes.js' },
    'middleware/authMiddleware.js':     { template: 'middleware/authMiddleware.js' },
    'services/assistant.js':            { template: 'services/assistant.js' },
    'services/reasoning.js':            { template: 'services/reasoning.js' },
    'services/answerService.js':        { template: 'services/answerService.js' },
    'controllers/chatController.js':    { template: 'controllers/chatController.js' },
    'routes/chatRoutes.js':             { template: 'routes/chatRoutes.js' },
    'frontend/answer.js':               { template: 'frontend/answer.js' },
    'frontend/access.js':               { template: 'frontend/access.js' },
    // Svarg's provider module, copied in under its own name; the wrapper
    // above it is the template's.
    'services/llmCore.js':              { repo: 'services/llmService.js' },
    'services/llmService.js':           { template: 'services/llmService.js' },
    'services/modelSelectionService.js':{ repo: 'services/modelSelectionService.js' },
    'config/modelCatalog.js':           { repo: 'config/modelCatalog.js' },
  };

  const files = shipped.map((dest) => {
    const source = SOURCE[dest];
    if (!source) throw new Error(`No source is configured for the fixed file ${dest}`);
    const content = source.template
      ? readFile(path.join(TEMPLATE_ROOT, source.template), true)
      : readFile(source.repo);
    return { path: dest, content: applyName(content, appName, copy) };
  });

  assertImportsResolve(files);
  return files;
}

/*
 * Every static import in a shipped file must point at another shipped file.
 *
 * This is the invariant that was broken, and it was broken silently: the
 * build succeeded, the push succeeded, Railway reported SUCCESS, and the
 * application then died on boot in a customer's account where nobody was
 * watching the logs. Nothing between the mistake and the outage looked wrong.
 *
 * Checked here rather than in the verifier because the verifier reads the
 * files the MODEL wrote, and both files involved in this failure were ours.
 */
/**
 * Every script a shipped page loads must be a file the project actually has.
 *
 * Separate from assertImportsResolve because it needs the complete project —
 * fixed files AND the ones the generator wrote. Removing a fixed file while
 * a page still asks for it is the same mistake as the WhatsApp connector, in
 * the other language: the build succeeds, the page loads, and one script 404s
 * silently in a browser nobody is watching.
 */
export function assertProjectResolves(files) {
  const have = new Set(files.map(f => f.path));
  const missing = [];

  for (const f of files) {
    if (!f.path.endsWith('.html')) continue;
    for (const m of String(f.content).matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/g)) {
      const src = m[1].replace(/^\.\//, '');
      if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f.path), src));
      if (!have.has(target)) missing.push(`${f.path} loads ${target}, which this project does not contain`);
    }
  }

  if (missing.length) throw new Error('This application would not load:\n  ' + missing.join('\n  '));
  return files;
}

function assertImportsResolve(files) {
  const have = new Set(files.map(f => f.path));
  const missing = [];

  for (const f of files) {
    // HTML is checked in assertProjectResolves, against the COMPLETE project:
    // a <script src> may point at a file the generator writes, which this
    // function never sees.
    if (!f.path.endsWith('.js')) continue;
    // Static imports only. A dynamic import() of a directory's contents is how
    // connectors are meant to be optional, and absence there is the design.
    for (const m of f.content.matchAll(/^\s*import\s[^;]*?from\s*['"](\.[^'"]+)['"]/gm)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f.path), m[1]));
      if (!have.has(target)) missing.push(`${f.path} imports ${target}, which is not shipped`);
    }
  }

  if (missing.length) {
    throw new Error('This application would not start:\n  ' + missing.join('\n  '));
  }
}
