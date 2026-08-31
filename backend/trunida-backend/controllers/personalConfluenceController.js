/**
 * SoorgaAI — Personal Confluence Connection Controller
 *
 * Lets ANY authenticated user (not just CTO/Admin) connect their own
 * Confluence account and link specific pages to a specific blueprint they're
 * generating. Distinct from confluenceController.js, which manages one
 * org-wide connection gated to CTO/Admin.
 *
 * GET  /api/confluence/personal/connect             → returns { url } to redirect to Atlassian
 * GET  /api/confluence/personal/callback             → OAuth callback (public — Atlassian calls this)
 * GET  /api/confluence/personal/spaces               → list spaces for the caller's own connection
 * GET  /api/confluence/personal/spaces/:key/pages    → list pages in a space
 * POST /api/confluence/personal/link                 → fetch + classify selected pages, attach to a blueprint
 * GET  /api/confluence/personal/linked/:blueprintId  → list docs already linked to a blueprint
 * GET  /api/confluence/personal/status               → { connected, siteName } for the caller
 * POST /api/confluence/personal/disconnect           → hard-delete the caller's connection
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import PersonalConfluenceConnection from '../models/PersonalConfluenceConnection.js';
import LinkedProjectDocument         from '../models/LinkedProjectDocument.js';
import TransformationBlueprint       from '../models/TransformationBlueprint.js';
import { encryptSecret } from '../utils/encryption.js';
import {
  isConfluenceOAuthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getAccessibleResources,
  getValidAccessToken,
  listSpaces,
  listPages,
  getPageContent,
} from '../services/confluenceApiService.js';
import { ATLASSIAN_SCOPES, JIRA_SCOPES } from '../services/atlassianAuthService.js';
import { htmlToText, hashText, truncateForLLM, classifyDocument } from '../services/confluenceContentService.js';
import { regenerateTransformationCapabilityAsync } from '../services/blueprintGenerationService.js';

const JWT_SECRET   = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// Where the OAuth callback sends the user back to — 'profile-setup' (during
// onboarding) or 'knowledge-sources' (picking pages for a specific project).
const RETURN_PATHS = {
  'profile-setup':     '/profile-setup/profile.html',
  'knowledge-sources': '/knowledge-sources/knowledge-sources.html',
  'pipeline-wizard':   '/pipeline-demo/pipeline-demo.html',
  'cob':               '/cob.html',
  'domain':            '/domain/domain.html',
};

function auditLog(action, userId, extra = {}) {
  console.log(JSON.stringify({
    audit:  'PersonalConfluenceConnection',
    action,
    userId: String(userId),
    ts:     new Date().toISOString(),
    ...extra,
  }));
}

function returnUrl(returnTo, extraParams = {}) {
  const path = RETURN_PATHS[returnTo] || RETURN_PATHS['knowledge-sources'];
  const params = new URLSearchParams(extraParams);
  const qs = params.toString();
  return `${FRONTEND_URL}${path}${qs ? `?${qs}` : ''}`;
}

function errorRedirect(res, msg, { blueprintId, returnTo } = {}) {
  const params = { error: msg };
  if (blueprintId) params.blueprintId = blueprintId;
  return res.redirect(returnUrl(returnTo, params));
}

async function verifyBlueprintOwnership(blueprintId, userId) {
  if (!blueprintId) return null;
  return TransformationBlueprint.findOne({ _id: blueprintId, userId }).lean();
}

// ── GET /api/confluence/personal/connect ──────────────────────────────────────

export async function initiatePersonalConnect(req, res) {
  if (!isConfluenceOAuthConfigured()) {
    return res.status(503).json({ error: 'Confluence connection is not configured on this server.' });
  }

  const { blueprintId, returnTo } = req.query;
  const resolvedReturnTo = RETURN_PATHS[returnTo] ? returnTo : 'knowledge-sources';

  const state = jwt.sign(
    {
      nonce: crypto.randomBytes(16).toString('hex'),
      userId: String(req.user._id),
      blueprintId: blueprintId || '',
      returnTo: resolvedReturnTo,
      flow: 'personal',
    },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  // The pipeline wizard and the real Aria screen (domain.html) both need
  // Jira access alongside Confluence — every other personal-connect
  // caller (knowledge-sources, profile-setup) keeps requesting the
  // narrower CONFLUENCE_SCOPES default, so this doesn't risk breaking
  // their already-working connect flow if the Atlassian app's Jira scope
  // hasn't been added yet (see atlassianAuthService.js's JIRA_SCOPES).
  const scopes = (resolvedReturnTo === 'pipeline-wizard' || resolvedReturnTo === 'domain') ? ATLASSIAN_SCOPES : undefined;

  return res.json({ url: scopes ? buildAuthorizeUrl(state, scopes) : buildAuthorizeUrl(state) });
}

// ── GET /api/confluence/personal/callback ─────────────────────────────────────

export async function personalConfluenceCallback(req, res) {
  const { code, state, error } = req.query;

  // Best-effort decode even on error paths, so the redirect still lands
  // back where the user started (Atlassian echoes `state` on denial too).
  let statePayload = null;
  try { statePayload = jwt.verify(state, JWT_SECRET); } catch { /* handled below */ }

  if (error) {
    const msg = error === 'access_denied' ? 'Confluence connection was cancelled.' : 'Confluence authorization failed.';
    return errorRedirect(res, msg, statePayload || {});
  }
  if (!code) return errorRedirect(res, 'Confluence authorization failed — no code received.', statePayload || {});
  if (!statePayload) return errorRedirect(res, 'Invalid or expired security state. Please try connecting again.');

  try {
    const tokens = await exchangeCodeForTokens(code);
    const resources = await getAccessibleResources(tokens.access_token);

    if (!resources.length) {
      return errorRedirect(res, 'No accessible Confluence sites found for this account.', statePayload);
    }
    const site = resources[0];

    // Union with whatever scopes are already on the record rather than
    // overwriting — this connection is shared across three entry points
    // (pipeline wizard, knowledge-sources, profile-setup) that each
    // request different scope sets. A narrower reconnect from one of the
    // Confluence-only flows must not silently drop a Jira grant made
    // earlier through the pipeline wizard (real bug: it did, since a
    // straight $set only ever reflected the most recent grant).
    const existing = await PersonalConfluenceConnection.findOne({ userId: statePayload.userId }).select('scopes').lean();
    const newScopes = (tokens.scope || '').split(' ').filter(Boolean);
    const mergedScopes = [...new Set([...(existing?.scopes || []), ...newScopes])];

    await PersonalConfluenceConnection.findOneAndUpdate(
      { userId: statePayload.userId },
      {
        $set: {
          userId: statePayload.userId,
          status: 'active',
          cloudId: site.id,
          siteUrl: site.url,
          siteName: site.name,
          encryptedAccessToken: encryptSecret(tokens.access_token),
          encryptedRefreshToken: encryptSecret(tokens.refresh_token),
          accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
          scopes: mergedScopes,
          connectedAt: new Date(),
        },
      },
      { upsert: true }
    );

    auditLog('CONNECTED', statePayload.userId, { siteName: site.name });

    const extraParams = { personalConnected: '1' };
    if (statePayload.blueprintId) extraParams.blueprintId = statePayload.blueprintId;
    return res.redirect(returnUrl(statePayload.returnTo, extraParams));
  } catch (err) {
    console.error('[PersonalConfluence] callback error:', err.response?.data || err.message);
    return errorRedirect(res, 'Confluence connection failed. Please try again.', statePayload);
  }
}

