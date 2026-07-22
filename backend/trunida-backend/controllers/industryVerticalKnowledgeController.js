/**
 * SoorgaAI — Industry Vertical Knowledge Controller
 *
 * Platform-admin-only. Every route here is gated by adminMiddleware.js's
 * adminOnly (mounted in routes/industryVerticalKnowledgeRoutes.js).
 *
 * GET    /api/admin/industry-verticals                        List all entries.
 * POST   /api/admin/industry-verticals                         Create directly (can be prepared ahead of any company).
 * GET    /api/admin/industry-verticals/:id                     Get one entry (full content).
 * POST   /api/admin/industry-verticals/:id/research             Run web-search research.
 * PATCH  /api/admin/industry-verticals/:id/capability/:capabilityId  Manual entry.
 * POST   /api/admin/industry-verticals/:id/capability/:capabilityId/section/:sectionTitle/approve
 * POST   /api/admin/industry-verticals/:id/capability/:capabilityId/section/:sectionTitle/discard
 */

import {
  ensureVerticalKnowledge,
  runResearch,
  approveSection,
  discardDraftSection,
  updateCapabilitySections,
  getEntry as getEntryService,
  listEntries as listEntriesService,
} from '../services/industryVerticalKnowledgeService.js';

function auditLog(action, userId, extra = {}) {
  console.log(JSON.stringify({
    audit:  'IndustryVerticalKnowledge',
    action,
    userId: String(userId),
    ts:     new Date().toISOString(),
    ...extra,
  }));
}

function handleServiceError(res, err, notFoundMsgFragments = ['not found', 'no pending draft']) {
  console.error('[IndustryVerticalKnowledge] error:', err);
  if (notFoundMsgFragments.some(f => err.message?.includes(f))) {
    return res.status(404).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Industry vertical knowledge operation failed.' });
}

export async function listEntries(req, res) {
  try {
    const entries = await listEntriesService();
    const summary = entries.map(entry => {
      const total    = entry.capabilities.flatMap(c => c.sections).length;
      const filled   = entry.capabilities.flatMap(c => c.sections).filter(s => s.content?.trim()).length;
      const hasDraft = entry.capabilities.flatMap(c => c.sections).filter(s => s.draftContent?.trim()).length;
      return {
        _id: entry._id, parentIndustry: entry.parentIndustry, subVertical: entry.subVertical,
        status: entry.status, createdAt: entry.createdAt, total, filled, hasDraft,
      };
    });
    return res.json({ entries: summary });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function createEntry(req, res) {
  try {
    const { parentIndustry, subVertical } = req.body;
    if (!parentIndustry || !subVertical) {
      return res.status(400).json({ error: 'parentIndustry and subVertical are required.' });
    }

    const doc = await ensureVerticalKnowledge(parentIndustry, subVertical, req.user._id);
    auditLog('CREATED', req.user._id, { parentIndustry, subVertical });
    return res.status(201).json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function getEntry(req, res) {
  try {
    const entry = await getEntryService(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Vertical knowledge entry not found.' });
    auditLog('READ', req.user._id, { verticalId: req.params.id });
    return res.json({ entry });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function research(req, res) {
  try {
    const doc = await runResearch(req.params.id);
    auditLog('RESEARCH_RUN', req.user._id, { verticalId: req.params.id });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function patchCapability(req, res) {
  try {
    const { id, capabilityId } = req.params;
    const { sections } = req.body;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections must be an array of { title, content } objects.' });
    }

    const doc = await updateCapabilitySections(id, capabilityId, sections, req.user._id);
    auditLog('WRITE', req.user._id, { verticalId: id, capabilityId, sectionsWritten: sections.length });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function approveDraft(req, res) {
  try {
    const { id, capabilityId, sectionTitle } = req.params;
    const doc = await approveSection(id, capabilityId, decodeURIComponent(sectionTitle), req.user._id);
    auditLog('APPROVED', req.user._id, { verticalId: id, capabilityId, sectionTitle });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function discardDraft(req, res) {
  try {
    const { id, capabilityId, sectionTitle } = req.params;
    const doc = await discardDraftSection(id, capabilityId, decodeURIComponent(sectionTitle));
    auditLog('DISCARDED', req.user._id, { verticalId: id, capabilityId, sectionTitle });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}
