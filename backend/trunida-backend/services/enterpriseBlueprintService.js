/**
 * SoorgaAI — Enterprise Blueprint Service
 *
 * Manages the company-level proprietary AI strategy document.
 *
 * Public API:
 *   ensureBlueprint({ orgName, industry, createdByUserId })
 *     Idempotent — creates an empty blueprint shell for the org if one doesn't
 *     already exist. Called once per org on first profile setup.
 *
 *   getBlueprint(orgName)
 *     Returns the full EnterpriseBlueprint document or null.
 *
 *   updateCapabilitySections(orgName, capabilityId, sections, updatedByUserId)
 *     Stage 2 — CTO/Admin writes section content for a single capability.
 *     Recomputes overall status after update.
 *
 *   getEnterpriseContextForAdvisor(userId, capabilityId)
 *     Stage 3 — Returns a formatted context string for the matching capability's
 *     sections that have non-empty content, or null if none.
 */

import EnterpriseBlueprint from '../models/EnterpriseBlueprint.js';
import UserProfile          from '../models/UserProfile.js';
import { getCapabilities, getCapabilityBlueprint } from './strategyCanvasService.js';

// ── Stage 1: Blueprint shell creation ─────────────────────────────────────────

/**
 * Build an empty capabilities array from the current KB framework.
 * Reads Core markdown files to enumerate section titles.
 */
function buildEmptyCapabilities(industry) {
  const capabilities = getCapabilities();

  return capabilities.map(cap => {
    let sections = [];
    try {
      const blueprint = getCapabilityBlueprint(cap.id, industry);
      sections = (blueprint.sections || []).map(s => ({
        title:   s.title,
        content: '',
      }));
    } catch {
      // KB file missing for this capability — create capability with no sections
    }
    return {
      capabilityId:   cap.id,
      capabilityName: cap.name,
      sections,
    };
  });
}

export async function ensureBlueprint({ orgName, industry = 'Automotive', createdByUserId }) {
  const existing = await EnterpriseBlueprint.findOne({ orgName }).lean();
  if (existing) return;

  const capabilities = buildEmptyCapabilities(industry);

  await EnterpriseBlueprint.create({
    orgName,
    industry,
    createdByUserId,
    capabilities,
    status: 'empty',
  });

  console.log(`[EnterpriseBlueprint] Shell created for org: "${orgName}" (${capabilities.length} capabilities)`);
}

// ── Stage 2: Section content update (CTO/Admin only) ─────────────────────────

/**
 * Compute blueprint status based on how many sections have content.
 */
function computeStatus(capabilities) {
  const all     = capabilities.flatMap(c => c.sections);
  const filled  = all.filter(s => s.content && s.content.trim().length > 0);
  if (filled.length === 0)        return 'empty';
  if (filled.length === all.length) return 'complete';
  return 'partial';
}

/**
 * Overwrite the sections array for one capability.
 * `sections` must be an array of { title, content } objects.
 */
export async function updateCapabilitySections(orgName, capabilityId, sections, updatedByUserId) {
  const doc = await EnterpriseBlueprint.findOne({ orgName });
  if (!doc) throw new Error(`Enterprise blueprint not found for org: ${orgName}`);

  const cap = doc.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error(`Capability "${capabilityId}" not found in enterprise blueprint for org: ${orgName}`);

  const now = new Date();
  cap.sections = sections.map(s => ({
    title:     s.title,
    content:   typeof s.content === 'string' ? s.content.trim() : '',
    updatedAt: now,
    updatedBy: updatedByUserId || null,
  }));

  doc.status = computeStatus(doc.capabilities);
  await doc.save();

  return doc;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getBlueprint(orgName) {
  return EnterpriseBlueprint.findOne({ orgName }).lean();
}

// ── Stage 3a: Blueprint generation context injection ─────────────────────────

/**
 * Returns a formatted enterprise context block for blueprint generation prompts.
 * Keyed by orgName directly (already resolved by loadCompanyProfile).
 * Returns null when the org has no blueprint or the capability has no filled sections.
 */
export async function getCapabilityEnterpriseContext(orgName, capabilityId) {
  if (!orgName || !capabilityId) return null;

  const blueprint = await EnterpriseBlueprint.findOne({ orgName }).lean();
  if (!blueprint) return null;

  const cap = blueprint.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) return null;

  const filledSections = cap.sections.filter(s => s.content && s.content.trim().length > 0);
  if (filledSections.length === 0) return null;

  const sectionBlock = filledSections
    .map(s => `[${s.title}]\n${s.content.trim()}`)
    .join('\n\n');

  return [
    `=== ENTERPRISE BLUEPRINT — ${orgName} ===`,
    `[CONFIDENTIAL — Authoritative strategic grounding for this organisation. Ground all generated content in this direction. Do not quote verbatim.]`,
    `Capability: ${cap.capabilityName}`,
    '',
    sectionBlock,
    `=== END ENTERPRISE BLUEPRINT ===`,
  ].join('\n');
}

// ── Stage 3b: Advisor context injection ──────────────────────────────────────

/**
 * Returns a formatted context block for the advisor prompt, or null.
 *
 * Looks up the user's org via UserProfile, finds the EnterpriseBlueprint,
 * extracts sections of the matching capability that have content.
 *
 * Returns null when:
 *   - User has no profile (new user, not yet onboarded)
 *   - No enterprise blueprint exists for the org
 *   - Blueprint exists but the capability has no filled sections
 */
export async function getEnterpriseContextForAdvisor(userId, capabilityId) {
  if (!userId || !capabilityId) return null;

  // Look up the user's org
  const profile = await UserProfile.findOne({ userId }).lean();
  if (!profile?.orgName) return null;

  const blueprint = await EnterpriseBlueprint.findOne({ orgName: profile.orgName }).lean();
  if (!blueprint) return null;

  const cap = blueprint.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) return null;

  const filledSections = cap.sections.filter(s => s.content && s.content.trim().length > 0);
  if (filledSections.length === 0) return null;

  const sectionBlock = filledSections
    .map(s => `## ${s.title}\n${s.content.trim()}`)
    .join('\n\n');

  return [
    `=== ENTERPRISE BLUEPRINT — ${profile.orgName} ===`,
    `[CONFIDENTIAL — Company proprietary AI strategy. Use for grounding only; do not quote verbatim.]`,
    `Capability: ${cap.capabilityName}`,
    '',
    sectionBlock,
    `=== END ENTERPRISE BLUEPRINT ===`,
  ].join('\n');
}
