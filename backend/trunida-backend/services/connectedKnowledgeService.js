/**
 * SoorgaAI — Connected Knowledge Service
 *
 * Formats extracted KnowledgeDocuments (Confluence today) into a context
 * block for blueprint generation prompts, mirroring
 * enterpriseBlueprintService.getCapabilityEnterpriseContext /
 * preloadEnterpriseContextMap exactly — same null-safety contract, same
 * delimited-block shape.
 *
 * Relevance filtering now goes through hybridRetrievalService — the same
 * retrieval system blueprint generation and chat share — instead of the
 * original v1 naive keyword-overlap heuristic. Callers are unaffected: the
 * exported function signatures and the formatted-block return shape are
 * unchanged.
 */

import LinkedProjectDocument  from '../models/LinkedProjectDocument.js';
import { hybridRetrieve }     from './hybridRetrievalService.js';

const MAX_DOCS        = 5;
const MAX_BLOCK_CHARS = 6000;

function formatBlock(orgName, chunks) {
  let charBudget = MAX_BLOCK_CHARS;
  const entries = [];

  for (const c of chunks) {
    const keywordLine = c.keywords?.length ? `\nKey terms: ${c.keywords.join(', ')}` : '';
    const entry = `[${c.title}] (${c.docType})${keywordLine}\n${c.content || '(no summary)'}`;
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

  const queryText = [query.capabilityName, query.businessObjective].filter(Boolean).join(' — ');

  const results = await hybridRetrieve({
    sourceType: 'confluence',
    orgName,
    queryText: queryText || undefined,
    topK: MAX_DOCS,
  }).catch(() => []);

  if (!results.length) return null;

  return formatBlock(orgName, results.slice(0, MAX_DOCS));
}

/**
 * Kept for call-site compatibility with the multi-capability generation loop
 * (avoids callers needing to change). Real preloading of the semantic arm
 * isn't possible — each capability's query text differs, so each `.get()`
 * still runs its own (cheap) retrieval — but this keeps the same accessor
 * shape preloadEnterpriseContextMap-style callers expect.
 */
export async function preloadConnectedKnowledgeMap(orgName) {
  return {
    async get(capabilityId, capabilityName) {
      return getConnectedKnowledgeContext(orgName, { capabilityId, capabilityName });
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
