/**
 * Telling the owner what the agents found.
 *
 * This application holds no mail credentials, for the same reason it holds no
 * model key: a container that can send mail is a container worth stealing. So
 * it asks Svarg over the gateway, with the per-deployment token it already
 * has, and Svarg resolves the recipient itself. Nothing here names an address,
 * and nothing here could.
 *
 * ── One message, not six ───────────────────────────────────────────────────
 *
 * Every agent that found something in the same tick is combined into a single
 * message. Six agents sending six emails on a Monday morning is the difference
 * between a product somebody keeps and one they filter to a folder — and it is
 * only possible because all the agents in an application share one process.
 *
 * Unset SVARG_NOTIFY_URL and nothing is sent. The agents still run and still
 * record what they found; a self-hosted install that wants no contact with
 * Svarg simply reads the board instead.
 */
import axios from 'axios';

const TIMEOUT_MS = 10000;

export function endpoint() {
  return String(process.env.SVARG_NOTIFY_URL || '').trim();
}

export function token() {
  return String(process.env.SELFHOSTED_API_KEY || '').trim();
}

export function configured() {
  return !!endpoint() && !!token();
}

/**
 * Turn what the agents found into the lines of one message.
 *
 * Pure, so the wording is testable without sending anything. Only what is new
 * and what has resolved appear: an agent spends most of its life looking at
 * something that is still true, and saying so every morning is how somebody
 * learns to stop reading.
 */
export function composeDigest(results) {
  const lines = [];
  for (const r of results || []) {
    if (!r || !r.ran) continue;
    const fresh = (r.new || []).length;
    const gone = (r.resolved || []).length;
    if (fresh) lines.push(`${r.name}: ${fresh} new — ${(r.new || []).slice(0, 6).join(', ')}`);
    if (gone) lines.push(`${r.name}: ${gone} resolved — ${(r.resolved || []).slice(0, 6).join(', ')}`);
  }
  return lines;
}

/** A subject that says how much, so the inbox list alone is worth reading. */
export function composeSubject(lines) {
  if (!lines.length) return '';
  return lines.length === 1 ? lines[0].split(' — ')[0] : `${lines.length} things to look at`;
}

/**
 * Send the digest. Never throws: an application must not fail, or wait, on its
 * own reporting — a finding that was recorded but not delivered is still on
 * the board, and that is the durable copy.
 */
export async function sendDigest(results) {
  const lines = composeDigest(results);
  if (!lines.length) return { sent: false, reason: 'nothing new' };
  if (!configured()) return { sent: false, reason: 'no notify url' };

  try {
    const res = await axios.post(
      endpoint(),
      { subject: composeSubject(lines), lines },
      { headers: { Authorization: `Bearer ${token()}` }, timeout: TIMEOUT_MS },
    );
    return res.data || { sent: false, reason: 'no answer' };
  } catch (err) {
    console.warn('[notify] not delivered —', err.message);
    return { sent: false, reason: err.message };
  }
}
