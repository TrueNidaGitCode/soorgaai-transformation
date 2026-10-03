/**
 * LeadSquared, by the owner's own API keys.
 *
 * ── Why this connector exists ─────────────────────────────────────────────
 *
 * A wellness business described its problem as: a lead becomes an
 * opportunity, and keeping that person engaged over the next three months is
 * where it goes wrong. LeadSquared knows the opportunity is open. It does not
 * say that nobody has spoken to the customer in four weeks — that is a
 * pattern across its records, not a field in one of them, and noticing it is
 * what watchers are for.
 *
 * Three things can be read, each into its own dataset, because they answer
 * different questions:
 *
 *   Leads          who the customers are
 *   Activities     every touch — a call, an email, a visit — with its time,
 *                  which is the record of engagement itself
 *   Opportunities  what each customer is being sold and whether it is open
 *
 * ── The credential ────────────────────────────────────────────────────────
 *
 * An Access Key and Secret Key, from My Profile → Settings → API and Webhooks.
 * Held encrypted in this application's database and nowhere else, sent as
 * headers rather than in the query string so they never appear in a URL a log
 * might keep.
 *
 * ── Built from the documentation, not from a live account ─────────────────
 *
 * Every request shape here is LeadSquared's published one (apidocs.leadsquared
 * .com): Leads.RecentlyModified, Leads/Retrieve/ByIds, LeadsMetaData.Get,
 * ProspectActivity.svc/RetrieveRecentlyModified, OpportunityManagement.svc/
 * Retrieve/BySearchParameter and GetOpportunityTypeMetadata. It had not been
 * run against a real account when it was written. Where the documentation was
 * silent — the largest page size two of these endpoints accept — the smaller,
 * safe value is used and said so.
 */
import axios from 'axios';

export const kind = 'leadsquared';
export const label = 'LeadSquared';
export const help = 'Leads, activities and opportunities from LeadSquared. In LeadSquared open My Profile → Settings → '
  + 'API and Webhooks and copy the Access Key and Secret Key — an admin’s keys see every record.';

/*
 * ── Which region, found rather than asked ─────────────────────────────────
 *
 * LeadSquared runs separate hosts per region, and a key from one is refused by
 * the others with 401 — the same answer a wrong key gets. Asking the owner to
 * pick a region would be asking them to know something LeadSquared's screens
 * do not show plainly, and a wrong pick would read as "your keys are wrong".
 * So each host is tried until one answers, and remembered.
 *
 * India first: the businesses this is sold to are there.
 */
export const HOSTS = [
  { id: 'in21', label: 'India (Mumbai)', host: 'api-in21.leadsquared.com' },
  { id: 'in22', label: 'India (Hyderabad)', host: 'api-in22.leadsquared.com' },
  { id: 'sg', label: 'Singapore', host: 'api.leadsquared.com' },
  { id: 'us11', label: 'United States', host: 'api-us11.leadsquared.com' },
  { id: 'me61', label: 'Middle East', host: 'api-me61.leadsquared.com' },
  { id: 'ir31', label: 'Ireland', host: 'api-ir31.leadsquared.com' },
  { id: 'ca12', label: 'Canada', host: 'api-ca12.leadsquared.com' },
];

export const OBJECTS = ['Leads', 'Activities', 'Opportunities'];

export const fields = [
  { name: 'accessKey', label: 'Access key', placeholder: 'u$r…' },
  { name: 'secretKey', label: 'Secret key', secret: true },
  /*
   * Written by the connect flow, never typed — the same as Zoho's module.
   * Connecting reads the account and connects every part holding records,
   * each as its own connection, so which part and which opportunity type are
   * answers the flow already has. Declared because connectorService stores
   * only the fields a kind names.
   */
  { name: 'object', label: 'What to read', options: OBJECTS, hidden: true, required: false },
  { name: 'opportunityType', label: 'Opportunity type code', hidden: true, required: false },
];

