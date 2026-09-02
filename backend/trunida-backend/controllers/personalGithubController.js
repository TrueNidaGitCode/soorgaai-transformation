/**
 * SoorgaAI — Personal GitHub Connection Controller
 *
 * Window 5 (Eame) of the pipeline wizard. Lets a user connect their own
 * GitHub account and push the real, working defect-matching project
 * (see services/eameProjectBuilder.js) as a new repo — the actual
 * deliverable Eame promises, not a static snippet.
 *
 * GET  /api/github/personal/connect      → { url } to redirect to GitHub
 * GET  /api/github/personal/callback     → OAuth callback (public — GitHub calls this)
 * GET  /api/github/personal/status       → { connected, githubLogin } for the caller
 * POST /api/github/personal/disconnect   → hard-delete the caller's connection
 * POST /api/github/personal/push-project → create a repo + push the project
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import PersonalGithubConnection from '../models/PersonalGithubConnection.js';
import { encryptSecret, decryptSecret } from '../utils/encryption.js';
import {
  isGithubOAuthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getAuthenticatedUser,
} from '../services/githubAuthService.js';
import { createRepo, pushFiles } from '../services/githubApiService.js';
import { buildManifest } from '../services/eameProjectBuilder.js';

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

// ── POST /api/github/personal/push-project ────────────────────────────────────

export async function pushProject(req, res) {
  try {
    const { repoName, isPrivate } = req.body;
    if (!repoName || typeof repoName !== 'string' || !/^[\w.-]+$/.test(repoName)) {
      return res.status(400).json({ error: 'repoName is required and may only contain letters, numbers, dots, dashes, and underscores.' });
    }

    const connection = await PersonalGithubConnection.findOne({ userId: req.user._id });
    if (!connection) {
      return res.status(404).json({ error: 'No GitHub connection found. Connect first.', code: 'not_connected' });
    }

    const accessToken = decryptSecret(connection.encryptedAccessToken);

    const repo = await createRepo(accessToken, {
      name: repoName,
      description: 'Retrieval-Augmented Semantic Matching for Defects — delivered by Svarg (Eame).',
      isPrivate: !!isPrivate,
    });

    const files = buildManifest({ includeJira: true });

    // An existing repository is left exactly as it is. pushFiles bootstraps
    // a .gitkeep commit and writes a fresh tree, which would trample whatever
    // is already in there — and it is the customer's repository, not ours.
    if (repo.created) {
      await pushFiles(accessToken, repo.owner, repo.name, repo.defaultBranch, files, 'Initial commit — delivered by Svarg (Eame)');
    } else {
      console.log(`[PersonalGithub] ${repo.owner}/${repo.name} already exists — adopting it, contents untouched`);
    }

    auditLog(repo.created ? 'PUSHED' : 'ADOPTED', req.user._id, { repoUrl: repo.htmlUrl, fileCount: files.length });

    // Ownership is enforced in the filter — a blueprintId from the body can
    // only ever update a blueprint this user already owns.
    if (req.body?.blueprintId) {
      const { default: TransformationBlueprint } = await import('../models/TransformationBlueprint.js');
      await TransformationBlueprint.updateOne(
        { _id: req.body.blueprintId, userId: req.user._id },
        { $set: { eameDelivery: {
          repoOwner: repo.owner, repoName: repo.name, repoUrl: repo.htmlUrl,
          fileCount: files.length, pushedAt: new Date(),
        } } }
      ).catch(err => console.warn('[PersonalGithub] could not record delivery —', err.message));
    }
    return res.json({ repoUrl: repo.htmlUrl, fileCount: files.length, owner: repo.owner, name: repo.name, created: repo.created });
  } catch (err) {
    console.error('[PersonalGithub] push-project error:', err.response?.data || err.message);
    // GitHub's validation errors put the actually useful detail (e.g. "name
    // already exists on this account") in a nested `errors` array, not the
    // generic top-level `message` — surface both, since the top-level one
    // alone (e.g. "Repository creation failed.") isn't actionable.
    const data = err.response?.data;
    const nested = data?.errors?.map(e => e.message || e.code).filter(Boolean).join('; ');
    const detail = [data?.message, nested].filter(Boolean).join(' — ') || err.message;
    return res.status(500).json({ error: `Failed to push project: ${detail}` });
  }
}

/**
 * GET /api/github/personal/project-manifest
 * The file list that a push would deliver — paths and sizes only, no
 * content. Lets the Eame screen show what will actually be built from the
 * same builder the push uses, rather than a hand-maintained list that
 * could drift from reality.
 */
export async function getProjectManifest(req, res) {
  try {
    const includeJira = req.query.includeJira !== '0';
    const files = buildManifest({ includeJira });
    return res.json({
      fileCount: files.length,
      totalBytes: files.reduce((n, f) => n + Buffer.byteLength(f.content || '', 'utf8'), 0),
      files: files.map(f => ({
        path: f.path,
        bytes: Buffer.byteLength(f.content || '', 'utf8'),
      })),
    });
  } catch (err) {
    console.error('[PersonalGithub] manifest error:', err.message);
    return res.status(500).json({ error: 'Failed to build the project manifest.' });
  }
}
