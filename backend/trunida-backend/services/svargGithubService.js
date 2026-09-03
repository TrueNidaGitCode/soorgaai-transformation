/**
 * Svarg — publishing agents to Svarg's own GitHub
 *
 * Every agent Eame builds lives in a repository Svarg owns. That is what
 * makes hosting work for a stranger: Railway's GitHub App is installed once
 * on the Svarg account with access to all repositories, so a repo created
 * this morning is buildable this morning. Pointing Railway at a customer's
 * account instead means asking every customer to grant their deploy platform
 * read access to their own GitHub — which no enterprise will do, and which
 * silently fails with "GitHub Repo not found" when they grant it narrowly.
 *
 * The customer is not locked out: they download the project as a zip
 * (see downloadProject) and push it wherever they like. They get the code;
 * Svarg keeps a copy it can actually build from.
 */

import axios from 'axios';
import { pushFiles } from './githubApiService.js';

const API_BASE = 'https://api.github.com';

const TOKEN = process.env.SVARG_GITHUB_TOKEN || '';
/** A GitHub organisation, or a plain account login. Both are supported. */
const OWNER = process.env.SVARG_GITHUB_OWNER || '';

export function isSvargGithubConfigured() {
  return Boolean(TOKEN && OWNER);
}

function headers() {
  return { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' };
}

/**
 * A repository name that is unique across every customer.
 *
 * Use-case slugs are derived from the objective, so two customers in the
 * same industry genuinely do collide — "defect-matching" is not a rare
 * name. Under a single Svarg owner a collision would silently hand
 * customer B the repository built for customer A, so the blueprint id is
 * part of the name, not a tiebreaker added after a failure.
 */
export function svargRepoName(slug, blueprintId) {
  const base = String(slug || 'agent').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'agent';
  return `${base}-${String(blueprintId).slice(-8)}`;
}

/**
 * Whether OWNER is an organisation, which decides the creation endpoint:
 * /orgs/{org}/repos for an org, /user/repos for a plain account. Asking is
 * more reliable than a config flag someone has to remember to set.
 */
async function ownerIsOrg() {
  try {
    const { data } = await axios.get(`${API_BASE}/users/${OWNER}`, { headers: headers() });
    return data.type === 'Organization';
  } catch {
    return false;
  }
}

/**
 * Create the repository under the Svarg owner, or adopt it if a previous
 * run already made it.
 *
 * Unlike the customer-owned path, an existing repo here is OURS, and
 * overwriting it is correct: it holds a previous build of the same agent for
 * the same blueprint, and a re-push is how a rebuilt agent reaches Railway.
 */
export async function ensureSvargRepo({ name, description }) {
  const isOrg = await ownerIsOrg();
  const createUrl = isOrg ? `${API_BASE}/orgs/${OWNER}/repos` : `${API_BASE}/user/repos`;

  try {
    const { data } = await axios.post(
      createUrl,
      { name, description, private: true, auto_init: false },
      { headers: headers() }
    );
    return { owner: data.owner.login, name: data.name, htmlUrl: data.html_url, defaultBranch: data.default_branch || 'main', created: true };
  } catch (err) {
    const already = (err.response?.data?.errors || []).some(e => /already exists/i.test(e.message || ''));
    if (!already) throw err;

    const { data } = await axios.get(`${API_BASE}/repos/${OWNER}/${name}`, { headers: headers() });
    return { owner: data.owner.login, name: data.name, htmlUrl: data.html_url, defaultBranch: data.default_branch || 'main', created: false };
  }
}

/**
 * Push the file set, replacing whatever is there.
 *
 * pushFiles() bootstraps a .gitkeep commit through the Contents API, which
 * is the only way to give a brand-new repository its first commit — but it
 * 422s on a repository that already has one. On a re-push the bootstrap is
 * skipped and the new tree is committed straight onto the existing head.
 */
export async function publishToSvarg({ repo, files, message }) {
  if (repo.created) {
    return pushFiles(TOKEN, repo.owner, repo.name, repo.defaultBranch, files, message);
  }

  // Existing repo: commit a complete new tree on top of the current head.
  const { data: ref } = await axios.get(
    `${API_BASE}/repos/${repo.owner}/${repo.name}/git/ref/heads/${repo.defaultBranch}`,
    { headers: headers() }
  ).catch(() => ({ data: null })) || {};

  // A repo that exists but has no commits still needs the bootstrap path.
  if (!ref?.object?.sha) {
    return pushFiles(TOKEN, repo.owner, repo.name, repo.defaultBranch, files, message);
  }

  const blobs = [];
  for (const file of files) {
    const { data } = await axios.post(
      `${API_BASE}/repos/${repo.owner}/${repo.name}/git/blobs`,
      { content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' },
      { headers: headers() }
    );
    blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: data.sha });
  }

  // No base_tree: the manifest is the complete file set, so a file dropped
  // from the builder disappears from the repo rather than lingering.
  const { data: tree } = await axios.post(
    `${API_BASE}/repos/${repo.owner}/${repo.name}/git/trees`,
    { tree: blobs }, { headers: headers() }
  );
  const { data: commit } = await axios.post(
    `${API_BASE}/repos/${repo.owner}/${repo.name}/git/commits`,
    { message, tree: tree.sha, parents: [ref.object.sha] }, { headers: headers() }
  );
  await axios.patch(
    `${API_BASE}/repos/${repo.owner}/${repo.name}/git/refs/heads/${repo.defaultBranch}`,
    { sha: commit.sha }, { headers: headers() }
  );
  return { commitSha: commit.sha };
}
