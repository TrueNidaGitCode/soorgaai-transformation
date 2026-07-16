/**
 * SoorgaAI — Confluence API Service
 *
 * Pure Atlassian REST client: OAuth 2.0 (3LO) token exchange/refresh,
 * accessible-resources lookup, space/page listing, and page content fetch.
 * No Mongoose/model access here — callers persist whatever this returns.
 */

import axios from 'axios';
import { encryptSecret, decryptSecret } from '../utils/encryption.js';

const AUTHORIZE_URL   = 'https://auth.atlassian.com/authorize';
const TOKEN_URL        = 'https://auth.atlassian.com/oauth/token';
const RESOURCES_URL    = 'https://api.atlassian.com/oauth/token/accessible-resources';

const CLIENT_ID     = process.env.CONFLUENCE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.CONFLUENCE_OAUTH_CLIENT_SECRET;
const CALLBACK_URL  = process.env.CONFLUENCE_OAUTH_CALLBACK_URL;

// Granular OAuth scopes — least privilege: read-only content + space listing,
// offline_access for refresh tokens. Identity (who connected) is already
// known from our own JWT — no User identity API scope is requested, since
// nothing in this codebase ever calls an Atlassian /me endpoint.
export const CONFLUENCE_SCOPES = [
  'offline_access',
  'read:confluence-content.all',
  'read:confluence-space.summary',
];

export function isConfluenceOAuthConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && CALLBACK_URL);
}

/**
 * Builds the Atlassian authorize redirect URL.
 */
export function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    audience:      'api.atlassian.com',
    client_id:     CLIENT_ID,
    scope:         CONFLUENCE_SCOPES.join(' '),
    redirect_uri:  CALLBACK_URL,
    state,
    response_type: 'code',
    prompt:        'consent',
  });
  return `${AUTHORIZE_URL}?${params}`;
}

/**
 * Exchanges an authorization code for an access + refresh token pair.
 */
export async function exchangeCodeForTokens(code) {
  const { data } = await axios.post(TOKEN_URL, {
    grant_type:    'authorization_code',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri:  CALLBACK_URL,
  });
  return data; // { access_token, refresh_token, expires_in, scope, token_type }
}

/**
 * Exchanges a refresh token for a new access + refresh token pair.
 * Atlassian rotates the refresh token on every use — always persist the new one.
 */
async function refreshTokens(refreshToken) {
  const { data } = await axios.post(TOKEN_URL, {
    grant_type:    'refresh_token',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  return data;
}

/**
 * Fetches the Atlassian sites (cloudId, url, name) accessible to this token.
 * v1 uses only the first entry — multi-site accounts are not yet supported.
 */
export async function getAccessibleResources(accessToken) {
  const { data } = await axios.get(RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data; // [{ id: cloudId, url, name, scopes, avatarUrl }]
}

/**
 * Returns a valid plaintext access token for the given connection, refreshing
 * (and persisting the refreshed, re-encrypted tokens) if the current one has
 * expired or is within 60s of expiry. The plaintext token is never logged.
 *
 * @param {import('mongoose').Document} connection ConfluenceConnection doc
 * @returns {Promise<string>} plaintext access token
 */
export async function getValidAccessToken(connection) {
  const expiresAt = connection.accessTokenExpiresAt ? new Date(connection.accessTokenExpiresAt).getTime() : 0;
  const isExpiring = !expiresAt || expiresAt - Date.now() < 60_000;

  if (!isExpiring) {
    return decryptSecret(connection.encryptedAccessToken);
  }

  if (!connection.encryptedRefreshToken) {
    throw new Error('No refresh token on file — reconnect required.');
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken);
  const tokens = await refreshTokens(refreshToken);

  connection.encryptedAccessToken  = encryptSecret(tokens.access_token);
  connection.encryptedRefreshToken = encryptSecret(tokens.refresh_token);
  connection.accessTokenExpiresAt  = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  await connection.save();

  return tokens.access_token;
}

// ── Discovery (metadata only) ────────────────────────────────────────────────

export async function listSpaces(cloudId, accessToken) {
  const { data } = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/rest/api/space`,
    { headers: { Authorization: `Bearer ${accessToken}` }, params: { limit: 100 } }
  );
  return (data.results || []).map(s => ({ key: s.key, id: String(s.id), name: s.name, type: s.type }));
}

export async function listPages(cloudId, accessToken, spaceKey, { limit = 100, maxPages = 500 } = {}) {
  const pages = [];
  let url = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/rest/api/content`;
  let params = { spaceKey, type: 'page', expand: 'version', limit };

  while (url && pages.length < maxPages) {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });

    for (const p of data.results || []) {
      pages.push({ id: p.id, title: p.title, lastModified: p.version?.when || null });
    }

    if (data._links?.next && pages.length < maxPages) {
      url = `https://api.atlassian.com${data._links.next}`;
      params = undefined; // next link already has the full query string
    } else {
      url = null;
    }
  }

  return pages.slice(0, maxPages);
}

/**
 * Fetches macro-resolved static HTML for one page (body.export_view).
 * Diagrams/images/attachments remain out of scope — only text content is used.
 */
export async function getPageContent(cloudId, accessToken, pageId) {
  const { data } = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/rest/api/content/${pageId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { expand: 'body.export_view,version,space' },
    }
  );

  return {
    id:           data.id,
    title:        data.title,
    spaceKey:     data.space?.key || '',
    html:         data.body?.export_view?.value || '',
    lastModified: data.version?.when || null,
    permalink:    data._links?.base && data._links?.webui ? `${data._links.base}${data._links.webui}` : '',
  };
}
