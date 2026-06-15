import { askAdvisor } from '../services/advisorService.js';

export async function ask(req, res) {
  try {
    const {
      capabilityId,
      blueprint,
      question,
      automotiveBlueprint,
      conversationHistory,
      companyMemory,
    } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'question is required.' });
    }
    if (!capabilityId || typeof capabilityId !== 'string') {
      return res.status(400).json({ error: 'capabilityId is required.' });
    }

    const result = await askAdvisor({
      capabilityId,
      blueprint:           blueprint || {},
      question:            question.trim(),
      automotiveBlueprint: typeof automotiveBlueprint === 'string' ? automotiveBlueprint : '',
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      companyMemory:       companyMemory && typeof companyMemory === 'object' ? companyMemory : {},
    });

    return res.json(result);

  } catch (err) {
    console.error('advisor ask error:', err);

    // 503: all providers unavailable (missing keys, credits, outages)
    const isUnavailable =
      err.message?.includes('not configured') ||
      err.message?.includes('All LLM providers') ||
      err.message?.includes('No valid LLM providers');
    if (isUnavailable) {
      return res.status(503).json({ error: 'AI Advisor is not available. Please try again later.' });
    }
    return res.status(500).json({ error: 'Failed to generate advisor response.' });
  }
}
