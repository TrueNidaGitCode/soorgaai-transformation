/**
 * Svarg — the three Zoho calls a delivered application makes.
 *
 * Authenticated the way every gateway route is: by the deployment token the
 * container already holds, never by a user session. Kept out of
 * gatewayController.js because that file is the model plane and this is not —
 * nothing here spends a token or touches an allowance.
 *
 *   start  a consent is opened, and a URL comes back for the browser
 *   claim  the refresh token, once the customer has consented
 *   token  an access token, because the client secret is Svarg's
 *
 * The last one is the price of brokering. A container that made its own Zoho
 * client would refresh on its own; one consenting to Svarg's cannot, so it
 * asks — the same hop transcription makes, for the same reason.
 */
import { authenticate } from '../services/gatewayService.js';
import {
  isZohoOAuthConfigured, isRegion, openHandoff, claimHandoff, refreshAccessToken,
  authorizeEntryUrl,
} from '../services/zohoOAuthService.js';

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

async function deploymentOr401(req, res) {
  const d = await authenticate(bearer(req));
  if (!d) { res.status(401).json({ error: 'Invalid or missing deployment token.' }); return null; }
  return d;
}

/**
 * Where the browser must be sent back to, checked rather than trusted.
 *
 * `back` comes from the tenant, and the tenant is ours — but it reaches this
 * server as a string in a request body, and an open redirect on a domain
 * registered with Zoho is worth more to somebody than the connection is. So
 * it has to be the address Svarg itself recorded for this deployment.
 */
export function allowedBack(deployment, wanted) {
  /*
   * railway.url is where a delivered application's address is kept —
   * HostedDeployment has no top-level `url`, and reading one that does not
   * exist produced an empty allow-list, an empty `back`, and a consent that
   * ended on a Svarg page with nowhere to go. The customer saw "Connected"
   * and was connected to nothing: the token sat in the handoff until it
   * expired, because the application never came back to claim it.
   */
  const home = String(deployment?.railway?.url || deployment?.appUrl || deployment?.url || '')
    .replace(/\/+$/, '');
  if (!home) return '';
  // Railway records a host without a scheme; new URL() needs one, and
  // without it every comparison below threw and fell back to the bare host.
  const full = /^https?:\/\//.test(home) ? home : `https://${home}`;
  const w = String(wanted || '').trim();
  if (!w) return full;
  try {
    return new URL(w).origin === new URL(full).origin ? w : full;
  } catch { return full; }
}

/**
 * Is the one-click path available on this Svarg server?
 *
 * Its own route because the alternative was asking by starting a consent and
 * throwing the answer away — which opened a handoff on every load of every
 * Data page, to learn something that changes when an environment variable
 * does.
 */
export async function zohoStatus(req, res) {
  const deployment = await deploymentOr401(req, res);
  if (!deployment) return;
  return res.json({ configured: isZohoOAuthConfigured() });
}

export async function zohoStart(req, res) {
  const deployment = await deploymentOr401(req, res);
  if (!deployment) return;

  if (!isZohoOAuthConfigured()) {
    return res.status(503).json({ error: 'This Svarg server has no Zoho client configured.', configured: false });
  }
  const region = isRegion(req.body?.region) ? req.body.region : 'com';
  const state = openHandoff({
    deploymentId: String(deployment._id),
    region,
    back: allowedBack(deployment, req.body?.back),
  });
  const url = authorizeEntryUrl(state);
  if (!url) return res.status(503).json({ error: 'This Svarg server has no Zoho callback address configured.' });
  return res.json({ url });
}

export async function zohoClaim(req, res) {
  const deployment = await deploymentOr401(req, res);
  if (!deployment) return;

  const got = claimHandoff(String(req.body?.handoff || ''), String(deployment._id));
  if (!got.ok) return res.status(400).json({ error: got.reason });
  return res.json({ refreshToken: got.refreshToken, region: got.region });
}

export async function zohoToken(req, res) {
  const deployment = await deploymentOr401(req, res);
  if (!deployment) return;

  if (!isZohoOAuthConfigured()) {
    return res.status(503).json({ error: 'This Svarg server has no Zoho client configured.' });
  }
  const refreshToken = String(req.body?.refreshToken || '').trim();
  if (!refreshToken) return res.status(400).json({ error: 'No refresh token was sent.' });

  try {
    const { accessToken, expiresIn } = await refreshAccessToken(refreshToken, req.body?.region);
    return res.json({ accessToken, expiresIn });
  } catch (err) {
    // 502: the refusal is Zoho's, and an application that reads this as its
    // own fault would drop a connection that is one retry from working.
    return res.status(502).json({ error: err.message });
  }
}
