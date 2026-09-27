/**
 * The phone system, as a source.
 *
 * ── What it is for ─────────────────────────────────────────────────────────
 *
 * A booking says No Show. The patient rang to cancel, or rang afterwards to
 * ask about upgrading and was told somebody would check and get back. None of
 * that is anywhere a watcher can read it, because it happened on the phone —
 * so the record and what actually happened disagree, and the business cannot
 * see the gap it is losing money to.
 *
 * This is the connector that makes a call readable: the provider posts a
 * webhook when a call ends, the recording is fetched with the owner's own
 * credentials, Svarg turns it into text across the gateway, and the whole
 * thing lands as a row like any other.
 *
 * ── One connector, many providers ──────────────────────────────────────────
 *
 * The owner says which service they use and the difference lives in
 * services/phoneProviders.js as a lookup table. "Something else" reads every
 * field name any of them has used, which is the honest default for a market
 * where a clinic's phone system is whatever their telecom reseller sold them.
 *
 * ── The consent line, which is not optional ────────────────────────────────
 *
 * Recording a patient's call is processing personal data, and in a clinic it
 * is health-adjacent personal data. Every provider here can play "this call
 * is being recorded" before connecting, and that announcement is the consent.
 * It is the owner's to switch on in their own provider account — this
 * application cannot do it for them — so the help text says so plainly rather
 * than leaving somebody to find out afterwards.
 *
 * ── What is a fact and what is a reading ───────────────────────────────────
 *
 * The metadata is a fact: the provider recorded who rang, when, for how long.
 * The transcript is a reading, and it is marked as one — `transcript_status`
 * says whether the text is there, missing, or failed, and why. A row whose
 * transcript failed still lands: who rang and when is most of what the
 * watchers need, and half the evidence is better than a call nobody knows
 * happened.
 */
import axios from 'axios';
import mongoose from 'mongoose';
import { callsIn, PROVIDERS, PROVIDER_IDS } from '../phoneProviders.js';
import { transcribe, canTranscribe } from '../transcribeService.js';
import { readSignals, SIGNAL_FIELDS } from '../callSignalService.js';
import { generate } from '../llmService.js';

export const kind = 'phone';
export const label = 'Your phone system';
export const help = 'Calls from your cloud telephony service, arriving as they end. '
  + 'Choose your provider, paste the credentials that let this application download a '
  + 'recording, then put the webhook address shown here into your provider\'s call-end or '
  + 'recording callback. Switch the "this call is being recorded" announcement on in your '
  + 'provider account before you start: that announcement is how a caller consents, and it '
  + 'cannot be set from here.';

export const fields = [
  { name: 'provider', label: 'Which service', options: PROVIDER_IDS,
    hint: PROVIDERS.map((p) => `${p.id} = ${p.label}`).join(' · ') },
  { name: 'authUser', label: 'API key or account id', required: false,
    hint: 'Only needed if your recordings are behind a login. Twilio: the Account SID. Exotel: your API key.' },
  { name: 'authToken', label: 'API token', required: false, secret: true,
    hint: 'Sent with the download request. Left blank, recordings are fetched without credentials, which works where the link is already signed.' },
  { name: 'transcribe', label: 'Read the recordings', options: ['yes', 'no'],
    hint: 'Turning this off keeps who rang and when, and skips the cost of listening.' },
];

/**
 * What one call carries, for the mapping onto the dataset.
 *
 * The last five are the transcript read into columns a watcher can filter on
 * — see callSignalService. A transcript is four hundred characters of prose
 * and every operator in the answer pipeline compares a column to a value, so
 * without these the recording is readable by a person and invisible to the
 * product.
 */
export const provides = [
  'date', 'time', 'name', 'phone', 'direction', 'duration_seconds', 'agent',
  'status', 'transcript', 'transcript_status', 'call_id', 'received_at',
  ...SIGNAL_FIELDS,
];