/*
 * ── Why `provides` is only four names ─────────────────────────────────────
 *
 * Rows reach a dataset through guessMapping, which pairs each column with a
 * provided field by name — and, failing an exact match, by one name CONTAINING
 * the other. Every LeadSquared account has custom fields, and "mx_Stage"
 * contains "stage": with "stage" in this list, a custom Stage column would
 * have been filled with the lead's built-in stage and never its own value, and
 * nothing would have said so.
 *
 * So every dataset this connector defines begins with exactly these four
 * columns, which consume these four names by exact match before any custom
 * column is reached. Every other column then reads its own value by name.
 */
export const provides = ['id', 'name', 'phone', 'email'];
const LEADING = provides;

const TIMEOUT = 30000;

/** How far back a sync reads. A year: engagement is judged over months. */
export const LOOKBACK_DAYS = 365;

/*
 * Page sizes. Opportunities documents 1,000. Leads and Activities do not
 * state a ceiling, and asking for more than an endpoint allows is refused
 * rather than truncated — so they use 100, which the documentation's own
 * examples use.
 */
const PAGE = { Leads: 100, Activities: 100, Opportunities: 500 };

/** Stops one sync walking a whole account in one go. */
const MAX_PAGES = 200;

/** LeadSquared accounts carry hundreds of lead fields; a dataset needs fewer. */
export const MAX_COLUMNS = 60;

/** Leads per lookup when naming the person behind an activity. */
const LOOKUP_CHUNK = 500;

const auth = (config) => ({
  'x-LSQ-AccessKey': String(config.accessKey || '').trim(),
  'x-LSQ-SecretKey': String(config.secretKey || '').trim(),
  'Content-Type': 'application/json',
});

export const objectOf = (config) => (OBJECTS.includes(config.object) ? config.object : 'Activities');

// ── Dates ───────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD HH:MM:SS", in UTC — the only form these endpoints accept. */
export function stamp(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * The window a sync reads.
 *
 * It ends a day AFTER now. The Exotel connector learned this the hard way: a
 * window ending at the container's "now" in UTC missed everything an Indian
 * office did after half past five that evening, because those records were
 * stamped later than the window's end. A day of slack costs nothing and an
 * empty sync costs a customer's trust.
 */
export function windowFor(now = new Date()) {
  const to = new Date(now.getTime() + 24 * 3600e3);
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3600e3);
  return { FromDate: stamp(from), ToDate: stamp(to) };
}

// ── Errors, said as the thing to fix ────────────────────────────────────────

export function reason(err) {
  const status = err?.response?.status;
  const body = err?.response?.data || {};
  const said = body.ExceptionMessage || body.Message || body.message || '';
  if (status === 401 || status === 403) return 'LeadSquared refused the access key and secret key.';
  if (status === 429) return 'LeadSquared is rate limiting this application. It will catch up on the next sync.';
  if (!err?.response) return `Could not reach LeadSquared: ${err?.message || 'no answer'}`;
  return said ? `LeadSquared said: ${said}` : `LeadSquared answered ${status}.`;
}

// ── Finding the region ──────────────────────────────────────────────────────

const found = new Map();

/**
 * The host these keys belong to.
 *
 * Probed with the lead metadata call, which every account answers and which
 * returns nothing sensitive. A 401 means "not this region, or not these keys";
 * only once every region has said it is the answer the keys.
 */
export async function hostFor(config) {
  const key = String(config.accessKey || '').trim();
  if (!key || !String(config.secretKey || '').trim()) {
    throw new Error('Enter both the access key and the secret key.');
  }
  const held = found.get(key);
  if (held) return held;

  let lastOther = null;
  for (const h of HOSTS) {
    try {
      await axios.request({
        method: 'get',
        url: `https://${h.host}/v2/LeadManagement.svc/LeadsMetaData.Get`,
        params: { excludeOptionSets: 1 },
        headers: auth(config),
        timeout: TIMEOUT,
      });
      found.set(key, h);
      return h;
    } catch (err) {
      const s = err?.response?.status;
      if (s === 401 || s === 403 || !err?.response) continue;
      lastOther = err;
    }
  }
  if (lastOther) throw new Error(reason(lastOther));
  throw new Error('LeadSquared refused those keys in every region. Copy them again from My Profile → '
    + 'Settings → API and Webhooks, and check the user they belong to is still active.');
}

/** Forget the region, so a test can begin from nothing. */
export function forgetHosts() { found.clear(); }

