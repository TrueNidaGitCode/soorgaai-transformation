/**
 * SoorgaAI — Confluence Connection Controller
 *
 * CONFIDENTIALITY: Connecting/disconnecting/re-syncing a customer's Confluence
 * knowledge source is restricted to CTO/Admin users, mirroring the Enterprise
 * Blueprint permission pattern in enterpriseBlueprintController.js. Every org
 * member can read connection *status* (no tokens, no space internals) so the
 * "connected knowledge is active" signal is visible without exposing controls.
 *
 * GET  /api/confluence/connect              → returns { url } to redirect to Atlassian (CTO/Admin)
 * GET  /api/confluence/callback              → OAuth callback (public — Atlassian calls this)
 * GET  /api/confluence/spaces                → list spaces (CTO/Admin)
 * GET  /api/confluence/spaces/:key/pages     → list pages in a space (CTO/Admin)
 * POST /api/confluence/extract               → confirm spaces + start extraction (CTO/Admin)
 * GET  /api/confluence/status                → connection status (any org member)
 * POST /api/confluence/disconnect            → hard-delete connection + documents (CTO/Admin)
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import UserProfile from '../models/UserProfile.js';
import ConfluenceConnection from '../models/ConfluenceConnection.js';
import KnowledgeDocument     from '../models/KnowledgeDocument.js';
import { encryptSecret } from '../utils/encryption.js';
import {
  isConfluenceOAuthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getAccessibleResources,
  getValidAccessToken,
  listSpaces,
  listPages,
  CONFLUENCE_SCOPES,
} from '../services/confluenceApiService.js';
import { extractConfluenceKnowledgeAsync } from '../services/confluenceExtractionService.js';
import { personalConfluenceCallback } from './personalConfluenceController.js';

const JWT_SECRET   = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// ── Shared helpers (duplicated per enterpriseBlueprintController.js convention) ─

async function resolveOrg(userId) {
  const profile = await UserProfile.findOne({ userId }).lean();
  if (!profile?.orgName) return null;
  return profile;
}

function canManageConnection(jwtRole, profileRole) {
  return jwtRole === 'admin' || profileRole === 'CTO';
}

function auditLog(action, userId, orgName, extra = {}) {
  console.log(JSON.stringify({
    audit:  'ConfluenceConnection',
    action,
    userId: String(userId),
    orgName,
    ts:     new Date().toISOString(),
    ...extra,
  }));
}

function errorRedirect(res, msg) {
  const params = new URLSearchParams({ error: msg });
  return res.redirect(`${FRONTEND_URL}/knowledge-sources/knowledge-sources.html?${params}`);
}

// ── GET /api/confluence/connect ───────────────────────────────────────────────
// Returns the Atlassian authorize URL as JSON rather than issuing a server
// redirect — a plain <a href> navigation cannot carry the Authorization
// header this endpoint requires (protect middleware), and putting the app
// JWT in a URL query param would leak it into browser history / server
// access logs. The frontend fetches this URL (with the header) and then
// navigates the browser to the returned Atlassian URL itself.

export async function initiateConfluenceConnect(req, res) {
  if (!isConfluenceOAuthConfigured()) {
    return res.status(503).json({ error: 'Confluence connection is not configured on this server.' });
  }

  const profile = await resolveOrg(req.user._id);
  if (!profile) {
    return res.status(404).json({ error: 'Complete your profile setup before connecting Confluence.' });
  }
  if (!canManageConnection(req.user.role, profile.role)) {
    return res.status(403).json({ error: 'Only CTO or admin users may connect Confluence.' });
  }

  const state = jwt.sign(
    { nonce: crypto.randomBytes(16).toString('hex'), userId: String(req.user._id), orgName: profile.orgName, flow: 'org' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  return res.json({ url: buildAuthorizeUrl(state) });
}

// ── GET /api/confluence/callback ──────────────────────────────────────────────
//
// IMPORTANT: this is the ONLY Atlassian redirect URL actually registered in
// the developer console (CONFLUENCE_OAUTH_CALLBACK_URL is one shared env var
// for both flows) — a personal-flow authorization lands here too, never at
// /api/confluence/personal/callback. Dispatch on state.flow before doing any
// org-wide-specific work, or a personal connection silently corrupts the
// org-wide ConfluenceConnection document instead (an undefined orgName in
// the query filter matches whatever document Mongo returns first).

export async function confluenceCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    const msg = error === 'access_denied' ? 'Confluence connection was cancelled.' : 'Confluence authorization failed.';
    return errorRedirect(res, msg);
  }
  if (!code) return errorRedirect(res, 'Confluence authorization failed — no code received.');

  let statePayload;
  try {
    statePayload = jwt.verify(state, JWT_SECRET);
  } catch {
    return errorRedirect(res, 'Invalid or expired security state. Please try connecting again.');
  }

  if (statePayload.flow === 'personal') {
    return personalConfluenceCallback(req, res);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const resources = await getAccessibleResources(tokens.access_token);

    if (!resources.length) {
      return errorRedirect(res, 'No accessible Confluence sites found for this account.');
    }
    if (resources.length > 1) {
      console.warn(`[Confluence] Org "${statePayload.orgName}" has ${resources.length} accessible sites — using the first (single-site v1 limitation).`);
    }
    const site = resources[0];

    await ConfluenceConnection.findOneAndUpdate(
      { orgName: statePayload.orgName },
      {
        $set: {
          orgName: statePayload.orgName,
          status: 'discovering',
          cloudId: site.id,
          siteUrl: site.url,
          siteName: site.name,
          encryptedAccessToken: encryptSecret(tokens.access_token),
          encryptedRefreshToken: encryptSecret(tokens.refresh_token),
          accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
          scopes: CONFLUENCE_SCOPES,
          connectedByUserId: statePayload.userId,
          connectedAt: new Date(),
          lastSyncStatus: 'idle',
          lastSyncError: '',
        },
      },
      { upsert: true }
    );

    auditLog('CONNECTED', statePayload.userId, statePayload.orgName, { siteName: site.name });
    return res.redirect(`${FRONTEND_URL}/knowledge-sources/knowledge-sources.html?connected=1`);
  } catch (err) {
    console.error('[Confluence] callback error:', err.response?.data || err.message);
    return errorRedirect(res, 'Confluence connection failed. Please try again.');
  }
}

// ── GET /api/confluence/spaces ────────────────────────────────────────────────

export async function getSpaces(req, res) {
  try {
    const profile = await resolveOrg(req.user._id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    if (!canManageConnection(req.user.role, profile.role)) {
      return res.status(403).json({ error: 'Access denied. Only CTO or admin users may view Confluence spaces.' });
    }

    const connection = await ConfluenceConnection.findOne({ orgName: profile.orgName });
    if (!connection) return res.status(404).json({ error: 'No Confluence connection found for your organisation.' });

    const accessToken = await getValidAccessToken(connection);
    const spaces = await listSpaces(connection.cloudId, accessToken);

    connection.discoveredSpaces = spaces;
    connection.discoveredAt = new Date();
    await connection.save();

    return res.json({ spaces });
  } catch (err) {
    console.error('[Confluence] GET spaces error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to list Confluence spaces.' });
  }
}

// ── GET /api/confluence/spaces/:spaceKey/pages ────────────────────────────────

export async function getSpacePages(req, res) {
  try {
    const profile = await resolveOrg(req.user._id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    if (!canManageConnection(req.user.role, profile.role)) {
      return res.status(403).json({ error: 'Access denied. Only CTO or admin users may view Confluence pages.' });
    }

    const connection = await ConfluenceConnection.findOne({ orgName: profile.orgName });
    if (!connection) return res.status(404).json({ error: 'No Confluence connection found for your organisation.' });

    const accessToken = await getValidAccessToken(connection);
    const pages = await listPages(connection.cloudId, accessToken, req.params.spaceKey);

    return res.json({ pages });
  } catch (err) {
    console.error('[Confluence] GET pages error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to list Confluence pages.' });
  }
}

// ── POST /api/confluence/extract ──────────────────────────────────────────────

export async function extract(req, res) {
  try {
    const { spaceKeys } = req.body;
    if (!Array.isArray(spaceKeys) || !spaceKeys.length) {
      return res.status(400).json({ error: 'spaceKeys must be a non-empty array.' });
    }

    const profile = await resolveOrg(req.user._id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    if (!canManageConnection(req.user.role, profile.role)) {
      return res.status(403).json({ error: 'Access denied. Only CTO or admin users may extract Confluence content.' });
    }

    const connection = await ConfluenceConnection.findOne({ orgName: profile.orgName });
    if (!connection) return res.status(404).json({ error: 'No Confluence connection found for your organisation.' });

    if (connection.lastSyncStatus === 'syncing') {
      return res.status(409).json({ error: 'A sync is already in progress for your organisation.' });
    }

    // Confused-deputy guard: only allow spaces the user actually saw in discovery
    const discoveredKeys = new Set((connection.discoveredSpaces || []).map(s => s.key));
    const invalidKeys = spaceKeys.filter(k => !discoveredKeys.has(k));
    if (invalidKeys.length) {
      return res.status(400).json({ error: `Unknown space key(s): ${invalidKeys.join(', ')}. Re-run discovery first.` });
    }

    connection.selectedSpaceKeys = spaceKeys;
    connection.lastSyncStatus = 'syncing';
    connection.lastSyncError = '';
    await connection.save();

    auditLog('EXTRACT_STARTED', req.user._id, profile.orgName, { spaceCount: spaceKeys.length });

    // Fire-and-forget — matches generateTransformationAsync's async pattern
    extractConfluenceKnowledgeAsync(profile.orgName, spaceKeys, req.user._id)
      .catch(err => console.error('[Confluence] extraction async error:', err.message));

    return res.json({ status: 'extracting', spaceCount: spaceKeys.length });
  } catch (err) {
    console.error('[Confluence] POST extract error:', err.message);
    return res.status(500).json({ error: 'Failed to start Confluence extraction.' });
  }
}

// ── GET /api/confluence/status ────────────────────────────────────────────────
// Unrestricted to any authenticated org member — no tokens or space internals returned.

export async function getStatus(req, res) {
  try {
    const profile = await resolveOrg(req.user._id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const connection = await ConfluenceConnection.findOne({ orgName: profile.orgName }).lean();
    if (!connection) return res.json({ status: 'not_connected' });

    const documentCounts = await KnowledgeDocument.aggregate([
      { $match: { orgName: profile.orgName } },
      { $group: { _id: '$extractionStatus', count: { $sum: 1 } } },
    ]);

    return res.json({
      status: connection.status,
      lastSyncStatus: connection.lastSyncStatus,
      lastSyncedAt: connection.lastSyncedAt,
      siteName: connection.siteName,
      selectedSpaceKeys: connection.selectedSpaceKeys,
      documentCounts: Object.fromEntries(documentCounts.map(d => [d._id, d.count])),
    });
  } catch (err) {
    console.error('[Confluence] GET status error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve Confluence connection status.' });
  }
}

// ── POST /api/confluence/disconnect ───────────────────────────────────────────

export async function disconnect(req, res) {
  try {
    const profile = await resolveOrg(req.user._id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    if (!canManageConnection(req.user.role, profile.role)) {
      return res.status(403).json({ error: 'Access denied. Only CTO or admin users may disconnect Confluence.' });
    }

    const connection = await ConfluenceConnection.findOne({ orgName: profile.orgName });
    if (!connection) return res.status(404).json({ error: 'No Confluence connection found for your organisation.' });

    // Best-effort — Atlassian has no confirmed public revoke endpoint for 3LO
    // apps; deleting our copy of the token is the operative security boundary.

    await ConfluenceConnection.deleteOne({ orgName: profile.orgName });
    const { deletedCount } = await KnowledgeDocument.deleteMany({ orgName: profile.orgName });

    auditLog('DISCONNECTED', req.user._id, profile.orgName, { deletedDocCount: deletedCount });

    return res.json({ status: 'disconnected', deletedDocCount: deletedCount });
  } catch (err) {
    console.error('[Confluence] POST disconnect error:', err.message);
    return res.status(500).json({ error: 'Failed to disconnect Confluence.' });
  }
}
