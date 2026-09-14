/**
 * The chat, as the application answers it.
 *
 * Thin on purpose: services/answerService.js is the pipeline — which records
 * matter, how many there are, whether two rows are the same person, and
 * whether the sentence written about them is supported. This turns a request
 * into that call and an error into a sentence.
 *
 * `history` is the turns before this one, sent by the page, so a follow-up
 * resolves against what was just said instead of asking the customer to
 * repeat themselves. It is capped here rather than trusted: the page is the
 * customer's and could send anything.
 */
import { answer } from '../services/answerService.js';

const MAX_TURNS = 6;
const MAX_TEXT = 2000;

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(t => t && typeof t.text === 'string' && t.text.trim())
    .slice(-MAX_TURNS)
    .map(t => ({ role: t.role === 'assistant' ? 'assistant' : 'user', text: String(t.text).slice(0, MAX_TEXT) }));
}

export async function ask(req, res) {
  const question = String(req.body?.message || '').slice(0, MAX_TEXT).trim();
  if (!question) return res.status(400).json({ error: 'Ask a question.' });

  // 'sample' answers from the simulated rows the application was built with,
  // 'own' from the customer's. The page says which it is showing; the two are
  // never mixed, because a number drawn from both is true of neither.
  const kind = req.body?.kind === 'sample' ? 'sample' : 'own';

  try {
    const out = await answer({
      question,
      history: cleanHistory(req.body?.history),
      kind,
      appName: process.env.APP_NAME || '',
    });
    // turnMiddleware in server.js records the turn from the response; the
    // conversation stays here and only the fact that one happened is a signal.
    return res.json(out);
  } catch (err) {
    console.error('[chat] failed —', err);
    return res.status(500).json({ error: 'I could not put that answer together. Try again in a moment.' });
  }
}
