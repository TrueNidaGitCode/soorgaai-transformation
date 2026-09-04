/**
 * Svarg — GitHub App connection (read-only), for Aria
 *
 * See services/githubAppService.js for why this exists alongside the OAuth
 * connection Eame uses. In short: reading a customer's schema should not
 * require handing Svarg write access to every repository they own.
 *
 * GET  /api/github/app/connect     → { url } to install the App
 * GET  /api/github/app/callback    → GitHub redirects here after install (public)
 * GET  /api/github/app/status      → { connected, accountLogin, ... }
 * GET  /api/github/app/repos       → repositories this installation may read
 * POST /api/github/app/disconnect  → forget the installation
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import GithubAppInstallation from '../models/GithubAppInstallation.js';
import {
  isGithubAppConfigured,
  buildInstallUrl,
  getInstallation,
  listInstallationRepos,
  isInstallationLive,
} from '../services/githubAppService.js';

const JWT_SECRET   = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

/**
 * Same allow-list discipline as the OAuth flow: the destination travels
 * through GitHub inside the signed state, so accepting a URL rather than a
 * key would make this an open redirect.
 */
const RETURN_PATHS = {
  aria: '/domain/domain.html?view=aria',
};
const DEFAULT_RETURN = 'aria';

function auditLog(action, userId, extra = {}) {
  console.log(JSON.stringify({
    audit: 'GithubAppInstallation', action, userId: String(userId),
    ts: new Date().toISOString(), ...extra,
  }));
}

function returnUrl(extraParams = {}, key = DEFAULT_RETURN) {
  const base = RETURN_PATHS[key] || RETURN_PATHS[DEFAULT_RETURN];
  const qs = new URLSearchParams(extraParams).toString();
  const joiner = base.includes('?') ? '&' : '?';
  return `${FRONTEND_URL}${base}${qs ? joiner + qs : ''}`;
}

// ── GET /connect ─────────────────────────────────────────────────────────────

export async function initiateAppInstall(req, res) {
  if (!isGithubAppConfigured()) {
    return res.status(503).json({
      error: 'Reading repositories is not configured on this server yet.',
    });
  }

  const returnTo = RETURN_PATHS[req.query.returnTo] ? req.query.returnTo : DEFAULT_RETURN;
  const state = jwt.sign(
    { nonce: crypto.randomBytes(16).toString('hex'), userId: String(req.user._id), returnTo },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  return res.json({ url: buildInstallUrl(state) });
}

// ── GET /callback (public — GitHub redirects the browser here) ────────────────

export async function githubAppCallback(req, res) {
  const { installation_id: installationId, setup_action: setupAction, state } = req.query;

  let statePayload = null;
  try { statePayload = jwt.verify(state, JWT_SECRET); } catch { /* handled below */ }

  const back = statePayload?.returnTo || DEFAULT_RETURN;

  // The state carries the only proof of who started this. Without it we cannot
  // attribute the installation to a user, and guessing would attach a
  // customer's repositories to the wrong account.
  if (!statePayload) {
    return res.redirect(returnUrl({ error: 'Invalid or expired security state. Please try connecting again.' }));
  }
  if (setupAction === 'cancel' || !installationId) {
    return res.redirect(returnUrl({ error: 'GitHub connection was cancelled.' }, back));
  }

  try {
    const details = await getInstallation(installationId);

    await GithubAppInstallation.findOneAndUpdate(
      { userId: statePayload.userId },
      {
        userId:              statePayload.userId,
        installationId:      details.installationId,
        accountLogin:        details.accountLogin,
        accountType:         details.accountType,
        repositorySelection: details.repositorySelection,
        connectedAt:         new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    auditLog('INSTALLED', statePayload.userId, {
      installationId: details.installationId,
      account: details.accountLogin,
      repositorySelection: details.repositorySelection,
    });

    return res.redirect(returnUrl({ connected: 'github' }, back));
  } catch (err) {
    console.error('githubAppCallback error:', err.message);
    return res.redirect(returnUrl({ error: 'Could not complete the GitHub connection.' }, back));
  }
}

// ── GET /status ──────────────────────────────────────────────────────────────

export async function getAppStatus(req, res) {
  try {
    if (!isGithubAppConfigured()) {
      return res.json({ connected: false, configured: false });
    }

    const record = await GithubAppInstallation.findOne({ userId: req.user._id }).lean();
    if (!record) return res.json({ connected: false, configured: true });

    // A customer can uninstall from GitHub without telling us. A stored id is
    // not proof of a live connection, and reporting one that cannot read
    // anything is worse than reporting none.
    const live = await isInstallationLive(record.installationId);
    if (!live) {
      await GithubAppInstallation.deleteOne({ userId: req.user._id });
      auditLog('UNINSTALLED_REMOTELY', req.user._id, { installationId: record.installationId });
      return res.json({ connected: false, configured: true });
    }

    return res.json({
      connected:           true,
      configured:          true,
      accountLogin:        record.accountLogin,
      accountType:         record.accountType,
      repositorySelection: record.repositorySelection,
    });
  } catch (err) {
    console.error('getAppStatus error:', err);
    return res.status(500).json({ error: 'Failed to check the GitHub connection.' });
  }
}

// ── GET /repos ───────────────────────────────────────────────────────────────

export async function listRepos(req, res) {
  try {
    const record = await GithubAppInstallation.findOne({ userId: req.user._id }).lean();
    if (!record) return res.status(404).json({ error: 'GitHub is not connected.' });

    const repositories = await listInstallationRepos(record.installationId);
    return res.json({ repositories });
  } catch (err) {
    console.error('listRepos error:', err.message);
    return res.status(502).json({ error: 'Could not list your repositories.' });
  }
}

// ── POST /disconnect ─────────────────────────────────────────────────────────

export async function disconnectApp(req, res) {
  try {
    await GithubAppInstallation.deleteOne({ userId: req.user._id });
    auditLog('DISCONNECTED', req.user._id);

    // Forgetting the installation stops Svarg reading, but the App stays
    // installed on GitHub until the customer removes it there. Say so rather
    // than implying we revoked something we cannot revoke.
    return res.json({
      disconnected: true,
      note: 'Svarg will no longer read your repositories. To remove the app entirely, uninstall it from your GitHub settings.',
    });
  } catch (err) {
    console.error('disconnectApp error:', err);
    return res.status(500).json({ error: 'Failed to disconnect.' });
  }
}
