/**
 * SoorgaAI — Connected Knowledge Service
 *
 * Formats extracted KnowledgeDocuments (Confluence today) into a context
 * block for blueprint generation prompts, mirroring
 * enterpriseBlueprintService.getCapabilityEnterpriseContext /
 * preloadEnterpriseContextMap exactly — same null-safety contract, same
 * delimited-block shape.
 *
 * v1 relevance filtering is a naive keyword-overlap heuristic, not vector
 * similarity (the codebase has no embedding infrastructure). This is an
 * intentional v1 simplification — a future phase may replace this with
 * hybrid retrieval without changing the calling contract.
 */

import KnowledgeDocument      from '../models/KnowledgeDocument.js';
import LinkedProjectDocument  from '../models/LinkedProjectDocument.js';

const MAX_DOCS        = 5;
const MAX_BLOCK_CHARS = 6000;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2);
}

function relevanceScore(doc, queryTokens) {
  if (queryTokens.size === 0) return 1; // no query context — treat all docs as equally relevant
  const docTokens = new Set([
    ...tokenize(doc.title),
    ...tokenize(doc.docType),
    ...(doc.keywords || []).flatMap(tokenize),
  ]);
  let overlap = 0;
  for (const t of queryTokens) if (docTokens.has(t)) overlap++;
  return overlap;
}

function formatBlock(orgName, docs) {
  let charBudget = MAX_BLOCK_CHARS;
  const entries = [];

  for (const doc of docs) {
    const keywordLine = doc.keywords?.length ? `\nKey terms: ${doc.keywords.join(', ')}` : '';
    const entry = `[${doc.title}] (${doc.docType})${keywordLine}\n${doc.summary || '(no summary)'}`;
    if (entry.length > charBudget && entries.length > 0) break; // keep at least one doc
    entries.push(entry);
    charBudget -= entry.length;
    if (charBudget <= 0) break;
  }

  return [
    `=== CONNECTED KNOWLEDGE — ${orgName} (Confluence) ===`,
    `[Source: customer Confluence space, extracted automatically. Use the specific systems, tools, and terms named below by their actual names — this is what makes the output sound grounded in this project rather than generic. Do not copy full sentences or paragraphs verbatim.]`,
    '',
    entries.join('\n\n'),
    `=== END CONNECTED KNOWLEDGE ===`,
  ].join('\n');
}

/**
 * Returns a formatted connected-knowledge context block, or null when the org
 * has no extracted documents or none are relevant to the given capability.
 *
 * @param {string} orgName
 * @param {{ capabilityId?: string, capabilityName?: string, businessObjective?: string }} query
 */
export async function getConnectedKnowledgeContext(orgName, query = {}) {
  if (!orgName) return null;

  const docs = await KnowledgeDocument.find({ orgName, extractionStatus: 'extracted' }).lean().catch(() => []);
  if (!docs.length) return null;

  const queryTokens = new Set([
    ...tokenize(query.capabilityId),
    ...tokenize(query.capabilityName),
    ...tokenize(query.businessObjective),
  ]);

  const ranked = docs
    .map(doc => ({ doc, score: relevanceScore(doc, queryTokens) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DOCS)
    .map(r => r.doc);

  if (!ranked.length) return null;

  return formatBlock(orgName, ranked);
}

/**
 * Fetches all extracted documents for the org once and returns a function
 * that formats a per-capability context block from the shared set, avoiding
 * one DB query per capability in a multi-capability generation loop.
 * Mirrors preloadEnterpriseContextMap's single-query-then-Map shape.
 */
export async function preloadConnectedKnowledgeMap(orgName) {
  const map = new Map();
  if (!orgName) return map;

  const docs = await KnowledgeDocument.find({ orgName, extractionStatus: 'extracted' }).lean().catch(() => []);
  if (!docs.length) return map;

  return {
    get(capabilityId, capabilityName) {
      const queryTokens = new Set([...tokenize(capabilityId), ...tokenize(capabilityName)]);
      const ranked = docs
        .map(doc => ({ doc, score: relevanceScore(doc, queryTokens) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_DOCS)
        .map(r => r.doc);
      if (!ranked.length) return null;
      return formatBlock(orgName, ranked);
    },
  };
}

// ── Personal per-blueprint linked documents ──────────────────────────────────
// Explicitly user-picked via the personal Confluence connection — always
// included in full, no relevance filtering (the user already chose them).

function formatLinkedBlock(docs) {
  let charBudget = MAX_BLOCK_CHARS;
  const entries = [];

  for (const doc of docs) {
    const keywordLine = doc.keywords?.length ? `\nKey terms: ${doc.keywords.join(', ')}` : '';
    const entry = `[${doc.title}]${keywordLine}\n${doc.summary || '(no summary)'}`;
    if (entry.length > charBudget && entries.length > 0) break;
    entries.push(entry);
    charBudget -= entry.length;
    if (charBudget <= 0) break;
  }

  return [
    `=== LINKED PROJECT DOCUMENTS ===`,
    `[Source: Confluence pages the user explicitly linked to this specific project. Use the specific systems, tools, and terms named below by their actual names — this is what makes the output sound grounded in this project rather than generic. Do not copy full sentences or paragraphs verbatim.]`,
    '',
    entries.join('\n\n'),
    `=== END LINKED PROJECT DOCUMENTS ===`,
  ].join('\n');
}

/**
 * Returns a formatted context block of documents explicitly linked to this
 * blueprint via a user's personal Confluence connection, or null if none.
 *
 * @param {string} blueprintId
 */
export async function getLinkedProjectContext(blueprintId) {
  if (!blueprintId) return null;

  const docs = await LinkedProjectDocument.find({ blueprintId, extractionStatus: 'extracted' }).lean().catch(() => []);
  if (!docs.length) return null;

  return formatLinkedBlock(docs);
}
