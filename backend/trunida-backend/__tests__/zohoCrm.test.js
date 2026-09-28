/**
 * Zoho CRM as a source.
 *
 * ── Why this connector exists ─────────────────────────────────────────────
 *
 * The product's claim is that reality does not always reach the business
 * system. For most of the businesses it is sold to the CRM IS the business
 * system: the booking, the package, the status somebody set weeks ago. Until
 * now an application could read a database, a phone and WhatsApp, and could
 * not read the one place the belief it is meant to contradict is written
 * down — so the contradiction had nothing to be a contradiction WITH.
 *
 * The demonstration is exactly this shape. Rahul Sharma, active customer,
 * physiotherapy package, ten sessions, appointment on 12 September marked
 * No Show. The CRM says No Show. The phone says he rang that morning asking
 * to upgrade. Neither record is wrong; nobody put them side by side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({ default: { create: vi.fn(), post: vi.fn() } }));

const axios = (await import('axios')).default;
const zoho = await import('../eame-template/services/connectors/zohocrm.js');

const CONFIG = {
  region: 'in', clientId: '1000.ABC', clientSecret: 'shh',
  refreshToken: '1000.rrr', module: 'Contacts',
};

/** A token that is always fresh, so a test never depends on the cache. */
function tokenOk() {
  axios.post.mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } });
}

/**
 * Pages of records, answered in order — and the field list, answered
 * whenever it is asked for.
 *
 * Zoho requires a `fields` parameter on every record read, so pull asks
 * /settings/fields first. A mock that answered purely by turn gave that call
 * the first page of records and everything after it was off by one.
 */
const FIELDS = { status: 200, data: { fields: [
  { api_name: 'Full_Name', data_type: 'text' },
  { api_name: 'Email', data_type: 'email' },
  { api_name: 'Appointment_Status', data_type: 'picklist' },
] } };

function pages(...responses) {
  const queue = [...responses];
  const get = vi.fn((path) => {
    if (String(path).includes('/settings/fields')) return Promise.resolve(FIELDS);
    return Promise.resolve(queue.shift() || { status: 204, data: null });
  });
  axios.create.mockReturnValue({ get });
  return get;
}

/** Only the calls that asked for records, so an assertion can count pages. */
const recordCalls = (get) => get.mock.calls.filter((c) => !String(c[0]).includes('/settings/'));

beforeEach(() => {
  vi.clearAllMocks();
  // Each test gets its own credential, so the in-process token cache never
  // carries an answer from one test into the next.
  CONFIG.refreshToken = '1000.' + Math.random().toString(36).slice(2);
});

describe('the credential is the owner’s, and stays theirs', () => {
  it('marks the secret halves so they are encrypted at rest', () => {
    // connectorService seals every field the kind marks secret; a field it
    // does not mark is stored in clear in the tenant's own database.
    const secret = zoho.fields.filter((f) => f.secret).map((f) => f.name).sort();
    expect(secret).toEqual(['clientSecret', 'refreshToken']);
  });

  it('asks for the data centre rather than guessing it', () => {
    /*
     * Zoho runs separate data centres that do not share accounts, and a
     * token minted at accounts.zoho.in is refused by accounts.zoho.com with
     * "invalid_client" — which reads as a bad secret and sends somebody off
     * to regenerate a credential that was right all along.
     */
    const dc = zoho.fields.find((f) => f.name === 'region');
    expect(dc.options).toContain('in');
    expect(dc.options).toContain('com');
    expect(zoho.oauthReason('invalid_client', { region: 'in' })).toMatch(/zoho\.in/);
    expect(zoho.oauthReason('invalid_client', { region: 'in' })).toMatch(/another data centre/);
  });

  it('reads the region into every address it uses', async () => {
    tokenOk();
    pages({ status: 200, data: { data: [{ id: '1' }] } });
    await zoho.test({ ...CONFIG });
    expect(axios.post.mock.calls[0][0]).toBe('https://accounts.zoho.in/oauth/v2/token');
    expect(axios.create.mock.calls[0][0].baseURL).toBe('https://www.zohoapis.in/crm/v6');
  });

  it('treats an OAuth error as an error, though Zoho answers it with a 200', async () => {
    // The one thing about this API that will catch somebody out: a refused
    // refresh token comes back as a successful HTTP response with an
    // `error` key, so a connector that trusts the status code stores a
    // connection that can never sync.
    axios.post.mockResolvedValue({ status: 200, data: { error: 'invalid_code' } });
    await expect(zoho.test({ ...CONFIG })).rejects.toThrow(/no longer valid/);
  });
});

