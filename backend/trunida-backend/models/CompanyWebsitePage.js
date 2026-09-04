/**
 * Svarg — Company Website Page
 *
 * A page from the company's own public site, captured at profile setup.
 *
 * Deliberately NOT a LinkedProjectDocument. Those are project documents and
 * require a blueprintId, which is the right invariant for them — but a
 * company website is company-level: it is captured before any blueprint
 * exists, and it grounds every blueprint the company ever creates. Forcing
 * it into a blueprint-scoped collection would mean either weakening that
 * invariant or re-importing the same site per project.
 *
 * This is the answer to "who are we", which is what Company Context needs.
 * It is not operational data, and does not make a company data-ready.
 */

import mongoose from 'mongoose';

const companyWebsitePageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  url:   { type: String, required: true },
  title: { type: String, default: '' },

  summary:  { type: String, default: '' },
  keywords: { type: [String], default: [] },
  rawText:  { type: String, default: '' },

  // Skips re-classifying a page whose content has not changed — one LLM
  // call per page is the expensive part of importing a site.
  contentHash: { type: String, default: '' },

  // Public pages are not automatically safe: team and contact pages
  // routinely carry personal data, so they take the same redaction path as
  // every other source.
  redactionApplied: { type: Boolean, default: false },
  redactionCount:   { type: Number,  default: 0 },
  redactionNotes:   { type: [String], default: [] },

  extractionStatus: { type: String, enum: ['pending', 'extracted', 'error'], default: 'pending' },
  extractionError:  { type: String, default: '' },
}, { timestamps: true });

// One row per page per user; re-importing a site updates rather than duplicates.
companyWebsitePageSchema.index({ userId: 1, url: 1 }, { unique: true });

export default mongoose.model('CompanyWebsitePage', companyWebsitePageSchema);
