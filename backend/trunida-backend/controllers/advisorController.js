import { askAdvisor } from '../services/advisorService.js';

export async function ask(req, res) {
  try {
    const { capabilityId, blueprint, question } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'question is required.' });
    }
    if (!capabilityId || typeof capabilityId !== 'string') {
      return res.status(400).json({ error: 'capabilityId is required.' });
    }

    const result = await askAdvisor({
      capabilityId,
      blueprint: blueprint || {},
      question:  question.trim(),
    });

    return res.json(result);

  } catch (err) {
    console.error('advisor ask error:', err);

    if (err.message?.includes('not configured')) {
      return res.status(503).json({ error: 'AI Advisor is not available. Please try again later.' });
    }
    return res.status(500).json({ error: 'Failed to generate advisor response.' });
  }
}
