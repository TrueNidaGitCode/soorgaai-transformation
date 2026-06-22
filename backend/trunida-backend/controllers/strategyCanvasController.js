import UserProfile          from '../models/UserProfile.js';
import CompanyBlueprint      from '../models/CompanyBlueprint.js';
import { getCapabilities, getCapabilityBlueprint } from '../services/strategyCanvasService.js';
import { suggestBlueprintSection }  from '../services/blueprintSuggestService.js';
import { generateBlueprintAsync }   from '../services/blueprintGenerationService.js';

const DEFAULT_INDUSTRY = 'Automotive';

// Maps UserProfile.industryDomain enum values to knowledge-base folder names.
// All current sub-domains (ADAS, Diagnostics, etc.) belong to the Automotive layer.
const INDUSTRY_FOLDER = {
  General:     'Automotive',
  Diagnostics: 'Automotive',
  Infotainment: 'Automotive',
  ADAS:        'Automotive',
  Automotive:  'Automotive',
};

async function detectIndustry(userId) {
  try {
    const profile = await UserProfile.findOne({ userId }).lean();
    const domain  = profile?.industryDomain || DEFAULT_INDUSTRY;
    return INDUSTRY_FOLDER[domain] ?? DEFAULT_INDUSTRY;
  } catch {
    return DEFAULT_INDUSTRY;
  }
}

export async function listCapabilities(req, res) {
  try {
    const industry     = await detectIndustry(req.user._id);
    const capabilities = getCapabilities();
    res.json({ industry, capabilities });
  } catch (err) {
    console.error('listCapabilities error:', err);
    res.status(500).json({ error: 'Failed to load capabilities.' });
  }
}

export async function suggestSection(req, res) {
  try {
    const {
      capabilityId,
      blueprint,
      sectionTitle,
      currentContent,
      request,
      automotiveBlueprint,
      conversationHistory,
      companyMemory,
    } = req.body;

    if (!capabilityId || typeof capabilityId !== 'string') {
      return res.status(400).json({ error: 'capabilityId is required.' });
    }
    if (!sectionTitle || typeof sectionTitle !== 'string') {
      return res.status(400).json({ error: 'sectionTitle is required.' });
    }
    if (!request || typeof request !== 'string' || !request.trim()) {
      return res.status(400).json({ error: 'request is required.' });
    }

    const result = await suggestBlueprintSection({
      capabilityId,
      blueprint:           blueprint || {},
      sectionTitle,
      currentContent:      currentContent || '',
      request:             request.trim(),
      automotiveBlueprint: typeof automotiveBlueprint === 'string' ? automotiveBlueprint : '',
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      companyMemory:       companyMemory && typeof companyMemory === 'object' ? companyMemory : {},
      userId:              req.user._id,
    });

    return res.json(result);

  } catch (err) {
    console.error('[suggestSection] Error:', {
      message:  err.message,
      name:     err.name,
      stack:    err.stack,
      capabilityId: req.body?.capabilityId,
      sectionTitle: req.body?.sectionTitle,
    });

    const isUnavailable =
      err.message?.includes('not configured') ||
      err.message?.includes('All LLM providers') ||
      err.message?.includes('No valid LLM providers') ||
      err.message?.includes('Gemini response unavailable');
    if (isUnavailable) {
      return res.status(503).json({ error: 'AI Advisor is not available. Please try again later.' });
    }
    return res.status(500).json({ error: 'Failed to generate section suggestion.' });
  }
}

