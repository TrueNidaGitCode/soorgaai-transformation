/**
 * SoorgaAI — Atlassian OAuth Service
 *
 * Product-agnostic OAuth 2.0 (3LO) plumbing shared by every Atlassian
 * product connector (Confluence today, Jira for the pipeline wizard) —
 * token exchange/refresh and the accessible-resources/cloudId lookup are
 * identical regardless of which product's scopes were granted. Only each
 * product's own REST API base path differs (see confluenceApiService.js /
 * jiraApiService.js).
 *
 * Extracted from confluenceApiService.js, which re-exports everything here
 * so no existing caller's import line changes.
 */

import axios from 'axios';
import { encryptSecret, decryptSecret } from '../utils/encryption.js';

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL      = 'https://auth.atlassian.com/oauth/token';
const RESOURCES_URL  = 'https://api.atlassian.com/oauth/token/accessible-resources';

const CLIENT_ID     = process.env.CONFLUENCE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.CONFLUENCE_OAUTH_CLIENT_SECRET;
const CALLBACK_URL  = process.env.CONFLUENCE_OAUTH_CALLBACK_URL;

// Granular OAuth scopes — least privilege: read-only content + space listing,
// offline_access for refresh tokens. Identity (who connected) is already
// known from our own JWT — no User identity API scope is requested.
export const CONFLUENCE_SCOPES = [
  'offline_access',
  'read:space:confluence',
  'read:page:confluence',
];

// Jira Cloud's granular "work" scope covers projects/issues/comments —
// requires this scope to be added under Jira API permissions on the same
// Atlassian Developer Console app that already grants CONFLUENCE_SCOPES
// (external, manual step — see PRODUCT_PIPELINE_SCHEMA.md's Window 3 note).
export const JIRA_SCOPES = ['read:jira-work'];

// The pipeline wizard requests both products' scopes in one consent, so a
// single connection covers Window 1 (Confluence) and Window 3 (Jira).
export const ATLASSIAN_SCOPES = [...new Set([...CONFLUENCE_SCOPES, ...JIRA_SCOPES])];

export function isAtlassianOAuthConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && CALLBACK_URL);
}

/**
 * Builds the Atlassian authorize redirect URL.
 * @param {string} state
 * @param {string[]} [scopes=CONFLUENCE_SCOPES] — explicit, not implicitly
 *   widened, so callers that only need one product's scopes (e.g. the
 *   org-wide Confluence connector) aren't silently granted more.
 */
export function buildAuthorizeUrl(state, scopes = CONFLUENCE_SCOPES) {
  const params = new URLSearchParams({
    audience:      'api.atlassian.com',
    client_id:     CLIENT_ID,
    scope:         scopes.join(' '),
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
 * Product-agnostic — the same call surfaces whichever products' scopes were
 * granted. v1 uses only the first entry — multi-site accounts are not yet
 * supported.
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
 * @param {import('mongoose').Document} connection PersonalConfluenceConnection/ConfluenceConnection doc
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
