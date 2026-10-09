/**
 * Svarg — the voice endpoint behind the objective box
 *
 * Public and unauthenticated, because the box it serves is the one an anonymous
 * guest types into before they have an account. That is the whole point of it:
 * the first thing anybody does with Svarg should not require a signup.
 *
 * Bounded the same way guest generation is — a per-IP limit in memory, a hard
 * size cap, and nothing stored.
 *
 * ── Nothing is kept ─────────────────────────────────────────────────────────
 *
 * The audio exists in this process for the length of one request and is never
 * written to disk or to the database. What the speaker said comes back to their
 * own browser and goes in their own text box; if they then generate a
 * blueprint, the TEXT is stored exactly as if they had typed it. A recording of
 * someone's voice is a different kind of data from a sentence they wrote, and
 * there is no reason to hold one.
 */

import { transcribe, transcriptionConfigured, MAX_AUDIO_BYTES, TranscriptionError } from '../services/transcriptionService.js';

/** Five minutes in 25-second pieces is twelve; a little room for timing. */
const MAX_SEGMENTS = 16;

/** Per-IP, in memory, resets on deploy — same shape as the guest generator's. */
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 60 * 60 * 1000;
const _hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const hits = (_hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) { _hits.set(ip, hits); return true; }
  hits.push(now);
  _hits.set(ip, hits);
  return false;
}

/**
 * GET /api/guest/voice-status
 *
 * Asked once on page load so the microphone is only offered when it can
 * actually work. A button that fails when pressed is worse than no button:
 * it teaches people the product is broken at the first thing they touch.
 */
export function voiceStatus(req, res) {
  return res.json({ available: transcriptionConfigured() });
}

/** POST /api/guest/transcribe — { audio: base64, mimeType } -> { text } */
export async function transcribeAudio(req, res) {
  try {
    if (tooMany(req.ip || '')) {
      return res.status(429).json({ error: 'Too many recordings from here. Try again shortly.' });
    }

    /*
     * One recording, or the 25-second pieces the page now sends.
     *
     * Pieces because Sarvam, first in the chain for Indian voices, takes at
     * most 30 seconds a request. Each piece is a whole file the browser closed
     * on its own, so nothing here has to cut audio. They are transcribed in
     * order and joined; a piece with nothing in it (a long pause) adds nothing
     * rather than failing the rest.
     */
    const segments = Array.isArray(req.body?.segments)
      ? req.body.segments
      : [{ audio: req.body?.audio, mimeType: req.body?.mimeType }];
    if (!segments.length || segments.length > MAX_SEGMENTS) {
      return res.status(400).json({ error: segments.length ? 'That recording is too long.' : 'No audio was sent.' });
    }
    const b64s = segments.map((s) => String(s?.audio || ''));
    if (b64s.every((b) => !b)) return res.status(400).json({ error: 'No audio was sent.' });

    // Checked before decoding: base64 is about a third larger than the bytes it
    // carries, and decoding a payload we are about to reject wastes the memory
    // the limit exists to protect.
    const total = b64s.reduce((n, b) => n + Buffer.byteLength(b, 'utf8'), 0);
    if (total > MAX_AUDIO_BYTES * 1.4) {
      return res.status(413).json({ error: 'That recording is too long. Keep it under five minutes.' });
    }

    const texts = [];
    let language = '';
    let quiet = null;
    for (let i = 0; i < segments.length; i += 1) {
      if (!b64s[i]) continue;
      const audio = Buffer.from(b64s[i], 'base64');
      try {
        const out = await transcribe(audio, String(segments[i]?.mimeType || 'audio/webm'));
        texts.push(out.text);
        if (!language && out.language) language = out.language;
      } catch (err) {
        // Silence in one piece is a pause, not a failure — unless it is the
        // only piece, which the check below reports.
        if (segments.length > 1 && err instanceof TranscriptionError && err.status < 500 && err.status !== 413) {
          quiet = err;
          continue;
        }
        throw err;
      }
    }
    if (!texts.length) throw quiet || new TranscriptionError('Nothing was heard in that recording.', 422);
    return res.json({ text: texts.join(' ').replace(/\s+/g, ' ').trim(), language });
  } catch (err) {
    const status = err.status || 500;

    /**
     * Detail goes to the log; the visitor gets a sentence they can act on.
     *
     * This endpoint is public and unauthenticated — it serves the first box a
     * stranger touches. It was returning the provider's message verbatim, which
     * meant a Google billing failure put "Your project has exceeded its monthly
     * spending cap" and a link to the spend console into the browser of every
     * prospect who pressed Speak. That is internal financial state, shown to
     * exactly the people it should never be shown to.
     *
     * Not the same thing as swallowing an error. The provider's own words still
     * matter and are still kept — they go to the server log, and an operator can
     * reproduce the whole chain at /api/llm-status?test=1. What changes is who
     * reads them.
     *
     * The 4xx messages stay verbatim because they are about the recording and
     * the speaker is the only person who can fix them: too long, nothing heard,
     * nothing sent.
     */
    if (status >= 500) {
      console.error('[voice]', err.message);
      return res.status(status).json({
        error: 'Voice input is temporarily unavailable. Please type your objective instead.',
      });
    }

    return res.status(status).json({ error: err.message || 'Could not transcribe that.' });
  }
}
