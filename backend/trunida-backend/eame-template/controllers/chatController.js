/**
 * The chat, as the application answers it.
 *
 * Thin on purpose: services/answerService.js is the reasoning — which records
 * matter, what has to be computed, whether two rows are one person, and
 * whether the sentence written about them holds up.
 *
 * ── A failure is still an answer ──────────────────────────────────────────
 *
 * This never returns 500. A model that times out, a provider out of credit, a
 * dataset that cannot be read — none of that is the customer's problem to
 * decode, and a red error in a conversation reads as the application being
 * broken rather than one request being unlucky. Every path returns the same
 * envelope with a state of its own, so the page draws it like any other turn
 * and the person can simply ask again.
 */
import { answer } from '../services/answerService.js';
import { recentTurns } from '../services/turnLog.js';

const MAX_TURNS = 8;
const MAX_TEXT = 2000;

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(t => t && typeof t.text === 'string' && t.text.trim())
    .slice(-MAX_TURNS)
    .map(t => ({ role: t.role === 'assistant' ? 'assistant' : 'user', text: String(t.text).slice(0, MAX_TEXT) }));
}

/** What the last answer found, as the page hands it back. Trusted only in shape. */
function cleanContext(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const entities = Array.isArray(raw.entities)
    ? raw.entities.filter(e => typeof e === 'string' && e.trim()).slice(0, 60).map(e => e.slice(0, 120))
    : [];
  if (!entities.length && !raw.window) return null;
  return { entities, window: String(raw.window || '').slice(0, 40), intent: String(raw.intent || '').slice(0, 20) };
}

/** The shape the page draws, whatever happened. */
function fallback(answerText, state) {
  return {
    answer: answerText, state, reading: '', groups: [], overlap: null, sources: [],
    simulated: false, notes: [], intent: 'lookup', act: null, checked: true,
    context: { entities: [], window: '', intent: 'lookup' },
  };
}

export async function ask(req, res) {
  const question = String(req.body?.message || '').slice(0, MAX_TEXT).trim();
  if (!question) return res.json(fallback('Ask me something about your records and I will answer from them.', 'unknown'));

  // 'sample' answers from the simulated rows the application was built with,
  // 'own' from the customer's. The two are never mixed, because a number drawn
  // from both is true of neither.
  const kind = req.body?.kind === 'sample' ? 'sample' : 'own';

  try {
    const out = await answer({
      question,
      history: cleanHistory(req.body?.history),
      ctx: cleanContext(req.body?.context),
      kind,
    });
    // turnMiddleware in server.js records the turn from this response; the
    // conversation stays here and only the fact that one happened is a signal.
    return res.json(out);
  } catch (err) {
    console.error('[chat] failed —', err);
    // Said the way a colleague would say it, and never as a 500.
    const provider = /credit|quota|rate limit|429|balance/i.test(String(err?.message || ''));
    return res.json(fallback(
      provider
        ? 'I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.'
        : 'Something went wrong putting that answer together, so I would rather say so than guess. Try asking again.',
      'unknown',
    ));
  }
}

/**
 * GET /api/chat/history — the conversation, so a reload does not erase it.
 *
 * Only the text is returned. The groups, the sources and the overlap that the
 * page draws under a live answer were never stored, so a restored turn is the
 * sentence and not the cards — which is honest about what was kept, and far
 * better than an empty page after every refresh.
 *
 * Never an error: a conversation that cannot be read back is an empty
 * conversation, which is exactly what the page showed before this existed.
 */
export async function history(req, res) {
  try {
    const turns = await recentTurns(req.user?.userId, 20);
    return res.json({ turns });
  } catch (err) {
    console.warn('[chat] history not read —', err.message);
    return res.json({ turns: [] });
  }
}
