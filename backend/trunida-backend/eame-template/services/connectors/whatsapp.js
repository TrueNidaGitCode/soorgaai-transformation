/**
 * WhatsApp Business, through Meta's Cloud API.
 *
 * The business's own Meta app: the owner creates one at developers.facebook.com
 * with the WhatsApp product, and pastes its phone number id and a permanent
 * access token here. This application gives back the webhook address and
 * verify token to put into that app, and from then on every message sent
 * to the business number arrives at the webhook (routes/whatsappRoutes.js)
 * and is kept in this application's own database -- then landed on the
 * dataset this connection feeds, live, the way an export would have been.
 *
 * Nothing on Svarg's side is involved: no shared Meta app, no token passing
 * through. The credential is the owner's, kept sealed in the owner's
 * database like any other connector's.
 *
 * What the Cloud API cannot do, said plainly: it does not read WhatsApp
 * GROUPS. A business number receives what is sent TO it, one person at a
 * time. Attendance asked in a per-batch group stays in the group, and the
 * export is still the way to read that; a business number means asking
 * each guardian directly and getting one reply per child, timestamped,
 * with no doubt about who "yes" was for.
 */
import axios from 'axios';
import mongoose from 'mongoose';

export const kind = 'whatsapp-business';
export const label = 'WhatsApp Business';
export const help = 'Messages sent to your WhatsApp Business number, arriving live. Needs a Meta app with the WhatsApp product (developers.facebook.com): paste its phone number id and a permanent access token, then put the webhook address and verify token shown here into the app\'s WhatsApp → Configuration. Groups cannot be read this way; use an export for those.';

export const fields = [
  { name: 'phoneNumberId', label: 'Phone number id', placeholder: '1234567890123456 (WhatsApp → API Setup)' },
  { name: 'accessToken', label: 'Access token', secret: true },
  { name: 'appSecret', label: 'App secret (optional, checks that messages really come from Meta)', secret: true },
  { name: 'mode', label: 'Read replies as', options: ['attendance', 'messages'] },
];

/** What each received message carries, for the mapping onto the dataset. */
export const provides = ['date', 'time', 'name', 'phone', 'message', 'status', 'received_at', 'message_id'];

// WHATSAPP_GRAPH_URL points the calls at a stand-in for Meta in a test; unset, it is Meta.
const GRAPH = () => process.env.WHATSAPP_GRAPH_URL || `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}`;

/** Where messages received at the webhook are kept: this application's database. */
export function inboxCollection() {
  return mongoose.connection.collection('svarg_whatsapp_inbox');
}

function reason(err) {
  const e = err.response?.data?.error;
  if (err.response?.status === 401 || e?.code === 190) return 'Meta refused the access token. A temporary token from the API Setup page expires in 24 hours; use a permanent one from a System User.';
  if (err.response?.status === 404 || e?.code === 100) return 'No WhatsApp phone number has that id, or the token cannot see it.';
  if (!err.response) return 'Could not reach Meta: ' + err.message;
  return String(e?.message || err.message);
}

export function describe(config) {
  return `number ${config.displayPhone || config.phoneNumberId || ''} · ${config.mode === 'messages' ? 'every message' : 'attendance replies'}`;
}

export async function test(config) {
  const id = String(config.phoneNumberId || '').trim();
  if (!/^\d{6,}$/.test(id)) throw new Error('The phone number id is the long number on the API Setup page, not the phone number itself.');
  if (!String(config.accessToken || '').trim()) throw new Error('An access token is needed.');
  try {
    const r = await axios.get(`${GRAPH()}/${id}`, {
      params: { fields: 'display_phone_number,verified_name,quality_rating' },
      headers: { Authorization: `Bearer ${String(config.accessToken).trim()}` },
      timeout: 20000,
    });
    const d = r.data || {};
    return { ok: true, message: `Connected to ${d.verified_name || 'the business'} on ${d.display_phone_number || id}. Now put the webhook address and verify token into the Meta app, and messages will arrive here.` };
  } catch (err) {
    throw new Error(reason(err));
  }
}

// The same reading of a reply the Data page applies to an export. Absent
// first: "not coming" contains "coming". Long, or a question: not a reply.
const ABSENT = /\b(not coming|can'?t|cannot|won'?t|unable|absent|skip|leave|sick|unwell|not available|will miss|missing|no)\b|❌|🙅|👎/i;
const PRESENT = /\b(yes|yep|yeah|present|coming|attending|will come|will be there|i'?m in|count me in|ok|okay|sure|confirmed|available|done)\b|👍|✅|🙋/i;
export function classifyReply(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 80 || /\?/.test(t)) return '';
  if (/yes\s*(\/|or)\s*no/i.test(t)) return '';
  if (ABSENT.test(t)) return 'absent';
  if (PRESENT.test(t)) return 'present';
  return '';
}

/**
 * The messages inside one webhook delivery, flattened: who, when, what.
 * Pure, so it can be tested against Meta's documented shape. Status
 * updates (sent, delivered, read) are not messages and are left out.
 */
export function messagesIn(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      if (change.field !== 'messages' || !Array.isArray(v.messages)) continue;
      const names = {};
      for (const c of v.contacts || []) names[c.wa_id] = c.profile?.name || '';
      for (const m of v.messages) {
        const text = m.type === 'text' ? m.text?.body
          : m.type === 'button' ? m.button?.text
          : m.type === 'interactive' ? (m.interactive?.button_reply?.title || m.interactive?.list_reply?.title)
          : m.type === 'reaction' ? m.reaction?.emoji
          : `[${m.type}]`;
        out.push({
          messageId: String(m.id || ''),
          phone: String(m.from || ''),
          name: names[m.from] || '',
          text: String(text || ''),
          type: String(m.type || ''),
          at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          phoneNumberId: String(v.metadata?.phone_number_id || ''),
        });
      }
    }
  }
  return out;
}

/** Keep what arrived; once per message id, so Meta's retries add nothing. */
export async function keep(messages) {
  if (!messages.length) return 0;
  const col = inboxCollection();
  const r = await col.bulkWrite(messages.map(m => ({
    updateOne: { filter: { messageId: m.messageId }, update: { $setOnInsert: { ...m, keptAt: new Date() } }, upsert: true },
  })), { ordered: false });
  return r.upsertedCount || 0;
}

/**
 * Everything received for this number, as rows. A pull here is a read of
 * the inbox, which the webhook has been filling; so "Sync now" and the
 * schedule land what has arrived, and the webhook asks for a sync itself
 * as messages come in.
 */
export async function pull(config, { maxRows = 50000 } = {}) {
  const id = String(config.phoneNumberId || '').trim();
  const docs = await inboxCollection().find(id ? { $or: [{ phoneNumberId: id }, { phoneNumberId: '' }] } : {}).sort({ at: 1 }).limit(maxRows).toArray();
  const attendance = config.mode !== 'messages';
  const rows = [];
  for (const m of docs) {
    const status = attendance ? classifyReply(m.text) : '';
    if (attendance && !status) continue;
    const at = new Date(m.at);
    rows.push({
      date: at.toLocaleDateString('en-GB'),
      time: at.toTimeString().slice(0, 5),
      name: m.name || m.phone,
      phone: m.phone,
      message: String(m.text || '').replace(/\n/g, ' '),
      status,
      received_at: at.toISOString(),
      message_id: m.messageId,
    });
  }
  return rows;
}
