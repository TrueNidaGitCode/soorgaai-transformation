/**
 * SoorgaAI — Industry Capability Knowledge Controller
 *
 * Platform-admin-only. Every route here is gated by adminMiddleware.js's
 * adminOnly (mounted in routes/industryCapabilityKnowledgeRoutes.js).
 *
 * GET  /api/admin/industry-kb                                  List all entries.
 * GET  /api/admin/industry-kb/:id                               Get one entry.
 * GET  /api/admin/industry-kb/:id/stream                        SSE generation progress.
 * POST /api/admin/industry-kb/:id/generate                      Explicitly start generation for a 'pending' entry.
 * POST /api/admin/industry-kb/:id/capability/:capabilityId/approve
 * POST /api/admin/industry-kb/:id/capability/:capabilityId/discard
 */

import IndustryCapabilityKnowledge from '../models/IndustryCapabilityKnowledge.js';
import {
  getEntry as getIndustryEntry,
  listEntries as listIndustryEntries,
  approveCapability,
  discardCapabilityDraft,
  triggerGeneration,
} from '../services/industryCapabilityKnowledgeService.js';

function auditLog(action, userId, extra = {}) {
  console.log(JSON.stringify({
    audit:  'IndustryCapabilityKnowledge',
    action,
    userId: String(userId),
    ts:     new Date().toISOString(),
    ...extra,
  }));
}

function handleServiceError(res, err) {
  console.error('[IndustryCapabilityKnowledge] error:', err);
  if (err.message?.includes('not found')) {
    return res.status(404).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Industry capability knowledge operation failed.' });
}

export async function listEntries(req, res) {
  try {
    const entries = await listIndustryEntries();
    return res.json({ entries });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function getEntry(req, res) {
  try {
    const entry = await getIndustryEntry(req.params.id);
    auditLog('READ', req.user._id, { industryKnowledgeId: req.params.id });
    return res.json({ entry });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function generate(req, res) {
  try {
    const doc = await triggerGeneration(req.params.id);
    auditLog('GENERATION_TRIGGERED', req.user._id, { industryKnowledgeId: req.params.id, industry: doc.industry });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function approveDraft(req, res) {
  try {
    const { id, capabilityId } = req.params;
    const { editedContent } = req.body;
    const doc = await approveCapability(id, capabilityId, req.user._id, editedContent);
    auditLog('APPROVED', req.user._id, { industryKnowledgeId: id, capabilityId });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function discardDraft(req, res) {
  try {
    const { id, capabilityId } = req.params;
    const doc = await discardCapabilityDraft(id, capabilityId);
    auditLog('DISCARDED', req.user._id, { industryKnowledgeId: id, capabilityId });
    return res.json({ entry: doc });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * GET /api/admin/industry-kb/:id/stream
 * SSE endpoint — polls DB every 1.5s and streams generation progress.
 * Closes once status leaves 'generating'. Mirrors
 * strategyCanvasController.js's streamBlueprintProgress exactly.
 */
export async function streamGenerationProgress(req, res) {
  const { id } = req.params;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 15000);

  const poll = setInterval(async () => {
    try {
      const doc = await IndustryCapabilityKnowledge.findById(id)
        .select('industry status progress').lean();
      if (!doc) {
        send({ error: 'Entry not found.' });
        clearInterval(poll);
        clearInterval(heartbeat);
        res.end();
        return;
      }

      send({ status: doc.status, progress: doc.progress });

      if (doc.status !== 'generating') {
        send({ done: true });
        clearInterval(poll);
        clearInterval(heartbeat);
        res.end();
      }
    } catch (err) {
      console.error('streamGenerationProgress poll error:', err);
      send({ error: 'Stream error.' });
      clearInterval(poll);
      clearInterval(heartbeat);
      res.end();
    }
  }, 1500);

  req.on('close', () => {
    clearInterval(poll);
    clearInterval(heartbeat);
  });
}
