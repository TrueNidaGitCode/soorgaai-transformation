/**
 * Cloud telephony, read as one shape.
 *
 * ── Why this is one connector and not eight ────────────────────────────────
 *
 * Exotel, Twilio, Knowlarity, MyOperator, Ozonetel, Servetel, Tata Smartflo
 * and the rest all post the same nine facts when a call ends: which call,
 * who rang, what they rang, which way, when, how long, who took it, how it
 * ended, and where the recording is. What differs is the spelling. `CallSid`
 * or `call_id` or `uuid`; `RecordingUrl` or `recording_url` or `Filename`.
 *
 * Eight connector modules would be eight copies of one webhook, one fetch and
 * one landing, differing by a lookup table — and eight cards on the Data page
 * where seven are wrong for any given customer. So there is one "Your phone
 * system" card, the owner says which service they use, and the difference
 * lives here as a table.
 *
 * ── Aliases, not exact field names, and why ────────────────────────────────
 *
 * Every one of these providers has changed its payload between versions, and
 * several post different shapes for a missed call than for an answered one.
 * A single hardcoded field name per provider would be right until the first
 * time it was not, and then it would be silently wrong: a row landed with an
 * empty caller and a blank time looks like a quiet week rather than a broken
 * parser.
 *
 * So each field is a LIST of names that have been seen for it, tried in
 * order, and a provider nobody listed falls back to the union of all of them.
 * That last part is the point: we do not know what a customer runs, and a
 * prospect saying "we use something called Acefone" should not be a build.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * Nothing here guesses. A field that cannot be found is empty and is REPORTED
 * empty — `missing` names it — so a connector can say "these calls arrived
 * without a caller number" instead of landing rows that read as facts.
 */

/** Everything a call is, whoever delivered it. */
export const CALL_FIELDS = [
  'callId', 'from', 'to', 'direction', 'at', 'durationSec', 'agent', 'status', 'recordingUrl',
];

/*
 * The names each fact has gone by, best first.
 *
 * Collected per provider rather than as one global list because order
 * matters: Exotel sends both `Duration` (the whole call, including ringing)
 * and `ConversationDuration` (the part somebody was actually talking), and
 * the second is the one that means anything.
 */
const COMMON = {
  callId: ['CallSid', 'call_id', 'callId', 'uuid', 'UCID', 'ucid', 'id', 'CallUUID', 'sid'],
  from: ['From', 'from', 'caller_id', 'caller_id_number', 'CallerID', 'callerNumber',
    'caller_number', 'customer_number', 'CustomerNumber', 'customerNumber', 'src'],
  to: ['To', 'to', 'did_number', 'DID', 'did', 'called_number', 'call_to_number',
    'company_number', 'destination', 'dst', 'VirtualNumber'],
  direction: ['Direction', 'direction', 'call_type', 'CallType', 'type', 'call_flow', 'Leg'],
  at: ['StartTime', 'start_time', 'start_stamp', 'startTime', 'DateCreated', 'Timestamp',
    'timestamp', 'CurrentTime', 'created_at', 'date'],
  durationSec: ['ConversationDuration', 'conversation_duration', 'CallDuration', 'TalkTime',
    'talk_time', 'billsec', 'Duration', 'duration', 'call_duration'],
  agent: ['DialWhomNumber', 'agent_number', 'AgentID', 'agent_id', 'agent', 'answered_agent',
    'dispatched_agent', 'user', 'AgentName', 'agent_name'],
  status: ['Status', 'status', 'CallStatus', 'call_status', 'DialCallStatus', 'disposition'],
  recordingUrl: ['RecordingUrl', 'RecordingURL', 'recording_url', 'recordingUrl', 'recording',
    'call_recording_url', 'Filename', 'file_name', 'resource_url', 'audio_url', 'RecordingFile'],
};

/** Ahead of COMMON for that provider, where its own spelling is known. */
const OVERRIDES = {
  twilio: {
    durationSec: ['CallDuration', 'RecordingDuration', 'Duration'],
    status: ['CallStatus', 'Status'],
  },
  exotel: {
    // Exotel's Duration counts ringing too; the conversation is the useful one.
    durationSec: ['ConversationDuration', 'Duration'],
    agent: ['DialWhomNumber', 'AgentNumber'],
  },
  ozonetel: {
    callId: ['UCID', 'ucid', 'monitorUCID', 'call_id'],
    recordingUrl: ['Filename', 'RecordingURL', 'recording_url'],
    agent: ['AgentID', 'agent_id', 'AgentName'],
  },
  knowlarity: {
    callId: ['uuid', 'call_id'],
    from: ['caller_id', 'customer_number'],
    recordingUrl: ['recording_url', 'resource_url'],
  },
  myoperator: {
    callId: ['call_id', 'uid'],
    from: ['caller_number', 'customer_number'],
    recordingUrl: ['recording', 'recording_url'],
  },
  servetel: {
    callId: ['call_id', 'uuid'],
    from: ['caller_id_number', 'caller_id'],
    durationSec: ['billsec', 'duration'],
    recordingUrl: ['call_recording_url', 'recording_url'],
  },
  smartflo: {
    callId: ['uuid', 'call_id'],
    from: ['caller_id_number', 'caller_id'],
    to: ['call_to_number', 'did_number'],
    durationSec: ['billsec', 'duration'],
    recordingUrl: ['recording_url'],
  },
};

