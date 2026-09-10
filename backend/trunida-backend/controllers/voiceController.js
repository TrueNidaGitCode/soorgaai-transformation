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

import { transcribe, transcriptionConfigured, MAX_AUDIO_BYTES } from '../services/transcriptionService.js';

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

    const b64 = String(req.body?.audio || '');
    if (!b64) return res.status(400).json({ error: 'No audio was sent.' });

    // Checked before decoding: base64 is about a third larger than the bytes it
    // carries, and decoding a payload we are about to reject wastes the memory
    // the limit exists to protect.
    if (Buffer.byteLength(b64, 'utf8') > MAX_AUDIO_BYTES * 1.4) {
      return res.status(413).json({ error: 'That recording is too long. Keep it under two minutes.' });
    }

    const audio = Buffer.from(b64, 'base64');
    const { text, language } = await transcribe(audio, String(req.body?.mimeType || 'audio/webm'));
    return res.json({ text, language });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[voice]', err.message);
    return res.status(status).json({ error: err.message || 'Could not transcribe that.' });
  }
}
