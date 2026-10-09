/**
 * Your app: what the business's own users do in it, sent here as it happens.
 *
 * For a business whose customers use software it built -- a teacher in a
 * classroom app, a learner in a course platform -- the first sign of somebody
 * leaving is what they stop doing there, and no CRM or clinic system records
 * it. So the business's app tells this application, the way it would tell an
 * analytics tool: one small message per thing a user did.
 *
 * ── The shape it takes ──────────────────────────────────────────────────────
 *
 * Segment's, because most product teams already send it or something close:
 *
 *   { "type": "track", "userId": "t-104", "event": "Lesson Created",
 *     "properties": { "school": "Hillview", "plan": "pro" },
 *     "timestamp": "2026-10-09T08:15:00Z", "messageId": "…" }
 *
 *   { "type": "identify", "userId": "t-104",
 *     "traits": { "name": "Asha Rao", "email": "asha@hillview.edu", "school": "Hillview" } }
 *
 * One at a time, or many as { "batch": [ … ] }. An app already sending to
 * Segment can point a webhook destination here and change nothing else.
 *
 * ── What it keeps ──────────────────────────────────────────────────────────
 *
 * Every event in this application's own database (svarg_app_events), once
 * per messageId, so a sender's retries add nothing. Who a user is, from
 * identify, beside it (svarg_app_users), so an event row can say a name
 * rather than an id. A pull reads both and lands them on the App Activity
 * dataset, where the agents and the churn-pattern learner read them like
 * any other rows. Nothing is sent to Svarg.
 *
 * The connection itself holds no credential: the app proves itself with
 * this application's own key (controllers/appEventsController.js).
 */
import crypto from 'crypto';
import mongoose from 'mongoose';

export const kind = 'app-events';
export const label = 'Your app';
export const help = 'What your users do in your own app, sent here as it happens: one small message per action (signed up, opened, created, finished, cancelled). Your developers send it with the address and key shown below, in the same shape as Segment. Nothing to install.';

/** No credential to type: the app sends with this application's own key. */
export const keyedByApplication = true;

export const fields = [
  { name: 'appName', label: 'Your app\'s name', required: false, placeholder: 'The name your users know it by',
    hint: 'Only used to label the records; leave it blank if you have one app.' },
];

/** What each event row carries, for the dataset this connection defines. */
export const provides = [
  'customer', 'user_name', 'user_email', 'user_id', 'event', 'status',
  'event_date', 'event_time', 'plan', 'amount', 'event_id', 'received_at',
];

/** Most a single request may carry, as Segment's own batch limit. */
export const MAX_PER_REQUEST = 500;

export function inboxCollection() {
  return mongoose.connection.collection('svarg_app_events');
}
export function usersCollection() {
  return mongoose.connection.collection('svarg_app_users');
}

export function describe(config) {
  return config.appName ? `events from ${config.appName}` : 'events from your app';
}

/** Nothing to reach: the app reaches us. Ready as soon as it is made. */
export async function test() {
  return { ok: true, message: 'Ready. Give your developers the address and key shown here; events appear as soon as your app sends them.' };
}

export function describeShape(config = {}) {
  return {
    name: config.appName ? `App Activity (${String(config.appName).slice(0, 40)})` : 'App Activity',
    columns: provides,
    key: 'event_id',
    // When this application heard about it, and the sender's own id: kept so
    // a row can be checked, never what an agent is about.
    internal: ['event_id', 'received_at'],
  };
}

// ── Reading what an app sent ────────────────────────────────────────────────

const text = (v, max = 200) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

/** The account a user belongs to, wherever the app put it. */
function accountOf(...bags) {
  for (const b of bags) {
    if (!b || typeof b !== 'object') continue;
    const c = b.customer ?? b.account ?? b.company ?? b.school ?? b.organisation ?? b.organization ?? b.team;
    if (c && typeof c === 'object') { if (c.name) return text(c.name); continue; }
    if (c) return text(c);
  }
  return '';
}

