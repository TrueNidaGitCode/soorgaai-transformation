/**
 * SoorgaAI — Blueprint Generation & Display Configuration
 *
 * Single source of truth for what gets generated per blueprint and which
 * view the product ships. Change these values — no other code needs to change.
 *
 * To toggle views:
 *   1. Update activeView + generate flags here
 *   2. Update BLUEPRINT_VIEW_MODE in frontend/domain/blueprintWorkspace.js
 *
 * ── Views ──────────────────────────────────────────────────────────────────
 *
 *   'essay'  Long-form strategic analysis per section   (section.content)
 *            Audience: Strategists, consultants
 *            Requires: generate.essay = true
 *
 *   'pm'     Structured 4-cell Strategy Brief cards     (section.brief)
 *            Audience: Product managers, delivery leads
 *            Requires: generate.brief = true (always on)
 *
 *   'cto'    Presentation-style with section templates  (section.brief + extras)
 *            Audience: CTOs, engineering VPs
 *            Requires: generate.brief = true + generate.ctoExtras = true
 *
 * ── Generation flags ───────────────────────────────────────────────────────
 *
 *   essay     — Generates section.content (long-form prose ~600 words/section)
 *               When true: essay is generated first, brief is extracted from it
 *               When false: brief is generated directly (current behaviour)
 *               Cost impact: ~3× token usage, ~45s extra per capability
 *
 *   brief     — Generates section.brief (4 structured fields)
 *               Always true — PM and CTO views both depend on it
 *
 *   ctoExtras — Generates template-specific extras (e.g. strategicPillars for Vision)
 *               Stored on section.brief alongside standard fields
 *               Cost impact: minimal — injected into the existing brief call
 */

export const BLUEPRINT_CONFIG = {
  activeView: 'cto',          // 'essay' | 'pm' | 'cto'

  generate: {
    essay:     false,         // off — brief generated directly, essay pipeline dormant
    brief:     true,          // always on
    ctoExtras: true,          // on — Vision gets strategicPillars, future templates follow
  },
};
