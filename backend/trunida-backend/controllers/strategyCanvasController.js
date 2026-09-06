import mongoose                   from 'mongoose';
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
import { backfillActionItemsForClaimedBlueprint } from '../services/actionItemService.js';
import { enabledDomains }   from '../config/domainRegistry.js';
import { MAX_OBJECTIVE_LENGTH } from '../config/objectiveLimits.js';
import { checkObjective } from '../services/objectiveGuardService.js';
import { resolveEngagement, CATEGORIES, WORKFLOW_AREAS } from '../services/engagementClassifierService.js';
import { getCompanyEvidence } from '../services/companyContextService.js';
import { requireEntitlement } from '../services/entitlements.js';

// Maps UserProfile.industryDomain enum values to knowledge-base folder names.
// All current sub-domains (ADAS, Diagnostics, etc.) belong to the Automotive layer.
const INDUSTRY_FOLDER = {
  General:     'Automotive',
  Diagnostics: 'Automotive',
  Infotainment: 'Automotive',
  ADAS:        'Automotive',
  Automotive:  'Automotive',
};

/**
 * The industry declared on the user's profile, or '' when they declared none.
 *
 * This used to default to 'Automotive', which is why a company building
 * academy-management software has a blueprint stored as automotive. An
 * undeclared industry is unknown, not automotive: resolveIndustryGrounding
 * treats "no industry" as a first-class answer and grounds on core content,
 * which is right, where the wrong overlay actively pulls generation toward
 * irrelevant framing.
 */