function when(v) {
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function eventIdOf(m, userId, name, at) {
  const given = text(m.messageId ?? m.message_id ?? m.event_id ?? m.id, 120);
  if (given) return given;
  // No id from the sender: the same user, event and moment is the same event.
  return 'h_' + crypto.createHash('sha256').update(`${userId}|${name}|${at.toISOString()}`).digest('hex').slice(0, 32);
}

/**
 * The events and identities in one request, flattened. Pure, so it is tested
 * against Segment's documented shape. Anything without a user, or a track
 * without an event name, is counted as rejected rather than kept half-said.
 *
 * @param {object|object[]} payload  one message, an array, or { batch: [...] }
 * @param {string} [defaultType]     'track' or 'identify', for /track and /identify
 */
export function eventsIn(payload, defaultType = '') {
  const list = Array.isArray(payload) ? payload
    : Array.isArray(payload?.batch) ? payload.batch
    : payload && typeof payload === 'object' ? [payload] : [];
  const events = [];
  const identities = [];
  let rejected = 0;
  for (const m of list.slice(0, MAX_PER_REQUEST)) {
    if (!m || typeof m !== 'object') { rejected++; continue; }
    const type = text(m.type || defaultType || (m.traits ? 'identify' : 'track'), 20).toLowerCase();
    const userId = text(m.userId ?? m.user_id ?? m.anonymousId ?? m.anonymous_id, 120);
    if (!userId) { rejected++; continue; }
    if (type === 'identify') {
      const t = m.traits && typeof m.traits === 'object' ? m.traits : {};
      identities.push({
        userId,
        name: text(t.name || [t.firstName || t.first_name, t.lastName || t.last_name].filter(Boolean).join(' ')),
        email: text(t.email),
        customer: accountOf(t),
        plan: text(t.plan),
        at: when(m.timestamp),
      });
      continue;
    }
    if (type !== 'track' && type !== 'page' && type !== 'screen') { rejected++; continue; }
    const p = m.properties && typeof m.properties === 'object' ? m.properties : {};
    const name = text(m.event ?? m.name ?? (type !== 'track' ? `Viewed ${m.name || type}` : ''), 120);
    if (!name) { rejected++; continue; }
    const at = when(m.timestamp ?? m.sentAt);
    const amount = p.revenue ?? p.amount ?? p.value ?? p.price;
    events.push({
      eventId: eventIdOf(m, userId, name, at),
      userId,
      event: name,
      // What happened, as a value an agent can count: the app's own status
      // where it gave one ("cancelled", "failed"), else the event itself,
      // so a rare event is a pattern signal like any other value.
      status: text(p.status || p.state || name, 120),
      customer: accountOf(p, m.context?.traits, m.traits),
      plan: text(p.plan),
      amount: amount === undefined || amount === null || amount === '' ? '' : text(amount, 40),
      name: text(p.name || m.context?.traits?.name),
      email: text(p.email || m.context?.traits?.email),
      at,
    });
  }
  rejected += Math.max(0, list.length - MAX_PER_REQUEST);
  return { events, identities, rejected };
}

/** Keep what arrived: once per event id, and the latest of who each user is. */
export async function keep({ events = [], identities = [] } = {}) {
  let kept = 0;
  if (events.length) {
    const r = await inboxCollection().bulkWrite(events.map(e => ({
      updateOne: { filter: { eventId: e.eventId }, update: { $setOnInsert: { ...e, receivedAt: new Date() } }, upsert: true },
    })), { ordered: false });
    kept = r.upsertedCount || 0;
  }
  if (identities.length) {
    await usersCollection().bulkWrite(identities.map(i => {
      // Only what was said: an identify without an email does not erase the
      // email an earlier one gave.
      const set = { userId: i.userId, seenAt: i.at };
      for (const k of ['name', 'email', 'customer', 'plan']) if (i[k]) set[k] = i[k];
      return { updateOne: { filter: { userId: i.userId }, update: { $set: set }, upsert: true } };
    }), { ordered: false });
  }
  return kept;
}

/** Every event kept, as rows, with who each user is filled in from identify. */
export async function pull(config, { maxRows = 50000 } = {}) {
  const docs = await inboxCollection().find({}).sort({ at: -1 }).limit(maxRows).toArray();
  const ids = [...new Set(docs.map(d => d.userId))];
  const people = new Map(
    (ids.length ? await usersCollection().find({ userId: { $in: ids } }).toArray() : [])
      .map(u => [u.userId, u]),
  );
  return docs.reverse().map((e) => {
    const who = people.get(e.userId) || {};
    const at = new Date(e.at);
    return {
      customer: e.customer || who.customer || '',
      user_name: who.name || e.name || e.userId,
      user_email: who.email || e.email || '',
      user_id: e.userId,
      event: e.event,
      status: e.status || e.event,
      event_date: at.toISOString().slice(0, 10),
      event_time: at.toISOString().slice(11, 16),
      plan: e.plan || who.plan || '',
      amount: e.amount || '',
      event_id: e.eventId,
      received_at: new Date(e.receivedAt || e.at).toISOString(),
    };
  });
}
