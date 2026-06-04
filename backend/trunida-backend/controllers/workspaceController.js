/**
 * SoorgaAI — Workspace Controller
 *
 * GET /api/workspace/state
 *   Returns everything the workspace shell needs to render:
 *   { profile, domains: [{ domainId, title, enabled, canvas, lastActivityAt }] }
 *
 * GET /api/workspace/domains
 *   Returns the static domain catalog (no auth required).
 *   Used by the frontend to render the domain card grid even before profile setup.
 */

import UserProfile  from '../models/UserProfile.js';
import DomainCanvas from '../models/DomainCanvas.js';
import Conversation from '../models/Conversation.js';
import DOMAINS      from '../data/domainDefinitions.js';

// ── GET /api/workspace/state ──────────────────────────────────────────────────

export const getWorkspaceState = async (req, res) => {
  try {
    const userId = req.user._id;

    const [profile, canvases, conversations] = await Promise.all([
      UserProfile.findOne({ userId }).lean(),
      DomainCanvas.find({ userId }).lean(),
      Conversation.find({ userId }, { domainId: 1, lastActivityAt: 1 }).lean(),
    ]);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Complete profile setup first.' });
    }

    // Build a lookup map for canvases and last activity
    const canvasMap       = Object.fromEntries(canvases.map(c => [c.domainId, c]));
    const activityMap     = Object.fromEntries(conversations.map(c => [c.domainId, c.lastActivityAt]));

    const domains = DOMAINS.map(domain => ({
      domainId:       domain.domainId,
      title:          domain.title,
      description:    domain.description,
      icon:           domain.icon,
      enabled:        domain.enabled,
      canvas:         canvasMap[domain.domainId]?.focusAreas || [],
      lastActivityAt: activityMap[domain.domainId] || null,
    }));

    return res.status(200).json({ profile, domains });

  } catch (err) {
    console.error('getWorkspaceState error:', err);
    return res.status(500).json({ error: 'Failed to load workspace state.' });
  }
};

// ── GET /api/workspace/domains ────────────────────────────────────────────────

export const getDomainCatalog = async (req, res) => {
  try {
    const catalog = DOMAINS.map(({ domainId, title, description, icon, enabled }) => ({
      domainId,
      title,
      description,
      icon,
      enabled,
    }));
    return res.status(200).json({ domains: catalog });
  } catch (err) {
    console.error('getDomainCatalog error:', err);
    return res.status(500).json({ error: 'Failed to fetch domain catalog.' });
  }
};
