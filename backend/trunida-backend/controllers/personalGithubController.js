/**
 * Svarg — the customer's own GitHub connection
 *
 * A read connection, and only that. Aria uses it to look at a repository the
 * customer already has, so the generated application can be shaped after
 * entities they actually own rather than names a model invented.
 *
 * It does NOT deliver anything. Eame publishes to a repository Svarg owns
 * (services/svargGithubService.js) because Railway's GitHub App is installed
 * once on Svarg's account and can build from there; asking every customer to
 * host and grant access to the delivered repo was overhead that bought them
 * nothing. Their copy of the code is the zip from /api/delivery/download.
 *
 * Preferred over the GitHub App only when the App is unconfigured — see
 * connectVia in controllers/githubAppController.js. The App is narrower
 * (Contents: read-only), so configure it and this becomes the fallback.
 *
 * GET  /api/github/personal/connect    → { url } to redirect to GitHub
 * GET  /api/github/personal/callback   → OAuth callback (public — GitHub calls this)
 * GET  /api/github/personal/status     → { connected, githubLogin } for the caller
 * POST /api/github/personal/disconnect → hard-delete the caller's connection
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import PersonalGithubConnection from '../models/PersonalGithubConnection.js';
import { encryptSecret } from '../utils/encryption.js';
import {
  isGithubOAuthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getAuthenticatedUser,
} from '../services/githubAuthService.js';

const JWT_SECRET   = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';
/**
 * Where the OAuth round trip comes back to.
 *
 * An allow-list, keyed by name: the destination arrives as a query parameter
 * and is carried through GitHub in the signed state, so accepting a URL
 * would make this an open redirect. The caller picks a key, never a path.
 *
 * 'demo' is the original home of this flow and stays the default so an
 * in-flight redirect started before Yusu existed still lands somewhere real.
 */
const RETURN_PATHS = {
  demo:  '/pipeline-demo/pipeline-demo.html',
  yusu:  '/domain/domain.html?view=yusu',
  // Aria connects this same account to READ a repository. Without an entry
  // here the return trip silently lands on the demo page instead.
  aria:  '/domain/domain.html?view=aria',
};
const DEFAULT_RETURN = 'demo';

function auditLog(action, userId, extra = {}) {
  console.log(JSON.stringify({ audit: 'PersonalGithubConnection', action, userId: String(userId), ts: new Date().toISOString(), ...extra }));
}

function returnUrl(extraParams = {}, key = DEFAULT_RETURN) {
  const base = RETURN_PATHS[key] || RETURN_PATHS[DEFAULT_RETURN];
  const qs = new URLSearchParams(extraParams).toString();
  const joiner = base.includes('?') ? '&' : '?';
  return `${FRONTEND_URL}${base}${qs ? joiner + qs : ''}`;
}

// ── GET /api/github/personal/connect ──────────────────────────────────────────

export async function initiatePersonalConnect(req, res) {
  if (!isGithubOAuthConfigured()) {
    return res.status(503).json({ error: 'GitHub connection is not configured on this server.' });
  }

  const returnTo = RETURN_PATHS[req.query.returnTo] ? req.query.returnTo : DEFAULT_RETURN;
  const state = jwt.sign(
    { nonce: crypto.randomBytes(16).toString('hex'), userId: String(req.user._id), returnTo },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  return res.json({ url: buildAuthorizeUrl(state) });
}

// ── GET /api/github/personal/callback ─────────────────────────────────────────

export async function personalGithubCallback(req, res) {
  const { code, state, error } = req.query;

  let statePayload = null;
  try { statePayload = jwt.verify(state, JWT_SECRET); } catch { /* handled below */ }

  const back = statePayload?.returnTo || DEFAULT_RETURN;

  if (error) {
    const msg = error === 'access_denied' ? 'GitHub connection was cancelled.' : 'GitHub authorization failed.';
    return res.redirect(returnUrl({ error: msg }, back));
  }
  if (!code) return res.redirect(returnUrl({ error: 'GitHub authorization failed — no code received.' }, back));
  if (!statePayload) return res.redirect(returnUrl({ error: 'Invalid or expired security state. Please try connecting again.' }));

  try {
    const tokens = await exchangeCodeForToken(code);
    const ghUser = await getAuthenticatedUser(tokens.access_token);

    await PersonalGithubConnection.findOneAndUpdate(
      { userId: statePayload.userId },
      {
        $set: {
          userId: statePayload.userId,
          githubLogin: ghUser.login,
          encryptedAccessToken: encryptSecret(tokens.access_token),
          scopes: (tokens.scope || '').split(',').filter(Boolean),
          connectedAt: new Date(),
        },
      },
      { upsert: true }
    );

    auditLog('CONNECTED', statePayload.userId, { githubLogin: ghUser.login });
    return res.redirect(returnUrl({ githubConnected: '1' }, back));
  } catch (err) {
    console.error('[PersonalGithub] callback error:', err.response?.data || err.message);
    return res.redirect(returnUrl({ error: 'GitHub connection failed. Please try again.' }, back));
  }
}

// ── GET /api/github/personal/status ───────────────────────────────────────────

export async function getPersonalStatus(req, res) {
  try {
    const connection = await PersonalGithubConnection.findOne({ userId: req.user._id }).lean();
    if (!connection) return res.json({ connected: false });
    return res.json({ connected: true, githubLogin: connection.githubLogin });
  } catch (err) {
    console.error('[PersonalGithub] GET status error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve connection status.' });
  }
}

// ── POST /api/github/personal/disconnect ──────────────────────────────────────

export async function disconnectPersonal(req, res) {
  try {
    const result = await PersonalGithubConnection.deleteOne({ userId: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'No personal GitHub connection found.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[PersonalGithub] disconnect error:', err.message);
    return res.status(500).json({ error: 'Failed to disconnect.' });
  }
}
