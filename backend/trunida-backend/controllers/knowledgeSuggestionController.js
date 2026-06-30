/**
 * SoorgaAI — Knowledge Suggestion Controller
 *
 * GET  /api/knowledge-suggestions              — list suggestions (? status, projectId, page, limit)
 * GET  /api/knowledge-suggestions/:id          — single suggestion detail
 * POST /api/knowledge-suggestions/batch        — save multiple suggestions from AI response
 * POST /api/knowledge-suggestions/:id/approve  — approve + store in company KB
 * POST /api/knowledge-suggestions/:id/reject   — reject
 */

import {
  saveSuggestions,
  listSuggestions,
  getSuggestion,
  approveSuggestion,
  rejectSuggestion,
} from '../services/knowledgeSuggestionService.js';

export const list = async (req, res) => {
  try {
    const { status, projectId, page = 1, limit = 50 } = req.query;
    const result = await listSuggestions({
      userId: req.user._id,
      status,
      projectId,
      page:  parseInt(page)  || 1,
      limit: parseInt(limit) || 50,
    });
    res.json(result);
  } catch (err) {
    console.error('[KS] list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch knowledge suggestions.' });
  }
};

export const getOne = async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id, req.user._id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found.' });
    res.json(suggestion);
  } catch (err) {
    console.error('[KS] getOne error:', err.message);
    res.status(500).json({ error: 'Failed to fetch suggestion.' });
  }
};

export const saveBatch = async (req, res) => {
  try {
    const { suggestions, projectId, sourceConversation } = req.body;

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({ error: 'suggestions array is required.' });
    }
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId is required.' });
    }

    const saved = await saveSuggestions(suggestions, {
      projectId,
      userId: req.user._id,
      sourceConversation,
    });

    res.status(201).json({ saved: saved.length, items: saved });
  } catch (err) {
    console.error('[KS] saveBatch error:', err.message);
    res.status(500).json({ error: 'Failed to save knowledge suggestions.' });
  }
};

export const approve = async (req, res) => {
  try {
    const suggestion = await approveSuggestion(req.params.id, req.user._id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found.' });
    res.json(suggestion);
  } catch (err) {
    console.error('[KS] approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve suggestion.' });
  }
};

export const reject = async (req, res) => {
  try {
    const suggestion = await rejectSuggestion(req.params.id, req.user._id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found or already actioned.' });
    res.json(suggestion);
  } catch (err) {
    console.error('[KS] reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject suggestion.' });
  }
};
