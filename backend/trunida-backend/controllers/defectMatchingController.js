/**
 * SoorgaAI — Defect Matching Controller
 *
 * POST /api/defect-matching/match — retrieve similar historical defects
 * for a new failure description and suggest a likely root cause.
 */

import { matchDefect } from '../services/defectMatchingService.js';

export const match = async (req, res) => {
  try {
    const { description, orgName, industry, topK } = req.body;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'description is required.' });
    }

    const result = await matchDefect({
      description: description.trim(),
      ...(orgName  ? { orgName }  : {}),
      ...(industry ? { industry } : {}),
      ...(topK     ? { topK: parseInt(topK) || undefined } : {}),
    });

    res.json(result);
  } catch (err) {
    console.error('[DefectMatching] match error:', err.message);
    res.status(500).json({ error: 'Failed to match defect.' });
  }
};
