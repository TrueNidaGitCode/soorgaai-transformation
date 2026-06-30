/**
 * SoorgaAI — Knowledge Suggestion Service
 *
 * Handles persistence and lifecycle of organisational knowledge suggestions
 * that are automatically detected during AI-assisted blueprint refinement.
 *
 * Architecture notes:
 * - Suggestions are stored in their own collection (never modifies blueprints)
 * - Approval stores knowledge to CompanyContext (KB enrichment only)
 * - Blueprint regeneration remains a separate, manual action
 * - Designed to support future: pattern detection, duplicate detection, semantic search
 */

import KnowledgeSuggestion from '../models/KnowledgeSuggestion.js';
import { getCompanyContext, saveCompanyContext } from './companyContextService.js';

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_TYPES    = ['PROJECT', 'COMPANY', 'INDUSTRY'];
const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

function validateRawSuggestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.title       || typeof raw.title       !== 'string') return null;
  if (!raw.description || typeof raw.description !== 'string') return null;
  if (!VALID_TYPES.includes(raw.knowledgeType)) return null;

  const confidence = typeof raw.confidence === 'number'
    ? Math.max(0, Math.min(1, raw.confidence))
    : null;

  // Only persist suggestions the model is reasonably confident about
  if (confidence !== null && confidence < 0.6) return null;

  return {
    title:               raw.title.slice(0, 200),
    description:         raw.description.slice(0, 1000),
    knowledgeType:       raw.knowledgeType,
    suggestedCapability: raw.suggestedCapability || null,
    suggestedSection:    raw.suggestedSection    || null,
    suggestedDomain:     raw.suggestedDomain     || null,
    confidence,
    reasoning:           raw.reasoning ? raw.reasoning.slice(0, 500) : null,
  };
}

// ── Save (batch) ──────────────────────────────────────────────────────────────

/**
 * Persist an array of raw suggestion objects extracted from the LLM response.
 * Invalid/low-confidence items are silently dropped.
 *
 * @param {object[]} rawSuggestions - suggestions as returned by the LLM
 * @param {object}   context        - { projectId, userId, sourceConversation }
 * @returns {Promise<object[]>}     - saved suggestion documents (plain objects)
 */
export async function saveSuggestions(rawSuggestions, { projectId, userId, sourceConversation }) {
  if (!Array.isArray(rawSuggestions) || rawSuggestions.length === 0) return [];

  const docs = rawSuggestions
    .map(validateRawSuggestion)
    .filter(Boolean)
    .map(s => ({
      ...s,
      projectId,
      createdBy: userId,
      sourceConversation: sourceConversation ? String(sourceConversation) : null,
      status: 'PENDING',
    }));

  if (docs.length === 0) return [];

  try {
    const saved = await KnowledgeSuggestion.insertMany(docs, { ordered: false });
    return saved.map(d => d.toObject());
  } catch (err) {
    console.error('[knowledgeSuggestion] save failed:', err.message);
    return [];
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

/**
 * List suggestions for a user with optional filters.
 */
export async function listSuggestions({ userId, status, projectId, page = 1, limit = 50 }) {
  const query = { createdBy: userId };

  if (status && VALID_STATUSES.includes(status)) query.status = status;
  if (projectId) query.projectId = projectId;

  const skip = (Math.max(1, page) - 1) * Math.min(limit, 100);

  const [items, total] = await Promise.all([
    KnowledgeSuggestion.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .lean(),
    KnowledgeSuggestion.countDocuments(query),
  ]);

  return { items, total, page, limit };
}

// ── Single fetch ──────────────────────────────────────────────────────────────

export async function getSuggestion(id, userId) {
  return KnowledgeSuggestion.findOne({ _id: id, createdBy: userId }).lean();
}

// ── Approve ───────────────────────────────────────────────────────────────────

/**
 * Approve a suggestion.
 * Stores the knowledge in the user's CompanyContext repository so it can
 * inform future AI generations. Does NOT modify any blueprint directly.
 */
export async function approveSuggestion(id, userId) {
  const suggestion = await KnowledgeSuggestion.findOne({ _id: id, createdBy: userId });
  if (!suggestion) return null;
  if (suggestion.status !== 'PENDING') return suggestion.toObject();

  suggestion.status = 'APPROVED';
  await suggestion.save();

  // Append to company context so future AI generations can draw on this learning
  try {
    const existing = await getCompanyContext(userId);
    const entry    = `\n\n[${suggestion.knowledgeType} KNOWLEDGE — ${new Date().toISOString().slice(0,10)}]\nTitle: ${suggestion.title}\n${suggestion.description}`;
    const updated  = (existing?.content || '') + entry;
    await saveCompanyContext(userId, updated, existing?.orgName, existing?.role);
  } catch (err) {
    console.warn('[knowledgeSuggestion] company context append failed (non-fatal):', err.message);
  }

  return suggestion.toObject();
}

// ── Reject ────────────────────────────────────────────────────────────────────

export async function rejectSuggestion(id, userId) {
  const suggestion = await KnowledgeSuggestion.findOneAndUpdate(
    { _id: id, createdBy: userId, status: 'PENDING' },
    { $set: { status: 'REJECTED' } },
    { new: true }
  ).lean();

  return suggestion;
}