// ── GET /api/confluence/personal/spaces ───────────────────────────────────────

export async function getPersonalSpaces(req, res) {
  try {
    const connection = await PersonalConfluenceConnection.findOne({ userId: req.user._id });
    if (!connection) return res.status(404).json({ error: 'No personal Confluence connection found. Connect first.' });

    const accessToken = await getValidAccessToken(connection);
    const spaces = await listSpaces(connection.cloudId, accessToken);

    connection.discoveredSpaces = spaces;
    connection.discoveredAt = new Date();
    await connection.save();

    return res.json({ spaces, siteUrl: connection.siteUrl, siteName: connection.siteName });
  } catch (err) {
    console.error('[PersonalConfluence] GET spaces error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to list Confluence spaces.' });
  }
}

// ── GET /api/confluence/personal/spaces/:spaceKey/pages ───────────────────────

export async function getPersonalSpacePages(req, res) {
  try {
    const connection = await PersonalConfluenceConnection.findOne({ userId: req.user._id });
    if (!connection) return res.status(404).json({ error: 'No personal Confluence connection found. Connect first.' });

    const accessToken = await getValidAccessToken(connection);
    const pages = await listPages(connection.cloudId, accessToken, req.params.spaceKey);

    return res.json({ pages });
  } catch (err) {
    console.error('[PersonalConfluence] GET pages error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to list Confluence pages.' });
  }
}

