/**
 * Svarg — turning what someone said into the objective box
 *
 * The slowest step in the whole product is the first one: a blank box asking a
 * business person to describe their problem in writing. People stall there,
 * re-draft, and leave. Speaking it takes fifteen seconds and produces a better
 * description than typing does, because it is how they would explain it to a
 * colleague.
 *
 * ── Why ElevenLabs Scribe ───────────────────────────────────────────────────
 *
 * Wispr Flow was the first choice and cannot be used: it is a desktop app, and
 * its API is closed to new partners. (Worth knowing that Flow already works
 * with Svarg for anyone who has it installed — it types into any field, so the
 * objective box is already dictatable today. This is for everyone else.)
 *
 * Scribe is a public API with self-serve keys, cheaper than Whisper ($0.22/hr
 * against roughly $0.36) and built to hold accuracy across accents and
 * dialects. That last part decides it: most of the people describing an
 * objective into this box speak Indian-accented English, and that is precisely
 * where the browser's own speech API falls apart.
 *
 * ── Why the batch endpoint and not the realtime one ─────────────────────────
 *
 * Scribe v2 Realtime streams words as you speak, over a WebSocket, for $0.39/hr.
 * It feels better. It also needs WebSocket infrastructure this backend does not
 * have, and a 30-second objective costs a fifth of a cent either way. Record,
 * stop, transcribe is the honest first version; realtime is an upgrade that
 * changes no interface but this file.
 *
 * ── Why no multer ──────────────────────────────────────────────────────────
 *
 * Svarg's backend accepts no multipart bodies anywhere by deliberate choice
 * (see controllers/uploadController.js). The browser sends base64 inside JSON,
 * matching how folder uploads already work, and THIS file builds the multipart
 * request — as a client, using Node 22's native FormData and Blob. No new
 * dependency, and no new class of request the server has to accept.
 */

const API_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const MODEL_ID = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';
const TIMEOUT_MS = 30000;

/** Roughly two minutes of Opus. Enough for any objective, small enough to post. */
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

export class TranscriptionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'TranscriptionError';
    this.status = status;
  }
}

/** Whether transcription can work at all, for the screen to ask before offering it. */
export function transcriptionConfigured() {
  return !!process.env.ELEVENLABS_API_KEY;
}

/**
 * @param {Buffer} audio  the recording, as bytes
 * @param {string} mimeType  what the browser said it recorded
 * @returns {Promise<{text: string, language: string}>}
 */
export async function transcribe(audio, mimeType = 'audio/webm') {
  if (!transcriptionConfigured()) {
    /**
     * A refusal, not a failure.
     *
     * Said in words the operator can act on rather than as a 500. The screen
     * hides the microphone entirely when this is the case, so reaching here at
     * all means something asked anyway.
     */
    throw new TranscriptionError(
      'Voice input is not configured on this server — ELEVENLABS_API_KEY is not set.', 503);
  }
  if (!audio?.length) throw new TranscriptionError('No audio was received.');
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new TranscriptionError('That recording is too long. Keep it under two minutes.', 413);
  }

  // The extension matters to some decoders even though the type is declared.
  const ext = /ogg/.test(mimeType) ? 'ogg' : /mp4|m4a/.test(mimeType) ? 'mp4' : /wav/.test(mimeType) ? 'wav' : 'webm';

  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), `speech.${ext}`);
  form.append('model_id', MODEL_ID);

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // A timeout or a DNS failure is theirs, not the speaker's. Say so, because
    // "we could not hear you" would send someone to re-record for no reason.
    throw new TranscriptionError(
      `Could not reach the transcription service (${err.name === 'TimeoutError' ? 'timed out' : err.message}).`, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');

    /**
     * Say what THEY said, including on a 401.
     *
     * This used to collapse every 401 to "the transcription key was rejected",
     * which is the least useful true sentence available: a rejected key, a key
     * without the speech-to-text permission, an account with no credit and a
     * model the plan does not include all arrive as 401 and all need different
     * fixes. Swallowing the provider's own explanation at exactly the moment
     * somebody needs it is the same failure as a stale error on a lead row.
     *
     * The body is a diagnostic, not a secret — it never contains the key.
     */
    throw new TranscriptionError(
      `Transcription failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ' with no detail'}.`, 502);
  }

  const data = await res.json().catch(() => null);
  const text = String(data?.text || '').trim();

  /**
   * Silence is a real outcome and gets its own message.
   *
   * An empty string returned into the objective box looks like the button did
   * nothing, and the speaker's next move is to press it again rather than to
   * check their microphone.
   */
  if (!text) throw new TranscriptionError('Nothing was heard in that recording.', 422);

  return { text, language: String(data?.language_code || '') };
}
