/**
 * SoorgaAI — Governance Checklist Controller
 *
 * Window 6 (Yusu) of the pipeline wizard. Confirms the real, already-
 * generated "Governance & Ethics" domain exists for this engagement
 * (Cob's output — not regenerated here), then runs a real, automated test
 * suite (services/governanceTestService.js) against the live
 * defect-matching capability and publishes the results — no manual
 * checklist-checking, per direction ("no more person involved... run the
 * applicable test automatically and publish the result").
 *
 * This controller exists for the one real demo engagement (KPIT/CARIAD),
 * same convention as personalJiraController.js's ORG_NAME — not a generic
 * multi-tenant lookup.
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { runGovernanceTests } from '../services/governanceTestService.js';

const COMPANY_NAME = 'KPIT';
const DOMAIN_ID = 'governance-security';

// ── POST /api/governance-checklist/run ────────────────────────────────────────

export async function runChecklist(req, res) {
  try {
    const blueprint = await TransformationBlueprint.findOne({ userId: req.user._id, companyName: COMPANY_NAME })
      .sort('-updatedAt')
      .lean();

    if (!blueprint) {
      return res.status(404).json({ error: 'No KPIT blueprint found for this account.' });
    }

    const domain = blueprint.domains.find(d => d.domainId === DOMAIN_ID);
    const capability = domain?.capabilities?.[0];
    if (!domain || !capability?.sections?.length) {
      return res.status(404).json({ error: 'Governance & Ethics domain has not been generated on this blueprint yet.' });
    }

    const { results, passedCount, total } = await runGovernanceTests();

    return res.json({
      capabilityName: capability.capabilityName,
      // capability.status can be 'error' from a later regeneration attempt
      // hitting a provider outage while still holding usable content from
      // an earlier successful run — the domain existing (checked above) is
      // what matters here, not this flag; surfaced for transparency only.
      sourceGeneratedWithErrors: capability.status === 'error',
      passedCount,
      total,
      results,
    });
  } catch (err) {
    console.error('[GovernanceChecklist] POST run error:', err.message);
    return res.status(500).json({ error: `Failed to run governance tests: ${err.message}` });
  }
}
