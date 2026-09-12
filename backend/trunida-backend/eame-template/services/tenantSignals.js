/**
 * What this application tells Svarg about itself, and the whole of it.
 *
 * The conversations in this application stay in this application (see
 * turnLog.js). Svarg learns how the application is used from a short list
 * of signals -- counts and votes, never a message body, never a row -- so
 * that it can notice what the customer needs next. That list is SIGNALS,
 * below, and it is exported so anyone can read it: the Data page shows it,
 * the privacy page on Svarg repeats it, and a test holds the two together.
 *
 * Where they go: SVARG_SIGNALS_URL, with the same token that reaches Svarg's
 * model gateway. Unset it and nothing is sent; the application runs in full.
 * A self-hosted install that wants no contact with Svarg leaves it unset.
 *
 * How they go: batched. A signal joins a queue; the queue is flushed every
 * thirty seconds or at forty entries, and a flush that fails is dropped --
 * these are hints, and an application must never wait on, or fail for, its
 * reporting.
 */
import axios from 'axios';

/** Every signal this application can send, and what each carries. Nothing else leaves. */
export const SIGNALS = Object.freeze({
  question_asked: 'One question was answered: which capability answered it, and when. Not the question.',
  feedback: 'A thumbs up or down on an answer: the vote, the capability, and when. Not the answer.',
  correction: 'What the owner said the answer should have been, in their words, when they chose to say so.',
  import: 'Rows arrived on a dataset: the dataset name, the source kind and the count. Not a row.',
});

const FLUSH_MS = 30 * 1000;
const FLUSH_AT = 40;
const MAX_CORRECTION = 1000;

let queue = [];
let timer = null;

function endpoint() {
  return String(process.env.SVARG_SIGNALS_URL || '').trim();
}

export function configured() {
  return !!endpoint();
}

/** Queue one signal. Unknown kinds are refused here, so the list above stays the truth. */
export function sendSignal(kind, payload = {}) {
  if (!SIGNALS[kind]) return false;
  if (!configured()) return false;
  const entry = { kind, at: new Date().toISOString() };
  if (payload.capability) entry.capability = String(payload.capability).slice(0, 80);
  if (kind === 'feedback') entry.vote = payload.vote === 'down' ? 'down' : 'up';
  if (kind === 'correction') entry.correction = String(payload.correction || '').slice(0, MAX_CORRECTION);
  if (kind === 'import') { entry.datasetName = String(payload.datasetName || '').slice(0, 120); entry.source = String(payload.source || ''); entry.rows = Number(payload.rows) || 0; }
  queue.push(entry);
  if (queue.length >= FLUSH_AT) flush();
  else if (!timer) { timer = setTimeout(flush, FLUSH_MS); if (typeof timer.unref === 'function') timer.unref(); }
  return true;
}

export async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length || !configured()) return 0;
  const batch = queue;
  queue = [];
  try {
    await axios.post(endpoint(), { signals: batch }, {
      headers: { Authorization: `Bearer ${process.env.SELFHOSTED_API_KEY || ''}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return batch.length;
  } catch (err) {
    // Dropped, and said once per flush. Retrying would only queue the same
    // failure behind the customer's next reply.
    console.warn('[signals] not delivered —', err.message);
    return 0;
  }
}

/** For tests: what is waiting to go. */
export function pending() {
  return queue.slice();
}
