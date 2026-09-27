/**
 * A recorded conversation, as text this application can read.
 *
 * ── Why an application cannot do this itself ───────────────────────────────
 *
 * This container holds no provider key, by design, so it cannot call a model
 * and cannot transcribe anything. It sends the recording to Svarg with the
 * gateway token it already has; Svarg spends the money, meters it against
 * this deployment's allowance, and hands back text. Same arrangement as every
 * other model call this application makes, and the same reason: a key in a
 * customer's container is a key that has left Svarg.
 *
 * ── What a transcript is, and is not ───────────────────────────────────────
 *
 * It is DATA. Nothing here decides that a call matters, that somebody made a
 * promise, or that anyone should be followed up. It is the step that turns a
 * conversation into rows, and everything after it — the watchers, the joins,
 * the findings — reasons over those rows in code, exactly as it does over a
 * spreadsheet. That is the only reason a model is allowed near this at all.
 *
 * ── Failure is a state, not an exception ───────────────────────────────────
 *
 * A recording that cannot be read must not stop a call being recorded as
 * having happened. The metadata — who rang, when, how long, which way — is
 * useful on its own and is most of what the watchers need; the transcript
 * makes it richer. So every failure here returns a reason rather than
 * throwing, and the caller lands the row either way.
 */
import axios from 'axios';

/** Where Svarg reads recordings. Unset, and nothing is transcribed. */
function endpoint() {
  return String(process.env.SVARG_TRANSCRIBE_URL || '').trim();
}

function token() {
  return String(process.env.SELFHOSTED_API_KEY || '').trim();
}

/** Long, because a model listening to a five-minute call is not quick. */
const TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS || 120000);

/** Whether this application can transcribe at all, for a screen to say so. */
export function canTranscribe() {
  return !!(endpoint() && token());
}

/**
 * Text from a recording.
 *
 * @param {Buffer|string} audio  the recording, or base64 of it
 * @param {string} mimeType
 * @returns {Promise<{ok, text, empty, reason}>} never throws
 */
export async function transcribe(audio, mimeType) {
  if (!canTranscribe()) {
    return fail('This application was not set up to read recordings.');
  }
  if (!audio || !audio.length) return fail('The recording was empty.');

  const data = Buffer.isBuffer(audio) ? audio.toString('base64') : String(audio);

  try {
    const res = await axios.post(
      endpoint(),
      { audio: data, mime_type: mimeType || 'audio/mpeg' },
      {
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        timeout: TIMEOUT_MS,
        // A three-minute call is a few megabytes of base64. axios defaults to
        // a 10MB body, which refuses a five-minute call for no stated reason.
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      },
    );
    const text = String(res.data?.text || '');
    return {
      ok: true,
      text,
      // Svarg's own answer, not a test of the string here: silence, hold music
      // and a wrong number all produce nothing, and all three are real.
      empty: !!res.data?.empty || !text.trim(),
      reason: '',
    };
  } catch (err) {
    return fail(reason(err));
  }
}

/**
 * The sentence Svarg sent, rather than the status code axios reports.
 *
 * A connector shows this to the owner, so "Request failed with status code
 * 429" has to become "the recording is longer than this plan allows" or it is
 * not worth showing.
 */
function reason(err) {
  const body = err?.response?.data?.error;
  if (typeof body === 'string') return body;
  if (body?.message) return body.message;
  if (err?.code === 'ECONNABORTED') return 'Svarg took too long to read the recording.';
  return String(err?.message || 'The recording could not be read.');
}

const fail = (why) => ({ ok: false, text: '', empty: true, reason: why });
