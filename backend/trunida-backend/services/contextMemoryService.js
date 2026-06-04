/**
 * SoorgaAI — Context Memory Service
 *
 * Pure function: given userId + domainId, assembles the context bundle
 * needed by conversationService to call Claude.
 *
 * Context bundle:
 *   { profile, canvasSnapshot, recentTurns, summary }
 *
 * Windowing strategy:
 *   - Last 10 turns verbatim (hard cap prevents runaway context).
 *   - Older turns are represented only via the rolling `summary` field.
 *   - Total input tokens stay within ~6,000 (enforced by max_tokens guard
 *     in conversationService, not here).
 */

import UserProfile  from '../models/UserProfile.js';
import DomainCanvas from '../models/DomainCanvas.js';
import Conversation from '../models/Conversation.js';

const RECENT_TURNS_LIMIT = 10;

/**
 * Load and return the full context bundle for one agent turn.
 * Throws if the user profile does not exist (caller should surface as 404).
 */
export async function loadContext(userId, domainId) {
  const [profile, canvas, conversation] = await Promise.all([
    UserProfile.findOne({ userId }).lean(),
    DomainCanvas.findOne({ userId, domainId }).lean(),
    Conversation.findOne({ userId, domainId }).lean(),
  ]);

  if (!profile) {
    const err = new Error('User profile not found.');
    err.status = 404;
    throw err;
  }

  const canvasSnapshot = canvas?.focusAreas || [];
  const allTurns       = conversation?.turns || [];
  const summary        = conversation?.summary || '';

  // Verbatim recent turns only — older history is in summary
  const recentTurns = allTurns.slice(-RECENT_TURNS_LIMIT);

  return { profile, canvasSnapshot, recentTurns, summary };
}
