/**
 * SoorgaAI — Enterprise Blueprint Controller
 *
 * CONFIDENTIALITY: The Enterprise Blueprint is proprietary company-owned IP.
 *
 *   Raw content (section text) is restricted to CTO/Admin users only.
 *   All other users benefit from the blueprint silently through the advisor
 *   (Stage 3 context injection) — they never see the raw document.
 *
 * GET  /api/enterprise-blueprint
 *   Returns full blueprint content. CTO/Admin only.
 *
 * GET  /api/enterprise-blueprint/status
 *   Returns fill counts per capability — no content. All org users.
 *
 * PATCH /api/enterprise-blueprint/capability/:capabilityId
 *   Overwrites sections for one capability. CTO/Admin only.
 *
 * Company Public Information (external research) is no longer reviewed at
 * this level — it's admin-curated centrally in CompanyResearchLibrary and
 * copied in, already-approved, at signup. See companyResearchLibraryController.js.
 */

import UserProfile from '../models/UserProfile.js';
import {
  getBlueprint,
  updateCapabilitySections,
} from '../services/enterpriseBlueprintService.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

async function resolveOrg(userId) {
  const profile = await UserProfile.findOne({ userId }).lean();
  if (!profile?.orgName) return null;
  return profile;
}

function canAccessContent(jwtRole, profileRole) {
  return jwtRole === 'admin' || profileRole === 'CTO';
}

function auditLog(action, userId, orgName, extra = {}) {
  console.log(JSON.stringify({
    audit:  'EnterpriseBlueprint',
    action,
    userId: String(userId),
    orgName,
    ts:     new Date().toISOString(),
    ...extra,
  }));
}

// ── GET /api/enterprise-blueprint ────────────────────────────────────────────
// Restricted to CTO/Admin — raw section content is proprietary.

export async function getBlueprintForMyOrg(req, res) {
  try {
    const profile = await resolveOrg(req.user._id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Complete profile setup first.' });
    }

    if (!canAccessContent(req.user.role, profile.role)) {
      return res.status(403).json({
        error: 'Access denied. Enterprise blueprint content is restricted to CTO and admin users.',
      });
    }

    const blueprint = await getBlueprint(profile.orgName);
    if (!blueprint) {
      return res.status(404).json({ error: 'Enterprise blueprint not yet initialised for your organisation.' });
    }

    auditLog('READ', req.user._id, profile.orgName);
    return res.json({ blueprint });
  } catch (err) {
    console.error('[EnterpriseBlueprint] GET error:', err);
    return res.status(500).json({ error: 'Failed to retrieve enterprise blueprint.' });
  }
}

// ── GET /api/enterprise-blueprint/status ─────────────────────────────────────

export async function getBlueprintStatus(req, res) {
  try {
    const profile = await resolveOrg(req.user._id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    const blueprint = await getBlueprint(profile.orgName);
    if (!blueprint) {
      return res.status(404).json({ error: 'Enterprise blueprint not yet initialised.' });
    }

    const summary = blueprint.capabilities.map(cap => {
      const total  = cap.sections.length;
      const filled = cap.sections.filter(s => s.content && s.content.trim().length > 0).length;
      return { capabilityId: cap.capabilityId, capabilityName: cap.capabilityName, total, filled };
    });

    return res.json({
      orgName:  blueprint.orgName,
      industry: blueprint.industry,
      status:   blueprint.status,
      summary,
    });
  } catch (err) {
    console.error('[EnterpriseBlueprint] STATUS error:', err);
    return res.status(500).json({ error: 'Failed to retrieve blueprint status.' });
  }
}

// ── PATCH /api/enterprise-blueprint/capability/:capabilityId ─────────────────

export async function patchCapability(req, res) {
  try {
    const { capabilityId } = req.params;
    const { sections }     = req.body;

    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections must be an array of { title, content } objects.' });
    }

    const profile = await resolveOrg(req.user._id);
    if (!profile) {
      return res.status(403).json({ error: 'Access denied. Complete profile setup to verify your role.' });
    }

    // Permission gate: User JWT role 'admin' OR UserProfile role 'CTO'
    const canEdit = req.user.role === 'admin' || profile.role === 'CTO';
    if (!canEdit) {
      return res.status(403).json({
        error: 'Access denied. Only CTO or admin users may edit the enterprise blueprint.',
      });
    }

    const updated = await updateCapabilitySections(profile.orgName, capabilityId, sections, req.user._id);

    auditLog('WRITE', req.user._id, profile.orgName, { capabilityId, sectionsWritten: sections.length });

    return res.json({
      orgName:         updated.orgName,
      capabilityId,
      status:          updated.status,
      sectionsWritten: sections.length,
    });
  } catch (err) {
    console.error('[EnterpriseBlueprint] PATCH error:', err);
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to update enterprise blueprint.' });
  }
}
