/**
 * Svarg — turning a recorded conversation into text.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Two clinics described the same problem and neither of them could show it to
 * us, because the evidence was a phone call. A booking says No Show; the
 * patient rang to cancel, or rang afterwards to ask about upgrading, and the
 * front desk said they would check and get back. Every watcher in the
 * catalogue reads rows, and a conversation is not rows until something turns
 * it into them.
 *
 * ── Where this sits, and why it cannot live in the delivered application ───
 *
 * A delivered application holds no provider key, by design. So it cannot call
 * a model, and it cannot transcribe anything: it sends the audio across the
 * gateway and Svarg spends the money, meters it, and hands back text. This
 * file is the Svarg half. controllers/gatewayController.js is the door.
 *
 * ── The rule this file holds ───────────────────────────────────────────────
 *
 * A transcript is DATA, never a judgement. Nothing here decides that a call
 * matters, that a promise was made, or that anybody should be followed up.
 * It returns what was said and how confident it is that it heard it. The
 * agents reason over the rows afterwards, in code, exactly as they do over a
 * spreadsheet — which is the only reason a model may touch this at all.
 *
 * ── Accounting ─────────────────────────────────────────────────────────────
 *
 * Audio is charged as input tokens, and there are a lot of them: Gemini reads
 * roughly 32 tokens a second, so a three-minute call is about 5,800 tokens
 * before a word of transcript comes back. That is small money per call and
 * real money per month, and the last time a token class was not counted —
 * thinking tokens, billed as output and invisible for months — the ledger,
 * the spend cap and every estimate were wrong together. So the count returned
 * here is the provider's own reported usage, never an estimate from duration.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * What a recording may be, and how long.
 *
 * The ceiling is about cost and about honesty: an hour of audio is 115,000
 * input tokens, and an application that silently accepts it produces a bill
 * nobody predicted. A call longer than this is refused with its length in the
 * message rather than truncated, because half a transcript that does not say
 * it is half is the kind of evidence this product must not produce.
 */
export const MAX_AUDIO_BYTES = Number(process.env.TRANSCRIBE_MAX_BYTES || 24 * 1024 * 1024);

/** What the providers will actually accept. A recording is one of these. */
export const AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm',
  'audio/ogg', 'audio/opus', 'audio/aac', 'audio/mp4', 'audio/m4a', 'audio/flac',
];

/**
 * The instruction, and everything it refuses to do.
 *
 * It is deliberately not asked to summarise, to judge tone, or to say what
 * the customer wanted. Those are the extraction step's job, over text, where
 * the result can be checked against a transcript somebody can read. A model
 * asked to transcribe AND interpret in one pass produces an interpretation
 * with no transcript to check it against.
 *
 * Speaker labels are asked for because the whole value of a phone call is who
 * said what: "I'll check and get back to you" is a commitment when staff say
 * it and nothing at all when the customer does.
 */
const INSTRUCTION = [
  'Transcribe this recording of a telephone call, exactly as spoken.',
  '',
  'RULES',
  '- Write only what is said. Add nothing, summarise nothing, correct nothing.',
  '- Label each turn "Caller:" or "Staff:" when it is clear who is speaking, and',
  '  "Speaker:" when it is not. Never guess to avoid saying "Speaker:".',
  '- Keep the language it was spoken in, including where it switches mid-sentence.',
  '  Do not translate. Indian callers mix English with Hindi, Tamil, Telugu,',
  '  Kannada, Malayalam, Marathi and Bengali, often inside one sentence.',
  '- Where a stretch is inaudible, write [inaudible] rather than a guess.',
  '- Return the transcript alone: no preamble, no notes, no headings.',
].join('\n');

/**
 * Text from audio.
 *
 * @param {object}  opts
 * @param {Buffer}  opts.audio       the recording itself
 * @param {string}  opts.mimeType    what it is
 * @param {string}  [opts.model]     provider model id; the caller's catalogue choice
 * @returns {Promise<{text, inputTokens, outputTokens, model}>}
 */
export async function transcribe({ audio, mimeType, model }) {
  const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio || '', 'base64');
  const type = String(mimeType || '').toLowerCase().split(';')[0].trim();

  if (!buf.length) throw badRequest('No audio was sent.');
  if (buf.length > MAX_AUDIO_BYTES) {
    throw badRequest(`That recording is ${mb(buf.length)}MB, and the limit is `
      + `${mb(MAX_AUDIO_BYTES)}MB. Send a shorter call, or split it.`);
  }
  if (!AUDIO_TYPES.includes(type)) {
    throw badRequest(`"${mimeType}" is not an audio type this can read. `
      + `Send one of: ${AUDIO_TYPES.join(', ')}.`);
  }

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured.');

  const apiModel = model || process.env.TRANSCRIBE_MODEL || 'gemini-3.8-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const mdl = genAI.getGenerativeModel({ model: apiModel });

  /*
   * Thinking off, and it is not a micro-optimisation.
   *
   * Transcription is the least reasoning-shaped work there is: the answer is
   * in the audio. Thinking is billed as output at the output rate, and on a
   * long call it can cost more than the transcript it precedes.
   */
  const result = await mdl.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: INSTRUCTION },
        { inlineData: { mimeType: type, data: buf.toString('base64') } },
      ],
    }],
    generationConfig: {
      maxOutputTokens: Number(process.env.TRANSCRIBE_MAX_TOKENS || 8192),
      thinkingConfig: { thinkingBudget: 0 },
      // A transcript is not a place for invention.
      temperature: 0,
    },
  });

  const response = result.response;
  const meta = response.usageMetadata || {};

  let text;
  try {
    text = response.text();
  } catch {
    const finish = response.candidates?.[0]?.finishReason || 'UNKNOWN';
    throw new Error(`The recording could not be transcribed (${finish}).`);
  }

  /*
   * An empty transcript is reported as empty, never as a transcript.
   *
   * Silence, hold music and a wrong number all produce nothing, and all three
   * are legitimate answers. What must not happen is an empty string travelling
   * onward as though the call had been read and found to contain nothing —
   * downstream that becomes a call with no signals, which is a finding about
   * the business rather than a fact about the audio.
   */
  const clean = String(text || '').trim();

  return {
    text: clean,
    empty: !clean,
    // The provider's own counts. Audio tokens are inside promptTokenCount.
    inputTokens: Number(meta.promptTokenCount || 0),
    outputTokens: Number(meta.candidatesTokenCount || 0),
    model: apiModel,
  };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const mb = (n) => (n / (1024 * 1024)).toFixed(1);
