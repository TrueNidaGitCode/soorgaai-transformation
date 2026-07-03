import UserProfile               from '../models/UserProfile.js';
import CompanyBlueprint           from '../models/CompanyBlueprint.js';
import TransformationBlueprint    from '../models/TransformationBlueprint.js';
import { getCapabilities, getCapabilityBlueprint, getDomainCapabilities } from '../services/strategyCanvasService.js';
import { suggestBlueprintSection }  from '../services/blueprintSuggestService.js';
import {
  generateBlueprintAsync,
  regenerateCapabilityAsync,
  regenerateSectionExtras,
  regenerateSectionExtrasForTransformation,
  regenerateTransformationCapabilityAsync,
  generateTransformationAsync,
  generateSpecificDomainsAsync,
} from '../services/blueprintGenerationService.js';
import { autoCapture }      from '../services/knowledgeSuggestionService.js';
import { enabledDomains }   from '../config/domainRegistry.js';

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

async function detectOrgName(userId) {
  try {
    const profile = await UserProfile.findOne({ userId }).lean();
    return profile?.orgName || '';
  } catch {
    return '';
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
      allCapabilitySections,
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
      allCapabilitySections: Array.isArray(allCapabilitySections) ? allCapabilitySections : [],
    });

    // Auto-capture detected knowledge — fire-and-forget, never blocks the response
    const rawKS = result.knowledgeSuggestions || [];
    if (rawKS.length > 0) {
      autoCapture(rawKS, {
        projectId:          capabilityId,
        userId:             req.user._id,
        sourceConversation: String(conversationHistory?.length || 0),
      }).catch(err => console.warn('[suggestSection] knowledge auto-capture non-fatal:', err.message));
    }

    // Strip raw suggestions from response; send only the count for the UI toast
    const { knowledgeSuggestions: _ks, ...responsePayload } = result;
    return res.json({ ...responsePayload, knowledgeCaptured: rawKS.length });

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
    const [industry, companyName] = await Promise.all([
      detectIndustry(userId),
      detectOrgName(userId),
    ]);
    const capabilities = getCapabilities();

    // Create initial blueprint record with all capabilities pending
    const blueprint = await CompanyBlueprint.create({
      userId,
      businessObjective: businessObjective.trim(),
      industry,
      companyName,
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
 * POST /strategy-canvas/company-blueprint/:blueprintId/capability/:capabilityId/regenerate
 *
 * Re-runs generation for a single capability that previously failed.
 * Returns immediately; generation runs fire-and-forget in the background.
 * The client should poll GET /company-blueprint to detect completion.
 */
export async function regenerateCapability(req, res) {
  try {
    const { blueprintId, capabilityId } = req.params;
    const userId = req.user._id;

    const bp = await CompanyBlueprint.findOne({ _id: blueprintId, userId }).lean();
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    const capExists = bp.capabilities.some(c => c.capabilityId === capabilityId);
    if (!capExists) return res.status(404).json({ error: 'Capability not found in blueprint.' });

    regenerateCapabilityAsync(blueprintId, capabilityId, userId, bp.businessObjective)
      .catch(err => console.error('[regenerateCapability] async error:', err));

    return res.json({ ok: true });

  } catch (err) {
    console.error('regenerateCapability error:', err);
    res.status(500).json({ error: 'Failed to start regeneration.' });
  }
}

/**
 * PATCH /strategy-canvas/company-blueprint/:blueprintId/capability/:capabilityId/section/:sectionTitle
 *
 * Updates one section in the stored blueprint.
 * Accepts any combination of `brief` (Strategy Brief fields) and `content` (essay).
 * Only the fields present in the request body are overwritten.
 */
export async function updateBlueprintSection(req, res) {
  try {
    const { blueprintId, capabilityId, sectionTitle } = req.params;
    const { brief, content } = req.body;
    const userId  = req.user._id;
    const decoded = decodeURIComponent(sectionTitle);

    if (brief === undefined && content === undefined) {
      return res.status(400).json({ error: 'Provide brief and/or content to update.' });
    }

    const setFields = { 'capabilities.$[cap].sections.$[sec].updatedAt': new Date(), updatedAt: new Date() };

    if (brief && typeof brief === 'object') {
      if (typeof brief.strategicPosition === 'string')
        setFields['capabilities.$[cap].sections.$[sec].brief.strategicPosition'] = brief.strategicPosition;
      if (Array.isArray(brief.priorityActions))
        setFields['capabilities.$[cap].sections.$[sec].brief.priorityActions']   = brief.priorityActions;
      if (Array.isArray(brief.successMetrics))
        setFields['capabilities.$[cap].sections.$[sec].brief.successMetrics']    = brief.successMetrics;
      if (brief.leadershipValidation && typeof brief.leadershipValidation === 'object') {
        const lv = brief.leadershipValidation;
        const validStatuses = ['Approved', 'In Review', 'Not Yet Validated'];
        if (typeof lv.status === 'string' && validStatuses.includes(lv.status))
          setFields['capabilities.$[cap].sections.$[sec].brief.leadershipValidation.status']  = lv.status;
        if (typeof lv.context === 'string')
          setFields['capabilities.$[cap].sections.$[sec].brief.leadershipValidation.context'] = lv.context;
      }
      // CTO-view visual/extra fields
      const extraArrayFields = [
        'strategicPillars', 'kpiHighlights', 'timelineSteps', 'alignmentInitiatives',
        'spokeNodes', 'funnelStages', 'commitmentPillars', 'governanceNodes',
        'matrixQuadrants', 'quarterlyPlan', 'solutionPortfolio', 'teamRoles',
        'lifecycleStages', 'waterfallItems', 'sdlcStages', 'flywheelStages',
        'securityPillars', 'ethicsPillars', 'modelLifecycleStages', 'complianceControls',
        'adoptionStages',
      ];
      for (const field of extraArrayFields) {
        if (brief[field] !== undefined)
          setFields[`capabilities.$[cap].sections.$[sec].brief.${field}`] = brief[field];
      }
    }

    if (typeof content === 'string') {
      setFields['capabilities.$[cap].sections.$[sec].content'] = content;
    }

    const result = await CompanyBlueprint.updateOne(
      { _id: blueprintId, userId, 'capabilities.capabilityId': capabilityId, 'capabilities.sections.title': decoded },
      { $set: setFields },
      { arrayFilters: [{ 'cap.capabilityId': capabilityId }, { 'sec.title': decoded }] }
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

/**
 * POST /strategy-canvas/company-blueprint/:blueprintId/capability/:capabilityId/regenerate-section-extras
 *
 * Regenerates CTO-view visual fields (strategicPillars, kpiHighlights, etc.)
 * for specified sections using their current strategicPosition as context.
 * Body: { sectionTitles: string[] }
 */
export async function regenerateSectionExtrasHandler(req, res) {
  try {
    const { blueprintId, capabilityId } = req.params;
    const { sectionTitles } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(sectionTitles) || !sectionTitles.length) {
      return res.status(400).json({ error: 'sectionTitles must be a non-empty array.' });
    }

    const updatedBriefs = await regenerateSectionExtras(blueprintId, capabilityId, sectionTitles, userId);
    return res.json({ ok: true, updatedBriefs });

  } catch (err) {
    console.error('regenerateSectionExtrasHandler error:', err);
    res.status(500).json({ error: err.message || 'Failed to regenerate section extras.' });
  }
}

// ── Transformation Blueprint: regenerate-section-extras ──────────────────────

export async function regenerateTransformationSectionExtrasHandler(req, res) {
  try {
    const { blueprintId, domainId, capabilityId } = req.params;
    const { sectionTitles } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(sectionTitles) || !sectionTitles.length) {
      return res.status(400).json({ error: 'sectionTitles must be a non-empty array.' });
    }

    const updatedBriefs = await regenerateSectionExtrasForTransformation(
      blueprintId, domainId, capabilityId, sectionTitles, userId
    );
    return res.json({ ok: true, updatedBriefs });

  } catch (err) {
    console.error('regenerateTransformationSectionExtrasHandler error:', err);
    res.status(500).json({ error: err.message || 'Failed to regenerate section extras.' });
  }
}

// ── Transformation Blueprint: single-capability regeneration ──────────────────

export async function regenerateTransformationCapabilityHandler(req, res) {
  try {
    const { blueprintId, domainId, capabilityId } = req.params;
    const userId = req.user._id;

    const bp = await TransformationBlueprint.findOne({ _id: blueprintId, userId });
    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    // Ensure the domain + capability exist in MongoDB before the async runs.
    // They may be missing when the domain was added after blueprint creation and
    // the user regenerates directly from domain.html (synthetic frontend-only entry).
    const domainDef = enabledDomains().find(d => d.id === domainId);
    if (!domainDef) return res.status(400).json({ error: `Unknown domain: ${domainId}` });

    let modified = false;
    let existingDomain = bp.domains.find(d => d.domainId === domainId);

    if (!existingDomain) {
      const caps = getDomainCapabilities(domainDef.kbPath);
      bp.domains.push({
        domainId:     domainDef.id,
        domainName:   domainDef.name,
        status:       'pending',
        capabilities: caps.map(c => ({
          capabilityId:   c.id,
          capabilityName: c.name,
          status:         'pending',
          sections:       [],
        })),
      });
      modified = true;
      existingDomain = bp.domains[bp.domains.length - 1];
    } else {
      const hasCap = (existingDomain.capabilities || []).some(c => c.capabilityId === capabilityId);
      if (!hasCap) {
        const caps   = getDomainCapabilities(domainDef.kbPath);
        const capDef = caps.find(c => c.id === capabilityId);
        if (!capDef) return res.status(400).json({ error: `Unknown capability: ${capabilityId}` });
        existingDomain.capabilities = existingDomain.capabilities || [];
        existingDomain.capabilities.push({
          capabilityId:   capDef.id,
          capabilityName: capDef.name,
          status:         'pending',
          sections:       [],
        });
        modified = true;
      }
    }

    if (modified) await bp.save();

    res.json({ ok: true });

    regenerateTransformationCapabilityAsync(
      blueprintId, domainId, capabilityId, userId, bp.businessObjective
    ).catch(err => console.error('[regenerateTransformation] async error:', err.message));

  } catch (err) {
    console.error('regenerateTransformationCapabilityHandler error:', err);
    res.status(500).json({ error: err.message || 'Failed to start regeneration.' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Multi-domain Transformation Blueprint handlers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /strategy-canvas/generate-transformation
 * Starts async multi-domain generation. Returns transformationId immediately.
 */
export async function startTransformationGeneration(req, res) {
  try {
    const { businessObjective } = req.body;
    if (!businessObjective?.trim()) {
      return res.status(400).json({ error: 'businessObjective is required.' });
    }

    const userId = req.user._id;
    const [industry, companyName] = await Promise.all([
      detectIndustry(userId),
      detectOrgName(userId),
    ]);

    const domains = enabledDomains();

    // Pre-populate each enabled domain with its capabilities (if KB docs exist)
    const domainDocs = domains.map(domain => {
      const caps = getDomainCapabilities(domain.kbPath);
      return {
        domainId:   domain.id,
        domainName: domain.name,
        status:     'pending',
        capabilities: caps.map(c => ({
          capabilityId:   c.id,
          capabilityName: c.name,
          status:         'pending',
          sections:       [],
        })),
      };
    });

    const blueprint = await TransformationBlueprint.create({
      userId,
      businessObjective: businessObjective.trim(),
      industry,
      companyName,
      status: 'generating',
      domains: domainDocs,
    });

    generateTransformationAsync(blueprint._id, userId, businessObjective.trim())
      .catch(err => console.error('[startTransformationGeneration] async error:', err));

    return res.json({ transformationId: blueprint._id });

  } catch (err) {
    console.error('startTransformationGeneration error:', err);
    res.status(500).json({ error: 'Failed to start transformation generation.' });
  }
}

/**
 * POST /strategy-canvas/transformation-blueprint/:blueprintId/regenerate-domains
 * Regenerates only the specified domains on an existing blueprint.
 * Body: { domainIds: string[] }
 */
export async function regenerateSpecificDomains(req, res) {
  try {
    const { blueprintId } = req.params;
    const { domainIds }   = req.body;
    const userId          = req.user._id;

    if (!Array.isArray(domainIds) || !domainIds.length) {
      return res.status(400).json({ error: 'domainIds array is required.' });
    }

    const blueprint = await TransformationBlueprint.findOne({ _id: blueprintId, userId });
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    const allDomainDefs = enabledDomains();

    // Add any missing domains to the blueprint first, then save
    let modified = false;
    for (const domainId of domainIds) {
      const existsInBlueprint = blueprint.domains.some(d => d.domainId === domainId);
      if (!existsInBlueprint) {
        const def  = allDomainDefs.find(d => d.id === domainId);
        if (!def) continue;
        const caps = getDomainCapabilities(def.kbPath);
        blueprint.domains.push({
          domainId:   def.id,
          domainName: def.name,
          status:     'pending',
          capabilities: caps.map(c => ({
            capabilityId:   c.id,
            capabilityName: c.name,
            status:         'pending',
            sections:       [],
          })),
        });
        modified = true;
      }
    }
    if (modified) await blueprint.save();

    // Reset targeted domains + their capabilities to pending
    for (const domainId of domainIds) {
      await TransformationBlueprint.updateOne(
        { _id: blueprintId },
        {
          $set: {
            'domains.$[dom].status': 'pending',
            'domains.$[dom].capabilities.$[].status': 'pending',
            'domains.$[dom].capabilities.$[].sections': [],
          },
        },
        { arrayFilters: [{ 'dom.domainId': domainId }] }
      );
    }

    // Mark blueprint as generating so SSE stream stays open
    await TransformationBlueprint.updateOne(
      { _id: blueprintId },
      { $set: { status: 'generating', updatedAt: new Date() } }
    );

    const objective = blueprint.businessObjective || '';
    generateSpecificDomainsAsync(blueprint._id, userId, objective, domainIds)
      .catch(err => console.error('[regenerateSpecificDomains] async error:', err));

    return res.json({ transformationId: blueprint._id });

  } catch (err) {
    console.error('regenerateSpecificDomains error:', err);
    res.status(500).json({ error: 'Failed to start domain regeneration.' });
  }
}

/**
 * GET /strategy-canvas/generate-transformation/:transformationId/stream
 * SSE — emits domain + capability status updates until complete.
 */
export async function streamTransformationProgress(req, res) {
  const { transformationId } = req.params;
  const userId = req.user._id;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };
  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': heartbeat\n\n'); }, 15000);

  const poll = setInterval(async () => {
    try {
      const bp = await TransformationBlueprint.findOne({ _id: transformationId, userId }).lean();
      if (!bp) { send({ error: 'Transformation not found.' }); clearInterval(poll); clearInterval(heartbeat); res.end(); return; }

      const domainStatuses = bp.domains.map(d => ({
        domainId:   d.domainId,
        domainName: d.domainName,
        status:     d.status,
        capabilities: (d.capabilities || []).map(c => ({ id: c.capabilityId, name: c.capabilityName, status: c.status })),
      }));

      send({ domains: domainStatuses, overallStatus: bp.status });

      if (bp.status === 'completed' || bp.status === 'error') {
        send({ done: true });
        clearInterval(poll); clearInterval(heartbeat); res.end();
      }
    } catch (err) {
      send({ error: 'Stream error.' });
      clearInterval(poll); clearInterval(heartbeat); res.end();
    }
  }, 1500);

  req.on('close', () => { clearInterval(poll); clearInterval(heartbeat); });
}

/**
 * GET /strategy-canvas/transformation-blueprint
 * Returns the user's most recent TransformationBlueprint.
 */
export async function getTransformationBlueprint(req, res) {
  try {
    const bp = await TransformationBlueprint
      .findOne({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    if (!bp) return res.status(404).json({ error: 'No transformation blueprint found.' });
    return res.json(bp);
  } catch (err) {
    console.error('getTransformationBlueprint error:', err);
    res.status(500).json({ error: 'Failed to load transformation blueprint.' });
  }
}

/**
 * PATCH /strategy-canvas/transformation-blueprint/:blueprintId/domain/:domainId/capability/:capabilityId/section/:sectionTitle
 * Updates one section brief within a domain capability.
 */
export async function updateTransformationSection(req, res) {
  try {
    const { blueprintId, domainId, capabilityId, sectionTitle } = req.params;
    const { brief, content } = req.body;
    const userId  = req.user._id;
    const decoded = decodeURIComponent(sectionTitle);

    if (brief === undefined && content === undefined) {
      return res.status(400).json({ error: 'Provide brief and/or content to update.' });
    }

    const setFields = {
      'domains.$[dom].capabilities.$[cap].sections.$[sec].updatedAt': new Date(),
      updatedAt: new Date(),
    };

    if (brief && typeof brief === 'object') {
      if (typeof brief.strategicPosition === 'string')
        setFields['domains.$[dom].capabilities.$[cap].sections.$[sec].brief.strategicPosition'] = brief.strategicPosition;
      if (Array.isArray(brief.priorityActions))
        setFields['domains.$[dom].capabilities.$[cap].sections.$[sec].brief.priorityActions']   = brief.priorityActions;
      if (Array.isArray(brief.successMetrics))
        setFields['domains.$[dom].capabilities.$[cap].sections.$[sec].brief.successMetrics']    = brief.successMetrics;

      const extraArrayFields = [
        'strategicPillars', 'kpiHighlights', 'timelineSteps', 'alignmentInitiatives',
        'spokeNodes', 'funnelStages', 'commitmentPillars', 'governanceNodes',
        'matrixQuadrants', 'quarterlyPlan', 'solutionPortfolio', 'teamRoles',
        'lifecycleStages', 'waterfallItems', 'sdlcStages', 'flywheelStages',
        'securityPillars', 'ethicsPillars', 'modelLifecycleStages', 'complianceControls', 'adoptionStages',
      ];
      for (const field of extraArrayFields) {
        if (brief[field] !== undefined)
          setFields[`domains.$[dom].capabilities.$[cap].sections.$[sec].brief.${field}`] = brief[field];
      }
    }
    if (typeof content === 'string')
      setFields['domains.$[dom].capabilities.$[cap].sections.$[sec].content'] = content;

    const result = await TransformationBlueprint.updateOne(
      {
        _id: blueprintId,
        userId,
        'domains.domainId': domainId,
        'domains.capabilities.capabilityId': capabilityId,
        'domains.capabilities.sections.title': decoded,
      },
      { $set: setFields },
      { arrayFilters: [{ 'dom.domainId': domainId }, { 'cap.capabilityId': capabilityId }, { 'sec.title': decoded }] }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Blueprint, domain, capability, or section not found.' });
    }
    return res.json({ ok: true });

  } catch (err) {
    console.error('updateTransformationSection error:', err);
    res.status(500).json({ error: 'Failed to update section.' });
  }
}

/**
 * POST /strategy-canvas/admin/remove-governance-ethics
 * One-time cleanup: removes the AI Governance & Ethics capability from the
 * calling user's TransformationBlueprint (AI Strategy domain).
 */
export async function removeGovernanceEthicsCapability(req, res) {
  try {
    const userId = req.user._id;
    const result = await TransformationBlueprint.updateMany(
      { userId, 'domains.domainId': 'ai-strategy' },
      {
        $pull: {
          'domains.$[dom].capabilities': { capabilityId: 'ai-governance-ethics' },
        },
      },
      { arrayFilters: [{ 'dom.domainId': 'ai-strategy' }] }
    );
    return res.json({
      ok: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      message: 'AI Governance & Ethics capability removed from AI Strategy domain.',
    });
  } catch (err) {
    console.error('removeGovernanceEthicsCapability error:', err);
    res.status(500).json({ error: 'Cleanup failed.' });
  }
}
