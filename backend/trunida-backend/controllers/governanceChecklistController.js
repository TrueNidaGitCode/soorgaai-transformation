/**
 * SoorgaAI — Governance Checklist Controller
 *
 * Window 6 (Yusu) of the pipeline wizard. Reads the real, already-generated
 * "Governance & Ethics" domain content off the ORU Pre-analysis blueprint
 * (Cob's output, generated earlier — not regenerated here) and turns each
 * section's priorityActions into a checklist the user confirms before
 * treating the deployed agent as production-ready.
 *
 * This controller exists for the one real demo engagement (KPIT/CARIAD),
 * same convention as personalJiraController.js's ORG_NAME — not a generic
 * multi-tenant lookup.
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';

const COMPANY_NAME = 'KPIT';
const DOMAIN_ID = 'governance-security';

// ── GET /api/governance-checklist ─────────────────────────────────────────────

export async function getChecklist(req, res) {
  try {
    const blueprint = await TransformationBlueprint.findOne({ userId: req.user._id, companyName: COMPANY_NAME })
      .sort('-updatedAt')
      .lean();

    if (!blueprint) {
      return res.status(404).json({ error: 'No KPIT blueprint found for this account.' });
    }

    const domain = blueprint.domains.find(d => d.domainId === DOMAIN_ID);
    if (!domain) {
      return res.status(404).json({ error: 'Governance & Ethics domain has not been generated on this blueprint yet.' });
    }

    const capability = domain.capabilities[0];
    if (!capability || !capability.sections?.length) {
      return res.status(404).json({ error: 'Governance & Ethics content is not available yet.' });
    }

    const sections = capability.sections.map(section => ({
      title: section.title,
      items: section.brief?.priorityActions || [],
    })).filter(s => s.items.length);

    return res.json({
      capabilityName: capability.capabilityName,
      // capability.status can be 'error' from a later regeneration attempt
      // hitting a provider outage while still holding usable content from
      // an earlier successful run — surface it, don't hide the content.
      generatedWithErrors: capability.status === 'error',
      sections,
    });
  } catch (err) {
    console.error('[GovernanceChecklist] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve governance checklist.' });
  }
}
