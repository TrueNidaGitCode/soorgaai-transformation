/**
 * SoorgaAI — Enterprise Blueprint Service
 *
 * Manages the company-level proprietary AI strategy document.
 *
 * Public API:
 *   ensureBlueprint({ orgName, industry, createdByUserId })
 *     Idempotent — creates an empty blueprint shell for the org if one doesn't
 *     already exist. Called once per org on first profile setup. If the org's
 *     name matches an admin-approved CompanyResearchLibrary entry, its
 *     approved content is copied straight in (contentSource: 'company-library').
 *     If NO library entry exists yet for this company, one is auto-created and
 *     web-search research fires immediately (companyResearchLibraryService) —
 *     but strictly as a draft; nothing reaches this or any other org's
 *     EnterpriseBlueprint until a SoorgaAI platform admin reviews and approves
 *     it. The triggering org gets no special preview of its own unapproved
 *     research — same admin-gated path as everyone else.
 *
 *   getBlueprint(orgName)
 *     Returns the full EnterpriseBlueprint document or null.
 *
 *   updateCapabilitySections(orgName, capabilityId, sections, updatedByUserId)
 *     Stage 2 — CTO/Admin writes section content for a single capability
 *     (contentSource: 'cto-manual'). Recomputes overall status after update.
 *
 *   getEnterpriseContextForAdvisor(userId, capabilityId)
 *     Stage 3 — Returns a formatted context string for the matching capability's
 *     sections that have non-empty content, or null if none.
 */

import EnterpriseBlueprint from '../models/EnterpriseBlueprint.js';
import UserProfile          from '../models/UserProfile.js';
import { LIBRARY_GROUNDED_DOMAINS, getDomainCapabilities, getDomainCapabilityBlueprint } from './strategyCanvasService.js';
import CompanyResearchLibrary from '../models/CompanyResearchLibrary.js';
import { normalizeCompanyName, createLibraryEntry, runResearch } from './companyResearchLibraryService.js';

// ── Stage 1: Blueprint shell creation ─────────────────────────────────────────

/**
 * Build an empty capabilities array from the current KB framework, covering
 * every domain in LIBRARY_GROUNDED_DOMAINS (currently AI_Strategy +
 * AI_Use_Cases) — must match CompanyResearchLibrary's shell shape exactly,
 * or applyLibraryMatch's capabilityId matching below silently finds nothing
 * to copy for whichever domain is missing from one side.
 */
function buildEmptyCapabilities(industry) {
  const capabilities = [];
  for (const kbPath of LIBRARY_GROUNDED_DOMAINS) {
    for (const cap of getDomainCapabilities(kbPath)) {
      let sections = [];
      try {
        const blueprint = getDomainCapabilityBlueprint(cap.id, kbPath, industry);
        sections = (blueprint.sections || []).map(s => ({
          title:   s.title,
          content: '',
        }));
      } catch {
        // KB file missing for this capability — create capability with no sections
      }
      capabilities.push({
        capabilityId:   cap.id,
        capabilityName: cap.name,
        sections,
        domainKbPath:   kbPath,
      });
    }
  }
  return capabilities;
}

/**
 * Looks up CompanyResearchLibrary for a matching (normalized) company name and
 * copies its APPROVED content (never draftContent — unapproved research must
 * never reach a customer) onto the shell's sections by title. Mutates
 * `capabilities` in place; non-fatal on any lookup error.
 *
 * If no entry exists yet for this company, creates one and immediately fires
 * research (still lands in draftContent, pending admin review — see
 * companyResearchLibraryService.js) so the company is ready for an admin to
 * approve as soon as possible, rather than sitting unresearched until someone
 * notices it in the admin library list.
 */
