/**
 * GitHub: the issues and pull requests of one repository, read-only.
 *
 * A fine-grained personal access token with read access to issues and pull
 * requests on that repository is enough. Held here, never on Svarg.
 */
import axios from 'axios';

export const kind = 'github';
export const label = 'GitHub';
export const help = 'Issues and pull requests from one repository. A fine-grained token with read access to Issues and Pull requests.';

export const fields = [
  { name: 'repo', label: 'Repository', placeholder: 'owner/name' },
  { name: 'token', label: 'Access token', secret: true },
  { name: 'include', label: 'Include', placeholder: 'both', required: false, options: ['both', 'issues', 'pulls'] },
];

export const provides = ['number', 'type', 'title', 'body', 'state', 'author', 'assignees', 'labels', 'created', 'updated', 'closed', 'url'];

const PAGE = 100;

function repo(config) {
  const r = String(config.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw new Error('The repository should be written owner/name.');
  return r;
}

function client(config) {
  return axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${String(config.token || '')}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'svarg-application',
    },
    timeout: 30000,
  });
}

function reason(err) {
  if (err.response?.status === 401) return 'GitHub refused the token.';
  if (err.response?.status === 404) return 'That repository was not found, or the token cannot see it.';
  return String(err.response?.data?.message || err.message);
}

export function describe(config) {
  return `github.com/${repo(config)} · ${config.include || 'both'}`;
}

export async function test(config) {
  const r = repo(config);
  try {
    const me = await client(config).get(`/repos/${r}`);
    return { ok: true, message: `Connected to ${me.data.full_name}${me.data.private ? ' (private)' : ''}.` };
  } catch (err) {
    throw new Error(reason(err));
  }
}

export async function pull(config, { maxRows = 50000 } = {}) {
  const r = repo(config);
  const include = String(config.include || 'both');
  const c = client(config);
  const out = [];
  for (let page = 1; ; page++) {
    let res;
    try { res = await c.get(`/repos/${r}/issues`, { params: { state: 'all', per_page: PAGE, page, sort: 'created', direction: 'desc' } }); }
    catch (err) { throw new Error(reason(err)); }
    const items = res.data || [];
    for (const it of items) {
      const isPr = !!it.pull_request;
      if (include === 'issues' && isPr) continue;
      if (include === 'pulls' && !isPr) continue;
      out.push({
        number: it.number, type: isPr ? 'pull request' : 'issue',
        title: it.title || '', body: String(it.body || ''),
        state: it.state || '', author: it.user?.login || '',
        assignees: (it.assignees || []).map(a => a.login).join('; '),
        labels: (it.labels || []).map(l => l.name).join('; '),
        created: it.created_at || '', updated: it.updated_at || '', closed: it.closed_at || '',
        url: it.html_url || '',
      });
      if (out.length >= maxRows) return out;
    }
    if (items.length < PAGE) break;
  }
  return out;
}
