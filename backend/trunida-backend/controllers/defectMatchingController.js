/**
 * SoorgaAI — Defect Matching Controller
 *
 * POST /api/defect-matching/match — retrieve similar historical defects
 * for a new failure description and suggest a likely root cause.
 * GET  /api/defect-matching/model-selection — preview which model would
 *      be selected for a given preference and why, with no generation
 *      call (no cost, works even before self-hosted hardware exists).
 */

import { matchDefect } from '../services/defectMatchingService.js';
import { selectModel } from '../services/modelSelectionService.js';

const VALID_PREFERENCES = ['auto', 'frontier', 'open-weight'];

export const match = async (req, res) => {
  try {
    const { description, orgName, industry, topK, modelPreference } = req.body;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'description is required.' });
    }
    if (modelPreference && !VALID_PREFERENCES.includes(modelPreference)) {
      return res.status(400).json({ error: `modelPreference must be one of: ${VALID_PREFERENCES.join(', ')}` });
    }

    const result = await matchDefect({
      description: description.trim(),
      ...(orgName         ? { orgName }         : {}),
      ...(industry        ? { industry }        : {}),
      ...(topK            ? { topK: parseInt(topK) || undefined } : {}),
      ...(modelPreference ? { modelPreference } : {}),
    });

    res.json(result);
  } catch (err) {
    console.error('[DefectMatching] match error:', err.message);
    // Surfaces the real reason (e.g. "SELFHOSTED_BASE_URL is not configured")
    // rather than a generic message — this is a protect-gated internal/demo
    // tool, not a customer-facing surface, so exposing it is a diagnosability
    // win, same reasoning already applied in personalJiraController.js.
    res.status(500).json({ error: `Failed to match defect: ${err.message}` });
  }
};

export const previewModelSelection = (req, res) => {
  try {
    const preference = req.query.preference || 'auto';
    if (!VALID_PREFERENCES.includes(preference)) {
      return res.status(400).json({ error: `preference must be one of: ${VALID_PREFERENCES.join(', ')}` });
    }
    res.json(selectModel({ preference }));
  } catch (err) {
    console.error('[DefectMatching] model-selection error:', err.message);
    res.status(500).json({ error: 'Failed to compute model selection.' });
  }
};
