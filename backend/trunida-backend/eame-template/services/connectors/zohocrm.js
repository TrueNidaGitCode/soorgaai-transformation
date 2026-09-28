/**
 * Zoho CRM, by the owner's own refresh token.
 *
 * ── Why a CRM is a source at all ──────────────────────────────────────────
 *
 * This product exists because reality does not always reach the business
 * system. The CRM IS the business system for most of the businesses it is
 * sold to: the booking, the package, the status somebody set weeks ago. Read
 * on its own it says what a business believes. Read beside the phone and
 * WhatsApp connectors it says where that belief has come apart — a customer
 * marked No Show who rang the same morning asking to upgrade.
 *
 * ── The credential ────────────────────────────────────────────────────────
 *
 * A Self Client from the owner's own Zoho API console, exchanged once for a
 * refresh token, held encrypted in this application's database and nowhere
 * else. No OAuth app on Svarg's side is involved: the same rule as Jira, and
 * for the same reason — Svarg never holds a customer's keys.
 *
 * Zoho runs separate data centres that do not share accounts, so the domain
 * is part of the credential rather than a detail: a token minted at
 * accounts.zoho.in is refused by accounts.zoho.com.
 */
import axios from 'axios';
import { brokeredAccessToken } from '../svargZohoService.js';

export const kind = 'zoho-crm';
export const label = 'Zoho CRM';
export const help = 'Records from one Zoho CRM module. In the Zoho API console create a Self Client, '
  + 'grant ZohoCRM.modules.ALL, and exchange the generated code for a refresh token.';

/**
 * The data centres Zoho runs. Not free text: the wrong one fails as "invalid
 * client", which reads as a bad secret and sends somebody to regenerate a
 * credential that was correct all along.
 */
export const REGIONS = ['com', 'in', 'eu', 'com.au', 'jp', 'ca', 'com.cn', 'sa'];

export const fields = [
  { name: 'region', label: 'Data centre', options: REGIONS,
    hint: 'The end of the address you sign in at — zoho.com, zoho.in, zoho.eu. A token from one is refused by the others.' },
  /*
   * Optional, because there are two ways to hold this connection.
   *
   * The owner's own Self Client fills all three. A connection made by
   * consenting to Svarg's client fills only the refresh token, and Svarg
   * keeps the halves that mint access tokens from it — so requiring them
   * here would refuse the very connection the one-click path creates.
   *
   * test() checks that one of the two shapes is complete, which is where a
   * per-field rule could never have seen it.
   */
  { name: 'clientId', label: 'Client ID', required: false, placeholder: '1000.XXXXXXXXXXXXXXXX' },
  { name: 'clientSecret', label: 'Client secret', required: false, secret: true },
  { name: 'refreshToken', label: 'Refresh token', secret: true },
  // Written by the one-click flow, never typed. Declared because
  // connectorService stores only the fields a kind names.
  { name: 'brokered', label: 'Connected through Svarg', hidden: true, required: false },
  { name: 'module', label: 'Module', placeholder: 'Contacts',
    hint: 'Contacts, Leads, Deals, Events, or a custom module’s API name.' },
  { name: 'criteria', label: 'Only records matching', required: false,
    placeholder: '(Lead_Status:equals:Active)',
    hint: 'Zoho search criteria. Leave it empty for the whole module.' },
];

/**
 * The fields every module is read into, whatever it calls them.
 *
 * Not the whole story, and deliberately: a CRM's real columns are whatever
 * this customer added, so every field the module returns is carried through
 * under its own Zoho name as well. These are what the automatic mapping
 * guesses from, and they are named the way a dataset column is named rather
 * than the way Zoho names it.
 */
export const provides = [
  'id', 'name', 'first_name', 'last_name', 'email', 'phone', 'mobile',
  'owner', 'status', 'source', 'company', 'amount', 'description',
  'created', 'modified', 'url',
];

const PAGE = 200;
const TIMEOUT = 30000;

/**
 * A connection Svarg brokered, as opposed to one the owner made themselves.
 *
 * Read from the config rather than guessed from a missing client id, so a
 * half-typed manual connection is a manual connection with a field missing
 * and says so, instead of quietly becoming a brokered one that fails later
 * against a Svarg server holding no client.
 */
export const isBrokered = (config) => String(config.brokered || '') === 'yes';

const region = (config) => String(config.region || 'com').trim().replace(/^\.+/, '') || 'com';
const accountsHost = (config) => `https://accounts.zoho.${region(config)}`;
const apiHost = (config) => `https://www.zohoapis.${region(config)}`;
export const moduleOf = (config) => String(config.module || 'Contacts').trim() || 'Contacts';

