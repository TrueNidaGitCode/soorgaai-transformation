/**
 * Svarg — reading a repository, whichever connection is available
 *
 * Aria needs to read a customer's code. There are two ways in, and they are
 * not equivalent:
 *
 *   app    A GitHub App with Contents: Read-only. The customer picks which
 *          repositories it covers and GitHub itself prevents writing. This is
 *          the one to offer a customer.
 *
 *   oauth  The connection Eame already uses, carrying the classic `repo`
 *          scope: read AND write on every repository the user owns. It can
 *          read perfectly well, and it is already configured — but a customer
 *          asked to grant it saw "full control of private repositories" on the
 *          consent screen, for what is a data-connection step.
 *
 * The App is preferred whenever it is configured. OAuth is the fallback, so a
 * deployment that already has Eame's connector working can read code today
 * without standing up a second app.
 *
 * ── Nothing here writes ─────────────────────────────────────────────────────
 *
 * Every function in this file is a GET. That is not enough to make the OAuth
 * path safe — the token still permits writing, and honesty about that belongs
 * in the UI rather than in a comment — but it does mean no code path from Aria
 * can modify a customer's repository, whichever connection carried it.
 */

import GithubAppInstallation from '../models/GithubAppInstallation.js';
import PersonalGithubConnection from '../models/PersonalGithubConnection.js';
import { decryptSecret } from '../utils/encryption.js';
import { isGithubAppConfigured, getInstallationToken } from './githubAppService.js';
import { isClassicOAuthApp } from './githubAuthService.js';

const API = 'https://api.github.com';

/** Refused above this — a source file this large is generated or vendored. */
const MAX_FILE_BYTES = 200_000;

async function ghGet(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Svarg',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * How this user can read repositories, or null if they cannot.
 *
 * @returns {Promise<{kind:'app'|'oauth', token:string, account:string, scopeNote:string, repositorySelection:string}|null>}
 */
export async function resolveRepoAccess(userId) {
  if (isGithubAppConfigured()) {
    const install = await GithubAppInstallation.findOne({ userId }).lean();
    if (install) {
      return {
        kind: 'app',
        token: await getInstallationToken(install.installationId),
        account: install.accountLogin,
        repositorySelection: install.repositorySelection,
        scopeNote: 'read-only',
      };
    }
  }

  const conn = await PersonalGithubConnection.findOne({ userId }).lean();
  if (conn?.encryptedAccessToken) {
    return {
      kind: 'oauth',
      token: decryptSecret(conn.encryptedAccessToken),
      account: conn.githubLogin,
      repositorySelection: 'all',
      // Say what is actually known, not what is assumed. A classic OAuth App
      // was granted the 'repo' scope — read AND write on everything — and the
      // user should be told. A GitHub App gets only the permissions declared
      // on the app itself, which this code cannot read, so it does not claim
      // to know them. Announcing "full access" for a Contents: Read-only app
      // would be the same fabrication this screen exists to remove.
      scopeNote: isClassicOAuthApp()
        ? 'full access — granted for delivery'
        : 'access as configured on the GitHub App',
    };
  }

  return null;
}

/** Repositories this connection can see. */
export async function readRepos(access) {
  if (access.kind === 'app') {
    const data = await ghGet(`${API}/installation/repositories?per_page=100`, access.token);
    return (data.repositories || []).map(mapRepo);
  }
  // OAuth lists what the user owns or collaborates on; newest activity first
  // so the repository they are actually working on is near the top.
  const data = await ghGet(`${API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator`, access.token);
  return (data || []).map(mapRepo);
}

function mapRepo(r) {
  return {
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    private: r.private,
    language: r.language || '',
    updatedAt: r.updated_at,
  };
}

/**
 * Every path in the repository, in one request. `truncated` is passed through
 * so callers degrade to a partial profile rather than pretending they saw
 * everything.
 */
export async function readTree(access, fullName, ref = 'HEAD') {
  const data = await ghGet(
    `${API}/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    access.token
  );
  return {
    truncated: !!data.truncated,
    files: (data.tree || [])
      .filter(n => n.type === 'blob')
      .map(n => ({ path: n.path, bytes: n.size || 0 })),
  };
}

/**
 * One file's text, or null for the ordinary reasons a file cannot be read —
 * too large, binary, or gone between tree and fetch. A profile built from
 * nineteen of twenty files is worth having.
 */
export async function readFile(access, fullName, filePath) {
  try {
    const data = await ghGet(
      `${API}/repos/${fullName}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`,
      access.token
    );
    if (data.size > MAX_FILE_BYTES || data.encoding !== 'base64' || !data.content) return null;

    const text = Buffer.from(data.content, 'base64').toString('utf8');
    // A NUL byte means this is not text, whatever the extension claimed.
    if (text.includes(String.fromCharCode(0))) return null;
    return text;
  } catch {
    return null;
  }
}
