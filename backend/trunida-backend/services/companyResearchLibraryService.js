/**
 * SoorgaAI — Company Research Library Service
 *
 * Manages the shared, admin-curated company research library. Mirrors
 * enterpriseBlueprintService.js's shape closely, but operates on
 * CompanyResearchLibrary (keyed by company name) instead of EnterpriseBlueprint
 * (keyed by org). All write operations here are platform-admin-only —
 * enforced at the route level (middleware/adminMiddleware.js's adminOnly),
 * not in this service.
 *
 * Public API:
 *   normalizeCompanyName(name)
 *     Shared normalization used both here and by ensureBlueprint's
 *     library-lookup step in enterpriseBlueprintService.js — must stay
 *     identical in both places or matching silently breaks.
 *
 *   createLibraryEntry(companyName, industry, createdByUserId, subVertical)
 *     Creates an empty shell for a company. Throws if one already exists
 *     for the normalized name. If subVertical is provided, also ensures a
 *     matching IndustryVerticalKnowledge entry exists (auto-drafts one via
 *     research if it doesn't) — see industryVerticalKnowledgeService.js.
 *
 *   setSubVertical(libraryId, subVertical)
 *     Tags an existing entry with a sub-vertical after the fact — same
 *     ensureVerticalKnowledge side effect as createLibraryEntry.
 *
 *   runResearch(libraryId)
 *     Calls companyResearchService and writes results into draftContent.
 *     A distinct, explicit action from creation — the admin controls when
 *     a paid web-search call happens.
 *
 *   approveSection / discardDraftSection(libraryId, capabilityId, sectionTitle, ...)
 *     Admin review actions — draftContent -> content, or discard.
 *
 *   updateCapabilitySections(libraryId, capabilityId, sections, updatedByUserId)
 *     Manual admin entry for one capability, same as EnterpriseBlueprint's.
 *
 *   getLibraryEntry(libraryId) / listLibraryEntries()
 */

import CompanyResearchLibrary from '../models/CompanyResearchLibrary.js';
import { getCapabilities, getCapabilityBlueprint } from './strategyCanvasService.js';
import { researchCompanyForBlueprint } from './companyResearchService.js';
import { ensureVerticalKnowledge } from './industryVerticalKnowledgeService.js';

export function normalizeCompanyName(name) {
  return String(name || '').trim().toLowerCase();
}

// ── Shell creation ────────────────────────────────────────────────────────────

function buildEmptyCapabilities(industry) {
  const capabilities = getCapabilities();

  return capabilities.map(cap => {
    let sections = [];
    try {
      const blueprint = getCapabilityBlueprint(cap.id, industry);
      sections = (blueprint.sections || []).map(s => ({ title: s.title, content: '' }));
    } catch {
      // KB file missing for this capability — create capability with no sections
    }
    return { capabilityId: cap.id, capabilityName: cap.name, sections };
  });
}

export async function createLibraryEntry(companyName, industry = 'Automotive', createdByUserId, subVertical = '') {
  const companyNameNormalized = normalizeCompanyName(companyName);
  if (!companyNameNormalized) throw new Error('companyName is required.');

  const existing = await CompanyResearchLibrary.findOne({ companyNameNormalized }).lean();
  if (existing) throw new Error(`A library entry already exists for "${companyName}".`);

  const capabilities = buildEmptyCapabilities(industry);

  const doc = await CompanyResearchLibrary.create({
    companyName,
    companyNameNormalized,
    industry,
    subVertical,
    createdByUserId,
    capabilities,
    status: 'empty',
  });

  console.log(`[CompanyResearchLibrary] Entry created for "${companyName}" (${capabilities.length} capabilities)`);

  if (subVertical) {
    ensureVerticalKnowledge(industry, subVertical, createdByUserId)
      .catch(err => console.error(`[CompanyResearchLibrary] Vertical knowledge ensure failed for "${subVertical}" (non-fatal):`, err.message));
  }

  return doc;
}

/**
 * Tags an existing library entry with a sub-vertical (or changes it) after
 * creation. Fire-and-forget triggers the same ensureVerticalKnowledge side
 * effect as createLibraryEntry — safe to call repeatedly, idempotent.
 */
export async function setSubVertical(libraryId, subVertical) {
  const doc = await CompanyResearchLibrary.findById(libraryId);
  if (!doc) throw new Error('Library entry not found.');

  doc.subVertical = subVertical || '';
  await doc.save();

  if (doc.subVertical) {
    ensureVerticalKnowledge(doc.industry, doc.subVertical, doc.createdByUserId)
      .catch(err => console.error(`[CompanyResearchLibrary] Vertical knowledge ensure failed for "${doc.subVertical}" (non-fatal):`, err.message));
  }

  return doc;
}

// ── Research ──────────────────────────────────────────────────────────────────

export async function runResearch(libraryId) {
  const doc = await CompanyResearchLibrary.findById(libraryId);
  if (!doc) throw new Error('Library entry not found.');

  const sectionMeta = [];
  for (const cap of doc.capabilities) {
    let kbSections = [];
    try {
      kbSections = getCapabilityBlueprint(cap.capabilityId, doc.industry).sections || [];
    } catch {
      // KB file missing for this capability — research with title only.
    }
    for (const section of cap.sections) {
      const kb = kbSections.find(s => s.title === section.title);
      sectionMeta.push({ title: section.title, definition: kb?.definition || '' });
    }
  }
  if (sectionMeta.length === 0) return doc;

  const result = await researchCompanyForBlueprint({
    orgName:  doc.companyName,
    industry: doc.industry,
    sections: sectionMeta,
  });
  if (!result || result.sections.length === 0) {
    console.log(`[CompanyResearchLibrary] No research draft produced for "${doc.companyName}"`);
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
  console.log(`[CompanyResearchLibrary] Drafted ${result.sections.length} section(s) for "${doc.companyName}"`);
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
  if (!cap) throw new Error(`Capability "${capabilityId}" not found in library entry.`);
  const section = cap.sections.find(s => s.title === sectionTitle);
  if (!section) throw new Error(`Section "${sectionTitle}" not found in capability "${capabilityId}".`);
  return section;
}

export async function approveSection(libraryId, capabilityId, sectionTitle, updatedByUserId) {
  const doc = await CompanyResearchLibrary.findById(libraryId);
  if (!doc) throw new Error('Library entry not found.');

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

export async function discardDraftSection(libraryId, capabilityId, sectionTitle) {
  const doc = await CompanyResearchLibrary.findById(libraryId);
  if (!doc) throw new Error('Library entry not found.');

  const section = findSection(doc, capabilityId, sectionTitle);
  section.draftContent = '';
  section.draftSource  = '';
  section.draftedAt    = null;

  await doc.save();
  return doc;
}

// ── Manual admin entry ───────────────────────────────────────────────────────

export async function updateCapabilitySections(libraryId, capabilityId, sections, updatedByUserId) {
  const doc = await CompanyResearchLibrary.findById(libraryId);
  if (!doc) throw new Error('Library entry not found.');

  const cap = doc.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error(`Capability "${capabilityId}" not found in library entry.`);

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

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getLibraryEntry(libraryId) {
  return CompanyResearchLibrary.findById(libraryId).lean();
}

export async function listLibraryEntries() {
  return CompanyResearchLibrary.find({}, {
    companyName: 1, companyNameNormalized: 1, industry: 1, subVertical: 1, status: 1, createdAt: 1, capabilities: 1,
  }).sort({ createdAt: -1 }).lean();
}
