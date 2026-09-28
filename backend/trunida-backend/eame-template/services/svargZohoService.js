/**
 * Zoho, brokered by Svarg, from this application's side.
 *
 * ── Why this hop exists ────────────────────────────────────────────────────
 *
 * A customer can make their own Zoho Self Client and type five fields into
 * the Data page; that path works, needs nothing from Svarg, and is the only
 * one available to somebody self-hosting. It also costs ten minutes in an API
 * console, which is ten minutes a customer being shown the product spends
 * reading Zoho's documentation.
 *
 * So Svarg registers one Zoho client and a customer simply consents to it.
 * The consequence lands here: Zoho refreshes an access token against the
 * client secret, the client is Svarg's, and this container holds no key of
 * Svarg's by design. So it asks — over the gateway token it already has, the
 * same arrangement as transcription.
 *
 * What this container DOES hold is the customer's own refresh token,
 * encrypted in the customer's own database. Svarg brokered the permission; it
 * did not take custody of the data.
 *
 * ── Unconfigured is a state, not a failure ─────────────────────────────────
 *
 * A Svarg server with no Zoho client answers 503, and that is not an error to
 * show anybody: it means this application offers the manual fields instead.
 * So `available()` asks and returns false rather than throwing, and the Data
 * page decides which form to draw from the answer.
 */
import axios from 'axios';

const TIMEOUT_MS = 20000;

function base() { return String(process.env.SVARG_ZOHO_URL || '').trim().replace(/\/+$/, ''); }
function token() { return String(process.env.SELFHOSTED_API_KEY || '').trim(); }

/** Whether this application could broker at all, before asking Svarg. */
export function canBroker() { return !!(base() && token()); }

async function post(path, body) {
  const r = await axios.post(`${base()}${path}`, body, {
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    const err = new Error(r.data?.error || `Svarg answered ${r.status}.`);
    err.status = r.status;
    throw err;
  }
  return r.data || {};
}

/**
 * Where to send the browser, or nothing.
 *
 * `back` is where Svarg returns the browser to. Svarg checks it against the
 * address it recorded for this deployment rather than trusting it, so a wrong
 * one here is corrected there rather than becoming an open redirect on a
 * domain registered with Zoho.
 */
export async function startConsent({ region, back }) {
  if (!canBroker()) return { ok: false, reason: 'not-configured' };
  try {
    const { url } = await post('/start', { region, back });
    return url ? { ok: true, url } : { ok: false, reason: 'not-configured' };
  } catch (err) {
    if (err.status === 503) return { ok: false, reason: 'not-configured' };
    return { ok: false, reason: err.message };
  }
}

/** The refresh token the consent produced. Once, and only for this tenant. */
export async function claimConsent(handoff) {
  if (!canBroker()) throw new Error('This application cannot connect through Svarg.');
  return post('/claim', { handoff });
}

/** An access token minted from it, because the client secret is Svarg's. */
export async function brokeredAccessToken({ refreshToken, region }) {
  if (!canBroker()) throw new Error('This application cannot reach Svarg to refresh the Zoho connection.');
  const { accessToken, expiresIn } = await post('/token', { refreshToken, region });
  return { accessToken, expiresIn: Number(expiresIn) || 3600 };
}

/**
 * Whether the one-click path is really available, asked rather than assumed.
 *
 * The address is baked into every application at build time; whether a Zoho
 * client sits behind it is a fact about the Svarg server today. Asking costs
 * one request and means a server that gains a client does not need its
 * applications rebuilt to offer it.
 *
 * Never throws: a Svarg that cannot be reached means the manual fields, which
 * is a working Data page, not an error on one.
 */
export async function available() {
  if (!canBroker()) return false;
  try {
    const r = await axios.get(`${base()}/status`, {
      headers: { Authorization: `Bearer ${token()}` },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
    return r.status === 200 && !!r.data?.configured;
  } catch {
    return false;
  }
}
