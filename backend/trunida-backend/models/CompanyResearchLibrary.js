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

// ── Capability ────────────────────────────────────────────────────────────────

const libraryCapabilitySchema = new mongoose.Schema({
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },
  sections:       { type: [librarySectionSchema], default: [] },
}, { _id: false });

// ── Library entry ────────────────────────────────────────────────────────────

const companyResearchLibrarySchema = new mongoose.Schema({
  companyName: {
    type:     String,
    required: true,
    trim:     true,
  },

  // trim + toLowerCase() of companyName — exact-normalized matching only.
  // No fuzzy/alias resolution in v1; an admin can re-key an entry if a
  // customer's org name doesn't normalize-match.
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

  capabilities: { type: [libraryCapabilitySchema], default: [] },
}, { timestamps: true });

export default mongoose.model('CompanyResearchLibrary', companyResearchLibrarySchema);
