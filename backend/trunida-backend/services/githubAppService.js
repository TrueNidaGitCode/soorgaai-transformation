/**
 * Svarg — GitHub App (read-only)
 *
 * Aria connects a customer's repository to find where their data actually
 * lives: a product company's migrations and ORM models describe their schema
 * better than any inference from an objective can.
 *
 * ── Why this is not the existing OAuth connection ───────────────────────────
 *
 * services/githubAuthService.js requests the classic `repo` scope, which is
 * full read AND write on every repository the user can reach, public and
 * private — GitHub offers no narrower classic scope. Eame needs that, because
 * it creates a repository and pushes a project into it.
 *
 * Aria must not ask for it. Reading a customer's source to locate their
 * schema is a smaller act than being handed write access to everything they
 * own, and a consent screen saying "full control of private repositories" for
 * a data-connection step is not a promise anyone should be asked to accept.
 *
 * A GitHub App with Contents: Read-only cannot write. That is enforced by
 * GitHub rather than by our own restraint, which is the only kind of promise
 * worth making about someone else's source code. The customer also chooses
 * which repositories the installation covers.
 *
 * The two connections coexist deliberately: this one for reading on Aria, the
 * OAuth App for Eame's delivery, which is unchanged.
 *
 * ── Tokens ─────────────────────────────────────────────────────────────────
 *
 * A GitHub App authenticates as itself with a short-lived RS256 JWT signed by
 * its private key, then exchanges that for an installation access token scoped
 * to one installation. Installation tokens expire after an hour, so they are
 * minted per request rather than stored — there is nothing here to keep
 * encrypted at rest, which is a nice consequence rather than the goal.
 */

import jwt from 'jsonwebtoken';

const API = 'https://api.github.com';

const APP_ID      = process.env.GITHUB_APP_ID;
const APP_SLUG    = process.env.GITHUB_APP_SLUG;
const PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;

/**
 * Private keys are PEM, which is multi-line. Environment variables in most
 * hosts (Railway included) are far easier to set with literal \n, so accept
 * both rather than failing with an unhelpful "error:0909006C" from OpenSSL.
 */
function privateKey() {
  return String(PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

export function isGithubAppConfigured() {
  return !!(APP_ID && APP_SLUG && PRIVATE_KEY);
}

/** Where the customer goes to choose which repositories Svarg may read. */
export function buildInstallUrl(state) {
  return `https://github.com/apps/${encodeURIComponent(APP_SLUG)}/installations/new`
    + `?state=${encodeURIComponent(state)}`;
}

/**
 * A JWT authenticating as the App itself. Valid for ten minutes; GitHub
 * rejects anything longer.
 *
 * `iat` is backdated a minute because GitHub rejects a token whose issued-at
 * is in the future, and a server clock a few seconds fast is enough to trip
 * that — an intermittent 401 that looks like a bad key.
 */
function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: APP_ID },
    privateKey(),
    { algorithm: 'RS256' }
  );
}

async function ghFetch(url, token, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Svarg',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Details of one installation — which account it belongs to. */
export async function getInstallation(installationId) {
  const data = await ghFetch(`${API}/app/installations/${installationId}`, appJwt());
  return {
    installationId: String(data.id),
    accountLogin:   data.account?.login || '',
    accountType:    data.account?.type || '',
    repositorySelection: data.repository_selection || '',
  };
}

/**
 * A token scoped to one installation. Short-lived by design, so callers should
 * mint one per operation rather than holding it.
 */
export async function getInstallationToken(installationId) {
  const data = await ghFetch(
    `${API}/app/installations/${installationId}/access_tokens`,
    appJwt(),
    { method: 'POST' }
  );
  return data.token;
}

/** The repositories this installation may read — the customer chose these. */
export async function listInstallationRepos(installationId) {
  const token = await getInstallationToken(installationId);
  const data = await ghFetch(`${API}/installation/repositories?per_page=100`, token);
  return (data.repositories || []).map(r => ({
    fullName:      r.full_name,
    defaultBranch: r.default_branch,
    private:       r.private,
    language:      r.language || '',
    updatedAt:     r.updated_at,
  }));
}

/** Refused above this — a source file this large is generated or vendored. */
const MAX_FILE_BYTES = 200_000;

/**
 * Every path in the repository, in one request.
 *
 * `recursive=1` walks the whole tree server-side, which is far cheaper than
 * paging directories, and lets selection happen against filenames before a
 * single file is fetched. GitHub sets `truncated` on very large repositories;
 * callers get it and should degrade to a partial profile rather than pretend
 * they saw everything.
 */
export async function getRepoTree(installationId, fullName, ref = 'HEAD') {
  const token = await getInstallationToken(installationId);
  const data = await ghFetch(
    `${API}/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    token
  );
  return {
    truncated: !!data.truncated,
    files: (data.tree || [])
      .filter(n => n.type === 'blob')
      .map(n => ({ path: n.path, bytes: n.size || 0 })),
  };
}

/**
 * One file's text.
 *
 * Returns null rather than throwing for the ordinary reasons a file cannot be
 * read — too large, binary, deleted between tree and fetch. A profile built
 * from nineteen of twenty files is worth having; one that fails entirely
 * because a single path went missing is not.
 */
export async function getFileContent(installationId, fullName, filePath) {
  try {
    const token = await getInstallationToken(installationId);
    const data = await ghFetch(
      `${API}/repos/${fullName}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`,
      token
    );
    if (data.size > MAX_FILE_BYTES || data.encoding !== 'base64' || !data.content) return null;

    const text = Buffer.from(data.content, 'base64').toString('utf8');
    // A NUL byte means this is not text, whatever its extension claimed.
    // Embedding decoded binary produces vectors that match nothing and waste
    // the call that made them.
    if (text.includes('\u0000')) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Confirms the installation still exists and is readable.
 *
 * A customer can uninstall the App at any time, from GitHub, without telling
 * us. Treating a stored installation id as proof of a live connection would
 * make the screen report a healthy connection that cannot read anything.
 */
export async function isInstallationLive(installationId) {
  try {
    await getInstallation(installationId);
    return true;
  } catch {
    return false;
  }
}