async function call(config, method, path, { params, data } = {}) {
  const h = await hostFor(config);
  try {
    const r = await axios.request({
      method, url: `https://${h.host}/v2${path}`, params, data, headers: auth(config), timeout: TIMEOUT,
    });
    return r.data;
  } catch (err) {
    throw new Error(reason(err));
  }
}

// ── Reading a record, in either of the shapes LeadSquared sends ─────────────

/**
 * A lead as one flat object.
 *
 * Two endpoints, two shapes, documented side by side: Leads.RecentlyModified
 * wraps every value as { Attribute, Value } inside LeadPropertyList, while
 * Leads/Retrieve/ByIds returns the lead flat. Both are read here so nothing
 * downstream has to know which call it came from.
 */
export function leadFields(lead) {
  if (!lead || typeof lead !== 'object') return {};
  if (Array.isArray(lead.LeadPropertyList)) {
    const out = {};
    for (const p of lead.LeadPropertyList) {
      if (p && p.Attribute) out[p.Attribute] = p.Value == null ? '' : String(p.Value);
    }
    return out;
  }
  const out = {};
  for (const [k, v] of Object.entries(lead)) out[k] = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return out;
}

const fullName = (f) => [f.FirstName, f.LastName].map((x) => String(x || '').trim()).filter(Boolean).join(' ');

/*
 * Which lead fields are mapped into the shared columns, and so are not
 * repeated under their own names.
 */
const LEAD_MAPPED = new Set(['ProspectID', 'EmailAddress', 'Phone', 'Mobile', 'ProspectStage',
  'OwnerIdName', 'Source', 'CreatedOn', 'ModifiedOn']);

/** A lead, in the dataset's own words. */
export function leadRow(lead, extra = []) {
  const f = leadFields(lead);
  const row = {
    id: f.ProspectID || '',
    name: fullName(f),
    phone: f.Phone || f.Mobile || '',
    email: f.EmailAddress || '',
    mobile: f.Mobile || '',
    stage: f.ProspectStage || '',
    owner: f.OwnerIdName || '',
    source: f.Source || '',
    created: f.CreatedOn || '',
    modified: f.ModifiedOn || '',
  };
  for (const c of extra) row[c] = f[c] == null ? '' : f[c];
  return row;
}

/**
 * A note an activity carries, where it carries one.
 *
 * Activity values sit in Data and Fields as { Key, Value }, and the keys are
 * an account's own: mx_Custom_1 is a call's duration on one activity type and
 * a treatment's name on the next. So they are not spread out as columns —
 * a column called mx_Custom_1 holding four kinds of thing would be read by a
 * watcher as one kind. Only a value whose key plainly says note is kept.
 */
export function noteOf(activity) {
  const pairs = [...(activity?.Data || []), ...(activity?.Fields || [])];
  for (const p of pairs) {
    if (p && /note|description|comment|remark/i.test(String(p.Key || '')) && String(p.Value || '').trim()) {
      return String(p.Value).trim();
    }
  }
  return '';
}

/** An activity, with the person it was with. */
export function activityRow(a, people = new Map()) {
  const who = people.get(String(a?.RelatedProspectId || '')) || {};
  return {
    id: String(a?.Id || ''),
    name: who.name || '',
    phone: who.phone || '',
    email: who.email || '',
    activity: String(a?.EventName || ''),
    activity_date: String(a?.CreatedOn || ''),
    note: noteOf(a),
    event_code: a?.EventCode == null ? '' : String(a.EventCode),
    modified: String(a?.ModifiedOn || ''),
    lead_id: String(a?.RelatedProspectId || ''),
    opportunity_id: String(a?.RelatedOpportunityId || ''),
  };
}

/**
 * A field label as a column name: "Expected Closure Date" → Expected_Closure_Date.
 * The same shape every other dataset's columns have.
 */
