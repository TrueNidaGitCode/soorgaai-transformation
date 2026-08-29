/**
 * SoorgaAI — GitHub REST API Service
 *
 * Repo creation + pushing a full file set as one initial commit, via the
 * Git Data API (blobs -> tree -> commit -> ref) rather than one Contents
 * API call per file — matches what a real `git push` of an initial commit
 * looks like, and avoids one round trip per file.
 */

import axios from 'axios';

const API_BASE = 'https://api.github.com';

function headers(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' };
}

/**
 * Creates a new (empty — no auto_init) repo owned by the authenticated user.
 * @returns {Promise<{owner:string, name:string, htmlUrl:string}>}
 */
export async function createRepo(accessToken, { name, description = '', isPrivate = false }) {
  const { data } = await axios.post(
    `${API_BASE}/user/repos`,
    { name, description, private: isPrivate, auto_init: false },
    { headers: headers(accessToken) }
  );
  return { owner: data.owner.login, name: data.name, htmlUrl: data.html_url };
}

async function createBlob(accessToken, owner, repo, content) {
  const { data } = await axios.post(
    `${API_BASE}/repos/${owner}/${repo}/git/blobs`,
    { content: Buffer.from(content, 'utf8').toString('base64'), encoding: 'base64' },
    { headers: headers(accessToken) }
  );
  return data.sha;
}

/**
 * Pushes `files` as a single initial commit on `main` into a freshly
 * created (empty) repo.
 * @param {{path:string, content:string}[]} files
 */
export async function pushFiles(accessToken, owner, repo, files, commitMessage) {
  const blobs = [];
  for (const file of files) {
    const sha = await createBlob(accessToken, owner, repo, file.content);
    blobs.push({ path: file.path, mode: '100644', type: 'blob', sha });
  }

  const { data: tree } = await axios.post(
    `${API_BASE}/repos/${owner}/${repo}/git/trees`,
    { tree: blobs },
    { headers: headers(accessToken) }
  );

  const { data: commit } = await axios.post(
    `${API_BASE}/repos/${owner}/${repo}/git/commits`,
    { message: commitMessage, tree: tree.sha },
    { headers: headers(accessToken) }
  );

  await axios.post(
    `${API_BASE}/repos/${owner}/${repo}/git/refs`,
    { ref: 'refs/heads/main', sha: commit.sha },
    { headers: headers(accessToken) }
  );

  return { commitSha: commit.sha };
}