/*
 * One access token per credential, kept until a minute before it expires.
 *
 * Zoho refuses more than a handful of refresh-token grants in a short window,
 * and a sync that pages through a large module would otherwise ask for a new
 * token on every run. In memory only: it does not survive a restart, and it
 * is never written anywhere.
 */
const tokens = new Map();
const tokenKey = (config) => `${region(config)}|${config.clientId}|${String(config.refreshToken).slice(-12)}`;

/** Zoho answers OAuth failures with HTTP 200 and an `error` key. */
export async function accessToken(config) {
  const key = tokenKey(config);
  const held = tokens.get(key);
  if (held && held.until > Date.now()) return held.token;

  /*
   * Zoho mints an access token against the client secret. On a brokered
   * connection that secret is Svarg's and is not in this container, so the
   * exchange happens there and the token comes back over the gateway. The
   * customer's refresh token still lives only here.
   */
  if (isBrokered(config)) {
    const got = await brokeredAccessToken({
      refreshToken: String(config.refreshToken || '').trim(),
      region: region(config),
    });
    tokens.set(key, { token: got.accessToken, until: Date.now() + (got.expiresIn - 60) * 1000 });
    return got.accessToken;
  }

  if (!String(config.clientId || '').trim() || !String(config.clientSecret || '').trim()) {
    throw new Error('This connection has no Zoho client. Connect through Svarg, or fill in the Client ID and secret.');
  }

  let data;
  try {
    const r = await axios.post(`${accountsHost(config)}/oauth/v2/token`, null, {
      params: {
        grant_type: 'refresh_token',
        client_id: String(config.clientId || '').trim(),
        client_secret: String(config.clientSecret || '').trim(),
        refresh_token: String(config.refreshToken || '').trim(),
      },
      timeout: TIMEOUT,
    });
    data = r.data || {};
  } catch (err) {
    throw new Error(`Could not reach Zoho at ${accountsHost(config)}: ${err.message}`);
  }

  if (data.error) throw new Error(oauthReason(String(data.error), config));
  if (!data.access_token) throw new Error('Zoho returned no access token for those details.');

  const life = Number(data.expires_in) || 3600;
  tokens.set(key, { token: data.access_token, until: Date.now() + (life - 60) * 1000 });
  return data.access_token;
}

/** Said as the thing to go and fix, not as the code Zoho returned. */
export function oauthReason(error, config) {
  const dc = `zoho.${region(config)}`;
  if (error === 'invalid_client') return `Zoho refused the client ID and secret. Check they were created at ${dc} — a Self Client from another data centre is refused here.`;
  if (error === 'invalid_code' || error === 'invalid_grant') return 'That refresh token is no longer valid. Generate a new one from the Self Client.';
  if (error === 'invalid_client_secret') return 'Zoho refused the client secret.';
  return `Zoho refused the credentials (${error}).`;
}

function client(config, token) {
  return axios.create({
    baseURL: `${apiHost(config)}/crm/v6`,
    headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json' },
    timeout: TIMEOUT,
  });
}

export function reason(err, config) {
  const body = err.response?.data;
  const code = body?.code || body?.data?.[0]?.code;
  const status = err.response?.status;
  if (code === 'INVALID_MODULE') return `Zoho has no module called "${moduleOf(config)}". Use the module's API name, which is not always what the screen calls it.`;
  if (code === 'OAUTH_SCOPE_MISMATCH') return 'The refresh token was granted without ZohoCRM.modules.ALL. Generate a new one with that scope.';
  if (code === 'INVALID_QUERY' || code === 'INVALID_DATA') return `Zoho did not understand that criteria: ${body?.message || 'check the field names.'}`;
  if (status === 401) return 'Zoho refused the access token.';
  if (status === 429) return 'Zoho is rate limiting this application. It will catch up on the next sync.';
  if (!err.response) return `Could not reach Zoho: ${err.message}`;
  return String(body?.message || err.message);
}

export function describe(config) {
  const where = String(config.criteria || '').trim();
  return `Zoho CRM (${region(config)}) · ${moduleOf(config)}${where ? ` · ${where}` : ''}`;
}

/**
 * A live check, and one that tells the two silences apart.
 *
 * An empty module answers 204 with no body, which is a working connection to
 * a module holding nothing — not a failure, and saying so here saves somebody
 * deciding their credentials are wrong when the record they are about to add
 * simply is not there yet.
 */
