/**
 * SoorgaAI — Industry Vertical Knowledge Service
 *
 * Manages admin-curated reference material for industry sub-verticals.
 * Structurally a near-mirror of companyResearchLibraryService.js — same
 * shell -> research -> draft -> admin-approve lifecycle — just keyed by
 * (parentIndustry, subVertical) instead of company name, and researching
 * general vertical practices instead of one company's specifics.
 *
 * Public API:
 *   normalizeVerticalKey(parentIndustry, subVertical)
 *     Shared normalization — must stay identical wherever a vertical is
 *     looked up (creation, generation-time context fetch, etc).
 *
 *   ensureVerticalKnowledge(parentIndustry, subVertical, createdByUserId)
 *     Idempotent — creates a shell for this (industry, vertical) pair if one
 *     doesn't exist, then immediately fires research. Safe to call multiple
 *     times (e.g. two companies tagged with the same vertical) — the second
 *     call is a no-op once the entry exists.
 *
 *   runResearch / approveSection / discardDraftSection / updateCapabilitySections
 *     Same admin review actions as companyResearchLibraryService.js.
 *
 *   getVerticalContextForCapability(parentIndustry, subVertical, capabilityId)
 *   preloadVerticalContextMap(parentIndustry, subVertical)
 *     Read-only, generation-time — formatted "=== INDUSTRY VERTICAL
 *     REFERENCE ===" context block, approved content only. Mirrors
 *     enterpriseBlueprintService.js's getCapabilityEnterpriseContext/
 *     preloadEnterpriseContextMap.
 *
 *   getEntry(id) / listEntries()
 */

import IndustryVerticalKnowledge from '../models/IndustryVerticalKnowledge.js';
import { getCapabilities, getCapabilityBlueprint } from './strategyCanvasService.js';
import { researchIndustryVertical } from './companyResearchService.js';

export function normalizeVerticalKey(parentIndustry, subVertical) {
  const industry = String(parentIndustry || '').trim().toLowerCase();
  const vertical  = String(subVertical || '').trim().toLowerCase();
  if (!industry || !vertical) return '';
  return `${industry}::${vertical}`;
}

// ── Shell creation ────────────────────────────────────────────────────────────

function buildEmptyCapabilities(parentIndustry) {
  const capabilities = getCapabilities();

  return capabilities.map(cap => {
    let sections = [];
    try {
      const blueprint = getCapabilityBlueprint(cap.id, parentIndustry);
      sections = (blueprint.sections || []).map(s => ({ title: s.title, content: '' }));
    } catch {
      // KB file missing for this capability — create capability with no sections
    }
    return { capabilityId: cap.id, capabilityName: cap.name, sections };
  });
}

/**
 * Idempotent — if a vertical entry already exists for this (industry,
 * vertical) pair, returns it unchanged and does NOT re-research. Otherwise
 * creates a shell and immediately fires research (still lands in
 * draftContent, pending admin review).
 */
export async function ensureVerticalKnowledge(parentIndustry, subVertical, createdByUserId) {
  const keyNormalized = normalizeVerticalKey(parentIndustry, subVertical);
  if (!keyNormalized) return null;

  const existing = await IndustryVerticalKnowledge.findOne({ keyNormalized });
  if (existing) return existing;

  const capabilities = buildEmptyCapabilities(parentIndustry);

  let doc;
  try {
    doc = await IndustryVerticalKnowledge.create({
      parentIndustry,
      subVertical,
      keyNormalized,
      createdByUserId,
      capabilities,
      status: 'empty',
    });
  } catch (err) {
    // Unique-index race (two companies tagged with the same new vertical at
    // once) — the loser just re-fetches what the winner created.
    if (err.code === 11000) return IndustryVerticalKnowledge.findOne({ keyNormalized });
    throw err;
  }

  console.log(`[IndustryVerticalKnowledge] Entry created for "${subVertical}" (${parentIndustry}), ${capabilities.length} capabilities`);

  try {
    await runResearch(doc._id);
    doc = await IndustryVerticalKnowledge.findById(doc._id);
  } catch (err) {
    console.error(`[IndustryVerticalKnowledge] Auto-research failed for "${subVertical}" (non-fatal):`, err.message);
  }

  return doc;
}

// ── Research ──────────────────────────────────────────────────────────────────

export async function runResearch(verticalId) {
  const doc = await IndustryVerticalKnowledge.findById(verticalId);
  if (!doc) throw new Error('Vertical knowledge entry not found.');

  const sectionMeta = [];
  for (const cap of doc.capabilities) {
    let kbSections = [];
    try {
      kbSections = getCapabilityBlueprint(cap.capabilityId, doc.parentIndustry).sections || [];
    } catch {
      // KB file missing for this capability — research with title only.
    }
    for (const section of cap.sections) {
      const kb = kbSections.find(s => s.title === section.title);
      sectionMeta.push({ title: section.title, definition: kb?.definition || '' });
    }
  }
  if (sectionMeta.length === 0) return doc;

  const result = await researchIndustryVertical({
    parentIndustry: doc.parentIndustry,
    subVertical:    doc.subVertical,
    sections:       sectionMeta,
  });
  if (!result || result.sections.length === 0) {
    console.log(`[IndustryVerticalKnowledge] No research draft produced for "${doc.subVertical}"`);
    return doc;
  }

  const now = new Date();
  const byTitle = new Map(result.sections.map(s => [s.title, s]));
  for (const cap of doc.capabilities) {
    for (const section of cap.sections) {
      const drafted = byTitle.get(section.title);
      if (!drafted) continue;
      section.draftContent = drafted.content;
      section.draftSource  = drafted.confidence === 'high' ? 'external-research' : 'external-research-limited';
      section.draftedAt    = now;
    }
  }

  await doc.save();
  console.log(`[IndustryVerticalKnowledge] Drafted ${result.sections.length} section(s) for "${doc.subVertical}"`);
  return doc;
}

