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
export const help = 'Issues from your Jira projects: status, owner, due date, estimate and time spent. Create an API token at '
  + 'id.atlassian.com → Security → API tokens.';

export const fields = [
  { name: 'siteUrl', label: 'Site', placeholder: 'https://your-team.atlassian.net' },
  { name: 'email', label: 'Atlassian email', placeholder: 'you@company.com' },
  { name: 'apiToken', label: 'API token', secret: true },
  { name: 'jql', label: 'Project key or JQL', placeholder: 'PROJ   or   project = PROJ AND status != Done' },
  // Written by the connect flow, which knows the project's name; never typed.
  { name: 'projectName', label: 'Project', hidden: true, required: false },
];

/** What each pulled issue carries, for the mapping onto the dataset. */
export const provides = ['key', 'summary', 'description', 'type', 'status', 'priority', 'assignee', 'reporter', 'labels',
  'created', 'updated', 'resolved', 'due_date', 'original_estimate_hours', 'time_spent_hours', 'remaining_hours',
  'sprint', 'release', 'epic', 'components', 'story_points', 'flagged', 'url'];

const PAGE = 100;
/*
 * ── What an engineering organisation needs from an issue ──────────────────
 *
 * The first version read what a support desk needs: a summary, a status, who
 * has it. A delivery head asks different questions -- is it due, how much
 * was estimated, how much has been spent, which sprint and which release --
 * and with none of those fields read, not one deadline or effort watcher
 * could bind to a Jira project. Time arrives in seconds and is kept in hours,
 * because a timesheet and an estimate are both said in hours.
 */
const FIELDS = 'summary,description,issuetype,status,priority,assignee,reporter,labels,created,updated,resolutiondate,'
  + 'duedate,timeoriginalestimate,timespent,timeestimate,fixVersions,components,parent';

/** How many projects one connect reads at most, as Zoho's modules are capped. */
export const MOST_PROJECTS = 15;

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

/**
 * Sprint, story points and the impediment flag are custom fields, and their
 * ids differ on every site (customfield_10020 on one, 10104 on the next). So
 * they are looked up by name once per read, and a site that has none of them
 * simply reads without them.
 */
export async function customFieldIds(c) {
  const out = { sprint: null, points: null, flagged: null };
  try {
    const r = await c.get('/rest/api/3/field');
    for (const f of r.data || []) {
      const name = String(f?.name || '').toLowerCase();
      const custom = String(f?.schema?.custom || '');
      if (!out.sprint && (custom.endsWith(':gh-sprint') || name === 'sprint')) out.sprint = f.id;
      else if (!out.points && /^story ?points?$|^story point estimate$/.test(name)) out.points = f.id;
      else if (!out.flagged && name === 'flagged') out.flagged = f.id;
    }
  } catch { /* none, and the read goes on without them */ }
  return out;
}

const hours = (seconds) => (typeof seconds === 'number' && Number.isFinite(seconds) ? String(Math.round(seconds / 36) / 100) : '');

/** A sprint value in either shape Jira has used: an object, or the old toString. */
export function sprintName(v) {
  const list = Array.isArray(v) ? v : (v ? [v] : []);
  const last = list[list.length - 1];
  if (!last) return '';
  if (typeof last === 'object') return String(last.name || '');
  const m = String(last).match(/name=([^,\]]+)/);
  return m ? m[1] : String(last);
}

export function toRow(issue, ids = {}) {
  const f = issue.fields || {};
  const custom = (id) => (id ? f[id] : undefined);
  const points = custom(ids.points);
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
    due_date: f.duedate || '',
    original_estimate_hours: hours(f.timeoriginalestimate),
    time_spent_hours: hours(f.timespent),
    remaining_hours: hours(f.timeestimate),
    sprint: sprintName(custom(ids.sprint)),
    release: (f.fixVersions || []).map((v) => v?.name).filter(Boolean).join('; '),
    epic: f.parent ? [f.parent.key, f.parent.fields?.summary].filter(Boolean).join(' ') : '',
    components: (f.components || []).map((v) => v?.name).filter(Boolean).join('; '),
    story_points: typeof points === 'number' ? String(points) : '',
    flagged: Array.isArray(custom(ids.flagged)) && custom(ids.flagged).length ? 'yes' : '',
    url: `${issue.self ? issue.self.split('/rest/')[0] : ''}/browse/${issue.key}`,
  };
}

/**
 * One project's issues as their own dataset, the way a Zoho module is.
 *
 * Bookkeeping is marked internal so a watcher is never ABOUT it: the link,
 * and the reporter, who filed the issue and is not who it is waiting on.
 */
export function describeShape(config) {
  const key = String(config.jql || '').trim();
  const label = String(config.projectName || '').trim() || (/^[A-Z][A-Z0-9_]*$/i.test(key) ? key.toUpperCase() : 'Jira');
  return {
    name: `${label} issues (Jira)`,
    columns: provides,
    key: 'key',
    internal: ['url', 'reporter', 'description'],
  };
}

/**
 * The projects this token can see that hold at least one issue -- the way
 * Zoho's modules are found, so nobody is asked to type a project key.
 */
export async function listPopulated(config) {
  const c = client(config);
  let projects = [];
  try {
    const r = await c.get('/rest/api/3/project/search', { params: { maxResults: 50, orderBy: 'lastIssueUpdatedTime' } });
    projects = (r.data?.values || []).map((p) => ({ key: p.key, name: p.name }));
  } catch (err) {
    throw new Error(reason(err));
  }
  const out = [];
  for (const p of projects) {
    if (out.length >= MOST_PROJECTS) break;
    const jql = `project = ${p.key}`;
    let has = false;
    try {
      const r = await c.get('/rest/api/3/search/jql', { params: { jql, maxResults: 1, fields: 'key' } });
      has = (r.data?.issues || []).length > 0;
    } catch (err) {
      if ([404, 410].includes(err.response?.status)) {
        try {
          const r = await c.get('/rest/api/3/search', { params: { jql, maxResults: 1, fields: 'key' } });
          has = (r.data?.issues || []).length > 0;
        } catch { has = false; }
      }
    }
    if (has) out.push(p);
  }
  return out;
}

/**
 * Pages through the search. The newer endpoint (a page token) is tried first;
 * a site that still answers only the older one (an offset) gets that.
 */
export async function pull(config, { maxRows = 50000 } = {}) {
  const c = client(config);
  const jql = toJql(config.jql);
  const ids = await customFieldIds(c);
  const fields = [FIELDS, ids.sprint, ids.points, ids.flagged].filter(Boolean).join(',');
  const out = [];
  try {
    let token = null;
    do {
      const r = await c.get('/rest/api/3/search/jql', { params: { jql, maxResults: PAGE, fields, ...(token ? { nextPageToken: token } : {}) } });
      for (const issue of r.data.issues || []) { out.push(toRow(issue, ids)); if (out.length >= maxRows) return out; }
      token = r.data.nextPageToken || null;
    } while (token);
    return out;
  } catch (err) {
    if (![404, 410].includes(err.response?.status) || out.length) throw new Error(reason(err));
  }
  let startAt = 0;
  for (;;) {
    let r;
    try { r = await c.get('/rest/api/3/search', { params: { jql, maxResults: PAGE, startAt, fields } }); }
    catch (err) { throw new Error(reason(err)); }
    const issues = r.data.issues || [];
    for (const issue of issues) { out.push(toRow(issue, ids)); if (out.length >= maxRows) return out; }
    startAt += issues.length;
    if (!issues.length || startAt >= (r.data.total || 0)) break;
  }
  return out;
}
