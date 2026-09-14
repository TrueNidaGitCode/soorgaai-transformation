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
import { recentTurns, recordTurn } from '../services/turnLog.js';

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

/*
 * The same answer, delivered as it is made.
 *
 * A question takes about eight seconds, and almost all of it is the model
 * writing prose about facts that were settled seconds earlier. Streaming does
 * not make it faster; it stops the customer watching nothing happen.
 *
 * Three kinds of event:
 *   stage     what is being done now, so the progress shown is the real work
 *             rather than a timer guessing at it
 *   evidence  the records, counts, names and sources — computed and validated
 *             by code, final, and never revised by anything that follows
 *   done      the sentence, and the whole envelope again so a client can
 *             simply use this one and ignore the rest
 *
 * The evidence is never rewritten. That is the point of sending it early: the
 * answer is finished long before the sentence about it is, and a customer who
 * sees six names at two seconds has been answered, whatever arrives at seven.
 */
function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx and friends will otherwise hold the whole response to buffer it,
    // which turns a stream back into the thing it replaced.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  let open = true;
  res.on('close', () => { open = false; });
  return {
    send(event, data) {
      if (!open) return;
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`); } catch { open = false; }
    },
    end() { if (open) { try { res.end(); } catch { /* already gone */ } } open = false; },
    get open() { return open; },
  };
}

/** Does this caller want the answer as it is made, or all at once? */
function wantsStream(req) {
  return req.body?.stream === true || /text\/event-stream/i.test(String(req.headers.accept || ''));
}

export async function ask(req, res) {
  const question = String(req.body?.message || '').slice(0, MAX_TEXT).trim();
  if (!question) return res.json(fallback('Ask me something about your records and I will answer from them.', 'unknown'));

  // 'sample' answers from the simulated rows the application was built with,
  // 'own' from the customer's. The two are never mixed, because a number drawn
  // from both is true of neither.
  const kind = req.body?.kind === 'sample' ? 'sample' : 'own';
  const ctx = cleanContext(req.body?.context);
  const history = cleanHistory(req.body?.history);

  /** The same words for a failure, whichever way the answer is being sent. */
  const failed = (err) => {
    console.error('[chat] failed —', err);
    const provider = /credit|quota|rate limit|429|balance/i.test(String(err?.message || ''));
    return fallback(
      provider
        ? 'I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.'
        : 'Something went wrong putting that answer together, so I would rather say so than guess. Try asking again.',
      'unknown',
    );
  };

  if (!wantsStream(req)) {
    try {
      const out = await answer({ question, history, ctx, kind });
      // turnMiddleware in server.js records the turn from this response; the
      // conversation stays here and only the fact that one happened is a signal.
      return res.json(out);
    } catch (err) {
      return res.json(failed(err));
    }
  }

  const stream = sse(res);
  let out = null;
  try {
    out = await answer({
      question, history, ctx, kind,
      onStage: (name, payload) => {
        if (name === 'evidence') stream.send('evidence', payload);
        else stream.send('stage', { stage: name, ...(payload || {}) });
      },
    });
  } catch (err) {
    out = failed(err);
  }

  stream.send('done', out);
  stream.end();

  /*
   * turnMiddleware cannot see this one: it wraps res.json, and a stream never
   * calls it. Recorded here instead, or the conversation a customer gets back
   * after a reload would be missing every streamed turn — which is every turn.
   */
  try {
    await recordTurn({
      question,
      answer: String(out?.answer || ''),
      capability: 'chat',
      sessionId: req.user?.userId || '',
    });
  } catch { /* a turn that cannot be written down is not an answer that failed */ }
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
