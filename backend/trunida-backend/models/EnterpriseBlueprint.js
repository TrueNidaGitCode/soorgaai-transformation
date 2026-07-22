/**
 * SoorgaAI — Enterprise Blueprint Model
 *
 * Company-level, proprietary AI strategy document. One document per organisation
 * (keyed by orgName). Distinct from CompanyBlueprint, which is a per-user,
 * per-session workspace document generated on demand.
 *
 * Lifecycle:
 *   Stage 1 — Empty shell auto-created on first profile setup for the org.
 *              Capabilities and section titles mirror the KB framework; all
 *              section content fields start as empty strings. If the org's
 *              name matches an admin-approved entry in CompanyResearchLibrary
 *              (models/CompanyResearchLibrary.js), that library's approved
 *              section content is copied straight into `content` here,
 *              tagged `contentSource: 'company-library'` — see the
 *              library-lookup step in ensureBlueprint (enterpriseBlueprintService.js).
 *              Raw/unapproved research never lives on this per-org document —
 *              it's drafted and reviewed centrally in the library, by
 *              SoorgaAI platform admins, before it can reach any org.
 *   Stage 2 — CTO/Admin role fills remaining empty section content via PATCH
 *              API, tagged `contentSource: 'cto-manual'`.
 *   Stage 3 — advisorService injects non-empty sections as P0 context for every
 *              recommendation query issued by any user in the same organisation.
 *
 * CONFIDENTIALITY: This document is proprietary company-owned intellectual
 * property. No field value must be logged, cached, or transmitted outside
 * the recommendation pipeline without an explicit authorisation check.
 */

import mongoose from 'mongoose';

// ── Section ───────────────────────────────────────────────────────────────────

const enterpriseSectionSchema = new mongoose.Schema({
  title:   { type: String, required: true },
  content: { type: String, default: '' },

  updatedAt: { type: Date },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
    default: null,
  },

  // Provenance only, no workflow attached at this level — set to
  // 'company-library' when copied in from an approved CompanyResearchLibrary
  // match, or 'cto-manual' when the org's own CTO/Admin typed it directly.
  contentSource: {
    type: String,
    enum: ['', 'cto-manual', 'company-library'],
    default: '',
  },
}, { _id: false });

// ── Capability ────────────────────────────────────────────────────────────────

const enterpriseCapabilitySchema = new mongoose.Schema({
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },
  sections:       { type: [enterpriseSectionSchema], default: [] },
}, { _id: false });

// ── Blueprint document ────────────────────────────────────────────────────────

const enterpriseBlueprintSchema = new mongoose.Schema({
  orgName: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true,
  },

  industry: { type: String, default: 'Automotive' },

  // Always true — guards against accidental exposure in logs or API responses
  confidential: { type: Boolean, default: true },

  // 'empty'   — shell created, no content yet
  // 'partial' — at least one section has content
  // 'complete'— all sections have content
  status: {
    type:    String,
    enum:    ['empty', 'partial', 'complete'],
    default: 'empty',
  },

  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
  },

  capabilities: { type: [enterpriseCapabilitySchema], default: [] },
}, { timestamps: true });

export default mongoose.model('EnterpriseBlueprint', enterpriseBlueprintSchema);
