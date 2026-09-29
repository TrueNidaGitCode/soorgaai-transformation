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
import { fetchCalls, ping, MAX_HISTORY_DAYS } from '../exotelApi.js';
import { generate } from '../llmService.js';

export const kind = 'phone';
export const label = 'Your phone system';
export const help = 'Calls from your cloud telephony service. '
  + 'On Exotel, paste the API key, token and Account SID from Settings → API Settings and '
  + 'press Test — your calls are read from there, last month included, with nothing to set '
  + 'up in Exotel. On any other service, put the webhook address shown here into the '
  + 'call-end or recording callback and calls arrive as they finish. '
  + 'Switch the "this call is being recorded" announcement on in your provider account '
  + 'before you start: that announcement is how a caller consents, and it cannot be set '
  + 'from here.';

/**
 * What the card asks, and what it refuses to ask.
 *
 * ── Three fields, not six ──────────────────────────────────────────────────
 *
 * Every question here was measured against one test: can the person in front
 * of it answer without guessing? Four could not, and they are gone.
 *
 * WHICH DATASET. The rows are calls. There is exactly one shape a call has,
 * this connector declares it in `provides`, and asking somebody to pick a
 * home for it — from a list of datasets about patients and appointments — is
 * asking them to make a filing decision on behalf of a program that already
 * knows the answer. describeShape() below answers it instead.
 *
 * READ THE RECORDINGS. A phone connector that does not read recordings
 * captures who rang and nothing about why, and the transcript is the entire
 * reason this source exists. It stays on. The cost it was guarding is
 * guarded properly elsewhere: MAX_PER_SYNC bounds how many recordings one
 * sync listens to, and an application with no transcription configured
 * simply does not transcribe.
 *
 * WHICH CLUSTER, and HOW FAR BACK. Nothing on an Exotel dashboard is
 * labelled "region", and nobody can pick a number of days before they have
 * seen anything. Both clusters are tried; the window is a month. See
 * exotelApi.js.
 *
 * ── And "optional" is a fact about the provider, not the field ─────────────
 *
 * The three credentials are what Exotel's API requires: without any one of
 * them there is nothing to call. On a webhook-only provider the same three
 * are genuinely optional, because the recording link may need no login. So
 * they are marked required FOR the providers that cannot work without them,
 * and the card says so — rather than labelling the only three things that
 * matter "optional" and leaving somebody to wonder what the form is for.
 */
export const fields = [
  { name: 'provider', label: 'Which service', options: PROVIDER_IDS,
    hint: PROVIDERS.map((p) => `${p.id} = ${p.label}`).join(' · ') },
  { name: 'authUser', label: 'API key', required: false, requiredWhen: { provider: ['exotel'] },
    hint: 'Exotel: your API Key, from Settings → API Settings. Twilio: the Account SID.' },
  { name: 'authToken', label: 'API token', required: false, secret: true,
    requiredWhen: { provider: ['exotel'] },
    hint: 'On the same page as the key. Not your sign-in password.' },
  { name: 'accountSid', label: 'Account SID', required: false,
    requiredWhen: { provider: ['exotel'] },
    hint: 'Also on that page. This is what lets your calls be read straight from Exotel, '
      + 'last month included, with nothing to set up there.' },
];

/** Left at a month: one request, and all anybody has an opinion about. */
const HISTORY_DAYS = 30;

/** Whether this connection can fetch, or only receive. */
export function canPull(config) {
  return String(config.provider || '') === 'exotel'
    && !!String(config.authUser || '').trim()
    && !!String(config.authToken || '').trim()
    && !!String(config.accountSid || '').trim();
}

const historyDays = (config) => {
  const n = Number(String(config.history || '').trim());
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_HISTORY_DAYS) : HISTORY_DAYS;
};

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

/**
 * The dataset this fills, worked out rather than asked about.
 *
 * A call has one shape and this connector declares it, so there is no filing
 * decision for anybody to make: the columns ARE `provides`, in that order,
 * and the mapping is therefore one to one — every column tagged to the field
 * that fills it, with nothing to line up by hand.
 *
 * Named after the service, so a business running two of them gets two
 * datasets rather than one with both mixed in. `call_id` is the key, which is
 * what makes a call landing twice — once from the webhook, once from the
 * pull — one row rather than two.
 */
