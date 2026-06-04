/**
 * SoorgaAI — Chat Controller
 *
 * POST   /api/chat/:domainId/message       — send a user message; returns reply + canvas updates
 * GET    /api/chat/:domainId/history       — paginated turn history
 * GET    /api/chat/:domainId/canvas        — current canvas snapshot for a domain
 * GET    /api/chat/:domainId/suggested-prompts — static suggested prompts from config
 */

import { getDomain }             from '../data/domainDefinitions.js';
import { handleTurn }            from '../services/conversationService.js';
import { applyUpdates }          from '../services/canvasEvolutionService.js';
import Conversation              from '../models/Conversation.js';
import DomainCanvas              from '../models/DomainCanvas.js';

// ── POST /api/chat/:domainId/message ──────────────────────────────────────────

export const sendMessage = async (req, res) => {
  try {
    const { domainId } = req.params;
    const { message }  = req.body;
    const userId       = req.user._id;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required.' });
    }

    const domain = getDomain(domainId);
    if (!domain) {
      return res.status(404).json({ error: `Domain "${domainId}" not found.` });
    }
    if (!domain.enabled) {
      return res.status(403).json({ error: `Domain "${domainId}" is not yet available. Coming soon.` });
    }

    // Run the conversation turn (Claude call + turn persistence)
    const { reply, parsedUpdates, conversationId } = await handleTurn(
      userId, domainId, message.trim()
    );

    // Validate + apply canvas updates atomically
    const acceptedUpdates = await applyUpdates(userId, domainId, parsedUpdates, conversationId);

    return res.status(200).json({
      reply,
      canvasUpdates:  acceptedUpdates,
      conversationId: conversationId.toString(),
    });

  } catch (err) {
    console.error('sendMessage error:', err);

    if (err.status === 404) {
      return res.status(404).json({ error: err.message });
    }

    // Claude API error or unexpected failure
    return res.status(503).json({
      error:   'We couldn\'t process that. Please try again.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// ── GET /api/chat/:domainId/history ───────────────────────────────────────────

export const getHistory = async (req, res) => {
  try {
    const { domainId } = req.params;
    const userId       = req.user._id;
    const limit        = Math.min(parseInt(req.query.limit) || 50, 100);
    const before       = req.query.before ? parseInt(req.query.before) : undefined;

    const conversation = await Conversation.findOne({ userId, domainId }).lean();
    if (!conversation) {
      return res.status(200).json({ turns: [], summary: '' });
    }

    let turns = conversation.turns;
    if (before !== undefined) {
      turns = turns.slice(0, before);
    }
    turns = turns.slice(-limit);

    return res.status(200).json({
      turns,
      summary:   conversation.summary || '',
      totalTurns: conversation.turns.length,
    });

  } catch (err) {
    console.error('getHistory error:', err);
    return res.status(500).json({ error: 'Failed to fetch conversation history.' });
  }
};

// ── GET /api/chat/:domainId/canvas ────────────────────────────────────────────

export const getCanvas = async (req, res) => {
  try {
    const { domainId } = req.params;
    const userId       = req.user._id;

    const canvas = await DomainCanvas.findOne({ userId, domainId }).lean();
    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found. Complete profile setup first.' });
    }

    return res.status(200).json({ focusAreas: canvas.focusAreas });

  } catch (err) {
    console.error('getCanvas error:', err);
    return res.status(500).json({ error: 'Failed to fetch canvas.' });
  }
};

// ── GET /api/chat/:domainId/suggested-prompts ─────────────────────────────────

export const getSuggestedPrompts = async (req, res) => {
  try {
    const { domainId } = req.params;
    const domain = getDomain(domainId);

    if (!domain) {
      return res.status(404).json({ error: `Domain "${domainId}" not found.` });
    }

    return res.status(200).json({ prompts: domain.suggestedPrompts });

  } catch (err) {
    console.error('getSuggestedPrompts error:', err);
    return res.status(500).json({ error: 'Failed to fetch suggested prompts.' });
  }
};
