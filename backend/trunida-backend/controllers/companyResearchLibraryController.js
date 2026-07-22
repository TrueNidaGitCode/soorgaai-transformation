/**
 * SoorgaAI — Company Research Library Controller
 *
 * Platform-admin-only. Every route here is gated by adminMiddleware.js's
 * adminOnly (mounted in routes/companyResearchLibraryRoutes.js) — no
 * per-org CTO fallback, unlike enterpriseBlueprintController.js.
 *
 * GET    /api/admin/company-library                        List all entries.
 * POST   /api/admin/company-library                         Create an entry.
 * GET    /api/admin/company-library/:id                     Get one entry (full content).
 * POST   /api/admin/company-library/:id/research             Run web-search research.
 * PATCH  /api/admin/company-library/:id/capability/:capabilityId  Manual entry.
 * POST   /api/admin/company-library/:id/capability/:capabilityId/section/:sectionTitle/approve
 * POST   /api/admin/company-library/:id/capability/:capabilityId/section/:sectionTitle/discard
 * POST   /api/admin/company-library/:id/set-vertical                    Tag/change sub-vertical.
 */

import {
  createLibraryEntry,
  setSubVertical,
  runResearch,
  approveSection,
  discardDraftSection,
  updateCapabilitySections,
  getLibraryEntry,
  listLibraryEntries,
} from '../services/companyResearchLibraryService.js';

function auditLog(action, userId, extra = {}) {
  console.log(JSON.stringify({
    audit:  'CompanyResearchLibrary',
    action,
    userId: String(userId),
    ts:     new Date().toISOString(),
    ...extra,
  }));
}

function handleServiceError(res, err, notFoundMsgFragments = ['not found', 'already exists', 'no pending draft']) {
  console.error('[CompanyResearchLibrary] error:', err);
  if (notFoundMsgFragments.some(f => err.message?.includes(f))) {
    return res.status(404).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Company research library operation failed.' });
}

export async function listEntries(req, res) {
  try {
    const entries = await listLibraryEntries();
    const summary = entries.map(entry => {
      const total    = entry.capabilities.flatMap(c => c.sections).length;
      const filled   = entry.capabilities.flatMap(c => c.sections).filter(s => s.content?.trim()).length;
      const hasDraft = entry.capabilities.flatMap(c => c.sections).filter(s => s.draftContent?.trim()).length;
      return {
        _id: entry._id, companyName: entry.companyName, industry: entry.industry,
        subVertical: entry.subVertical, status: entry.status, createdAt: entry.createdAt,
        total, filled, hasDraft,
      };
    });
    return res.json({ entries: summary });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function createEntry(req, res) {
  try {
    const { companyName, industry, subVertical } = req.body;
    if (!companyName) return res.status(400).json({ error: 'companyName is required.' });

    const doc = await createLibraryEntry(companyName, industry || 'Automotive', req.user._id, subVertical || '');
    auditLog('CREATED', req.user._id, { companyName, subVertical: subVertical || null });
    return res.status(201).json({ entry: doc });
  } catch (err) {
    if (err.message?.includes('already exists')) {
      return res.status(409).json({ error: err.message });
    }
    return handleServiceError(res, err);
  }
}

export async function updateVertical(req, res) {
  try {
    const { subVertical } = req.body;
    const doc = await setSubVertical(req.params.id, subVertical || '');
    auditLog('SET_VERTICAL', req.user._id, { libraryId: req.params.id, subVertical: subVertical || null });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function getEntry(req, res) {
  try {
    const entry = await getLibraryEntry(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Library entry not found.' });
    auditLog('READ', req.user._id, { libraryId: req.params.id });
    return res.json({ entry });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function research(req, res) {
  try {
    const doc = await runResearch(req.params.id);
    auditLog('RESEARCH_RUN', req.user._id, { libraryId: req.params.id });
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
    auditLog('WRITE', req.user._id, { libraryId: id, capabilityId, sectionsWritten: sections.length });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function approveDraft(req, res) {
  try {
    const { id, capabilityId, sectionTitle } = req.params;
    const doc = await approveSection(id, capabilityId, decodeURIComponent(sectionTitle), req.user._id);
    auditLog('APPROVED', req.user._id, { libraryId: id, capabilityId, sectionTitle });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function discardDraft(req, res) {
  try {
    const { id, capabilityId, sectionTitle } = req.params;
    const doc = await discardDraftSection(id, capabilityId, decodeURIComponent(sectionTitle));
    auditLog('DISCARDED', req.user._id, { libraryId: id, capabilityId, sectionTitle });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}