export function describeShape(config = {}) {
  const p = PROVIDERS.find((x) => x.id === config.provider);
  return {
    name: `Calls (${p ? p.label : 'Phone'})`,
    columns: provides,
    key: 'call_id',
    /*
     * Bookkeeping, not business. transcript_status says how far to trust the
     * transcript beside it and received_at is when this application heard
     * about the call — both matter to a person reading a row and neither is
     * a column a watcher should ever bind itself to.
     */
    internal: ['transcript_status', 'received_at', 'call_id'],
  };
}

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
  /*
   * Not being able to listen is no longer a refusal.
   *
   * It used to throw, and told somebody to answer "no" under a question that
   * no longer exists. Who rang, when, for how long and how it ended is a real
   * source on its own, so the connection is made and the shortfall is said
   * out loud in the message instead of costing them the whole card.
   */
  const deaf = !canTranscribe() ? ' Recordings will not be read — this application has no '
    + 'transcription configured, so calls arrive with who rang and when, but no words.' : '';
  const held = await callsCollection().countDocuments().catch(() => 0);

  /*
   * Where it can ask, it asks.
   *
   * The paragraph above is still true of seven of the eight providers here.
   * Exotel with credentials is not a letterbox but a source, and a source
   * that cannot say "yes, I can see your calls" while somebody is looking at
   * the card is one they find out about tomorrow, from an empty screen.
   */
  if (canPull(config)) {
    const seen = await ping({
      key: config.authUser, token: config.authToken, sid: config.accountSid,
    });
    return {
      ok: true,
      message: `Connected to Exotel at ${seen.host}. ${seen.total} call${seen.total === 1 ? '' : 's'} `
        + `in the last 30 days, and ${historyDays(config)} days of history on the first sync.`
        + (held ? ` ${held} already here from the webhook.` : '') + deaf,
    };
  }

  if (provider === 'exotel') {
    return {
      ok: true,
      message: held
        ? `Ready. ${held} call${held === 1 ? '' : 's'} received so far. Add the API key, token and `
          + 'Account SID to read your history as well, without configuring anything in Exotel.'
        : 'Ready, but nothing will arrive until you either paste the webhook address into Exotel, '
          + 'or fill in the API key, token and Account SID so this can read the calls itself.',
    };
  }

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
  /*
   * Fetch first, then listen, then hand over everything held.
   *
   * In that order because a call fetched on this tick should be read on this
   * tick: pulling and then waiting an hour to listen would make the first
   * sync of a new connection land a screen of rows with nothing in them,
   * which reads as a product that does not work.
   *
   * Never fatal. A pull that fails has lost nothing — the calls the webhook
   * delivered are still here and still worth landing — and a connection that
   * goes red because Exotel was slow is a connection somebody deletes.
   */
  if (canPull(config)) {
    try {
      const got = await fetchCalls({
        key: config.authUser, token: config.authToken,
        sid: config.accountSid,
        days: historyDays(config),
      });
      /*
       * The same parser the webhook uses.
       *
       * Exotel spells its fields the same way in the API as in the callback —
       * Sid, From, StartTime, ConversationDuration, RecordingUrl — and two
       * parsers for one provider is how they drift. keep() is keyed on the
       * call id, so a call that arrived at the webhook and is fetched again
       * is one row, and the transcript it already has survives.
       */
      const added = await keep(callsIn(got.calls, 'exotel'));
      if (added) console.log(`[phone] Exotel: ${added} new of ${got.calls.length} read`);
    } catch (err) {
      console.warn('[phone] could not read from Exotel:', err.message);
    }
  }

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
  // 'off' covers both ways it can be off: an older connection that answered
  // "no" while that question existed, and an application with no
  // transcription configured. Neither is 'pending', which would promise a
  // reading that is never coming.
  if (config.transcribe === 'no' || !canTranscribe()) return 'off';
  if (!call.recordingUrl) return 'none';
  return call.transcriptStatus || 'pending';
}
