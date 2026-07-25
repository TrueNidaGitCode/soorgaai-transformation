/**
 * SoorgaAI — Industry Capability Knowledge Model
 *
 * Auto-generated Industry-overlay KB coverage for an industry that has no
 * hand-authored Automotive/{Capability}.md-style files yet (e.g. a company
 * named "Micron" gets detected as "Semiconductor", which has none). One
 * document per industry, covering every capability in every domain
 * (config/domainRegistry.js's DOMAINS x strategyCanvasService.js's
 * getDomainCapabilities per domain) — NOT one document per capability.
 *
 * Deliberately does NOT mirror CompanyResearchLibrary/IndustryVerticalKnowledge's
 * sections[] shape: those hold several short per-section snippets, but each
 * capability here holds ONE whole generated markdown document (the same role
 * a hand-authored Automotive_{Capability}.md file plays), assembled from
 * companyResearchService.js's researchIndustryCapability output.
 *
 * Lifecycle per capability: pending -> draft (admin review) -> published
 * (approved content written out to the real .md file path under
 * knowledge_base/, so getDomainCapabilityBlueprint() reads it with zero
 * further code changes — see industryCapabilityKnowledgeService.js).
 * `content` is kept here too even after publish, so the DB remains the
 * durable source of truth if the file ever needs to be rewritten.
 *
 * `status` on the top-level document reaching 'ready' (every capability
 * published) is what industryCapabilityKnowledgeService.js's
 * ensureIndustryCoverage() checks to decide "this industry already has
 * coverage, skip generation" for the next company added in it.
 *
 * Access: every route in industryCapabilityKnowledgeRoutes.js is gated by
 * middleware/adminMiddleware.js's adminOnly — SoorgaAI platform admins only.
 */

import mongoose from 'mongoose';

const industryCapabilitySchema = new mongoose.Schema({
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },
  domainKbPath:   { type: String, required: true },

  // 'pending'   — queued, not yet attempted
  // 'draft'     — generated, awaiting admin review
  // 'published' — admin-approved and written to the real .md file path
  // 'failed'    — generation attempt failed (non-fatal to the rest; may retry)
  status: {
    type:    String,
    enum:    ['pending', 'draft', 'published', 'failed'],
    default: 'pending',
  },

  content: { type: String, default: '' }, // approved+published full markdown

  draftContent: { type: String, default: '' },
  draftSource: {
    type: String,
    enum: ['', 'external-research', 'external-research-limited'],
    default: '',
  },
  draftedAt: { type: Date, default: null },

  publishedAt:   { type: Date, default: null },
  publishedPath: { type: String, default: '' }, // absolute path written, for admin visibility/debugging
  error:         { type: String, default: '' }, // last generation failure message, if any

  updatedAt: { type: Date },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
    default: null,
  },
}, { _id: false });

const industryCapabilityKnowledgeSchema = new mongoose.Schema({
  industry: {
    type:     String,
    required: true,
    trim:     true,
  },

  // trim().toLowerCase() of `industry` — exact-normalized matching only,
  // same convention as CompanyResearchLibrary's companyNameNormalized.
  industryNormalized: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
  },

  // 'pending'    — shell created, generation not started yet
  // 'generating' — generation job in progress
  // 'partial'    — generation finished; some/all capabilities are drafts awaiting review
  // 'ready'      — every capability published — the actual "coverage exists" signal
  // 'error'      — generation finished with every capability failed
  status: {
    type:    String,
    enum:    ['pending', 'generating', 'partial', 'ready', 'error'],
    default: 'pending',
  },

  progress: {
    total:             { type: Number, default: 0 },
    completed:         { type: Number, default: 0 },
    currentCapability: { type: String, default: '' },
  },

  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
  },

  capabilities: { type: [industryCapabilitySchema], default: [] },
}, { timestamps: true });

export default mongoose.model('IndustryCapabilityKnowledge', industryCapabilityKnowledgeSchema);