// ── POST /api/confluence/personal/link ────────────────────────────────────────
// Synchronous — pages are classified inline so the response carries an
// immediate per-page result. Capped (not fire-and-forget like the org-wide
// bulk sync) since a synchronous request shouldn't run unbounded — link an
// entire space via the frontend's "Link entire space" action up to this cap;
// larger spaces need the org-wide CTO/Admin-managed sync instead.
const MAX_PAGES_PER_LINK_REQUEST = 30;

export async function linkDocumentsToBlueprint(req, res) {
  try {
    const { blueprintId, pages, force } = req.body;
    if (!blueprintId || !Array.isArray(pages) || !pages.length) {
      return res.status(400).json({ error: 'blueprintId and a non-empty pages array are required.' });
    }
    if (pages.length > MAX_PAGES_PER_LINK_REQUEST) {
      return res.status(400).json({
        error: `Too many pages in one request (${pages.length}, max ${MAX_PAGES_PER_LINK_REQUEST}). Link fewer pages at a time, or ask your CTO/Admin to connect this space to the whole organisation instead.`,
      });
    }

    const blueprint = await verifyBlueprintOwnership(blueprintId, req.user._id);
    if (!blueprint) {
      return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });
    }

    const connection = await PersonalConfluenceConnection.findOne({ userId: req.user._id });
    if (!connection) return res.status(404).json({ error: 'No personal Confluence connection found. Connect first.' });

    const results = [];
    for (const { pageId, spaceKey } of pages) {
      try {
        const accessToken = await getValidAccessToken(connection);
        const page = await getPageContent(connection.cloudId, accessToken, pageId);
        const normalizedText = htmlToText(page.html);
        const contentHash = hashText(normalizedText);

        // Re-linking an already-linked, unchanged page happens easily now
        // that "link entire space" can resubmit overlapping pages — skip
        // the LLM classification call entirely when nothing's changed,
        // mirroring the same optimization in confluenceExtractionService.js.
        // force:true bypasses this — needed to pick up a classification
        // prompt improvement for pages whose Confluence content itself
        // hasn't changed (the hash alone can't detect that case).
        const existing = await LinkedProjectDocument.findOne({ blueprintId, sourceId: page.id }).lean();
        if (!force && existing && existing.contentHash === contentHash && existing.extractionStatus === 'extracted') {
          results.push({ pageId, title: page.title, status: 'linked', unchanged: true });
          continue;
        }

        const classification = await classifyDocument(page.title, normalizedText);

        await LinkedProjectDocument.updateOne(
          { blueprintId, sourceId: page.id },
          {
            $set: {
              blueprintId,
              linkedByUserId: req.user._id,
              sourceId: page.id,
              spaceKey: spaceKey || page.spaceKey,
              title: page.title,
              permalink: page.permalink,
              summary: classification.summary,
              keywords: classification.keywords,
              rawText: truncateForLLM(normalizedText),
              contentHash,
              confluenceLastModified: page.lastModified ? new Date(page.lastModified) : null,
              extractionStatus: 'extracted',
              extractionError: '',
            },
          },
          { upsert: true }
        );

        results.push({ pageId, title: page.title, status: 'linked' });
      } catch (pageErr) {
        console.error(`[PersonalConfluence] Failed to link page ${pageId}:`, pageErr.message);
        results.push({ pageId, status: 'error', error: pageErr.message });
      }
    }

    const linkedCount = results.filter(r => r.status === 'linked').length;
    const changedCount = results.filter(r => r.status === 'linked' && !r.unchanged).length;
    auditLog('LINKED', req.user._id, { blueprintId, linkedCount, changedCount, total: pages.length });

    // Generation can outrun linking (it starts before login, for guests).
    // Any capability that already finished before this link completed
    // regenerates automatically, picking up the newly-linked context —
    // same fire-and-forget function the manual "Regenerate" button calls.
    // Gated on changedCount, not linkedCount — re-submitting pages that were
    // already linked and unchanged has nothing new for a capability to pick
    // up, so it shouldn't trigger a wasted regeneration. Also skipped
    // entirely when force is set — that's an explicit re-classify-for-
    // testing action, not organically discovering new content, so the
    // caller decides what to regenerate rather than it cascading automatically.
    if (changedCount > 0 && !force) {
      for (const domain of blueprint.domains || []) {
        for (const cap of domain.capabilities || []) {
          if (cap.status !== 'completed') continue;
          regenerateTransformationCapabilityAsync(blueprintId, domain.domainId, cap.capabilityId, req.user._id, blueprint.businessObjective)
            .catch(err => console.error(`[PersonalConfluence] auto-regen failed for ${domain.domainId}/${cap.capabilityId}:`, err.message));
        }
      }
    }

    return res.json({ linkedCount, total: pages.length, results });
  } catch (err) {
    console.error('[PersonalConfluence] POST link error:', err.message);
    return res.status(500).json({ error: 'Failed to link documents.' });
  }
}