async function detectIndustry(userId) {
  try {
    const profile = await UserProfile.findOne({ userId }).lean();
    if (!profile?.industryDomain) return '';
    return INDUSTRY_FOLDER[profile.industryDomain] ?? '';
  } catch {
    return '';
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
    if (businessObjective.trim().length > MAX_OBJECTIVE_LENGTH) {
      return res.status(400).json({ error: `Objective is too long (max ${MAX_OBJECTIVE_LENGTH} characters).` });
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
    const objective = businessObjective?.trim();
    if (!objective) {
      return res.status(400).json({ error: 'businessObjective is required.' });
    }
    if (objective.length > MAX_OBJECTIVE_LENGTH) {
      return res.status(400).json({ error: `Objective is too long (max ${MAX_OBJECTIVE_LENGTH} characters).` });
    }

    // Before the objective guard, not after: this is two counts against an
    // index, where the guard is a model call. Refusing for free costs nothing;
    // refusing after paying for a check is a bill with no product attached.
    if (!await requireEntitlement(req, res, 'blueprint')) return;

    // A full run is six domains and ~16 capability generations. Check once,
    // for a fraction of one capability, that this is worth generating at all
    // — "what can you do?" has cost four complete runs before now.
    const verdict = await checkObjective(objective);
    if (!verdict.ok) {
      return res.status(400).json({
        error: verdict.reason,
        suggestion: verdict.suggestion,
        code: 'not_a_business_objective',
      });
    }

    const userId = req.user._id;

    // What kind of AI work this is, decided once and reused by every capability
    // run. Company context is fetched first because the objective alone cannot
    // say whose workflow it describes — see engagementClassifierService.
    const companyEvidence = await getCompanyEvidence(userId).catch(() => '');
    const [industry, companyName, engagement] = await Promise.all([
      detectIndustry(userId),
      detectOrgName(userId),
      resolveEngagement(objective, companyEvidence),
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
      engagement: {
        checked:    true,
        category:   engagement.category || '',
        subArea:    engagement.subArea  || '',
        maturity:   engagement.maturity || '',
        confidence: engagement.confidence,
        reason:     engagement.reason,
        userSet:    false,
      },
    });

    console.log(engagement.category
      ? `[engagement] ${blueprint._id}: ${engagement.category}`
        + `${engagement.subArea ? ` / ${engagement.subArea}` : ''}`
        + ` (${engagement.maturity}). ${engagement.reason}`
      : `[engagement] ${blueprint._id}: undecided — generation is not steered. ${engagement.reason}`);

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

    // Classify before regenerating, if this blueprint has no answer yet.
    //
    // Two cases land here. A blueprint created before the classifier existed
    // has no engagement at all. One that came back undecided may simply have
    // had no company context at the time — context the user has since added,
    // which is exactly when a regeneration is worth steering. Both are worth
    // one small call; without this, "regenerate" on an older blueprint is
    // steered by nothing and produces the same generic datasets again.
    //
    // A category the user set themselves is never overwritten.
    if (!blueprint.engagement?.userSet && !blueprint.engagement?.category) {
      const evidence = await getCompanyEvidence(userId).catch(() => '');
      const engagement = await resolveEngagement(blueprint.businessObjective, evidence);

      // Set on the document and saved here rather than through a separate
      // updateOne. This function calls blueprint.save() further down, and a
      // write that bypassed the in-memory document could be silently undone by
      // that save writing back the stale value it still holds.
      blueprint.engagement = {
        checked:    true,
        category:   engagement.category || '',
        subArea:    engagement.subArea  || '',
        maturity:   engagement.maturity || '',
        confidence: engagement.confidence,
        reason:     engagement.reason,
        userSet:    false,
      };
      // Persisted immediately: the async generation below re-reads the
      // blueprint from the database to pick this up.
      await blueprint.save();

      console.log(engagement.category
        ? `[engagement] ${blueprintId}: classified on regeneration — ${engagement.category}`
          + `${engagement.subArea ? ` / ${engagement.subArea}` : ''} (${engagement.maturity}).`
        : `[engagement] ${blueprintId}: still undecided on regeneration. ${engagement.reason}`);
    }

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
 * POST /strategy-canvas/claim-guest-blueprint
 * Body: { guestId }
 * Attaches an anonymous preview blueprint to the signed-in user's account.
 * Skipped (claimed: false) if the user already has a blueprint of their own,
 * so a returning user's real blueprint is never displaced by a preview.
 */
export async function claimGuestBlueprint(req, res) {
  try {
    const { guestId } = req.body;
    const userId      = req.user._id;

    if (!guestId || typeof guestId !== 'string') {
      return res.status(400).json({ error: 'guestId is required.' });
    }

    const existing = await TransformationBlueprint.findOne({ userId }).lean();
    if (existing) {
      return res.json({ claimed: false, reason: 'existing-blueprint' });
    }

    const claimed = await TransformationBlueprint.findOneAndUpdate(
      { guestId, userId: null },
      { $set: { userId }, $unset: { guestId: 1 } },
      { new: true }
    ).lean();

    if (!claimed) {
      return res.json({ claimed: false, reason: 'not-found' });
    }

    // Fire-and-forget: guest generation skips action-item extraction (cost
    // control — see blueprintGenerationService.js), so a claimed blueprint
    // needs a one-time backfill for whatever capabilities already completed.
    backfillActionItemsForClaimedBlueprint(claimed)
      .catch(err => console.error('[actionItems] Claim backfill failed (non-fatal):', err.message));

    return res.json({ claimed: true, transformationId: claimed._id });

  } catch (err) {
    console.error('claimGuestBlueprint error:', err);
    res.status(500).json({ error: 'Failed to claim preview blueprint.' });
  }
}

/**
 * GET /strategy-canvas/transformation-blueprint[?id=<blueprintId>]
 * Returns the user's most recent TransformationBlueprint, or a specific one
 * (still scoped to the user) when ?id= is given — used by the landing-page
 * sidebar's blueprint history.
 */
export async function getTransformationBlueprint(req, res) {
  try {
    const { id } = req.query;
    const query  = (id && mongoose.isValidObjectId(id))
      ? { _id: id, userId: req.user._id }
      : { userId: req.user._id };

    const bp = await TransformationBlueprint
      .findOne(query)
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
 * PATCH /strategy-canvas/transformation-blueprint/:blueprintId/engagement
 *
 * Corrects what kind of AI work this is. The classifier runs silently at
 * generation time so it never interrupts the landing flow; this is how a human
 * overrules it when it read the objective the wrong way round.
 *
 * Sets userSet, which stops any later regeneration replacing the answer with a
 * fresh guess. It does NOT regenerate anything itself — the client decides
 * whether to re-rank, because a correction made while reading is not
 * necessarily a request to spend a generation run.
 */
export async function setEngagement(req, res) {
  try {
    const { blueprintId } = req.params;
    const { category, subArea, maturity } = req.body || {};

    // Validated against the classifier's own vocabulary so the stored value can
    // never be something no reader downstream recognises.
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}.` });
    }
    if (subArea && !WORKFLOW_AREAS.includes(subArea)) {
      return res.status(400).json({ error: `subArea must be one of: ${WORKFLOW_AREAS.join(', ')}.` });
    }
    if (maturity && !['enterprise', 'startup', 'unknown'].includes(maturity)) {
      return res.status(400).json({ error: 'maturity must be enterprise, startup, or unknown.' });
    }

    const result = await TransformationBlueprint.updateOne(
      { _id: blueprintId, userId: req.user._id },
      { $set: {
        'engagement.checked':  true,
        'engagement.category': category,
        // subArea only means anything for workflow automation.
        'engagement.subArea':  category === 'workflow-automation' ? (subArea || '') : '',
        'engagement.maturity': maturity || 'unknown',
        'engagement.reason':   'Set by the user.',
        'engagement.userSet':  true,
      } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Blueprint not found.' });
    }
    return res.json({ category, subArea: subArea || '', maturity: maturity || 'unknown', userSet: true });
  } catch (err) {
    console.error('setEngagement error:', err);
    res.status(500).json({ error: 'Failed to save the engagement type.' });
  }
}

/**
 * PATCH /strategy-canvas/transformation-blueprint/:blueprintId/approve-opportunity
 * Records the user's approval of Cob's recommended starting point (the AI
 * Use Cases & Prioritization screen, Window 1) — a decision recorded on
 * the blueprint, not a generation output. Logged-in only: this is a real
 * decision-recording action, same gating spirit as other things this
 * product already reserves for signed-in users.
 */
export async function approveOpportunity(req, res) {
  try {
    const { blueprintId } = req.params;

    const result = await TransformationBlueprint.updateOne(
      { _id: blueprintId, userId: req.user._id },
      { $set: { 'opportunityApproval.approved': true, 'opportunityApproval.approvedAt': new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Blueprint not found.' });
    }
    return res.json({ approved: true });
  } catch (err) {
    console.error('approveOpportunity error:', err);
    res.status(500).json({ error: 'Failed to approve.' });
  }
}

/**
 * PATCH /strategy-canvas/transformation-blueprint/:blueprintId/app-name
 * What the customer calls their application. Set on Eame before the build,
 * so it reaches the repository name, the deployed application's title and
 * its chat header.
 */
export async function setAppName(req, res) {
  try {
    const { blueprintId } = req.params;
    const raw = typeof req.body?.appName === 'string' ? req.body.appName.trim() : '';

    // Bounded and stripped of control characters: this string ends up in a
    // repository name, an HTML title and a page heading.
    const appName = raw.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 48);
    if (appName && appName.length < 2) {
      return res.status(400).json({ error: 'Give your application a name of at least two characters.' });
    }

    const result = await TransformationBlueprint.updateOne(
      { _id: blueprintId, userId: req.user._id },
      { $set: { appName } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Blueprint not found.' });
    }
    return res.json({ appName });
  } catch (err) {
    console.error('setAppName error:', err);
    res.status(500).json({ error: 'Failed to save the application name.' });
  }
}

/**
 * GET /strategy-canvas/transformation-blueprints
 * Lightweight list of the user's blueprints for the sidebar history —
 * objective, status, and timestamps only (no domain content).
 */
export async function listTransformationBlueprints(req, res) {
  try {
    const blueprints = await TransformationBlueprint
      .find({ userId: req.user._id }, { businessObjective: 1, status: 1, createdAt: 1, updatedAt: 1 })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ blueprints });
  } catch (err) {
    console.error('listTransformationBlueprints error:', err);
    res.status(500).json({ error: 'Failed to list transformation blueprints.' });
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
 * POST /strategy-canvas/admin/remove-ai-engineering-enablement
 * One-time cleanup: removes the AI Engineering Enablement capability from the
 * calling user's TransformationBlueprint (Technology Infrastructure domain).
 */
export async function removeAIEngineeringEnablement(req, res) {
  try {
    const userId = req.user._id;
    const result = await TransformationBlueprint.updateMany(
      { userId, 'domains.domainId': 'technology-infrastructure' },
      {
        $pull: {
          'domains.$[dom].capabilities': { capabilityId: 'ai-engineering-enablement' },
        },
      },
      { arrayFilters: [{ 'dom.domainId': 'technology-infrastructure' }] }
    );
    return res.json({
      ok: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      message: 'AI Engineering Enablement capability removed from Technology Infrastructure domain.',
    });
  } catch (err) {
    console.error('removeAIEngineeringEnablement error:', err);
    res.status(500).json({ error: 'Cleanup failed.' });
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

/**
 * POST /strategy-canvas/admin/remove-ai-team-readiness
 * One-time migration: removes the AI Team Readiness capability entirely from
 * the calling user's TransformationBlueprint (capability has been retired).
 */
export async function removeAITeamReadiness(req, res) {
  try {
    const userId = req.user._id;
    const result = await TransformationBlueprint.updateMany(
      { userId, 'domains.capabilities.capabilityId': 'ai-team-readiness' },
      { $pull: { 'domains.$[].capabilities': { capabilityId: 'ai-team-readiness' } } }
    );
    return res.json({
      ok: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      message: 'AI Team Readiness capability removed from all blueprints.',
    });
  } catch (err) {
    console.error('removeAITeamReadiness error:', err);
    res.status(500).json({ error: 'Migration failed.' });
  }
}

/**
 * POST /strategy-canvas/admin/rename-ai-skills-assessment
 * One-time migration: renames the AI Skills Assessment capability to
 * AI Roles & Capability Planning in the calling user's TransformationBlueprint.
 */
export async function renameAISkillsAssessmentCapability(req, res) {
  try {
    const userId = req.user._id;
    const result = await TransformationBlueprint.updateMany(
      { userId, 'domains.domainId': 'skills-workforce', 'domains.capabilities.capabilityId': 'ai-skills-assessment' },
      {
        $set: {
          'domains.$[dom].capabilities.$[cap].capabilityId':   'ai-roles-capability-planning',
          'domains.$[dom].capabilities.$[cap].capabilityName': 'AI Roles & Capability Planning',
        },
      },
      { arrayFilters: [{ 'dom.domainId': 'skills-workforce' }, { 'cap.capabilityId': 'ai-skills-assessment' }] }
    );
    return res.json({
      ok: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      message: 'AI Skills Assessment renamed to AI Roles & Capability Planning.',
    });
  } catch (err) {
    console.error('renameAISkillsAssessmentCapability error:', err);
    res.status(500).json({ error: 'Migration failed.' });
  }
}