export async function fetchCapabilityBlueprint(req, res) {
  try {
    const { capabilityId } = req.params;
    const industry         = await detectIndustry(req.user._id);
    const blueprint        = getCapabilityBlueprint(capabilityId, industry);
    res.json(blueprint);
  } catch (err) {
    if (err.message.startsWith('Capability not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('fetchCapabilityBlueprint error:', err);
    res.status(500).json({ error: 'Failed to load capability blueprint.' });
  }
}

// ── PI 26.3 Sprint 1: Blueprint Generation ────────────────────────────────────

/**
 * POST /strategy-canvas/generate-blueprint
 * Starts async blueprint generation. Returns blueprintId immediately.
 */
export async function startBlueprintGeneration(req, res) {
  try {
    const { businessObjective } = req.body;
    if (!businessObjective || typeof businessObjective !== 'string' || !businessObjective.trim()) {
      return res.status(400).json({ error: 'businessObjective is required.' });
    }

    const userId     = req.user._id;
    const industry   = await detectIndustry(userId);
    const capabilities = getCapabilities();

    // Create initial blueprint record with all capabilities pending
    const blueprint = await CompanyBlueprint.create({
      userId,
      businessObjective: businessObjective.trim(),
      industry,
      status:       'generating',
      capabilities: capabilities.map(c => ({
        capabilityId:   c.id,
        capabilityName: c.name,
        status:         'pending',
        sections:       [],
      })),
    });

    // Fire-and-forget generation (updates DB as each capability completes)
    generateBlueprintAsync(blueprint._id, userId, businessObjective.trim())
      .catch(err => console.error('[startBlueprintGeneration] async error:', err));

    return res.json({ blueprintId: blueprint._id });

  } catch (err) {
    console.error('startBlueprintGeneration error:', err);
    res.status(500).json({ error: 'Failed to start blueprint generation.' });
  }
}

/**
 * GET /strategy-canvas/generate-blueprint/:blueprintId/stream
 * SSE endpoint — polls DB every 1.5 s and sends capability status updates.
 * Closes when all capabilities are done or an error occurs.
 */
export async function streamBlueprintProgress(req, res) {
  const { blueprintId } = req.params;
  const userId          = req.user._id;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Heartbeat keeps Railway / proxy from closing an idle connection
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 15000);

  const poll = setInterval(async () => {
    try {
      const bp = await CompanyBlueprint.findOne({ _id: blueprintId, userId }).lean();
      if (!bp) {
        send({ error: 'Blueprint not found.' });
        clearInterval(poll);
        clearInterval(heartbeat);
        res.end();
        return;
      }

      const capStatuses = bp.capabilities.map(c => ({
        id:     c.capabilityId,
        name:   c.capabilityName,
        status: c.status,
      }));

      send({ capabilities: capStatuses, overallStatus: bp.status });

      if (bp.status === 'completed' || bp.status === 'error') {
        send({ done: true });
        clearInterval(poll);
        clearInterval(heartbeat);
        res.end();
      }
    } catch (err) {
      console.error('streamBlueprintProgress poll error:', err);
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

/**
 * GET /strategy-canvas/company-blueprint
 * Returns the user's most recent completed (or generating) blueprint.
 * Returns 404 if none exists yet.
 */
export async function getCompanyBlueprint(req, res) {
  try {
    const userId = req.user._id;
    const bp = await CompanyBlueprint
      .findOne({ userId })
      .sort({ createdAt: -1 })
      .lean();

    if (!bp) return res.status(404).json({ error: 'No blueprint found.' });
    return res.json(bp);

  } catch (err) {
    console.error('getCompanyBlueprint error:', err);
    res.status(500).json({ error: 'Failed to load company blueprint.' });
  }
}

/**
 * PATCH /strategy-canvas/company-blueprint/:blueprintId/capability/:capabilityId/section/:sectionTitle
 * Updates the content of one section in the stored blueprint.
 */
export async function updateBlueprintSection(req, res) {
  try {
    const { blueprintId, capabilityId, sectionTitle } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required.' });
    }

    const result = await CompanyBlueprint.updateOne(
      {
        _id:    blueprintId,
        userId,
        'capabilities.capabilityId':        capabilityId,
        'capabilities.sections.title':       decodeURIComponent(sectionTitle),
      },
      {
        $set: {
          'capabilities.$[cap].sections.$[sec].content':   content,
          'capabilities.$[cap].sections.$[sec].updatedAt': new Date(),
          updatedAt: new Date(),
        },
      },
      {
        arrayFilters: [
          { 'cap.capabilityId': capabilityId },
          { 'sec.title':        decodeURIComponent(sectionTitle) },
        ],
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Blueprint, capability, or section not found.' });
    }

    return res.json({ ok: true });

  } catch (err) {
    console.error('updateBlueprintSection error:', err);
    res.status(500).json({ error: 'Failed to update section.' });
  }
}
