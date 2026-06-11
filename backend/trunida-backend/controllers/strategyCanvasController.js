import UserProfile from '../models/UserProfile.js';
import { getCapabilities, getCapabilityBlueprint } from '../services/strategyCanvasService.js';

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
