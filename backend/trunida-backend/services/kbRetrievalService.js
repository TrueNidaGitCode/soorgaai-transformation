/**
 * SoorgaAI — KB Retrieval Service
 *
 * Reads and caches the three Knowledge Base sources:
 *   - maturity-stages.json   → 5 AI maturity stages
 *   - focus-areas.json       → 7 capability domains
 *   - domain-studies/<x>.md  → industry-specific AI study
 *
 * Interface is forward-compatible for future vector store replacement.
 * Consumer contracts (function signatures) remain stable even if the
 * underlying storage changes from files to a vector DB.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR    = path.resolve(__dirname, '../knowledge-base');

// ── In-memory cache ───────────────────────────────────────────────────────────
const _cache = {
  maturityStages: null,
  focusAreas:     null,
  domainStudies:  {},      // keyed by domain name (lowercase)
};

// ── Loaders ───────────────────────────────────────────────────────────────────

/**
 * Returns the 5 AI maturity stages from the KB.
 * @returns {{ stages: Array }}
 */
export function getMaturityStages() {
  if (!_cache.maturityStages) {
    const filePath = path.join(KB_DIR, 'maturity-stages.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    _cache.maturityStages = JSON.parse(raw);
    console.log('📚 KB: maturity-stages.json loaded and cached');
  }
  return _cache.maturityStages;
}

/**
 * Returns the 7 assessment focus areas from the KB.
 * @returns {{ focusAreas: Array }}
 */
export function getFocusAreas() {
  if (!_cache.focusAreas) {
    const filePath = path.join(KB_DIR, 'focus-areas.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    _cache.focusAreas = JSON.parse(raw);
    console.log('📚 KB: focus-areas.json loaded and cached');
  }
  return _cache.focusAreas;
}

/**
 * Returns the domain study markdown for a given domain.
 * Falls back to automotive.md if the requested domain file is missing.
 * @param {string} domain - e.g. 'Automotive', 'Healthcare'
 * @returns {string} Markdown content
 */
export function getDomainStudy(domain) {
  const key = (domain || 'automotive').toLowerCase().replace(/\s+/g, '-');

  if (!_cache.domainStudies[key]) {
    const filePath = path.join(KB_DIR, 'domain-studies', `${key}.md`);
    const fallback = path.join(KB_DIR, 'domain-studies', 'automotive.md');

    if (fs.existsSync(filePath)) {
      _cache.domainStudies[key] = fs.readFileSync(filePath, 'utf-8');
      console.log(`📚 KB: domain-studies/${key}.md loaded and cached`);
    } else {
      console.warn(`⚠️ KB: No domain study found for "${domain}" — falling back to automotive.md`);
      _cache.domainStudies[key] = fs.readFileSync(fallback, 'utf-8');
    }
  }

  return _cache.domainStudies[key];
}

/**
 * RAG-compatible retrieval — compose a context blob for a Claude prompt.
 * Forward-compatible: swap this implementation for a vector search without
 * changing the caller signature.
 *
 * @param {string} domain      - Discovered company domain
 * @param {string} [focusArea] - Optional: narrow to a specific focus area
 * @param {string} [stageHint] - Optional: narrow to a maturity stage
 * @returns {{ maturityStages, focusAreas, domainStudy, contextSummary }}
 */
export function retrieveContext(domain, focusArea = null, stageHint = null) {
  const maturityStages = getMaturityStages();
  const focusAreas     = getFocusAreas();
  const domainStudy    = getDomainStudy(domain);

  // If specific filters are provided, narrow the returned data
  const filteredStages = stageHint
    ? maturityStages.stages.filter(s => s.stage === stageHint)
    : maturityStages.stages;

  const filteredFocusAreas = focusArea
    ? focusAreas.focusAreas.filter(f => f.id === focusArea || f.name === focusArea)
    : focusAreas.focusAreas;

  const contextSummary = `Domain: ${domain}${focusArea ? ` | Focus: ${focusArea}` : ''}${stageHint ? ` | Stage: ${stageHint}` : ''}`;

  return {
    maturityStages:    filteredStages,
    focusAreas:        filteredFocusAreas,
    domainStudy,
    contextSummary,
  };
}

/**
 * Pre-warm the cache at startup to avoid first-request latency.
 * Called from server.js.
 */
export function warmCache() {
  try {
    getMaturityStages();
    getFocusAreas();
    getDomainStudy('automotive');
    console.log('✅ KB Retrieval Service: cache warmed successfully');
  } catch (err) {
    console.error('❌ KB Retrieval Service: cache warm failed —', err.message);
  }
}