// ── Review — approve or discard a draft ────────────────────────────────────────

function computeStatus(capabilities) {
  const all    = capabilities.flatMap(c => c.sections);
  const filled = all.filter(s => s.content && s.content.trim().length > 0);
  if (filled.length === 0)          return 'empty';
  if (filled.length === all.length) return 'complete';
  return 'partial';
}

function findSection(doc, capabilityId, sectionTitle) {
  const cap = doc.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error(`Capability "${capabilityId}" not found in vertical knowledge entry.`);
  const section = cap.sections.find(s => s.title === sectionTitle);
  if (!section) throw new Error(`Section "${sectionTitle}" not found in capability "${capabilityId}".`);
  return section;
}

export async function approveSection(verticalId, capabilityId, sectionTitle, updatedByUserId) {
  const doc = await IndustryVerticalKnowledge.findById(verticalId);
  if (!doc) throw new Error('Vertical knowledge entry not found.');

  const section = findSection(doc, capabilityId, sectionTitle);
  if (!section.draftContent) throw new Error(`Section "${sectionTitle}" has no pending draft.`);

  const now = new Date();
  section.content      = section.draftContent;
  section.updatedAt    = now;
  section.updatedBy    = updatedByUserId || null;
  section.draftContent = '';
  section.draftSource  = '';
  section.draftedAt    = null;

  doc.status = computeStatus(doc.capabilities);
  await doc.save();
  return doc;
}

export async function discardDraftSection(verticalId, capabilityId, sectionTitle) {
  const doc = await IndustryVerticalKnowledge.findById(verticalId);
  if (!doc) throw new Error('Vertical knowledge entry not found.');

  const section = findSection(doc, capabilityId, sectionTitle);
  section.draftContent = '';
  section.draftSource  = '';
  section.draftedAt    = null;

  await doc.save();
  return doc;
}

// ── Manual admin entry ───────────────────────────────────────────────────────

export async function updateCapabilitySections(verticalId, capabilityId, sections, updatedByUserId) {
  const doc = await IndustryVerticalKnowledge.findById(verticalId);
  if (!doc) throw new Error('Vertical knowledge entry not found.');

  const cap = doc.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error(`Capability "${capabilityId}" not found in vertical knowledge entry.`);

  const existingByTitle = new Map(cap.sections.map(s => [s.title, s]));
  const now = new Date();
  cap.sections = sections.map(s => {
    const existing = existingByTitle.get(s.title);
    return {
      title:        s.title,
      content:      typeof s.content === 'string' ? s.content.trim() : '',
      updatedAt:    now,
      updatedBy:    updatedByUserId || null,
      draftContent: existing?.draftContent || '',
      draftSource:  existing?.draftSource  || '',
      draftedAt:    existing?.draftedAt    || null,
    };
  });

  doc.status = computeStatus(doc.capabilities);
  await doc.save();
  return doc;
}

// ── Read — generation-time context ─────────────────────────────────────────────

function formatVerticalBlock(entry, filledSections) {
  const sectionBlock = filledSections
    .map(s => `[${s.title}]\n${s.content.trim()}`)
    .join('\n\n');

  return [
    `=== INDUSTRY VERTICAL REFERENCE — ${entry.subVertical} (${entry.parentIndustry}) ===`,
    `[General reference material for this sub-vertical, admin-curated. Use for terminology and context specific to this vertical, which may differ from generic ${entry.parentIndustry} assumptions. If this conflicts with the company's own Enterprise Blueprint context, the company-specific context takes precedence.]`,
    '',
    sectionBlock,
    `=== END INDUSTRY VERTICAL REFERENCE ===`,
  ].join('\n');
}

export async function getVerticalContextForCapability(parentIndustry, subVertical, capabilityId) {
  if (!subVertical || !capabilityId) return null;

  const keyNormalized = normalizeVerticalKey(parentIndustry, subVertical);
  if (!keyNormalized) return null;

  const entry = await IndustryVerticalKnowledge.findOne({ keyNormalized }).lean();
  if (!entry) return null;

  const cap = entry.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) return null;

  const filledSections = cap.sections.filter(s => s.content && s.content.trim().length > 0);
  if (filledSections.length === 0) return null;

  return formatVerticalBlock(entry, filledSections);
}

/**
 * Fetches the vertical entry once and returns a Map<capabilityId, contextString>.
 * Use before a multi-capability generation loop to avoid one DB query per
 * capability. Returns an empty Map when there's no matching entry or no
 * subVertical set.
 */
export async function preloadVerticalContextMap(parentIndustry, subVertical) {
  if (!subVertical) return new Map();

  const keyNormalized = normalizeVerticalKey(parentIndustry, subVertical);
  if (!keyNormalized) return new Map();

  const entry = await IndustryVerticalKnowledge.findOne({ keyNormalized }).lean().catch(() => null);
  if (!entry) return new Map();

  const map = new Map();
  for (const cap of entry.capabilities) {
    const filledSections = cap.sections.filter(s => s.content && s.content.trim().length > 0);
    if (filledSections.length === 0) continue;
    map.set(cap.capabilityId, formatVerticalBlock(entry, filledSections));
  }
  return map;
}

// ── Read — admin ──────────────────────────────────────────────────────────────

export async function getEntry(verticalId) {
  return IndustryVerticalKnowledge.findById(verticalId).lean();
}

export async function listEntries() {
  return IndustryVerticalKnowledge.find({}, {
    parentIndustry: 1, subVertical: 1, status: 1, createdAt: 1, capabilities: 1,
  }).sort({ createdAt: -1 }).lean();
}
