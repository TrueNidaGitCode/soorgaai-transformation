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

const TIMEOUT_MS = 30000;

/**
 * ── Why there is a chain and not one provider ───────────────────────────────
 *
 * ElevenLabs' free tier refuses requests from datacenter addresses — it answers
 * `detected_unusual_activity` and blames a proxy or VPN. Railway IS a
 * datacenter, so a free ElevenLabs account can never serve a server-side
 * integration however the key is scoped. That is a billing fact, not a bug, and
 * it is not one this code can route around.
 *
 * Rather than making voice input wait on a subscription, transcription fails
 * over the same way llmService already does for generation: try each configured
 * provider in order, use the first that answers. Add credit to ElevenLabs and
 * it takes over on the next request with nothing to redeploy; take it away and
 * OpenAI carries the feature.
 *
 * Order matters and is deliberate. ElevenLabs is first because it holds
 * accuracy across accents better, which is the whole reason it was chosen —
 * most people describing an objective into this box speak Indian-accented
 * English. Whisper is the floor, not the preference.
 */
const CHAIN = (process.env.TRANSCRIPTION_CHAIN || 'elevenlabs,openai')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const PROVIDERS = {
  elevenlabs: {
    keyEnv: 'ELEVENLABS_API_KEY',
    url: 'https://api.elevenlabs.io/v1/speech-to-text',
    model: () => process.env.ELEVENLABS_STT_MODEL || 'scribe_v2',
    headers: () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY }),
    form: (blob, name, model) => {
      const f = new FormData();
      f.append('file', blob, name);
      f.append('model_id', model);
      return f;
    },
    textOf: (d) => d?.text,
  },

  openai: {
    keyEnv: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/audio/transcriptions',
    // whisper-1 rather than the newer transcribe models: it is on every account
    // that has any OpenAI access at all, and a default that 404s on somebody's
    // plan is a default that fails for a reason they cannot see.
    model: () => process.env.OPENAI_STT_MODEL || 'whisper-1',
    headers: () => ({ Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }),
    form: (blob, name, model) => {
      const f = new FormData();
      f.append('file', blob, name);
      f.append('model', model);
      return f;
    },
    textOf: (d) => d?.text,
  },
};

/** The providers that are actually usable right now, in preference order. */
function availableProviders() {
  return CHAIN.filter(name => PROVIDERS[name] && process.env[PROVIDERS[name].keyEnv]);
}

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
  return availableProviders().length > 0;
}

/**
 * @param {Buffer} audio  the recording, as bytes
 * @param {string} mimeType  what the browser said it recorded
 * @returns {Promise<{text: string, language: string}>}
 */
export async function transcribe(audio, mimeType = 'audio/webm') {
  const usable = availableProviders();
  if (!usable.length) {
    /**
     * A refusal, not a failure.
     *
     * Said in words the operator can act on rather than as a 500. The screen
     * hides the microphone entirely when this is the case, so reaching here at
     * all means something asked anyway.
     */
    throw new TranscriptionError(
      'Voice input is not configured on this server — no transcription key is set.', 503);
  }
  if (!audio?.length) throw new TranscriptionError('No audio was received.');
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new TranscriptionError('That recording is too long. Keep it under two minutes.', 413);
  }

  // The extension matters to some decoders even though the type is declared.
  const ext = /ogg/.test(mimeType) ? 'ogg' : /mp4|m4a/.test(mimeType) ? 'mp4' : /wav/.test(mimeType) ? 'wav' : 'webm';
  const blob = new Blob([audio], { type: mimeType });

  const failures = [];

  for (const name of usable) {
    const p = PROVIDERS[name];
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: p.headers(),
        body: p.form(blob, `speech.${ext}`, p.model()),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        /**
         * The provider's own words, kept verbatim, including on a 401.
         *
         * Collapsing every 401 to "the key was rejected" is the least useful
         * true sentence available: a wrong key, a key missing the
         * speech-to-text permission, and a free account blocked for running on
         * a datacenter address all arrive as 401 and all need different fixes.
         * Two of those three actually happened here, and the summary would
         * have hidden both.
         *
         * The body is a diagnostic, never a secret — it does not contain a key.
         */
        failures.push(`${name} (${res.status})${detail ? `: ${detail.slice(0, 260)}` : ''}`);
        continue;
      }

      const data = await res.json().catch(() => null);
      const text = String(p.textOf(data) || '').trim();

      /**
       * Silence stops the chain rather than falling through.
       *
       * A recording with nothing in it will be empty at the next provider too,
       * and trying again would spend a second call and several seconds to
       * arrive at the same answer. It is also not a provider failure — it is a
       * fact about the recording, and the speaker needs to hear that rather
       * than watch the button spin.
       */
      if (!text) throw new TranscriptionError('Nothing was heard in that recording.', 422);

      return { text, language: String(data?.language_code || ''), provider: name };
    } catch (err) {
      if (err instanceof TranscriptionError) throw err;
      failures.push(`${name}: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
    }
  }

  /**
   * Every provider failed, and each says why.
   *
   * Listed rather than summarised, because with a chain the useful question is
   * not "did it fail" but "did they fail for the same reason". One key missing
   * a permission and one account out of credit look identical in a summary and
   * need entirely different things done about them.
   */
  throw new TranscriptionError(`Transcription failed — ${failures.join(' | ')}`, 502);
}