async function applyLibraryMatch(capabilities, orgName, industry, createdByUserId) {
  try {
    const companyNameNormalized = normalizeCompanyName(orgName);
    if (!companyNameNormalized) return;

    // Scoped by industry too, not just name — prevents two different real
    // companies that happen to share a name across industries from having
    // one's library content silently copied into the other's blueprint.
    const entry = await CompanyResearchLibrary.findOne({ companyNameNormalized, industry }).lean();

    if (!entry) {
      try {
        const created = await createLibraryEntry(orgName, createdByUserId, '', industry);
        await runResearch(created._id);
        console.log(`[EnterpriseBlueprint] Auto-created and researched company library entry for "${orgName}" — pending admin approval.`);
      } catch (err) {
        console.error(`[EnterpriseBlueprint] Auto-create library entry failed for "${orgName}" (non-fatal):`, err.message);
      }
      return;
    }

    const now = new Date();
    let copied = 0;
    for (const cap of capabilities) {
      const libCap = entry.capabilities.find(c => c.capabilityId === cap.capabilityId);
      if (!libCap) continue;
      for (const section of cap.sections) {
        const libSection = libCap.sections.find(s => s.title === section.title);
        if (!libSection?.content?.trim()) continue;
        section.content       = libSection.content;
        section.contentSource = 'company-library';
        section.updatedAt     = now;
        copied++;
      }
    }
    if (copied > 0) {
      console.log(`[EnterpriseBlueprint] Copied ${copied} approved section(s) from company library match "${entry.companyName}" for org: "${orgName}"`);
    }
  } catch (err) {
    console.error(`[EnterpriseBlueprint] Library lookup failed for org "${orgName}" (non-fatal):`, err.message);
  }
}

export async function ensureBlueprint({ orgName, industry = 'Automotive', createdByUserId }) {
  const existing = await EnterpriseBlueprint.findOne({ orgName }).lean();
  if (existing) return { created: false };

  const capabilities = buildEmptyCapabilities(industry);
  await applyLibraryMatch(capabilities, orgName, industry, createdByUserId);

  const doc = await EnterpriseBlueprint.create({
    orgName,
    industry,
    createdByUserId,
    capabilities,
    status: 'empty',
  });
  doc.status = computeStatus(doc.capabilities);
  if (doc.isModified('status')) await doc.save();

  console.log(`[EnterpriseBlueprint] Shell created for org: "${orgName}" (${capabilities.length} capabilities)`);
  return { created: true };
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
 * `sections` must be an array of { title, content } objects. Always tags
 * written sections `contentSource: 'cto-manual'` — this is the org's own
 * CTO/Admin typing directly, as distinct from a company-library match.
 */
export async function updateCapabilitySections(orgName, capabilityId, sections, updatedByUserId) {
  const doc = await EnterpriseBlueprint.findOne({ orgName });
  if (!doc) throw new Error(`Enterprise blueprint not found for org: ${orgName}`);

  const cap = doc.capabilities.find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error(`Capability "${capabilityId}" not found in enterprise blueprint for org: ${orgName}`);

  const now = new Date();
  cap.sections = sections.map(s => ({
    title:         s.title,
    content:       typeof s.content === 'string' ? s.content.trim() : '',
    updatedAt:     now,
    updatedBy:     updatedByUserId || null,
    contentSource: 'cto-manual',
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

/**
 * Fetches the enterprise blueprint once and returns a Map<capabilityId, contextString>.
 * Use before a multi-capability generation loop to avoid one DB query per capability.
 * Returns an empty Map when there is no blueprint or orgName is blank.
 */
export async function preloadEnterpriseContextMap(orgName) {
  if (!orgName) return new Map();

  const blueprint = await EnterpriseBlueprint.findOne({ orgName }).lean().catch(() => null);
  if (!blueprint) return new Map();

  const map = new Map();
  for (const cap of blueprint.capabilities) {
    const filledSections = cap.sections.filter(s => s.content && s.content.trim().length > 0);
    if (filledSections.length === 0) continue;

    const sectionBlock = filledSections
      .map(s => `[${s.title}]\n${s.content.trim()}`)
      .join('\n\n');

    map.set(cap.capabilityId, [
      `=== ENTERPRISE BLUEPRINT — ${orgName} ===`,
      `[CONFIDENTIAL — Authoritative strategic grounding for this organisation. Ground all generated content in this direction. Do not quote verbatim.]`,
      `Capability: ${cap.capabilityName}`,
      '',
      sectionBlock,
      `=== END ENTERPRISE BLUEPRINT ===`,
    ].join('\n'));
  }
  return map;
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