export function columnName(display) {
  return String(display || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || '';
}

/**
 * An opportunity type's custom fields, named.
 *
 * LeadSquared returns an opportunity's own values as mx_Custom_1, mx_Custom_2…
 * and which is which is different in every account. A column called
 * mx_Custom_2 is useless to a watcher and to anybody reading the table, so the
 * type's metadata is read and each field takes its display name. Two fields
 * sharing a label keep both, the second numbered.
 */
export function opportunityColumns(metaFields = []) {
  const RESERVED = new Set([...LEADING, 'status', 'created', 'modified', 'lead_id']);
  const out = [];
  const taken = new Set(RESERVED);
  for (const f of metaFields || []) {
    const schema = String(f?.SchemaName || '');
    if (!/^mx_/i.test(schema)) continue;
    let col = columnName(f.DisplayName) || schema;
    for (let n = 2; taken.has(col.toLowerCase()); n += 1) col = `${columnName(f.DisplayName) || schema}_${n}`;
    taken.add(col.toLowerCase());
    out.push({ schema, column: col });
  }
  return out;
}

/** An opportunity, with its person and its named fields. */
export function opportunityRow(o, named = [], people = new Map()) {
  const who = people.get(String(o?.RelatedProspectId || '')) || {};
  const row = {
    id: String(o?.OpportunityId || ''),
    name: who.name || '',
    phone: who.phone || '',
    email: who.email || '',
    status: String(o?.Status || ''),
    created: String(o?.CreatedOn || ''),
    modified: String(o?.ModifiedOn || ''),
    lead_id: String(o?.RelatedProspectId || ''),
  };
  for (const { schema, column } of named) row[column] = o?.[schema] == null ? '' : String(o[schema]);
  return row;
}

/**
 * The search an opportunity read needs.
 *
 * Retrieve/BySearchParameter refuses a request without AdvancedSearch, an
 * escaped JSON string the documentation says to copy from the browser's
 * network panel. The documented example's own condition — every opportunity
 * of this type — is built here instead, so nobody has to.
 */
export function advancedSearchFor(code) {
  return JSON.stringify({
    GrpConOp: 'And',
    Conditions: [{
      Type: 'Activity',
      ConOp: 'and',
      RowCondition: [{ SubConOp: 'And', LSO: 'ActivityEvent', LSO_Type: 'PAEvent', Operator: 'eq', RSO: String(code) }],
    }],
    QueryTimeZone: 'India Standard Time',
  });
}

// ── The people behind activities and opportunities ──────────────────────────

/**
 * Names, numbers and addresses for a set of lead ids.
 *
 * An activity knows only the id of the lead it was with. Without this a
 * watcher could see that somebody went quiet and not say who — so the leads
 * are fetched in bulk, a few hundred at a time, and joined on.
 */
async function peopleFor(config, ids) {
  const people = new Map();
  const list = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < list.length; i += LOOKUP_CHUNK) {
    const chunk = list.slice(i, i + LOOKUP_CHUNK);
    const data = await call(config, 'post', '/LeadManagement.svc/Leads/Retrieve/ByIds', {
      data: {
        SearchParameters: { LeadIds: chunk },
        Columns: { Include_CSV: 'ProspectID,FirstName,LastName,EmailAddress,Phone,Mobile' },
        Paging: { PageIndex: 1, PageSize: chunk.length },
      },
    });
    for (const lead of data?.Leads || []) {
      const f = leadFields(lead);
      if (f.ProspectID) {
        people.set(f.ProspectID, { name: fullName(f), phone: f.Phone || f.Mobile || '', email: f.EmailAddress || '' });
      }
    }
  }
  return people;
}

// ── The shape of each dataset ───────────────────────────────────────────────

/** The account's own lead fields, custom ones first, housekeeping last. */
async function leadExtras(config) {
  const meta = await call(config, 'get', '/LeadManagement.svc/LeadsMetaData.Get', { params: { excludeOptionSets: 1 } });
  const HOUSEKEEPING = /^(ProspectAutoId|OwnerId|CreatedBy|ModifiedBy|StatusCode|StatusReason|IsLead|LeadConversionDate|NotableEvent|NotableEventdate|LastVisitDate|SourceIPAddress|Score|EngagementScore|QualityScore\d*|Revenue|DoNotEmail|DoNotCall|TimeZone|Latitude|Longitude)$/i;
  const rank = (s) => (/^mx_/i.test(s) ? 0 : HOUSEKEEPING.test(s) ? 2 : 1);
  return (Array.isArray(meta) ? meta : [])
    .map((f) => String(f?.SchemaName || ''))
    .filter((s) => s && !LEAD_MAPPED.has(s) && s !== 'FirstName' && s !== 'LastName')
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map((x) => x.s)
    .slice(0, MAX_COLUMNS);
}

