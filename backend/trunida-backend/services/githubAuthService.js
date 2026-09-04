/**
 * SoorgaAI — GitHub OAuth Service
 *
 * OAuth 2.0 plumbing for GitHub, same style as atlassianAuthService.js
 * (plain axios calls, no SDK). Simpler than Atlassian: classic GitHub
 * OAuth App access tokens don't expire, so there's no refresh flow.
 */

import axios from 'axios';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL      = 'https://github.com/login/oauth/access_token';
const USER_URL       = 'https://api.github.com/user';

const CLIENT_ID     = process.env.GITHUB_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const CALLBACK_URL  = process.env.GITHUB_OAUTH_CALLBACK_URL;

// 'repo' — needed to create a repository and push content via the Git
// Data API. GitHub has no narrower "create repos only" granular scope
// for classic OAuth Apps.
export const GITHUB_SCOPES = ['repo'];

export function isGithubOAuthConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && CALLBACK_URL);
}

/**
 * Classic OAuth Apps have 20-character hexadecimal client ids. GitHub Apps use
 * a prefixed form — Iv1., Iv23…, Ov23… — and the distinction matters here:
 *
 *   OAuth App   permissions are requested at authorize time, via `scope`
 *   GitHub App  permissions are fixed on the app itself; `scope` is not part
 *               of its authorize contract, and sending one makes GitHub answer
 *               the authorize page with a 404
 *
 * So the parameter is included only when it means something.
 */
function isClassicOAuthApp() {
  return /^[0-9a-f]{20}$/.test(String(CLIENT_ID || ''));
}

export function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id:    CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    state,
  });
  // Requested for Eame's delivery push, which needs write. A GitHub App gets
  // whatever its own configuration declares and must not be sent this.
  if (isClassicOAuthApp()) params.set('scope', GITHUB_SCOPES.join(' '));

  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeCodeForToken(code) {
  const { data } = await axios.post(
    TOKEN_URL,
    {
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri:  CALLBACK_URL,
    },
    { headers: { Accept: 'application/json' } }
  );
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  return data; // { access_token, scope, token_type }
}

export async function getAuthenticatedUser(accessToken) {
  const { data } = await axios.get(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  });
  return data; // { login, id, ... }
}
