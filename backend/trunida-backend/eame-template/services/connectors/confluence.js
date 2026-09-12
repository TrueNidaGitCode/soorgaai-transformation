/**
 * Confluence Cloud, by API token: the pages of one space, as text.
 *
 * This is the application's own knowledge -- what it retrieves from when it
 * answers -- and it lives in the application's database. It is a different
 * thing from the Confluence knowledge source on Svarg's platform, which
 * grounds the blueprint before anything is built.
 */
import axios from 'axios';

export const kind = 'confluence';
export const label = 'Confluence';
export const help = 'Every page in one space. The same API token as Jira works here.';

export const fields = [
  { name: 'siteUrl', label: 'Site', placeholder: 'https://your-team.atlassian.net' },
  { name: 'email', label: 'Atlassian email', placeholder: 'you@company.com' },
  { name: 'apiToken', label: 'API token', secret: true },
  { name: 'spaceKey', label: 'Space key', placeholder: 'DOCS' },
];

export const provides = ['id', 'title', 'body', 'url', 'lastEdited', 'editor', 'space'];

const PAGE = 100;

function site(config) {
  return String(config.siteUrl || '').trim().replace(/\/+$/, '');
}

function client(config) {
  return axios.create({
    baseURL: site(config) + '/wiki',
    auth: { username: String(config.email || '').trim(), password: String(config.apiToken || '') },
    headers: { Accept: 'application/json' },
    timeout: 30000,
  });
}

/** Storage-format HTML to text: tags out, a few entities back, whitespace settled. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function reason(err) {
  if (err.response?.status === 401) return 'Confluence refused the email and token.';
  if (err.response?.status === 404) return 'No Confluence site answers at that address.';
  if (err.response?.status === 403) return 'That account cannot read that space.';
  if (!err.response) return 'Could not reach that address: ' + err.message;
  return String(err.response?.data?.message || err.message);
}

export function describe(config) {
  return `${site(config)} · space ${String(config.spaceKey || '').toUpperCase()}`;
}

async function spaceId(c, key) {
  const r = await c.get('/api/v2/spaces', { params: { keys: String(key || '').trim().toUpperCase(), limit: 1 } });
  const s = (r.data.results || [])[0];
  if (!s) throw new Error(`No space with the key ${String(key).toUpperCase()} is visible to this account.`);
  return s;
}

export async function test(config) {
  if (!/^https?:\/\//.test(site(config))) throw new Error('The site address should start with https://');
  try {
    const s = await spaceId(client(config), config.spaceKey);
    return { ok: true, message: `Connected to the space "${s.name || s.key}".` };
  } catch (err) {
    throw new Error(reason(err));
  }
}

export async function pull(config, { maxRows = 50000 } = {}) {
  const c = client(config);
  const out = [];
  try {
    const space = await spaceId(c, config.spaceKey);
    let cursor = null;
    do {
      const r = await c.get(`/api/v2/spaces/${space.id}/pages`, { params: { limit: PAGE, 'body-format': 'storage', ...(cursor ? { cursor } : {}) } });
      for (const p of r.data.results || []) {
        out.push({
          id: p.id, title: p.title || '',
          body: htmlToText(p.body?.storage?.value || ''),
          url: site(config) + '/wiki' + (p._links?.webui || ''),
          lastEdited: p.version?.createdAt || '',
          editor: p.version?.authorId || '',
          space: space.key || '',
        });
        if (out.length >= maxRows) return out;
      }
      const next = r.data._links?.next || '';
      cursor = next ? new URL(next, 'https://x').searchParams.get('cursor') : null;
    } while (cursor);
  } catch (err) {
    throw new Error(reason(err));
  }
  return out;
}