describe('what one record becomes', () => {
  it('carries every field under the name Zoho gave it', () => {
    /*
     * A CRM's real columns are whatever this customer added. No fixed list
     * can know them, and the demonstration turns on two that no list would
     * have guessed: the package and the session count.
     */
    const row = zoho.toRow({
      id: '55', Full_Name: 'Rahul Sharma', Package: 'Physiotherapy package',
      Sessions: 10, Appointment_Status: 'No Show',
    }, CONFIG);
    expect(row.Package).toBe('Physiotherapy package');
    expect(row.Sessions).toBe('10');
    expect(row.Appointment_Status).toBe('No Show');
  });

  it('and again under the names a dataset column is likely to use', () => {
    const row = zoho.toRow({
      id: '55', First_Name: 'Rahul', Last_Name: 'Sharma',
      Email: 'rahul@example.in', Phone: '+919800000001',
      Lead_Status: 'Active customer', Owner: { id: '9', name: 'Dr Rao' },
    }, CONFIG);
    expect(row.name).toBe('Rahul Sharma');
    expect(row.email).toBe('rahul@example.in');
    expect(row.phone).toBe('+919800000001');
    // Whatever this module calls "where it has got to".
    expect(row.status).toBe('Active customer');
    expect(row.owner).toBe('Dr Rao');
  });

  it('takes the name from whichever field this module keeps it in', () => {
    const n = (r) => zoho.toRow(r, CONFIG).name;
    expect(n({ Full_Name: 'Rahul Sharma' })).toBe('Rahul Sharma');
    expect(n({ Deal_Name: 'Physio renewal' })).toBe('Physio renewal');
    expect(n({ First_Name: 'Rahul', Last_Name: 'Sharma' })).toBe('Rahul Sharma');
    expect(n({ Subject: 'Follow-up call' })).toBe('Follow-up call');
  });

  it('never lets an object reach a spreadsheet cell', () => {
    /*
     * Zoho returns lookups as { id, name } and multi-selects as arrays. A
     * cell reading "[object Object]" is the sort of thing that survives a
     * demonstration and is found by a customer.
     */
    expect(zoho.flatten({ id: '9', name: 'Dr Rao' })).toBe('Dr Rao');
    expect(zoho.flatten(['Physio', 'Sports'])).toBe('Physio; Sports');
    expect(zoho.flatten(null)).toBe('');
    expect(zoho.flatten(0)).toBe('0');
    expect(zoho.flatten({ odd: 1 })).toBe('{"odd":1}');
  });

  it('links back to the record, so evidence can be checked in Zoho', () => {
    const row = zoho.toRow({ id: '55', Full_Name: 'Rahul Sharma' }, CONFIG);
    expect(row.url).toBe('https://crm.zoho.in/crm/tab/Contacts/55');
  });
});

describe('reading a module', () => {
  it('pages until Zoho says there is no more', async () => {
    tokenOk();
    const get = pages(
      { status: 200, data: { data: [{ id: '1' }, { id: '2' }], info: { more_records: true, next_page_token: 'p2' } } },
      { status: 200, data: { data: [{ id: '3' }], info: { more_records: false } } },
    );
    const rows = await zoho.pull({ ...CONFIG });
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3']);
    // The second page is asked for by the token Zoho handed back, not by a
    // page number: a number stops working past 2000 records.
    expect(recordCalls(get)[1][1].params.page_token).toBe('p2');
    // And every record read names its fields, because Zoho refuses one that
    // does not — the failure that told a customer their whole CRM was empty.
    expect(recordCalls(get)[0][1].params.fields).toContain('id');
  });

  it('stops at the row ceiling rather than pulling a whole CRM into memory', async () => {
    tokenOk();
    const many = Array.from({ length: 200 }, (_, i) => ({ id: String(i) }));
    pages({ status: 200, data: { data: many, info: { more_records: true, next_page_token: 'p2' } } });
    const rows = await zoho.pull({ ...CONFIG }, { maxRows: 5 });
    expect(rows).toHaveLength(5);
  });

  it('reads an empty module as empty, not as broken', async () => {
    // 204 with no body is a working connection to a module holding nothing.
    tokenOk();
    pages({ status: 204, data: null });
    await expect(zoho.pull({ ...CONFIG })).resolves.toEqual([]);
    tokenOk();
    pages({ status: 204, data: null });
    await expect(zoho.test({ ...CONFIG })).resolves.toMatchObject({ ok: true });
  });

  it('uses search when the owner narrowed it, and the plain read otherwise', async () => {
    tokenOk();
    const plain = pages({ status: 200, data: { data: [], info: { more_records: false } } });
    await zoho.pull({ ...CONFIG });
    expect(recordCalls(plain)[0][0]).toBe('/Contacts');

    vi.clearAllMocks();
    tokenOk();
    const searched = pages({ status: 200, data: { data: [], info: { more_records: false } } });
    await zoho.pull({ ...CONFIG, criteria: '(Lead_Status:equals:Active)' });
    expect(recordCalls(searched)[0][0]).toBe('/Contacts/search');
    expect(recordCalls(searched)[0][1].params.criteria).toBe('(Lead_Status:equals:Active)');
  });

  it('says what to go and fix when the module name is wrong', async () => {
    /*
     * The commonest mistake with this API, and the least guessable: Zoho
     * wants a module's API name, which is not always what the screen calls
     * it. "INVALID_MODULE" on its own tells nobody that.
     */
    tokenOk();
    const get = vi.fn().mockRejectedValue({ response: { status: 400, data: { code: 'INVALID_MODULE' } } });
    axios.create.mockReturnValue({ get });
    await expect(zoho.pull({ ...CONFIG, module: 'Appointments' }))
      .rejects.toThrow(/no module called "Appointments".*API name/s);
  });

  it('names the scope when the token was granted without it', async () => {
    tokenOk();
    const get = vi.fn().mockRejectedValue({ response: { status: 401, data: { code: 'OAUTH_SCOPE_MISMATCH' } } });
    axios.create.mockReturnValue({ get });
    await expect(zoho.pull({ ...CONFIG })).rejects.toThrow(/ZohoCRM\.modules\.READ/);
  });
});

describe('the frame every connector shares', () => {
  it('declares what the rest of the application expects of it', () => {
    expect(zoho.kind).toBe('zoho-crm');
    expect(typeof zoho.test).toBe('function');
    expect(typeof zoho.pull).toBe('function');
    expect(zoho.provides.length).toBeGreaterThan(3);
  });

  it('says which connection this is, for a page listing several', () => {
    expect(zoho.describe({ ...CONFIG, module: 'Deals' })).toBe('Zoho CRM (in) · Deals');
    expect(zoho.describe({ ...CONFIG, criteria: '(Stage:equals:Won)' }))
      .toBe('Zoho CRM (in) · Contacts · (Stage:equals:Won)');
  });
});