/**
 * The services an owner can name, and how each one is described on the card.
 *
 * `other` is not a placeholder. It is the honest default for a market where
 * there are dozens of these and a clinic's is whatever their telecom reseller
 * sold them — it reads every alias above, which is usually enough.
 */
export const PROVIDERS = [
  { id: 'exotel', label: 'Exotel' },
  { id: 'knowlarity', label: 'Knowlarity' },
  { id: 'myoperator', label: 'MyOperator' },
  { id: 'ozonetel', label: 'Ozonetel' },
  { id: 'servetel', label: 'Servetel / Acefone' },
  { id: 'smartflo', label: 'Tata Tele Smartflo' },
  { id: 'twilio', label: 'Twilio' },
  { id: 'other', label: 'Something else' },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

/** Case- and separator-insensitive, because payloads disagree about both. */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * One value out of a payload, by any of its names.
 *
 * Nested one level, because several providers wrap the call in an envelope
 * ({ data: {...} }, { call: {...} }) and posting the envelope is not a
 * different payload, it is the same one indented.
 */
function pick(payload, names) {
  const flat = flatten(payload);
  for (const name of names) {
    const hit = flat.get(norm(name));
    if (hit !== undefined && hit !== null && String(hit).trim() !== '') return String(hit).trim();
  }
  return '';
}

function flatten(payload, depth = 0, into = new Map()) {
  if (!payload || typeof payload !== 'object' || depth > 3) return into;
  for (const [k, v] of Object.entries(payload)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, depth + 1, into);
    } else if (!into.has(norm(k))) {
      into.set(norm(k), v);
    }
  }
  return into;
}

/** "incoming", "inbound", "1", "outbound-api" -> "in" | "out" | ''. */
export function normaliseDirection(raw) {
  const v = norm(raw);
  if (!v) return '';
  if (/^(out|outbound|outgoing|outdial|click2call|clicktocall)/.test(v)) return 'out';
  if (/^(in|inbound|incoming)/.test(v)) return 'in';
  // Some providers send a leg name rather than a direction.
  if (/customer|caller/.test(v)) return 'in';
  if (/agent/.test(v)) return 'out';
  return '';
}

/**
 * Seconds, from whatever the provider called them.
 *
 * "00:03:12" and "192" are both durations and both arrive. A value that is
 * neither is zero, not a guess: a call whose length cannot be read is better
 * recorded as unknown than as three minutes.
 */
export function normaliseSeconds(raw) {
  const v = String(raw || '').trim();
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const parts = v.split(':').map((p) => Number(p));
  if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * A date, from an epoch or a written timestamp.
 *
 * Returns null rather than `new Date()` when it cannot read one. A call
 * stamped with the moment it was parsed is a call that will sort wrongly
 * against every other row for ever, and nothing downstream could tell.
 */
export function normaliseAt(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^\d{10}$/.test(v)) return new Date(Number(v) * 1000);
  if (/^\d{13}$/.test(v)) return new Date(Number(v));
  const d = new Date(v.includes('T') || v.includes('-') || v.includes('/') ? v : v.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * One call, out of one provider's webhook.
 *
 * @returns {{call, missing}} `missing` names the fields that were not found,
 *   so a connector can report them instead of landing blanks as facts.
 */
export function readCall(payload, provider = 'other') {
  const over = OVERRIDES[provider] || {};
  const names = (field) => {
    const own = over[field] || [];
    // The provider's own spellings first, then everything else ever seen.
    return [...own, ...COMMON[field].filter((n) => !own.includes(n))];
  };

  const at = normaliseAt(pick(payload, names('at')));
  const call = {
    callId: pick(payload, names('callId')),
    from: pick(payload, names('from')),
    to: pick(payload, names('to')),
    direction: normaliseDirection(pick(payload, names('direction'))),
    at,
    durationSec: normaliseSeconds(pick(payload, names('durationSec'))),
    agent: pick(payload, names('agent')),
    status: pick(payload, names('status')),
    recordingUrl: pick(payload, names('recordingUrl')),
  };

  /*
   * What could not be read, named.
   *
   * Only the three that decide whether a row is worth anything. A call with
   * no id cannot be de-duplicated against the provider's retries, one with no
   * caller cannot be matched to a customer, and one with no time cannot be
   * compared to an appointment — which is the entire point of reading it.
   */
  const missing = [];
  if (!call.callId) missing.push('callId');
  if (!call.from) missing.push('from');
  if (!call.at) missing.push('at');

  return { call, missing };
}

/**
 * The calls in one delivery.
 *
 * Most providers post one call per request. Some post a batch under `calls`
 * or `data`, and one posts an array at the top level. All three arrive here.
 */
export function callsIn(payload, provider = 'other') {
  const batch = Array.isArray(payload) ? payload
    : Array.isArray(payload?.calls) ? payload.calls
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.records) ? payload.records
    : null;

  const list = batch || [payload];
  const out = [];
  for (const one of list) {
    if (!one || typeof one !== 'object') continue;
    const { call, missing } = readCall(one, provider);
    // A delivery with nothing in it at all is not a call. Everything else is
    // kept, with what was missing recorded against it.
    if (!call.callId && !call.from && !call.recordingUrl) continue;
    out.push({ ...call, missing });
  }
  return out;
}
