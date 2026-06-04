/**
 * SoorgaAI — Canvas Evolution Service
 *
 * Validates and applies canvas updates from the LLM response.
 *
 * Validation rules (all must pass for an update to be accepted):
 *   1. focusAreaId must exist in the domain's config.
 *   2. confidence >= 0.7
 *   3. newDescription length: 20–400 chars (after trim)
 *   4. evidence string is present and non-empty
 *   5. Title mutations are silently rejected and logged (server never modifies titles)
 *
 * Returns the list of accepted updates so the controller can include them in the
 * API response for immediate frontend canvas animation.
 */

import DomainCanvas from '../models/DomainCanvas.js';
import { getFocusAreaIds } from '../data/domainDefinitions.js';

const MIN_DESC_LEN  = 20;
const MAX_DESC_LEN  = 400;
const MIN_CONFIDENCE = 0.7;

/**
 * Apply validated canvas updates atomically.
 *
 * @param {string}   userId
 * @param {string}   domainId
 * @param {Array}    rawUpdates   — parsed from LLM JSON
 * @param {ObjectId} conversationId — for audit log reference
 * @returns {Array}  acceptedUpdates — what was actually applied
 */
export async function applyUpdates(userId, domainId, rawUpdates, conversationId) {
  if (!rawUpdates || rawUpdates.length === 0) return [];

  const validFocusAreaIds = new Set(getFocusAreaIds(domainId));
  const canvas = await DomainCanvas.findOne({ userId, domainId });

  if (!canvas) {
    console.warn(`applyUpdates: no canvas for userId=${userId} domainId=${domainId}`);
    return [];
  }

  const accepted = [];

  for (const update of rawUpdates) {
    const { focusAreaId, newDescription, confidence, evidence } = update;

    // Rule 1 — valid focusAreaId
    if (!validFocusAreaIds.has(focusAreaId)) {
      console.warn(`[canvas] rejected: unknown focusAreaId "${focusAreaId}"`);
      continue;
    }

    // Rule 2 — confidence threshold
    if (typeof confidence !== 'number' || confidence < MIN_CONFIDENCE) {
      console.warn(`[canvas] rejected focusAreaId="${focusAreaId}": confidence ${confidence} < ${MIN_CONFIDENCE}`);
      continue;
    }

    // Rule 3 — description length
    const desc = typeof newDescription === 'string' ? newDescription.trim() : '';
    if (desc.length < MIN_DESC_LEN || desc.length > MAX_DESC_LEN) {
      console.warn(`[canvas] rejected focusAreaId="${focusAreaId}": desc length ${desc.length} out of range`);
      continue;
    }

    // Rule 4 — evidence required
    if (!evidence || typeof evidence !== 'string' || evidence.trim().length === 0) {
      console.warn(`[canvas] rejected focusAreaId="${focusAreaId}": missing evidence`);
      continue;
    }

    // Rule 5 — never mutate titles (silently skip any attempt)
    const fa = canvas.focusAreas.find(f => f.id === focusAreaId);
    if (!fa) {
      console.warn(`[canvas] focusArea "${focusAreaId}" not found in stored canvas`);
      continue;
    }

    const previousDesc = fa.description;

    // Apply update
    fa.description = desc;

    canvas.auditLog.push({
      focusAreaId,
      previousDesc,
      newDesc:        desc,
      evidence:       evidence.trim(),
      confidence,
      appliedAt:      new Date(),
      conversationId: conversationId || null,
    });

    accepted.push({ focusAreaId, title: fa.title, newDescription: desc });
  }

  if (accepted.length > 0) {
    await canvas.save();
    console.log(`[canvas] applied ${accepted.length} update(s) to domainId="${domainId}" for userId=${userId}`);
  }

  return accepted;
}