// ── GET /api/confluence/personal/linked/:blueprintId ──────────────────────────

export async function getLinkedDocuments(req, res) {
  try {
    const { blueprintId } = req.params;
    const blueprint = await verifyBlueprintOwnership(blueprintId, req.user._id);
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found or you do not have access to it.' });

    const docs = await LinkedProjectDocument.find({ blueprintId })
      .select('sourceId title spaceKey projectKey sourceType extractionStatus createdAt')
      .lean();

    return res.json({ documents: docs });
  } catch (err) {
    console.error('[PersonalConfluence] GET linked error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve linked documents.' });
  }
}

// ── GET /api/confluence/personal/status ───────────────────────────────────────

export async function getPersonalStatus(req, res) {
  try {
    const connection = await PersonalConfluenceConnection.findOne({ userId: req.user._id }).lean();
    if (!connection) return res.json({ connected: false });
    const jiraScopeGranted = JIRA_SCOPES.every(s => (connection.scopes || []).includes(s));
    return res.json({
      connected: true,
      siteName: connection.siteName,
      siteUrl: connection.siteUrl,
      jiraScopeGranted,
    });
  } catch (err) {
    console.error('[PersonalConfluence] GET status error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve connection status.' });
  }
}

// ── POST /api/confluence/personal/disconnect ──────────────────────────────────
// Hard-deletes the connection only. Already-linked documents stay attached to
// whatever blueprints they were linked to — they're historical grounding
// already baked into generated content, not live tokens.

export async function disconnectPersonal(req, res) {
  try {
    const result = await PersonalConfluenceConnection.deleteOne({ userId: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'No personal Confluence connection found.' });
    }
    auditLog('DISCONNECTED', req.user._id);
    return res.json({ status: 'disconnected' });
  } catch (err) {
    console.error('[PersonalConfluence] POST disconnect error:', err.message);
    return res.status(500).json({ error: 'Failed to disconnect Confluence.' });
  }
}
