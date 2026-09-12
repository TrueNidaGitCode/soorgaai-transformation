/**
 * Svarg — turning what someone said into the objective box
 *
 * The slowest step in the whole product is the first one: a blank box asking a
 * business person to describe their problem in writing. People stall there,
 * re-draft, and leave. Speaking it takes fifteen seconds and produces a better
 * description than typing does, because it is how they would explain it to a
 * colleague.
 *
 * ── Which provider, and why there are three ────────────────────────────────
 *
 * Wispr Flow was the first choice and cannot be used: it is a desktop app and
 * its API is closed to new partners. (It already works with Svarg for anyone
 * who has it installed, since it types into any field. This is for everyone
 * else.)
 *
 * ElevenLabs Scribe was the second, and is still first in the chain: it holds
 * accuracy across accents better than the alternatives, which decides it —
 * most people describing an objective into this box speak Indian-accented
 * English, and that is exactly where cheaper speech recognition falls apart.
 *
 * It is first in the chain rather than the only entry because every provider
 * here failed for a different billing reason on the way in, and none of those
 * failures were visible until the code stopped summarising them:
 *
 *   elevenlabs  free tier refuses datacenter addresses, and Railway is one
 *   openai      key valid, account out of credit
 *   gemini      funded, working, and already paying for every generation
 *
 * So the order is preference, and the fallback is what makes the feature ship
 * without waiting on a subscription. Fund any provider above the one currently
 * answering and it takes over on the next request, with nothing to redeploy.
 *
 * ── Batch, not realtime ────────────────────────────────────────────────────
 *
 * Scribe v2 Realtime streams words as you speak, over a WebSocket. It feels
 * better. It also needs WebSocket infrastructure this backend does not have,
 * and a 30-second objective costs a fifth of a cent either way. Record, stop,
 * transcribe is the honest first version; realtime is an upgrade that changes
 * no interface but this file.
 *
 * ── Why no multer ──────────────────────────────────────────────────────────
 *
 * Svarg's backend accepts no multipart bodies anywhere by deliberate choice
 * (see controllers/uploadController.js). The browser sends base64 inside JSON,
 * matching how folder uploads already work, and this file builds a multipart
 * request where one is needed — as a client, using Node 22's native FormData
 * and Blob. No new dependency, and no new class of request the server accepts.
 */

/** Ninety seconds: a five-minute recording takes a multimodal model a while
 *  to read, and thirty was tuned for a two-minute cap. */
const TIMEOUT_MS = 90000;

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
 *
 * ── On, through Gemini, by decision ────────────────────────────────────────
 *
 * This defaulted to empty for a while — no microphone anywhere, no provider
 * ever called — because every provider here bills per use and a feature that
 * starts spending on its own because a key for something else happens to exist
 * is not a feature anybody chose.
 *
 * That decision has since been taken: voice runs through Gemini, on the
 * GOOGLE_API_KEY that already pays for every blueprint. A spoken objective is a
 * fraction of a cent against the same bill, and it needs no second billing
 * relationship. Leaving it behind an unset variable meant the Speak control
 * this product now leads with was invisible on the deployed site.
 *
 * The variable still decides everything, it just has a default now:
 *
 *   TRANSCRIPTION_CHAIN=elevenlabs,gemini   best accents, needs a paid plan
 *   TRANSCRIPTION_CHAIN=off                 no microphone, nothing called
 *
 * The screen asks the server whether voice is available before offering a
 * microphone, so it appears and disappears with this one setting and no
 * redeploy of the frontend.
 */
const CHAIN = (process.env.TRANSCRIPTION_CHAIN === 'off'
  ? ''
  : process.env.TRANSCRIPTION_CHAIN || 'gemini')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/**
 * Each provider owns its whole request.
 *
 * They do not share a shape: the two speech APIs take multipart uploads, and
 * Gemini takes the audio inline in a JSON generateContent call like any other
 * part of a prompt. A common "build a form" helper would have to grow a special
 * case for the third one, which is how a helper becomes the thing you work
 * around. Each `run` returns {text, language} or throws.
 */
