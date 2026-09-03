/**
 * SoorgaAI — GitHub REST API Service
 *
 * Repo creation + pushing a full file set as one real commit, via the Git
 * Data API (blobs -> tree -> commit -> ref) rather than one Contents API
 * call per file — matches what a real `git push` looks like, and avoids
 * one round trip per file.
 *
 * A brand-new repo has zero commits, and GitHub's Git Data API 409s with
 * "Git Repository is empty." on git/trees and git/commits until at least
 * one commit exists — there's no way to create that very first commit
 * through the Git Data API itself. So pushFiles() bootstraps one throwaway
 * commit via the Contents API (the one endpoint that can initialize an
 * empty repo), then builds the real, complete tree as a second commit on
 * top of it via the Git Data API — the actual file set still lands as one
 * real commit, just not the repo's very first one.
 */

import axios from 'axios';

const API_BASE = 'https://api.github.com';

function headers(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' };
}

/**
 * Creates a new (empty — no auto_init) repo owned by the authenticated user.
 * @returns {Promise<{owner:string, name:string, htmlUrl:string, defaultBranch:string}>}
 */
/**
 * Create the repository, or adopt one that is already there.
 *
 * A repository of this name usually exists because a previous run already
 * delivered it — the name is derived from the use case, so it is stable.
 * Failing in that case blocks the whole pipeline on a success. The existing
 * repository is returned and left ALONE: its contents are the customer's,
 * and overwriting them to satisfy a retry would be worse than not pushing.
 */
export async function createRepo(accessToken, { name, description = '', isPrivate = false }) {
  try {
    const { data } = await axios.post(
      `${API_BASE}/user/repos`,
      { name, description, private: isPrivate, auto_init: false },
      { headers: headers(accessToken) }
    );
    return { owner: data.owner.login, name: data.name, htmlUrl: data.html_url, defaultBranch: data.default_branch, created: true };
  } catch (err) {
    const already = (err.response?.data?.errors || [])
      .some(e => /already exists/i.test(e.message || ''));
    if (!already) throw err;

    const me = await axios.get(`${API_BASE}/user`, { headers: headers(accessToken) });
    const { data } = await axios.get(
      `${API_BASE}/repos/${me.data.login}/${name}`,
      { headers: headers(accessToken) }
    );

    // An existing repository is left alone because its contents are the
    // customer's — but an EMPTY one has nothing to protect, and is usually
    // the wreckage of an earlier attempt that created the repo and then
    // failed to push. Adopting that and calling it delivered leaves the
    // deploy platform with nothing to build.
    let isEmpty = false;
    try {
      await axios.get(`${API_BASE}/repos/${data.owner.login}/${data.name}/contents/`,
        { headers: headers(accessToken) });
    } catch (e) {
      // GitHub answers 404 for the contents of a repository with no commits.
      if (e.response?.status === 404) isEmpty = true;
    }

    return {
      owner: data.owner.login, name: data.name, htmlUrl: data.html_url,
      defaultBranch: data.default_branch, created: false, isEmpty,
    };
  }
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
 * Pushes `files` as one commit onto `branch` (the repo's default branch,
 * from createRepo()'s return value) in a freshly created, still-empty repo.
 * @param {{path:string, content:string}[]} files
 */
export async function pushFiles(accessToken, owner, repo, branch, files, commitMessage) {
  const { data: bootstrap } = await axios.put(
    `${API_BASE}/repos/${owner}/${repo}/contents/.gitkeep`,
    { message: 'Initialize repository', content: Buffer.from('').toString('base64') },
    { headers: headers(accessToken) }
  );
  const parentSha = bootstrap.commit.sha;

  const blobs = [];
  for (const file of files) {
    const sha = await createBlob(accessToken, owner, repo, file.content);
    blobs.push({ path: file.path, mode: '100644', type: 'blob', sha });
  }

  // No base_tree — this tree is the complete, final file set, so the
  // .gitkeep bootstrap file (not included in `files`) won't appear in it.
  const { data: tree } = await axios.post(
    `${API_BASE}/repos/${owner}/${repo}/git/trees`,
    { tree: blobs },
    { headers: headers(accessToken) }
  );

  const { data: commit } = await axios.post(
    `${API_BASE}/repos/${owner}/${repo}/git/commits`,
    { message: commitMessage, tree: tree.sha, parents: [parentSha] },
    { headers: headers(accessToken) }
  );

  // PATCH, not POST — the ref already exists (created by the bootstrap
  // commit above), this just moves it forward.
  await axios.patch(
    `${API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    { sha: commit.sha },
    { headers: headers(accessToken) }
  );

  return { commitSha: commit.sha };
}
