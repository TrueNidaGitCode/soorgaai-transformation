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
const CALLBACK_URL  = process.env.ZOHO_OAUTH_CALLBACK_URL;

/**
 * The client secret for one data centre.
 *
 * Zoho keeps the client ID constant across data centres and mints a separate
 * secret for each one it is enabled in — a client may be configured to share
 * a single secret, but that is a choice somebody has to make in the console
 * and not what happens by default.
 *
 * So a per-DC variable wins where it is set, and the shared one is the
 * fallback. Getting this wrong produces "invalid_client", which reads as a
 * bad secret and sends somebody to regenerate a credential that was correct.
 *
 *   ZOHO_OAUTH_CLIENT_SECRET_IN      the secret for zoho.in
 *   ZOHO_OAUTH_CLIENT_SECRET_COM_AU  for zoho.com.au (dots become underscores)
 *   ZOHO_OAUTH_CLIENT_SECRET         used for any data centre without its own
 */
export function clientSecretFor(region) {
  const key = 'ZOHO_OAUTH_CLIENT_SECRET_' + String(region || 'com').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return process.env[key] || process.env.ZOHO_OAUTH_CLIENT_SECRET || '';
}

/** Whether any secret is set at all, per data centre or shared. */
function haveAnySecret() {
  if (process.env.ZOHO_OAUTH_CLIENT_SECRET) return true;
  return ZOHO_REGIONS.some((r) => clientSecretFor(r));
}

/**
 * Read once per call rather than captured, so the module can say "not
 * configured" on a server that has not been given the client yet — which is
 * every server until somebody registers one, and is why the manual fields
 * stay on the form.
 */
export function isZohoOAuthConfigured() {
  return !!(CLIENT_ID && CALLBACK_URL && haveAnySecret());
}

/**
 * Read, and only read.
 *
 * This asked for ZohoCRM.modules.ALL first, on a wrong belief that it was the
 * only module scope there is. It is not: modules.READ exists, and ALL is
 * read AND WRITE.
 *
 * The difference is not academic. What a customer is shown on the consent
 * screen is the whole basis on which they decide, and a product whose claim
 * is "we watch your systems" asking for permission to change records is
 * asking for something it does not use. Nothing in this codebase writes to a
 * CRM and the connector exposes no way to — so nothing is lost by saying so
 * to Zoho, and the screen a customer's IT will read now matches what the
 * software actually does.
 *
 * settings.modules.READ is what lets a connection name a module and be told
 * whether it exists, rather than discovering it did not at the first sync.
 */
export const ZOHO_SCOPES = [
  'ZohoCRM.modules.READ',
  // Which modules this customer has, so a person picks from a list of their
  // own things rather than typing an API name they should never have to know.
  'ZohoCRM.settings.modules.READ',
  // And which fields each module has, so the dataset is the module's own
  // shape rather than a guess made before anyone connected anything. Read
  // like the rest: nothing here writes to a CRM.
  'ZohoCRM.settings.fields.READ',
];

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
      client_secret: clientSecretFor(region),
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
      client_secret: clientSecretFor(region),
      refresh_token: refreshToken,
    },
    timeout: 30000,
  });
  const data = orThrow(r.data || {}, 'refresh token');
  if (!data.access_token) throw new Error('Zoho returned no access token.');
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in) || 3600 };
}
