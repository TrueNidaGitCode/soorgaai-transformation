/**
 * SoorgaAI — Eame Project Builder
 *
 * Assembles the file manifest for the real, deployable defect-matching
 * project Window 5 (Eame) pushes to the user's GitHub. Two sources:
 *  - CORE_FILES / JIRA_MODULE_FILES: real, already-working files copied
 *    verbatim from this repo (same relative layout: models/, services/,
 *    controllers/, routes/, middleware/, scripts/, frontend/) — nothing
 *    here is regenerated or LLM-authored, it's the actual tested code.
 *  - eame-template/: new files written specifically for the standalone
 *    package (entrypoint, package.json, docs, dev-token frontend shell).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const JIRA_MODULE_FILES = [
  ['services/atlassianAuthService.js', 'services/atlassianAuthService.js'],
  ['services/jiraApiService.js', 'services/jiraApiService.js'],
  ['services/jiraContentService.js', 'services/jiraContentService.js'],
  ['services/confluenceContentService.js', 'services/confluenceContentService.js'],
  ['utils/encryption.js', 'utils/encryption.js'],
];

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

function applyName(content, appName) {
  return appName ? content.replace(NAME_TOKEN, appName) : content.replace(NAME_TOKEN, 'AI Assistant');
}

/**
 * @param {{includeJira?: boolean, appName?: string}} [opts]
 * @returns {{path:string, content:string}[]}
 */
export function buildManifest({ includeJira = true, appName = '' } = {}) {
  const manifest = [];

  for (const [source, dest] of CORE_FILES) {
    manifest.push({ path: dest, content: applyName(readFile(source), appName) });
  }

  if (includeJira) {
    for (const [source, dest] of JIRA_MODULE_FILES) {
      manifest.push({ path: dest, content: applyName(readFile(source), appName) });
    }
  }

  for (const [fullPath, dest] of walkTemplateFiles(TEMPLATE_ROOT)) {
    if (!includeJira && (dest.includes('jira') || dest.includes('Jira') || dest === 'JIRA_INTEGRATION.md')) continue;
    manifest.push({ path: dest, content: applyName(readFile(fullPath, true), appName) });
  }

  return manifest;
}
