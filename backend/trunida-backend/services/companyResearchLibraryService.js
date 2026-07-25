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
 *   createLibraryEntry(companyName, createdByUserId, subVertical, industry?)
 *     Creates an empty shell for a company. Throws if one already exists for
 *     the normalized name. `industry` is optional — when omitted (the admin
 *     "Add Company" flow), it's auto-detected from the company name via
 *     companyResearchService.js's detectCompanyIndustry, falling back to
 *     'Automotive' only if detection fails. Always fires
 *     industryCapabilityKnowledgeService.js's ensureIndustryCoverage in the
 *     background, which generates a full Industry KB overlay if this is the
 *     first company in a new industry (skipped if one already exists). If
 *     subVertical is provided, also ensures a matching IndustryVerticalKnowledge
 *     entry exists (auto-drafts one via research if it doesn't) — see
 *     industryVerticalKnowledgeService.js.
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
 *   approveCapabilityMap / discardCapabilityMapDraft(libraryId, ...)
 *     Whole-set admin review for the "industry challenge -> company
 *     capability" map (not row-by-row) — see runResearch, which also drafts
 *     this alongside sections.
 *
 *   getApprovedCapabilityMap(companyNameNormalized)
 *     Read-only, used by blueprintGenerationService.js's AI Opportunity
 *     Discovery staged pipeline. Returns [] if none approved yet.
 *
 *   getLibraryEntry(libraryId) / listLibraryEntries()
 */

import CompanyResearchLibrary from '../models/CompanyResearchLibrary.js';
import { LIBRARY_GROUNDED_DOMAINS, getDomainCapabilities, getDomainCapabilityBlueprint } from './strategyCanvasService.js';
import { researchCompanyForBlueprint, researchCapabilityMap, detectCompanyIndustry } from './companyResearchService.js';
import { ensureVerticalKnowledge } from './industryVerticalKnowledgeService.js';
import { ensureIndustryCoverage, listKnownIndustries, resolveIndustry } from './industryCapabilityKnowledgeService.js';

export function normalizeCompanyName(name) {
  return String(name || '').trim().toLowerCase();
}

// ── Shell creation ────────────────────────────────────────────────────────────

// Loops over every domain in LIBRARY_GROUNDED_DOMAINS (currently AI_Strategy
// + AI_Use_Cases) so a new entry gets every covered domain's capabilities
// from the start, each tagged with the domain it came from.
function buildEmptyCapabilities(industry) {
  const capabilities = [];
  for (const kbPath of LIBRARY_GROUNDED_DOMAINS) {
    for (const cap of getDomainCapabilities(kbPath)) {
      let sections = [];
      try {
        const blueprint = getDomainCapabilityBlueprint(cap.id, kbPath, industry);
        sections = (blueprint.sections || []).map(s => ({ title: s.title, content: '' }));
      } catch {
        // KB file missing for this capability — create capability with no sections
      }
      capabilities.push({ capabilityId: cap.id, capabilityName: cap.name, sections, domainKbPath: kbPath });
    }
  }
  return capabilities;
}

// Additive-only: adds any (domain, capability) pair from LIBRARY_GROUNDED_DOMAINS
// that isn't already present in doc.capabilities — never touches or reorders
// existing entries. Lets an entry created before a new domain was added catch
// up without disturbing already-drafted/approved/reviewed content.
function syncMissingCapabilities(doc, industry) {
  const existingIds = new Set(doc.capabilities.map(c => c.capabilityId));
  let added = 0;
  for (const kbPath of LIBRARY_GROUNDED_DOMAINS) {
    for (const cap of getDomainCapabilities(kbPath)) {
      if (existingIds.has(cap.id)) continue;
      let sections = [];
      try {
        const blueprint = getDomainCapabilityBlueprint(cap.id, kbPath, industry);
        sections = (blueprint.sections || []).map(s => ({ title: s.title, content: '' }));
      } catch {
        // KB file missing for this capability — add it with no sections
      }
      doc.capabilities.push({ capabilityId: cap.id, capabilityName: cap.name, sections, domainKbPath: kbPath });
      added++;
    }
  }
  return added;
}

// `industry` is optional and internal-only — the admin "Add Company" flow
// never supplies it (industry is auto-detected from just the company name
// below); enterpriseBlueprintService.js's applyLibraryMatch DOES pass it
// explicitly, since a live customer's industry is already known from their
// own profile and re-detecting it via web search would be redundant and
// could disagree with what the customer already selected.
export async function createLibraryEntry(companyName, createdByUserId, subVertical = '', industry = null) {
  const companyNameNormalized = normalizeCompanyName(companyName);
  if (!companyNameNormalized) throw new Error('companyName is required.');

  const existing = await CompanyResearchLibrary.findOne({ companyNameNormalized }).lean();
  if (existing) throw new Error(`A library entry already exists for "${companyName}".`);

  let resolvedIndustry = industry;
  if (!resolvedIndustry) {
    // Shown to the model so it reuses an existing label instead of a
    // near-duplicate phrasing of the same industry (see resolveIndustry).
    const knownIndustries = await listKnownIndustries().catch(() => []);
    const detected = await detectCompanyIndustry({ companyName, knownIndustries }).catch(() => null);
    const rawIndustry = detected?.industry || 'Automotive';

    // Deterministic backstop in case the model still drifts — e.g. detects
    // "Semiconductor" when "Semiconductors" already has KB coverage.
    resolvedIndustry = await resolveIndustry(rawIndustry).catch(() => rawIndustry);

    const dedupedNote = resolvedIndustry !== rawIndustry ? ` — deduped to existing "${resolvedIndustry}"` : '';
    console.log(`[CompanyResearchLibrary] Industry ${detected ? `detected as "${rawIndustry}"${dedupedNote} (${detected.confidence} confidence)` : `could not be detected, defaulting to "${resolvedIndustry}"`} for "${companyName}"`);
  }

  const capabilities = buildEmptyCapabilities(resolvedIndustry);

  const doc = await CompanyResearchLibrary.create({
    companyName,
    companyNameNormalized,
    industry: resolvedIndustry,
    subVertical,
    createdByUserId,
    capabilities,
    status: 'empty',
  });

  console.log(`[CompanyResearchLibrary] Entry created for "${companyName}" (${capabilities.length} capabilities, industry: ${resolvedIndustry})`);

  // Non-blocking: checks whether this industry already has KB coverage and,
  // if not, generates it in the background (admin reviews/approves later —
  // see industryCapabilityKnowledgeService.js). Never blocks company creation.
  ensureIndustryCoverage(resolvedIndustry, createdByUserId)
    .catch(err => console.error(`[CompanyResearchLibrary] Industry coverage ensure failed for "${resolvedIndustry}" (non-fatal):`, err.message));

  if (subVertical) {
    ensureVerticalKnowledge(resolvedIndustry, subVertical, createdByUserId)
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

  // Catch this entry up on any domain added to LIBRARY_GROUNDED_DOMAINS since
  // it was created — additive only, never touches existing capabilities.
  const added = syncMissingCapabilities(doc, doc.industry);
  if (added > 0) {
    await doc.save();
    console.log(`[CompanyResearchLibrary] Synced ${added} missing capability/ies for "${doc.companyName}"`);
  }

  // Only research sections that are genuinely empty — never overwrite a
  // section that already has approved content or a pending draft, so
  // re-running research to pick up a newly-synced domain doesn't clobber
  // work already reviewed/edited on the existing sections.
  const sectionMeta = [];
  for (const cap of doc.capabilities) {
    const kbPath = cap.domainKbPath || 'AI_Strategy';
    let kbSections = [];
    try {
      kbSections = getDomainCapabilityBlueprint(cap.capabilityId, kbPath, doc.industry).sections || [];
    } catch {
      // KB file missing for this capability — research with title only.
    }
    for (const section of cap.sections) {
      if (section.content || section.draftContent) continue; // already handled
      const kb = kbSections.find(s => s.title === section.title);
      sectionMeta.push({ title: section.title, definition: kb?.definition || '' });
    }
  }

  const needsCapabilityMap = !doc.capabilityMap?.content?.length && !doc.capabilityMap?.draftContent?.length;
  if (sectionMeta.length === 0 && !needsCapabilityMap) return doc;

  const [sectionResult, mapResult] = await Promise.all([
    sectionMeta.length > 0
      ? researchCompanyForBlueprint({ orgName: doc.companyName, industry: doc.industry, sections: sectionMeta })
      : Promise.resolve(null),
    // Only research the capability map if nothing's there yet — never
    // overwrite an approved map or a pending draft the admin hasn't reviewed.
    needsCapabilityMap
      ? researchCapabilityMap({ orgName: doc.companyName, industry: doc.industry, subVertical: doc.subVertical })
      : Promise.resolve(null),
  ]);

  const now = new Date();
  let sectionsDrafted = 0;

  if (sectionResult?.sections?.length) {
    const byTitle = new Map(sectionResult.sections.map(s => [s.title, s]));
    for (const cap of doc.capabilities) {
      for (const section of cap.sections) {
        const drafted = byTitle.get(section.title);
        if (!drafted) continue;
        section.draftContent = drafted.content;
        section.draftSource  = drafted.confidence === 'high' ? 'external-research' : 'external-research-limited';
        section.draftedAt    = now;
        sectionsDrafted++;
      }
    }
  }

  if (mapResult?.mappings?.length) {
    const hasLow = mapResult.mappings.some(m => m.confidence === 'low');
    doc.capabilityMap.draftContent = mapResult.mappings.map(({ confidence, ...rest }) => rest);
    doc.capabilityMap.draftSource  = hasLow ? 'external-research-limited' : 'external-research';
    doc.capabilityMap.draftedAt    = now;
  }

  if (sectionsDrafted === 0 && !mapResult?.mappings?.length) {
    console.log(`[CompanyResearchLibrary] No research draft produced for "${doc.companyName}"`);
    return doc;
  }

  await doc.save();
  console.log(`[CompanyResearchLibrary] Drafted ${sectionsDrafted} section(s)${mapResult?.mappings?.length ? ` + ${mapResult.mappings.length} capability-map row(s)` : ''} for "${doc.companyName}"`);
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

// ── Capability map review — approve or discard the whole set ──────────────────
// Whole-set, not row-by-row — a v1 simplification; individual rows can be
// edited before approving by discarding and re-running research if needed.

export async function approveCapabilityMap(libraryId, updatedByUserId) {
  const doc = await CompanyResearchLibrary.findById(libraryId);
  if (!doc) throw new Error('Library entry not found.');
  if (!doc.capabilityMap?.draftContent?.length) throw new Error('Capability map has no pending draft.');

  doc.capabilityMap.content      = doc.capabilityMap.draftContent;
  doc.capabilityMap.updatedAt    = new Date();
  doc.capabilityMap.updatedBy    = updatedByUserId || null;
  doc.capabilityMap.draftContent = [];
  doc.capabilityMap.draftSource  = '';
  doc.capabilityMap.draftedAt    = null;

  await doc.save();
  return doc;
}

export async function discardCapabilityMapDraft(libraryId) {
  const doc = await CompanyResearchLibrary.findById(libraryId);
  if (!doc) throw new Error('Library entry not found.');

  doc.capabilityMap.draftContent = [];
  doc.capabilityMap.draftSource  = '';
  doc.capabilityMap.draftedAt    = null;

  await doc.save();
  return doc;
}

/**
 * Returns the APPROVED capability map for a company (by normalized name), or
 * [] if none exists/none approved yet. Used by blueprintGenerationService.js's
 * AI Opportunity Discovery staged pipeline — never returns unapproved drafts.
 */
export async function getApprovedCapabilityMap(companyNameNormalized) {
  if (!companyNameNormalized) return [];
  const doc = await CompanyResearchLibrary.findOne({ companyNameNormalized })
    .select('capabilityMap.content').lean().catch(() => null);
  return doc?.capabilityMap?.content || [];
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

/**
 * Enriches each capability/section with its KB reference text, computed live
 * from the current markdown files (never stored — always reflects whatever
 * the KB says right now). Core content is written per-section
 * (`kbCoreDefinition`); the Automotive/Industry overlay is written once for
 * the whole capability, not per-section (`kbAutomotiveContext`) — the two KB
 * layers aren't structured symmetrically, so this doesn't force them to be.
 */
function attachKbReference(doc) {
  for (const cap of doc.capabilities) {
    const kbPath = cap.domainKbPath || 'AI_Strategy';
    try {
      const blueprint = getDomainCapabilityBlueprint(cap.capabilityId, kbPath, doc.industry);
      cap.kbAutomotiveContext = blueprint.automotiveBlueprint || '';
      for (const section of cap.sections) {
        const kbSection = (blueprint.sections || []).find(s => s.title === section.title);
        section.kbCoreDefinition = kbSection?.definition || '';
      }
    } catch {
      cap.kbAutomotiveContext = '';
      for (const section of cap.sections) section.kbCoreDefinition = '';
    }
  }
  return doc;
}

export async function getLibraryEntry(libraryId) {
  const doc = await CompanyResearchLibrary.findById(libraryId).lean();
  if (!doc) return null;
  return attachKbReference(doc);
}

export async function listLibraryEntries() {
  return CompanyResearchLibrary.find({}, {
    companyName: 1, companyNameNormalized: 1, industry: 1, subVertical: 1, status: 1, createdAt: 1, capabilities: 1,
  }).sort({ createdAt: -1 }).lean();
}
