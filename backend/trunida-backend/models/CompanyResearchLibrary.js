/**
 * SoorgaAI — Company Research Library Model
 *
 * Shared, admin-curated repository of public company research — the
 * "Company Public Information" layer of the knowledge architecture. Keyed
 * by company name, NOT by org: one entry can be researched once by a
 * SoorgaAI platform admin and reused across any number of orgs whose name
 * matches, or prepared ahead of a sales conversation before a company ever
 * signs up.
 *
 * Distinct from EnterpriseBlueprint (per-org, CTO/Admin-writable, "Company
 * Private Information"). Approved sections here get copied into a matching
 * org's EnterpriseBlueprint at signup — see the library-lookup step in
 * enterpriseBlueprintService.js's ensureBlueprint(). Unapproved draftContent
 * never leaves this document.
 *
 * Access: every route in companyResearchLibraryRoutes.js is gated by
 * middleware/adminMiddleware.js's adminOnly — SoorgaAI platform admins only
 * (User.role === 'admin', a global field, distinct from the per-org
 * self-declared UserProfile.role === 'CTO').
 */

import mongoose from 'mongoose';

// ── Section ───────────────────────────────────────────────────────────────────

const librarySectionSchema = new mongoose.Schema({
  title:   { type: String, required: true },
  content: { type: String, default: '' },  // admin-approved — safe to copy to any matching org

  updatedAt: { type: Date },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
    default: null,
  },

  // Drafted by researchCompanyForBlueprint, awaiting admin review.
  draftContent: { type: String, default: '' },
  draftSource: {
    type: String,
    enum: ['', 'external-research', 'external-research-limited'],
    default: '',
  },
  draftedAt: { type: Date, default: null },
}, { _id: false });

// ── Capability map ────────────────────────────────────────────────────────────
// "Industry challenge → company capability" mapping — e.g. "Labour shortage
// -> Autonomous industrial vehicles". Cross-cutting: not tied to any one KB
// capability/section, unlike `capabilities` below. Powers the AI Opportunity
// Discovery staged-reasoning pipeline (blueprintGenerationService.js's
// runOpportunityDiscoveryStaged) — Stage 2 looks up this APPROVED list
// instead of re-inferring the connection from prose on every generation.

const capabilityMapEntrySchema = new mongoose.Schema({
  industryChallenge: { type: String, required: true },
  companyCapability: { type: String, required: true },
  mechanism:         { type: String, default: '' },  // how the capability addresses the challenge
}, { _id: false });

const capabilityMapSchema = new mongoose.Schema({
  content:      { type: [capabilityMapEntrySchema], default: [] },  // admin-approved
  draftContent: { type: [capabilityMapEntrySchema], default: [] },  // pending review

  draftSource: {
    type: String,
    enum: ['', 'external-research', 'external-research-limited'],
    default: '',
  },
  draftedAt: { type: Date, default: null },
  updatedAt: { type: Date },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
    default: null,
  },
}, { _id: false });

// ── Capability ────────────────────────────────────────────────────────────────

const libraryCapabilitySchema = new mongoose.Schema({
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },
  sections:       { type: [librarySectionSchema], default: [] },

  // Which domain KB folder this capability belongs to (e.g. 'AI_Strategy',
  // 'AI_Use_Cases') — see strategyCanvasService.js's LIBRARY_GROUNDED_DOMAINS.
  // Empty string on entries created before this field existed means
  // 'AI_Strategy' (the only domain that existed at the time) — every reader
  // of this field must apply that fallback explicitly.
  domainKbPath: { type: String, default: '' },
}, { _id: false });

// ── Library entry ────────────────────────────────────────────────────────────

const companyResearchLibrarySchema = new mongoose.Schema({
  companyName: {
    type:     String,
    required: true,
    trim:     true,
  },

  // trim + toLowerCase() + punctuation-strip of companyName (see
  // normalizeCompanyName in companyResearchLibraryService.js). No fuzzy/alias
  // resolution beyond that in v1; an admin can re-key an entry if a
  // customer's org name still doesn't normalize-match (e.g. "Corp" vs "Inc").
  companyNameNormalized: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
  },

  industry: { type: String, default: 'Automotive' },

  // Optional finer-grained tag within `industry` (e.g. "Autonomous Fleet
  // Operations" within "Automotive") — when set, generation for any matching
  // org also pulls in the corresponding IndustryVerticalKnowledge entry as
  // an additional grounding block. See companyResearchLibraryService.js's
  // setSubVertical/createLibraryEntry, which auto-draft that entry via
  // ensureVerticalKnowledge if it doesn't exist yet.
  subVertical: { type: String, default: '', trim: true },

  // 'empty'   — shell created, nothing drafted or approved yet
  // 'partial' — at least one section has approved content
  // 'complete'— all sections have approved content
  status: {
    type:    String,
    enum:    ['empty', 'partial', 'complete'],
    default: 'empty',
  },

  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
  },

  capabilities:  { type: [libraryCapabilitySchema], default: [] },
  capabilityMap: { type: capabilityMapSchema, default: () => ({}) },
}, { timestamps: true });

export default mongoose.model('CompanyResearchLibrary', companyResearchLibrarySchema);