export async function test(config) {
  const token = await accessToken(config);
  const name = moduleOf(config);
  try {
    const r = await client(config, token).get(`/${encodeURIComponent(name)}`, { params: { per_page: 1 } });
    if (r.status === 204 || !r.data?.data?.length) {
      return { ok: true, message: `Connected to ${name}, which holds no records yet.` };
    }
    return { ok: true, message: `Connected to ${name}.` };
  } catch (err) {
    throw new Error(reason(err, config));
  }
}

/**
 * A Zoho value as one cell.
 *
 * Lookups arrive as { id, name } — the name is what a person recognises and
 * what a dataset column holds. Multi-selects arrive as arrays. Anything left
 * that is still an object would otherwise reach a spreadsheet cell as
 * "[object Object]", so it is stringified rather than guessed at.
 */
export function flatten(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    if (typeof value.name === 'string') return value.name;
    if (typeof value.display_value === 'string') return value.display_value;
    if (typeof value.id === 'string') return value.id;
    return JSON.stringify(value);
  }
  return String(value);
}

const firstOf = (r, ...names) => {
  for (const n of names) {
    const v = flatten(r[n]);
    if (v) return v;
  }
  return '';
};

/**
 * One record, twice over.
 *
 * Every field Zoho returned, under its own API name, so a dataset column
 * called Session_Date finds one — a CRM's columns are whatever this customer
 * made them, and no fixed list can know them. And on top of that the common
 * shape, so a dataset column called "Client Name" finds something too.
 *
 * The common shape wins where the two collide, which in practice they do not:
 * Zoho's own names are capitalised.
 */
export function toRow(record, config) {
  const raw = {};
  for (const [k, v] of Object.entries(record || {})) raw[k] = flatten(v);

  const id = flatten(record?.id);
  const name = firstOf(record, 'Full_Name', 'Name', 'Deal_Name', 'Account_Name', 'Subject', 'Event_Title')
    || [flatten(record?.First_Name), flatten(record?.Last_Name)].filter(Boolean).join(' ');

  return {
    ...raw,
    id,
    name,
    first_name: firstOf(record, 'First_Name'),
    last_name: firstOf(record, 'Last_Name'),
    email: firstOf(record, 'Email', 'Secondary_Email'),
    phone: firstOf(record, 'Phone'),
    mobile: firstOf(record, 'Mobile'),
    owner: firstOf(record, 'Owner'),
    // Whatever this module calls "where it has got to".
    status: firstOf(record, 'Status', 'Lead_Status', 'Stage', 'Deal_Stage', 'Appointment_Status'),
    source: firstOf(record, 'Lead_Source', 'Source'),
    company: firstOf(record, 'Company', 'Account_Name'),
    amount: firstOf(record, 'Amount', 'Deal_Amount'),
    description: firstOf(record, 'Description'),
    created: firstOf(record, 'Created_Time'),
    modified: firstOf(record, 'Modified_Time'),
    url: id ? `https://crm.zoho.${region(config)}/crm/tab/${encodeURIComponent(moduleOf(config))}/${id}` : '',
  };
}

/**
 * Every record in the module, newest change first.
 *
 * Two endpoints, because Zoho has two: the plain module read, which pages by
 * a token, and search, which does not take one and pages by number. Criteria
 * is the only thing that decides between them.
 */
export async function pull(config, { maxRows = 50000 } = {}) {
  const token = await accessToken(config);
  const c = client(config, token);
  const name = encodeURIComponent(moduleOf(config));
  const criteria = String(config.criteria || '').trim();
  const out = [];

  let page = 1;
  let pageToken = null;
  for (;;) {
    let r;
    try {
      r = criteria
        ? await c.get(`/${name}/search`, { params: { criteria, per_page: PAGE, page } })
        : await c.get(`/${name}`, {
          params: {
            per_page: PAGE,
            sort_by: 'Modified_Time',
            sort_order: 'desc',
            ...(pageToken ? { page_token: pageToken } : { page }),
          },
        });
    } catch (err) {
      throw new Error(reason(err, config));
    }

    // 204: the module is real and empty, or the search matched nothing.
    if (r.status === 204 || !r.data) return out;
    const rows = r.data.data || [];
    for (const record of rows) {
      out.push(toRow(record, config));
      if (out.length >= maxRows) return out;
    }

    const info = r.data.info || {};
    if (!rows.length || !info.more_records) return out;
    pageToken = info.next_page_token || null;
    page += 1;
    // Without a page token Zoho refuses to page past 2000 records; the token
    // is how a large module is read, so stop rather than loop on a repeat.
    if (!criteria && !pageToken && page * PAGE > 2000) return out;
  }
}
