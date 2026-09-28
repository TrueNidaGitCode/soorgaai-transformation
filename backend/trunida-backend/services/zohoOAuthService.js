/**
 * Svarg — Zoho OAuth, brokered on a customer's behalf
 *
 * ── Why Svarg holds this client and not the customer ──────────────────────
 *
 * The Zoho CRM connector already works on credentials the customer makes
 * themselves: a Self Client, a refresh token, five fields on a form. That is
 * the honest default and it stays — it is the only thing that works for
 * somebody self-hosting, and it needs nothing from us.
 *
 * It also takes ten minutes and an API console, which is ten minutes in which
 * a customer being shown the product is reading Zoho's documentation instead
 * of looking at their own data. So Svarg registers one Zoho client, and a
 * customer connects by consenting to it — the same arrangement as Atlassian
 * in the control plane, where the connection is one click because the client
 * is ours.
 *
 * ── What that costs, and where the line is ────────────────────────────────
 *
 * Zoho refreshes an access token against the client secret, so a container
 * that holds only a refresh token cannot mint one on its own. It asks Svarg,
 * over the gateway token it already has — the same hop the transcription
 * service makes, for the same reason: a delivered application holds no key
 * that is Svarg's.
 *
 * What the tenant DOES hold is the customer's own refresh token, encrypted in
 * the customer's own database. That side of the line does not move: this
 * brokers an authorisation, it does not take custody of the data.
 */
import axios from 'axios';
import crypto from 'crypto';

/** The data centres Zoho runs. A client registered multi-DC answers on all. */
export const ZOHO_REGIONS = ['com', 'in', 'eu', 'com.au', 'jp', 'ca', 'com.cn', 'sa'];

const CLIENT_ID     = process.env.ZOHO_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_OAUTH_CLIENT_SECRET;
const CALLBACK_URL  = process.env.ZOHO_OAUTH_CALLBACK_URL;

/**
 * Read once per call rather than captured, so the module can say "not
 * configured" on a server that has not been given the client yet — which is
 * every server until somebody registers one, and is why the manual fields
 * stay on the form.
 */
export function isZohoOAuthConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && CALLBACK_URL);
}

/**
 * Read and nothing else.
 *
 * modules.ALL is read/write on Zoho's side and there is no read-only variant
 * of it, so the restraint has to live here: nothing in this codebase writes
 * to a CRM, and the connector exposes no way to. If that changes, this list
 * is the thing to argue about first.
 */
export const ZOHO_SCOPES = ['ZohoCRM.modules.ALL', 'ZohoCRM.settings.modules.READ'];

export const isRegion = (r) => ZOHO_REGIONS.includes(String(r || '').trim());
const accountsHost = (region) => `https://accounts.zoho.${isRegion(region) ? region : 'com'}`;

/*
 * ── The handoff ───────────────────────────────────────────────────────────
 *
 * A consent happens in a browser; the connection is made by a container. The
 * two never speak, so something has to carry the result across, and it must
 * be something the browser can hold without being able to read.
 *
 * So: the tenant asks for a handoff over its gateway token, gets back an
 * opaque id, and the browser only ever carries that id. Zoho returns to
 * Svarg, Svarg exchanges the code and attaches the refresh token to the
 * handoff, and the tenant claims it back over the same gateway token. The
 * secret crosses one authenticated hop and never a URL.
 *
 * In memory, deliberately. It lives for ten minutes and a restart loses
 * nothing but a consent somebody can repeat — against a collection, a TTL
 * index and a migration for a record whose whole life is shorter than a
 * deploy.
 */
const TTL_MS = 10 * 60 * 1000;
const handoffs = new Map();

function sweep() {
  const now = Date.now();
  for (const [k, v] of handoffs) if (v.expiresAt <= now) handoffs.delete(k);
}

export function openHandoff({ deploymentId, region, back }) {
  sweep();
  const state = crypto.randomBytes(24).toString('base64url');
  handoffs.set(state, {
    state,
    deploymentId: String(deploymentId),
    region: isRegion(region) ? region : 'com',
    back: String(back || ''),
    refreshToken: '',
    expiresAt: Date.now() + TTL_MS,
  });
  return state;
}

export function readHandoff(state) {
  sweep();
  return handoffs.get(String(state || '')) || null;
}

/**
 * Claimed once, by the deployment that opened it.
 *
 * Both halves matter. Once, so a handoff replayed from a browser's history
 * cannot hand the token out again; by the same deployment, so one tenant
 * cannot claim another's consent by guessing an id.
 */
export function claimHandoff(state, deploymentId) {
  const h = readHandoff(state);
  if (!h) return { ok: false, reason: 'That connection attempt has expired. Start it again.' };
  if (h.deploymentId !== String(deploymentId)) return { ok: false, reason: 'That connection attempt belongs to another application.' };
  if (!h.refreshToken) return { ok: false, reason: 'Zoho has not finished. Try the connection again.' };
  handoffs.delete(state);
  return { ok: true, refreshToken: h.refreshToken, region: h.region };
}

export function dropHandoff(state) { handoffs.delete(String(state || '')); }

/** Only for tests: the store is process-local and otherwise unreachable. */
export function _handoffCount() { sweep(); return handoffs.size; }

// ── The three requests ──────────────────────────────────────────────────────

/**
 * Where a browser starts, derived from where Zoho comes back.
 *
 * One address to configure rather than two, and the two cannot drift: an
 * authorize entry on one host with a redirect_uri on another is refused by
 * Zoho as an invalid client, which reads as a bad secret.
 */
export function authorizeEntryUrl(state) {
  if (!CALLBACK_URL) return '';
  try {
    const u = new URL(CALLBACK_URL);
    return `${u.origin}/api/oauth/zoho/authorize?state=${encodeURIComponent(state)}`;
  } catch { return ''; }
}

export function buildAuthorizeUrl(state, region) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: ZOHO_SCOPES.join(','),
    redirect_uri: CALLBACK_URL,
    state,
    /*
     * Both are needed and neither is the default.
     *
     * access_type=offline is what asks for a refresh token at all, and
     * prompt=consent is what makes Zoho issue a NEW one — without it a
     * customer who has consented before is sent back with an access token
     * and no refresh token, and the connection works until it silently
     * stops an hour later.
     */
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${accountsHost(region)}/oauth/v2/auth?${params.toString()}`;
}

/** Zoho reports OAuth failures with HTTP 200 and an `error` key. */
function orThrow(data, what) {
  if (data?.error) throw new Error(`Zoho refused the ${what} (${data.error}).`);
  return data;
}

export async function exchangeCode(code, region) {
  const r = await axios.post(`${accountsHost(region)}/oauth/v2/token`, null, {
    params: {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: CALLBACK_URL,
      code,
    },
    timeout: 30000,
  });
  const data = orThrow(r.data || {}, 'authorisation code');
  if (!data.refresh_token) {
    throw new Error('Zoho returned no refresh token. The consent screen must be reached with prompt=consent.');
  }
  return { refreshToken: data.refresh_token, apiDomain: data.api_domain || '' };
}

export async function refreshAccessToken(refreshToken, region) {
  const r = await axios.post(`${accountsHost(region)}/oauth/v2/token`, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    },
    timeout: 30000,
  });
  const data = orThrow(r.data || {}, 'refresh token');
  if (!data.access_token) throw new Error('Zoho returned no access token.');
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in) || 3600 };
}
