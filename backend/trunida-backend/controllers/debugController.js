/**
 * SoorgaAI — Debug / Testing Controller
 *
 * TEMPORARY: built specifically to let the team compare grounding quality
 * (core KB only vs. + Automotive KB vs. + linked Confluence docs) for one
 * capability without paying for a full multi-domain blueprint generation
 * every time. Read-only — no TransformationBlueprint is created or
 * written to. Safe to delete once this round of testing is done.
 *
 * POST /api/debug/compare-grounding
 *   Body: { businessObjective, blueprintId? }
 *   blueprintId is optional — omit it to skip the "with Confluence" variant.
 *   Runs AI Opportunity Discovery's brief generation 2-3 times in parallel
 *   and returns all variants in one response. CTO/Admin only (same gate as
 *   managing the org-wide Confluence connection).
 */

import UserProfile from '../models/UserProfile.js';
import { getDomainCapabilityBlueprint } from '../services/strategyCanvasService.js';
import { loadCompanyProfile, runBriefGeneration } from '../services/blueprintGenerationService.js';
import { getLinkedProjectContext } from '../services/connectedKnowledgeService.js';

const CAPABILITY_ID   = 'ai-opportunity-discovery';
const CAPABILITY_NAME = 'AI Opportunity Discovery';
const KB_PATH          = 'AI_Use_Cases';
const NO_KB_INDUSTRY   = 'General'; // matches blueprintGenerationService.js's fail-closed convention

export async function compareGrounding(req, res) {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
    const isCtoOrAdmin = req.user.role === 'admin' || profile?.role === 'CTO';
    if (!isCtoOrAdmin) {
      return res.status(403).json({ error: 'Access denied. This testing tool is restricted to CTO or admin users.' });
    }

    const { businessObjective, blueprintId } = req.body;
    if (!businessObjective) {
      return res.status(400).json({ error: 'businessObjective is required.' });
    }

    const companyProfile = await loadCompanyProfile(req.user._id);
    const cap = { id: CAPABILITY_ID, name: CAPABILITY_NAME, objective: '' };

    const coreOnlyBlueprint = getDomainCapabilityBlueprint(CAPABILITY_ID, KB_PATH, NO_KB_INDUSTRY);
    const automotiveBlueprint = getDomainCapabilityBlueprint(CAPABILITY_ID, KB_PATH, 'Automotive');

    const variants = {
      coreOnly: runBriefGeneration(cap, companyProfile, businessObjective, NO_KB_INDUSTRY, coreOnlyBlueprint.sections, '', null),
      withAutomotiveKB: runBriefGeneration(cap, companyProfile, businessObjective, 'Automotive', automotiveBlueprint.sections, automotiveBlueprint.automotiveBlueprint, null),
    };

    if (blueprintId) {
      variants.withConfluence = (async () => {
        const linkedContext = await getLinkedProjectContext(blueprintId).catch(() => null);
        if (!linkedContext) {
          return { skipped: true, reason: 'No linked Confluence documents found for that blueprintId.' };
        }
        return runBriefGeneration(cap, companyProfile, businessObjective, 'Automotive', automotiveBlueprint.sections, automotiveBlueprint.automotiveBlueprint, linkedContext);
      })();
    }

    const entries = Object.entries(variants);
    const settled = await Promise.allSettled(entries.map(([, p]) => p));

    const results = {};
    settled.forEach((outcome, i) => {
      const [key] = entries[i];
      results[key] = outcome.status === 'fulfilled' ? outcome.value : { error: outcome.reason?.message || 'Generation failed.' };
    });

    if (!blueprintId) {
      results.withConfluence = { skipped: true, reason: 'Pass a blueprintId with linked documents to include this variant.' };
    }

    return res.json({ capability: CAPABILITY_NAME, businessObjective, results });
  } catch (err) {
    console.error('[Debug] compareGrounding error:', err.message);
    return res.status(500).json({ error: 'Failed to run grounding comparison.' });
  }
}