const LEAD_COMMON = [...LEADING, 'mobile', 'stage', 'owner', 'source', 'created', 'modified'];
const ACTIVITY_COLUMNS = [...LEADING, 'activity', 'activity_date', 'note', 'event_code', 'modified', 'lead_id', 'opportunity_id'];

async function opportunityNamed(config) {
  const code = String(config.opportunityType || '').trim();
  if (!/^\d+$/.test(code)) {
    throw new Error('Enter the opportunity type code — the number beside the type in My Profile → Settings → Opportunities → Opportunity Types.');
  }
  const meta = await call(config, 'get', '/OpportunityManagement.svc/GetOpportunityTypeMetadata', { params: { code } });
  if (!meta || !Array.isArray(meta.Fields)) {
    throw new Error(`LeadSquared has no opportunity type with code ${code}.`);
  }
  return { code, typeName: String(meta.DisplayName || meta.Name || 'Opportunities'), named: opportunityColumns(meta.Fields) };
}

/**
 * What the dataset should be, asked of LeadSquared rather than guessed.
 *
 * The four shared columns always lead — see `provides` for why that order is
 * load-bearing rather than tidy.
 */
export async function describeShape(config) {
  const object = objectOf(config);
  if (object === 'Leads') {
    const extra = await leadExtras(config);
    return { name: 'Leads (LeadSquared)', columns: [...LEAD_COMMON, ...extra], key: 'id', internal: [] };
  }
  if (object === 'Opportunities') {
    const { typeName, named } = await opportunityNamed(config);
    return {
      name: `${typeName} (LeadSquared)`,
      columns: [...LEADING, 'status', 'created', 'modified', 'lead_id', ...named.map((n) => n.column)],
      key: 'id',
      internal: ['lead_id', 'modified'],
    };
  }
  /*
   * Activities. activity_date is when the touch happened; modified is when the
   * record of it last changed, which is LeadSquared's bookkeeping and not
   * something a watcher should time a customer's silence by.
   */
  return {
    name: 'Activities (LeadSquared)',
    columns: ACTIVITY_COLUMNS,
    key: 'id',
    internal: ['event_code', 'modified', 'lead_id', 'opportunity_id'],
  };
}

export function describe(config) {
  const o = objectOf(config);
  return `LeadSquared · ${o}${o === 'Opportunities' && config.opportunityType ? ` · type ${config.opportunityType}` : ''}`;
}

/** A live check that names the region it found. */
export async function test(config) {
  const h = await hostFor(config);
  if (objectOf(config) === 'Opportunities') {
    const { typeName } = await opportunityNamed(config);
    return { ok: true, message: `Connected to LeadSquared (${h.label}) · ${typeName}.` };
  }
  return { ok: true, message: `Connected to LeadSquared (${h.label}).` };
}

// ── Reading ─────────────────────────────────────────────────────────────────

async function pullLeads(config, { maxRows, now }) {
  const extra = await leadExtras(config);
  const cols = ['ProspectID', 'FirstName', 'LastName', 'EmailAddress', 'Phone', 'Mobile', 'ProspectStage',
    'OwnerIdName', 'Source', 'CreatedOn', 'ModifiedOn', ...extra];
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await call(config, 'post', '/LeadManagement.svc/Leads.RecentlyModified', {
      data: {
        Parameter: windowFor(now),
        Columns: { Include_CSV: cols.join(',') },
        Paging: { PageIndex: page, PageSize: PAGE.Leads },
        Sorting: { ColumnName: 'ProspectAutoId', Direction: '1' },
      },
    });
    const leads = data?.Leads || [];
    for (const l of leads) {
      out.push(leadRow(l, extra));
      if (out.length >= maxRows) return out;
    }
    if (leads.length < PAGE.Leads) break;
  }
  return out;
}

