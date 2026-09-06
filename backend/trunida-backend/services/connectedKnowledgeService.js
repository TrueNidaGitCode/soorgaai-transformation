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

/**
 * What each kind of linked document actually is, said to the model.
 *
 * This block used to describe everything as "Confluence pages the user
 * explicitly linked". That was already wrong for uploads and websites, and it
 * becomes dangerous the moment generated sample data can appear here: the
 * model would be told invented figures were the customer's own, and instructed
 * to use their terms by name. Every other safeguard around synthetic data is
 * decoration if this sentence lies.
 */
const SOURCE_PREAMBLE = {
  confluence: 'Confluence pages the user explicitly linked to this specific project.',
  jira:       'Jira issues the user explicitly linked to this specific project.',
  website:    "Pages from the company's own website.",
  upload:     'Files the user exported from their own systems and uploaded.',
  synthetic:  'ILLUSTRATIVE SAMPLE DATA THAT SVARG GENERATED. The customer does not have this '
            + 'data yet — these rows were invented to show the shape it would take. Use them to '
            + 'reason about structure and field names ONLY. Never cite a value here as a fact '
            + 'about the customer, never quote a figure from it, and never describe it as '
            + 'something they already have.',
};

const REAL_SOURCE_GUIDANCE = ' Use the specific systems, tools, and terms named below by their '
  + 'actual names — this is what makes the output sound grounded in this project rather than '
  + 'generic. Do not copy full sentences or paragraphs verbatim.';

function entryFor(doc) {
  const keywordLine = doc.keywords?.length ? `\nKey terms: ${doc.keywords.join(', ')}` : '';
  return `[${doc.title}]${keywordLine}\n${doc.summary || doc.rawText || '(no summary)'}`;
}

function formatLinkedBlock(docs) {
  // Grouped by kind so each group can be described truthfully, and ordered so
  // real sources are budgeted first: if something has to be dropped for length
  // it should be the invented rows, never the customer's own documents.
  const order = ['confluence', 'jira', 'website', 'upload', 'synthetic'];
  const byType = new Map();
  for (const doc of docs) {
    const kind = SOURCE_PREAMBLE[doc.sourceType] ? doc.sourceType : 'confluence';
    if (!byType.has(kind)) byType.set(kind, []);
    byType.get(kind).push(doc);
  }

  let charBudget = MAX_BLOCK_CHARS;
  const blocks = [];

  for (const kind of order) {
    const group = byType.get(kind);
    if (!group?.length) continue;

    const entries = [];
    for (const doc of group) {
      const entry = entryFor(doc);
      if (entry.length > charBudget && (entries.length > 0 || blocks.length > 0)) break;
      entries.push(entry);
      charBudget -= entry.length;
      if (charBudget <= 0) break;
    }
    if (!entries.length) continue;

    blocks.push([
      `[Source: ${SOURCE_PREAMBLE[kind]}${kind === 'synthetic' ? '' : REAL_SOURCE_GUIDANCE}]`,
      '',
      entries.join('\n\n'),
    ].join('\n'));

    if (charBudget <= 0) break;
  }

  if (!blocks.length) return null;

  return [
    `=== LINKED PROJECT DOCUMENTS ===`,
    blocks.join('\n\n'),
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