/** Where calls received at the webhook are kept: this application's database. */
export function callsCollection() {
  return mongoose.connection.collection('svarg_phone_calls');
}

export function describe(config) {
  const p = PROVIDERS.find((x) => x.id === config.provider);
  return `${p ? p.label : 'a phone system'} · ${config.transcribe === 'no' ? 'calls only' : 'calls and recordings'}`;
}

/**
 * There is nothing to reach out to.
 *
 * Every other connector tests by calling its source. This one is the reverse:
 * the provider calls US, and no credential here proves that will happen. So
 * the test says what is true — the address is ready, and nothing will arrive
 * until it is pasted into the provider — rather than inventing a check that
 * would pass whether or not the webhook was ever configured.
 */
export async function test(config) {
  const provider = String(config.provider || '').trim();
  if (!PROVIDER_IDS.includes(provider)) {
    throw new Error(`Choose one of: ${PROVIDER_IDS.join(', ')}.`);
  }
  if (config.transcribe !== 'no' && !canTranscribe()) {
    throw new Error('This application cannot read recordings yet, so choose "no" under '
      + 'Read the recordings, or ask Svarg to enable it.');
  }
  const held = await callsCollection().countDocuments().catch(() => 0);
  return {
    ok: true,
    message: held
      ? `Ready. ${held} call${held === 1 ? '' : 's'} received so far.`
      : 'Ready. Put the webhook address shown here into your provider\'s call-end callback, '
        + 'and calls will arrive as they finish. Nothing will appear until you do.',
  };
}

/** Kept once per call id, so a provider's retries add nothing. */
export async function keep(calls) {
  if (!calls.length) return 0;
  const col = callsCollection();
  const r = await col.bulkWrite(calls.map((c) => ({
    updateOne: {
      filter: { callId: c.callId || `${c.from}-${c.at ? new Date(c.at).getTime() : ''}` },
      update: { $setOnInsert: { ...c, keptAt: new Date(), transcript: '', transcriptStatus: 'pending' } },
      upsert: true,
    },
  })), { ordered: false });
  return r.upsertedCount || 0;
}

/** How many recordings one sync will listen to. A ceiling on cost, per run. */
const MAX_PER_SYNC = Number(process.env.PHONE_TRANSCRIBE_PER_SYNC || 25);

/**
 * Fetch a recording, with the owner's credentials if it needs them.
 *
 * A username and a token together are Basic, which is what Twilio and Exotel
 * want; a token alone is a Bearer. Neither is a guess the owner cannot see —
 * both fields say what they are for on the card.
 */