const PROVIDERS = {
  elevenlabs: {
    hasKey: () => !!process.env.ELEVENLABS_API_KEY,
    async run(audio, mimeType, ext) {
      const form = new FormData();
      form.append('file', new Blob([audio], { type: mimeType }), `speech.${ext}`);
      form.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v2');

      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw await providerError(res);
      const d = await res.json().catch(() => null);
      return { text: d?.text || '', language: d?.language_code || '' };
    },
  },

  openai: {
    hasKey: () => !!process.env.OPENAI_API_KEY,
    async run(audio, mimeType, ext) {
      const form = new FormData();
      form.append('file', new Blob([audio], { type: mimeType }), `speech.${ext}`);
      // whisper-1 rather than the newer transcribe models: it is on every
      // account with any OpenAI access at all, and a default that 404s on
      // somebody's plan fails for a reason they cannot see.
      form.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw await providerError(res);
      const d = await res.json().catch(() => null);
      return { text: d?.text || '', language: '' };
    },
  },

  /**
   * Gemini, which is the one that actually works here.
   *
   * Not a speech API — a multimodal model given the audio as a part of a
   * prompt. Worth having in the chain for a reason beyond quality: it is the
   * only provider on this server with credit on it. Every blueprint Svarg has
   * ever generated went through this key, so transcription costs nothing new to
   * set up and fails only when generation is already failing.
   */
  gemini: {
    hasKey: () => !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
    async run(audio, mimeType) {
      const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      const model = process.env.GEMINI_STT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash';

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  // Explicit about what NOT to do. Asked plainly to "transcribe",
                  // a chat model will happily answer the question it heard, or
                  // preface the transcript with "Sure, here is". Either would
                  // land in the objective box as if the speaker had typed it.
                  //
                  // And explicit about tidying. A verbatim transcript of someone
                  // describing their business is "you know, yeah, you know" every
                  // few words, which nobody would type and which the objective
                  // then carries. What lands in the box should read as the
                  // sentence they would have written: fillers and false starts
                  // gone, grammar fixed, every fact and figure and their own
                  // words kept. Cleaning is not summarising; nothing is dropped
                  // or added.
                  text: 'Transcribe this audio as clean written text, the way the speaker would '
                    + 'have typed it. Remove filler words (um, uh, you know, yeah, like, so, '
                    + 'actually) and false starts, and fix grammar and punctuation. Keep every '
                    + 'fact, number, name and the speaker\'s own wording otherwise; do not '
                    + 'summarise, shorten, reorder or add anything. Output only the text, with '
                    + 'no preamble, no commentary, no quotation marks and no formatting. '
                    + 'If there is no speech, output nothing at all.',
                },
                { inline_data: { mime_type: mimeType, data: Buffer.from(audio).toString('base64') } },
              ],
            }],
            // Explicit, so a long dictation cannot be cut by a default the
            // model picked. Five minutes of speech is under a thousand words.
            generationConfig: { temperature: 0, maxOutputTokens: 4096 },
          }),
        });

      if (!res.ok) throw await providerError(res);
      const d = await res.json().catch(() => null);
      const cand = d?.candidates?.[0];
      const text = (cand?.content?.parts || [])
        .map(p => p?.text || '').join('').trim();
      // A transcript that ends mid-sentence is either the recording or the
      // model stopping; the finish reason is the only way to tell which
      // afterwards, so it is logged whenever it is not a plain stop.
      if (cand?.finishReason && cand.finishReason !== 'STOP') {
        console.warn(`[transcription] gemini finished with ${cand.finishReason} after ${text.length} chars`);
      }
      return { text, language: '' };
    },
  },
};

/** The provider's own words, kept for the chain to report. */
async function providerError(res) {
  const detail = await res.text().catch(() => '');
  const err = new Error(`${res.status}${detail ? `: ${detail.slice(0, 260)}` : ''}`);
  err.isProvider = true;
  return err;
}

/** The providers that are actually usable right now, in preference order. */
function availableProviders() {
  return CHAIN.filter(name => PROVIDERS[name]?.hasKey());
}

/** Roughly two minutes of Opus. Enough for any objective, small enough to post. */
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

/**
 * Less than about half a second of anything. A press-and-release, or a
 * container with no samples in it. Refused here rather than sent, because a
 * chat model asked to transcribe silence will sometimes transcribe a sentence
 * that was never said -- an empty WAV came back as "and let the children know
 * where to locate you should they need you" -- and that would land in the
 * objective box as though the visitor had spoken it.
 */
export const MIN_AUDIO_BYTES = 2000;

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
  if (audio.length < MIN_AUDIO_BYTES) {
    throw new TranscriptionError('Nothing was heard. Hold the microphone and speak, then press it again.');
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new TranscriptionError('That recording is too long. Keep it under two minutes.', 413);
  }

  // The extension matters to some decoders even though the type is declared.
  const ext = /ogg/.test(mimeType) ? 'ogg' : /mp4|m4a/.test(mimeType) ? 'mp4' : /wav/.test(mimeType) ? 'wav' : 'webm';

  const failures = [];

  for (const name of usable) {
    try {
      const { text, language } = await PROVIDERS[name].run(audio, mimeType, ext);
      const clean = String(text || '').trim();

      /**
       * Silence stops the chain rather than falling through.
       *
       * A recording with nothing in it will be empty at the next provider too,
       * and trying again would spend a second call and several seconds to reach
       * the same answer. It is also not a provider failure — it is a fact about
       * the recording, and the speaker needs to hear that rather than watch the
       * button spin.
       */
      if (!clean) throw new TranscriptionError('Nothing was heard in that recording.', 422);

      return { text: clean, language: language || '', provider: name };
    } catch (err) {
      if (err instanceof TranscriptionError) throw err;
      /**
       * Each provider's own words, kept verbatim.
       *
       * Collapsing these into one summary is the least useful thing available:
       * a key missing a permission, a free account blocked for running on a
       * datacenter address, and an account with no credit all look the same
       * summarised and need entirely different things done about them. All
       * three actually happened while building this.
       *
       * A response body is a diagnostic, never a secret — it contains no key.
       */
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