async function pullActivities(config, { maxRows, now }) {
  const raw = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await call(config, 'post', '/ProspectActivity.svc/RetrieveRecentlyModified', {
      data: {
        Parameter: { ...windowFor(now), IncludeCustomFields: 1 },
        Paging: { PageIndex: page, PageSize: PAGE.Activities },
        Sorting: { ColumnName: 'CreatedOn', Direction: 1 },
      },
    });
    const list = data?.ProspectActivities || [];
    raw.push(...list);
    if (raw.length >= maxRows || list.length < PAGE.Activities) break;
  }
  const people = await peopleFor(config, raw.map((a) => String(a?.RelatedProspectId || '')));
  return raw.slice(0, maxRows).map((a) => activityRow(a, people));
}

async function pullOpportunities(config, { maxRows }) {
  const { code, named } = await opportunityNamed(config);
  const raw = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await call(config, 'post', '/OpportunityManagement.svc/Retrieve/BySearchParameter', {
      data: {
        OpportunityEventCode: Number(code),
        AdvancedSearch: advancedSearchFor(code),
        Paging: { PageIndex: page, PageSize: PAGE.Opportunities },
      },
    });
    const list = data?.List || [];
    raw.push(...list);
    if (raw.length >= maxRows || list.length < PAGE.Opportunities) break;
  }
  const people = await peopleFor(config, raw.map((o) => String(o?.RelatedProspectId || '')));
  return raw.slice(0, maxRows).map((o) => opportunityRow(o, named, people));
}

export async function pull(config, { maxRows = 50000, now = new Date() } = {}) {
  const object = objectOf(config);
  if (object === 'Leads') return pullLeads(config, { maxRows, now });
  if (object === 'Opportunities') return pullOpportunities(config, { maxRows });
  return pullActivities(config, { maxRows, now });
}

// ── What this account holds ─────────────────────────────────────────────────

/** Opportunity types this application reads at most, the same ceiling Zoho's modules have. */
const MOST_TYPES = 12;

/**
 * Everything in this account worth connecting, the way Zoho's modules are found.
 *
 * Connecting Zoho asks nobody which module: every module holding a record is
 * connected, each as its own dataset. LeadSquared is connected the same way,
 * so the two CRMs behind the one card take the same steps. Leads and
 * Activities are asked whether they hold anything in the window a sync reads,
 * and every opportunity type is listed and asked the same — which is what
 * retired the "opportunity type code" box, a number nobody should have to
 * look up in a settings screen.
 *
 * A part that refuses to be read is skipped rather than fatal, as in Zoho:
 * an account where opportunities are switched off still has its activities.
 */
export async function listPopulated(config, { now = new Date() } = {}) {
  await hostFor(config);
  const out = [];
  const holds = async (fn) => { try { return await fn(); } catch { return false; } };

  if (await holds(async () => {
    const d = await call(config, 'post', '/LeadManagement.svc/Leads.RecentlyModified', {
      data: { Parameter: windowFor(now), Columns: { Include_CSV: 'ProspectID' }, Paging: { PageIndex: 1, PageSize: 1 } },
    });
    return (d?.Leads || []).length > 0;
  })) out.push({ object: 'Leads', label: 'Leads' });

  if (await holds(async () => {
    const d = await call(config, 'post', '/ProspectActivity.svc/RetrieveRecentlyModified', {
      data: { Parameter: { ...windowFor(now), IncludeCustomFields: 0 }, Paging: { PageIndex: 1, PageSize: 1 } },
    });
    return (d?.ProspectActivities || []).length > 0;
  })) out.push({ object: 'Activities', label: 'Activities' });

  const types = await holds(() => call(config, 'get', '/OpportunityManagement.svc/GetOpportunityTypes'));
  for (const t of (Array.isArray(types) ? types : []).slice(0, MOST_TYPES)) {
    const code = String(t?.EventCode ?? '').trim();
    if (!/^\d+$/.test(code)) continue;
    if (await holds(async () => {
      const d = await call(config, 'post', '/OpportunityManagement.svc/Retrieve/BySearchParameter', {
        data: { OpportunityEventCode: Number(code), AdvancedSearch: advancedSearchFor(code), Paging: { PageIndex: 1, PageSize: 1 } },
      });
      return (d?.List || []).length > 0;
    })) out.push({ object: 'Opportunities', opportunityType: code, label: String(t.PluralName || t.DisplayName || t.Name || `Type ${code}`) });
  }
  return out;
}