async function fetchRecording(url, config) {
  const user = String(config.authUser || '').trim();
  const token = String(config.authToken || '').trim();
  const headers = {};
  if (user && token) {
    headers.Authorization = 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64');
  } else if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await axios.get(url, {
    headers,
    responseType: 'arraybuffer',
    timeout: Number(process.env.PHONE_FETCH_TIMEOUT_MS || 60000),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return {
    audio: Buffer.from(res.data),
    mimeType: String(res.headers?.['content-type'] || 'audio/mpeg').split(';')[0].trim(),
  };
}

/**
 * Listen to what has arrived and not been listened to.
 *
 * Bounded per run, and every outcome is written back to the call — so a
 * recording that cannot be fetched is tried once and recorded as failed,
 * rather than retried on every sync for ever at the cost of a model call.
 */
async function transcribePending(config) {
  if (config.transcribe === 'no' || !canTranscribe()) return;
  const col = callsCollection();
  const pending = await col.find({
    transcriptStatus: 'pending',
    recordingUrl: { $nin: ['', null] },
  }).sort({ at: 1 }).limit(MAX_PER_SYNC).toArray().catch(() => []);

  for (const call of pending) {
    let status = 'failed';
    let text = '';
    let why = '';
    try {
      const { audio, mimeType } = await fetchRecording(call.recordingUrl, config);
      const out = await transcribe(audio, mimeType);
      if (out.ok && !out.empty) { status = 'read'; text = out.text; }
      // Silence, hold music and a wrong number are real answers, and saying
      // "nothing was said" is different from saying it could not be read.
      else if (out.ok) { status = 'silent'; }
      else { why = out.reason; }
    } catch (err) {
      why = String(err?.message || err).slice(0, 300);
    }

    /*
     * And what the conversation was about, in columns.
     *
     * Only for a call that was actually read: there is nothing to extract
     * from silence, and asking anyway would spend a model call to be told so.
     */
    const signals = status === 'read'
      ? await readSignals(text, askModel)
      : null;

    await col.updateOne({ _id: call._id }, {
      $set: {
        transcript: text, transcriptStatus: status, transcriptError: why,
        transcribedAt: new Date(),
        ...(signals ? { signals } : {}),
      },
    }).catch(() => {});
  }
}

/**
 * The one model call this connector makes on its own behalf.
 *
 * Wrapped rather than passed straight through so the signature stays the one
 * callSignalService is tested against, and so the spend has one name in the
 * logs rather than appearing as an anonymous generate().
 */
async function askModel({ systemPrompt, userMessage, thinking }) {
  const out = await generate({
    systemPrompt, userMessage, thinking, label: 'call-signals',
    maxTokens: Number(process.env.CALL_SIGNAL_MAX_TOKENS || 400),
  });
  return out?.text || '';
}

/**
 * Everything received, as rows.
 *
 * A pull is a read of what the webhook has been filling, the same way the
 * WhatsApp connector works — so "Sync now" and the schedule both land what
 * has arrived, and listening to new recordings happens on the same tick.
 */
export async function pull(config, { maxRows = 50000 } = {}) {
  await transcribePending(config);

  const docs = await callsCollection().find({}).sort({ at: 1 }).limit(maxRows).toArray();
  return docs.map((c) => {
    const at = c.at ? new Date(c.at) : null;
    return {
      date: at ? at.toLocaleDateString('en-GB') : '',
      time: at ? at.toTimeString().slice(0, 5) : '',
      // The phone number is the name until something else resolves it. A
      // clinic's diary is keyed on a person, so matching happens downstream
      // against whatever the customer's own records call them.
      name: c.name || c.from || '',
      phone: c.from || '',
      direction: c.direction || '',
      duration_seconds: String(c.durationSec || 0),
      agent: c.agent || '',
      status: c.status || '',
      transcript: String(c.transcript || '').replace(/\s*\n\s*/g, ' | '),
      /*
       * Whether the text above is evidence, and how far to trust its absence.
       *
       *   read      a recording was fetched and transcribed
       *   silent    it was transcribed and there was nothing said
       *   pending   it has not been listened to yet
       *   failed    it could not be fetched or read — see transcriptError
       *   none      the provider sent no recording for this call
       *   off       the owner turned reading off
       *
       * Without this, an empty transcript means all six at once, and a
       * watcher looking for calls with nothing recorded would report the
       * ones this application simply has not got to yet.
       */
      transcript_status: statusOf(c, config),
      call_id: c.callId || '',
      received_at: at ? at.toISOString() : '',
      /*
       * What the call was about, as columns a watcher can filter on.
       *
       * Empty where the call was never read — deliberately not 'no'. "No
       * promise was made" and "nobody has read this call" are different
       * facts, and a watcher looking for kept promises must not count the
       * second as the first.
       */
      intent: c.signals?.intent || '',
      request: c.signals?.request || '',
      promise: c.signals?.promise || '',
      promise_quote: c.signals?.promise_quote || '',
      signals_checked: c.signals?.signals_checked || '',
    };
  });
}

function statusOf(call, config) {
  if (config.transcribe === 'no') return 'off';
  if (!call.recordingUrl) return 'none';
  return call.transcriptStatus || 'pending';
}
