import UserProfile from '../models/UserProfile.js';
import { getCapabilities, getCapabilityBlueprint } from '../services/strategyCanvasService.js';
import { suggestBlueprintSection } from '../services/blueprintSuggestService.js';

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
    const { capabilityId, blueprint, sectionTitle, currentContent, request } = req.body;

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
      blueprint:      blueprint || {},
      sectionTitle,
      currentContent: currentContent || '',
      request:        request.trim(),
    });

    return res.json(result);

  } catch (err) {
    console.error('suggestSection error:', err);

    const isUnavailable =
      err.message?.includes('not configured') ||
      err.message?.includes('All LLM providers') ||
      err.message?.includes('No valid LLM providers');
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
