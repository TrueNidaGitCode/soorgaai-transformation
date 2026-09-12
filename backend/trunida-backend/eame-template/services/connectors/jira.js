/**
 * Jira Cloud, by API token.
 *
 * An API token from id.atlassian.com, held by this application and nowhere
 * else. No OAuth app on Svarg's side is involved, which is the point: the
 * credential is the owner's, kept in the owner's database.
 */
import axios from 'axios';

export const kind = 'jira';
export const label = 'Jira';
export const help = 'Issues from one project or JQL query. Create an API token at id.atlassian.com → Security → API tokens.';

export const fields = [
  { name: 'siteUrl', label: 'Site', placeholder: 'https://your-team.atlassian.net' },
  { name: 'email', label: 'Atlassian email', placeholder: 'you@company.com' },
  { name: 'apiToken', label: 'API token', secret: true },
  { name: 'jql', label: 'Project key or JQL', placeholder: 'PROJ   or   project = PROJ AND status != Done' },
];

/** What each pulled issue carries, for the mapping onto the dataset. */
export const provides = ['key', 'summary', 'description', 'type', 'status', 'priority', 'assignee', 'reporter', 'labels', 'created', 'updated', 'resolved', 'url'];

const PAGE = 100;
const FIELDS = 'summary,description,issuetype,status,priority,assignee,reporter,labels,created,updated,resolutiondate';

function site(config) {
  return String(config.siteUrl || '').trim().replace(/\/+$/, '');
}

function client(config) {
  return axios.create({
    baseURL: site(config),
    auth: { username: String(config.email || '').trim(), password: String(config.apiToken || '') },
    headers: { Accept: 'application/json' },
    timeout: 30000,
  });
}

/** A bare project key becomes a query; anything else is taken as JQL. */
export function toJql(text) {
  const t = String(text || '').trim();
  if (!t) return 'order by created DESC';
  if (/^[A-Z][A-Z0-9_]*$/i.test(t)) return `project = ${t.toUpperCase()} order by created DESC`;
  return t;
}

/** Atlassian Document Format to plain text: the text nodes, paragraphs on their own lines. */
export function adfToText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.text || '';
  const inner = (node.content || []).map(adfToText).join('');
  return ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(node.type) ? inner + '\n' : inner;
}

function reason(err) {
  const d = err.response?.data;
  const msg = d?.errorMessages?.[0] || (d?.errors && Object.values(d.errors)[0]) || d?.message || err.message;
  if (err.response?.status === 401) return 'Jira refused the email and token.';
  if (err.response?.status === 404) return 'No Jira site answers at that address.';
  if (err.response?.status === 403) return 'That account cannot read those issues.';
  if (!err.response) return 'Could not reach that address: ' + err.message;
  return String(msg);
}

export function describe(config) {
  return `${site(config)} · ${toJql(config.jql)}`;
}

export async function test(config) {
  if (!/^https?:\/\//.test(site(config))) throw new Error('The site address should start with https://');
  try {
    const me = await client(config).get('/rest/api/3/myself');
    return { ok: true, message: `Connected as ${me.data.displayName || me.data.emailAddress || 'the token holder'}.` };
  } catch (err) {
    throw new Error(reason(err));
  }
}

function toRow(issue) {
  const f = issue.fields || {};
  return {
    key: issue.key,
    summary: f.summary || '',
    description: adfToText(f.description).trim(),
    type: f.issuetype?.name || '',
    status: f.status?.name || '',
    priority: f.priority?.name || '',
    assignee: f.assignee?.displayName || '',
    reporter: f.reporter?.displayName || '',
    labels: (f.labels || []).join('; '),
    created: f.created || '',
    updated: f.updated || '',
    resolved: f.resolutiondate || '',
    url: `${issue.self ? issue.self.split('/rest/')[0] : ''}/browse/${issue.key}`,
  };
}

/**
 * Pages through the search. The newer endpoint (a page token) is tried first;
 * a site that still answers only the older one (an offset) gets that.
 */
export async function pull(config, { maxRows = 50000 } = {}) {
  const c = client(config);
  const jql = toJql(config.jql);
  const out = [];
  try {
    let token = null;
    do {
      const r = await c.get('/rest/api/3/search/jql', { params: { jql, maxResults: PAGE, fields: FIELDS, ...(token ? { nextPageToken: token } : {}) } });
      for (const issue of r.data.issues || []) { out.push(toRow(issue)); if (out.length >= maxRows) return out; }
      token = r.data.nextPageToken || null;
    } while (token);
    return out;
  } catch (err) {
    if (![404, 410].includes(err.response?.status) || out.length) throw new Error(reason(err));
  }
  let startAt = 0;
  for (;;) {
    let r;
    try { r = await c.get('/rest/api/3/search', { params: { jql, maxResults: PAGE, startAt, fields: FIELDS } }); }
    catch (err) { throw new Error(reason(err)); }
    const issues = r.data.issues || [];
    for (const issue of issues) { out.push(toRow(issue)); if (out.length >= maxRows) return out; }
    startAt += issues.length;
    if (!issues.length || startAt >= (r.data.total || 0)) break;
  }
  return out;
}
