/**
 * SoorgaAI — Industry Vertical Knowledge Model
 *
 * Admin-curated reference material for an industry sub-vertical (e.g.
 * "Autonomous Fleet Operations" within the parent "Automotive" industry) —
 * fills the gap where Industry KB (knowledge_base/.../Automotive/*.md) is
 * written for traditional OEM/Tier-1 suppliers and doesn't fit companies
 * whose actual domain concerns differ meaningfully from that baseline.
 *
 * Keyed by (parentIndustry, subVertical), NOT by company — one vertical
 * entry can ground every company tagged with that sub-vertical in
 * CompanyResearchLibrary. Mirrors CompanyResearchLibrary's shape and
 * lifecycle exactly (shell -> research -> draftContent -> admin approves ->
 * content), just researching general vertical practices/terminology instead
 * of one company's specifics — see companyResearchService.js's
 * researchIndustryVertical.
 *
 * Access: every route in industryVerticalKnowledgeRoutes.js is gated by
 * middleware/adminMiddleware.js's adminOnly — SoorgaAI platform admins only.
 *
 * Consumed additively during generation via getVerticalContextForCapability/
 * preloadVerticalContextMap (industryVerticalKnowledgeService.js), joined in
 * through blueprintGenerationService.js's combineContexts(...) alongside the
 * Enterprise Blueprint and Connected Knowledge blocks — never replaces the
 * synchronous, filesystem-based Core/Industry KB read path
 * (strategyCanvasService.js's getCapabilityBlueprint, unchanged).
 */

import mongoose from 'mongoose';

// ── Section ───────────────────────────────────────────────────────────────────

const verticalSectionSchema = new mongoose.Schema({
  title:   { type: String, required: true },
  content: { type: String, default: '' },  // admin-approved — safe to inject into generation

  updatedAt: { type: Date },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
    default: null,
  },

  // Drafted by researchIndustryVertical, awaiting admin review.
  draftContent: { type: String, default: '' },
  draftSource: {
    type: String,
    enum: ['', 'external-research', 'external-research-limited'],
    default: '',
  },
  draftedAt: { type: Date, default: null },
}, { _id: false });

// ── Capability ────────────────────────────────────────────────────────────────

const verticalCapabilitySchema = new mongoose.Schema({
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },
  sections:       { type: [verticalSectionSchema], default: [] },
}, { _id: false });

// ── Vertical entry ────────────────────────────────────────────────────────────

const industryVerticalKnowledgeSchema = new mongoose.Schema({
  parentIndustry: {
    type:     String,
    required: true,
    trim:     true,
  },

  subVertical: {
    type:     String,
    required: true,
    trim:     true,
  },

  // trim + toLowerCase() of `${parentIndustry}::${subVertical}` — exact-
  // normalized matching only, same convention as CompanyResearchLibrary's
  // companyNameNormalized. No fuzzy matching in v1.
  keyNormalized: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
  },

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

  capabilities: { type: [verticalCapabilitySchema], default: [] },
}, { timestamps: true });

export default mongoose.model('IndustryVerticalKnowledge', industryVerticalKnowledgeSchema);
