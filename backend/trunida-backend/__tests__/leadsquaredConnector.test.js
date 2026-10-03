/**
 * LeadSquared, read the way its documentation says it answers.
 *
 * ── What this can and cannot prove ────────────────────────────────────────
 *
 * The connector was written from LeadSquared's published API before any real
 * account had been connected. These tests fake the HTTP layer with the
 * response shapes that documentation gives, field for field, and run the real
 * parsing on them. They prove the connector reads THOSE shapes correctly.
 * They cannot prove LeadSquared answers in those shapes — only the first real
 * account can — so where the documentation is the only evidence, the test
 * says so.
 *
 * ── What it was built for ─────────────────────────────────────────────────
 *
 * A wellness business on LeadSquared loses customers in the three months
 * after they become an opportunity. Activities are the record of every touch,
 * so a watcher on them can notice somebody going quiet — if each activity
 * carries the name of the person it was with, which LeadSquared does not
 * send. Most of what is pinned below is about getting that right.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  HOSTS, OBJECTS, provides, fields, hostFor, forgetHosts, stamp, windowFor, leadFields, leadRow,
  activityRow, noteOf, opportunityColumns, opportunityRow, columnName, advancedSearchFor,
  describeShape, pull, test as testConnection, reason,
} from '../eame-template/services/connectors/leadsquared.js';
import { guessMapping, mapOntoColumns } from '../eame-template/services/connectorService.js';
import { catalogueFor } from '../eame-template/services/agentCatalogue.js';

vi.mock('axios', () => ({ default: { request: vi.fn() } }));

const refusal = (status, data = {}) => Object.assign(new Error(String(status)), { response: { status, data } });
const ok = (data) => ({ status: 200, data });
const CONFIG = { accessKey: 'u$r1a2b3', secretKey: 's3cr3t', object: 'Activities' };

beforeEach(() => {
  axios.request.mockReset();
  forgetHosts();
});

/** Route a faked request by host and path. */
function serve(handlers) {
  axios.request.mockImplementation(async (req) => {
    const url = new URL(req.url);
    for (const [match, fn] of handlers) {
      if (match(url, req)) return fn(url, req);
    }
    throw refusal(404);
  });
}
const at = (host, path) => (url) => url.host === host && url.pathname.endsWith(path);
const anyHost = (path) => (url) => url.pathname.endsWith(path);

/* ── Documented response shapes ─────────────────────────────────────────── */

const LEAD_META = [
  { SchemaName: 'FirstName', DisplayName: 'First Name' },
  { SchemaName: 'LastName', DisplayName: 'Last Name' },
  { SchemaName: 'EmailAddress', DisplayName: 'Email' },
  { SchemaName: 'Phone', DisplayName: 'Phone Number' },
  { SchemaName: 'ProspectAutoId', DisplayName: 'Lead Number' },
  { SchemaName: 'mx_Treatment', DisplayName: 'Treatment' },
  { SchemaName: 'mx_Stage', DisplayName: 'Stage' },
  { SchemaName: 'City', DisplayName: 'City' },
];

/* Leads.RecentlyModified wraps every value as { Attribute, Value }. */
const wrapped = (o) => ({ LeadPropertyList: Object.entries(o).map(([Attribute, Value]) => ({ Attribute, Value, Fields: null })) });

const ACTIVITY = {
  Id: 'a1', EventCode: 21, EventName: 'Phone Call', ActivityScore: 0,
  CreatedOn: '2026-09-02 10:00:00', ModifiedOn: '2026-09-02 10:05:00',
  RelatedProspectId: 'p1', RelatedOpportunityId: 'o1',
  Data: [{ Key: 'mx_Custom_1', Value: '420' }, { Key: 'ActivityEvent_Note', Value: 'Asked about the 12-session package' }],
  Fields: [{ Key: 'mx_Custom_2', Value: 'Physio' }],
};

/* Leads/Retrieve/ByIds answers flat. */
const BY_IDS = { RecordCount: 1, Leads: [{ ProspectID: 'p1', FirstName: 'Meera', LastName: 'Iyer', EmailAddress: 'meera@example.com', Phone: '+91-9845012345', Mobile: '' }] };

const OPP_META = {
  Name: 'Treatment Plan', DisplayName: 'Treatment Plan', EventCode: 12005,
  Fields: [
    { SchemaName: 'Status', DisplayName: 'Status' },
    { SchemaName: 'mx_Custom_1', DisplayName: 'Opportunity Name' },
    { SchemaName: 'mx_Custom_2', DisplayName: 'Stage' },
    { SchemaName: 'mx_Custom_6', DisplayName: 'Expected Value' },
    { SchemaName: 'mx_Custom_9', DisplayName: 'Stage' },
  ],
};

const OPP_LIST = {
  RecordCount: 1,
  List: [{
    OpportunityEvent: '12005', CreatedOn: '2026-07-01 09:00:00', ModifiedOn: '2026-08-15 12:00:00',
    mx_Custom_1: 'Meera - Knee rehab', Status: 'Open', mx_Custom_2: 'Need Analysis', mx_Custom_6: '24000',
    Owner: 'a4dfa1c5-guid', RelatedProspectId: 'p1', OpportunityId: 'opp-1',
  }],
};

/* ── Finding the region ──────────────────────────────────────────────── */

describe('which region the keys belong to', () => {
  it('tries each host until one answers, and remembers it', async () => {
    serve([
      [at('api-in21.leadsquared.com', 'LeadsMetaData.Get'), () => { throw refusal(401); }],
      [at('api-in22.leadsquared.com', 'LeadsMetaData.Get'), () => ok([])],
    ]);
    const first = await hostFor(CONFIG);
    expect(first.id).toBe('in22');
    const calls = axios.request.mock.calls.length;
    await hostFor(CONFIG);
    // Remembered: a second ask does not probe the regions again.
    expect(axios.request.mock.calls.length).toBe(calls);
  });

  it('starts with India, where the businesses this is sold to are', () => {
    expect(HOSTS[0].host).toBe('api-in21.leadsquared.com');
    expect(HOSTS[1].host).toBe('api-in22.leadsquared.com');
  });

  it('moves on past a region it cannot reach at all', async () => {
    serve([
      [at('api-in21.leadsquared.com', 'LeadsMetaData.Get'), () => { throw new Error('getaddrinfo ENOTFOUND'); }],
      [at('api-in22.leadsquared.com', 'LeadsMetaData.Get'), () => { throw refusal(401); }],
      [at('api.leadsquared.com', 'LeadsMetaData.Get'), () => ok([])],
    ]);
    expect((await hostFor(CONFIG)).id).toBe('sg');
  });

  it('says the keys are wrong only once every region has refused them', async () => {
    /*
     * A wrong region answers 401 exactly as a wrong key does. Reporting the
     * first 401 as "your keys are wrong" would send somebody to regenerate a
     * credential that was correct.
     */
    serve([[anyHost('LeadsMetaData.Get'), () => { throw refusal(401); }]]);
    await expect(hostFor(CONFIG)).rejects.toThrow(/every region/);
    expect(axios.request.mock.calls.length).toBe(HOSTS.length);
  });

  it('asks for both keys before trying anything', async () => {
    await expect(hostFor({ accessKey: 'x', secretKey: '' })).rejects.toThrow(/both/);
    expect(axios.request).not.toHaveBeenCalled();
  });

  it('sends the keys as headers, never in a URL a log might keep', async () => {
    serve([[anyHost('LeadsMetaData.Get'), () => ok([])]]);
    await hostFor(CONFIG);
    const req = axios.request.mock.calls[0][0];
    expect(req.headers['x-LSQ-AccessKey']).toBe('u$r1a2b3');
    expect(req.headers['x-LSQ-SecretKey']).toBe('s3cr3t');
    expect(req.url).not.toContain('s3cr3t');
    expect(JSON.stringify(req.params || {})).not.toContain('s3cr3t');
  });
});

/* ── The datasets ─────────────────────────────────────────────────────── */

describe('every dataset begins with the four shared columns', () => {
  /*
   * guessMapping pairs columns with provided fields by name, and failing that
   * by one name containing the other. With "stage" provided, a custom
   * mx_Stage column would have been filled with the lead's built-in stage and
   * never its own value. The four shared columns lead every dataset so they
   * consume the four provided names by exact match first.
   */
  it('provides only those four', () => {
    expect(provides).toEqual(['id', 'name', 'phone', 'email']);
  });

  it('puts them first for Leads, Activities and Opportunities alike', async () => {
    serve([
      [anyHost('LeadsMetaData.Get'), () => ok(LEAD_META)],
      [anyHost('GetOpportunityTypeMetadata'), () => ok(OPP_META)],
    ]);
    for (const object of OBJECTS) {
      const shape = await describeShape({ ...CONFIG, object, opportunityType: '12005' });
      expect(shape.columns.slice(0, 4), object).toEqual(['id', 'name', 'phone', 'email']);
      expect(shape.key).toBe('id');
    }
  });

  it('lets a custom column read its own value, not a built-in one', async () => {
    serve([
      [anyHost('LeadsMetaData.Get'), () => ok(LEAD_META)],
      [anyHost('Leads.RecentlyModified'), () => ok({ RecordCount: 1, Leads: [wrapped({
        ProspectID: 'p1', FirstName: 'Meera', LastName: 'Iyer', ProspectStage: 'Prospect', mx_Stage: 'Second visit booked',
      })] })],
    ]);
    const shape = await describeShape({ ...CONFIG, object: 'Leads' });
    const rows = await pull({ ...CONFIG, object: 'Leads' });
    const mapping = guessMapping(shape.columns, provides);
    // Only the four shared names are mapped; everything else reads itself.
    expect(Object.keys(mapping).sort()).toEqual(['email', 'id', 'name', 'phone']);
    const [cells] = mapOntoColumns({ columns: shape.columns }, rows, mapping);
    expect(cells[shape.columns.indexOf('mx_Stage')]).toBe('Second visit booked');
    expect(cells[shape.columns.indexOf('stage')]).toBe('Prospect');
  });
});

describe('Leads', () => {
  it('reads the attribute/value shape Leads.RecentlyModified sends', () => {
    const f = leadFields(wrapped({ ProspectID: 'p1', FirstName: 'Meera' }));
    expect(f).toEqual({ ProspectID: 'p1', FirstName: 'Meera' });
  });

  it('reads the flat shape Leads/Retrieve/ByIds sends, through the same function', () => {
    expect(leadFields({ ProspectID: 'p1', FirstName: 'Meera' })).toEqual({ ProspectID: 'p1', FirstName: 'Meera' });
  });

  it('names a lead in one column, so the people picker finds them', () => {
    const r = leadRow(wrapped({ ProspectID: 'p1', FirstName: 'Meera', LastName: 'Iyer', Phone: '+91-9845012345' }));
    expect(r).toMatchObject({ id: 'p1', name: 'Meera Iyer', phone: '+91-9845012345' });
  });

  it('keeps the account’s own fields, custom ones ahead of LeadSquared’s bookkeeping', async () => {
    serve([[anyHost('LeadsMetaData.Get'), () => ok(LEAD_META)]]);
    const shape = await describeShape({ ...CONFIG, object: 'Leads' });
    const extra = shape.columns.slice(10);
    expect(extra.indexOf('mx_Treatment')).toBeLessThan(extra.indexOf('City'));
    expect(extra.indexOf('City')).toBeLessThan(extra.indexOf('ProspectAutoId'));
    // Not repeated under their own names once mapped into the shared columns.
    expect(shape.columns).not.toContain('EmailAddress');
    expect(shape.columns).not.toContain('FirstName');
  });

  it('pages until a page comes back short', async () => {
    let pages = 0;
    serve([
      [anyHost('LeadsMetaData.Get'), () => ok(LEAD_META)],
      [anyHost('Leads.RecentlyModified'), (u, req) => {
        pages += 1;
        const n = req.data.Paging.PageIndex === 1 ? 100 : 7;
        return ok({ Leads: Array.from({ length: n }, (_, i) => wrapped({ ProspectID: `p${req.data.Paging.PageIndex}-${i}` })) });
      }],
    ]);
    const rows = await pull({ ...CONFIG, object: 'Leads' });
    expect(rows.length).toBe(107);
    expect(pages).toBe(2);
  });
});

describe('Activities, which is the record of engagement', () => {
  it('names the person each touch was with', async () => {
    /*
     * The whole point. An activity carries only RelatedProspectId; without
     * the join a watcher could notice somebody going quiet and not say who.
     */
    serve([
      [anyHost('LeadsMetaData.Get'), () => ok([])],
      [anyHost('ProspectActivity.svc/RetrieveRecentlyModified'), () => ok({ RecordCount: 1, ProspectActivities: [ACTIVITY] })],
      [anyHost('Leads/Retrieve/ByIds'), () => ok(BY_IDS)],
    ]);
    const [row] = await pull(CONFIG);
    expect(row).toMatchObject({
      id: 'a1', name: 'Meera Iyer', phone: '+91-9845012345', email: 'meera@example.com',
      activity: 'Phone Call', activity_date: '2026-09-02 10:00:00', lead_id: 'p1',
    });
  });

  it('looks people up in bulk, not one request per activity', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...ACTIVITY, Id: `a${i}`, RelatedProspectId: `p${i % 3}` }));
    serve([
      [anyHost('LeadsMetaData.Get'), () => ok([])],
      [anyHost('ProspectActivity.svc/RetrieveRecentlyModified'), () => ok({ ProspectActivities: many })],
      [anyHost('Leads/Retrieve/ByIds'), (u, req) => {
        expect(req.data.SearchParameters.LeadIds.sort()).toEqual(['p0', 'p1', 'p2']);
        return ok({ Leads: [] });
      }],
    ]);
    await pull(CONFIG);
    const lookups = axios.request.mock.calls.filter(([r]) => r.url.endsWith('Leads/Retrieve/ByIds'));
    expect(lookups.length).toBe(1);
  });

  it('keeps a note, but does not spread an account’s opaque custom keys into columns', () => {
    /*
     * mx_Custom_1 is a call's duration on one activity type and a treatment
     * on the next. A column holding four kinds of thing would be read by a
     * watcher as one.
     */
    const r = activityRow(ACTIVITY);
    expect(r.note).toBe('Asked about the 12-session package');
    expect(Object.keys(r)).not.toContain('mx_Custom_1');
    expect(noteOf({ Data: [{ Key: 'mx_Custom_1', Value: '420' }] })).toBe('');
  });

  it('marks LeadSquared’s bookkeeping, so a watcher times silence by when a touch happened', async () => {
    const shape = await describeShape(CONFIG);
    expect(shape.columns).toContain('activity_date');
    expect(shape.internal).toEqual(expect.arrayContaining(['modified', 'event_code', 'lead_id', 'opportunity_id']));
    expect(shape.internal).not.toContain('activity_date');
  });
});

describe('Opportunities', () => {
  it('names an account’s custom fields from the type’s own metadata', () => {
    const cols = opportunityColumns(OPP_META.Fields);
    expect(cols.map((c) => c.column)).toEqual(['Opportunity_Name', 'Stage', 'Expected_Value', 'Stage_2']);
  });

  it('reads each named field into its column', () => {
    const row = opportunityRow(OPP_LIST.List[0], opportunityColumns(OPP_META.Fields));
    expect(row).toMatchObject({ id: 'opp-1', status: 'Open', Stage: 'Need Analysis', Expected_Value: '24000' });
  });

  it('pulls them with the person attached', async () => {
    serve([
      [anyHost('LeadsMetaData.Get'), () => ok([])],
      [anyHost('GetOpportunityTypeMetadata'), () => ok(OPP_META)],
      [anyHost('Retrieve/BySearchParameter'), (u, req) => {
        expect(req.data.OpportunityEventCode).toBe(12005);
        expect(JSON.parse(req.data.AdvancedSearch).Conditions[0].RowCondition[0].RSO).toBe('12005');
        return ok(OPP_LIST);
      }],
      [anyHost('Leads/Retrieve/ByIds'), () => ok(BY_IDS)],
    ]);
    const [row] = await pull({ ...CONFIG, object: 'Opportunities', opportunityType: '12005' });
    expect(row).toMatchObject({ name: 'Meera Iyer', status: 'Open', Opportunity_Name: 'Meera - Knee rehab' });
  });

  it('builds the search itself, rather than asking for one copied from a browser', () => {
    // The documentation says to capture AdvancedSearch from the network panel.
    const s = JSON.parse(advancedSearchFor('12005'));
    expect(s.Conditions[0].RowCondition[0]).toMatchObject({ LSO: 'ActivityEvent', Operator: 'eq', RSO: '12005' });
  });

  it('asks for the type code when it is missing', async () => {
    serve([[anyHost('LeadsMetaData.Get'), () => ok([])]]);
    await expect(describeShape({ ...CONFIG, object: 'Opportunities' })).rejects.toThrow(/opportunity type code/);
  });

  it('says plainly when no type has that code', async () => {
    serve([
      [anyHost('LeadsMetaData.Get'), () => ok([])],
      [anyHost('GetOpportunityTypeMetadata'), () => ok({})],
    ]);
    await expect(testConnection({ ...CONFIG, object: 'Opportunities', opportunityType: '99' })).rejects.toThrow(/no opportunity type with code 99/);
  });

  it('requires the code only when reading opportunities', () => {
    const f = fields.find((x) => x.name === 'opportunityType');
    expect(f.required).toBe(false);
    expect(f.requiredWhen).toEqual({ object: ['Opportunities'] });
  });
});

describe('the read window', () => {
  it('is in the only form LeadSquared accepts', () => {
    expect(stamp(new Date('2026-10-03T07:05:09Z'))).toBe('2026-10-03 07:05:09');
  });

  it('ends a day after now, so an evening in India is not past its end', () => {
    // The Exotel connector learned this one: a window ending at the
    // container's UTC "now" missed everything after 17:30 in an Indian office.
    const w = windowFor(new Date('2026-10-03T12:00:00Z'));
    expect(w.ToDate).toBe('2026-10-04 12:00:00');
    expect(w.FromDate.startsWith('2025-10-03')).toBe(true);
  });
});

describe('what a failure says', () => {
  it('names the thing to fix', () => {
    expect(reason(refusal(401))).toMatch(/refused the access key/);
    expect(reason(refusal(429))).toMatch(/rate limiting/);
    expect(reason(refusal(500, { ExceptionMessage: 'Invalid column ModifiedOn' }))).toBe('LeadSquared said: Invalid column ModifiedOn');
    expect(reason(new Error('timeout'))).toMatch(/Could not reach LeadSquared/);
  });

  it('turns a page-two failure into a sync error rather than a short dataset', async () => {
    // A sync that stops quietly at page one looks like a business with fewer
    // customers. It must fail loudly instead.
    serve([
      [anyHost('LeadsMetaData.Get'), () => ok([])],
      [anyHost('ProspectActivity.svc/RetrieveRecentlyModified'), (u, req) => {
        if (req.data.Paging.PageIndex === 1) return ok({ ProspectActivities: Array.from({ length: 100 }, (_, i) => ({ ...ACTIVITY, Id: `a${i}` })) });
        throw refusal(500, { ExceptionMessage: 'Timeout' });
      }],
    ]);
    await expect(pull(CONFIG)).rejects.toThrow(/Timeout/);
  });
});

describe('a column name from a label', () => {
  it('is the shape every other dataset’s columns have', () => {
    expect(columnName('Expected Closure Date')).toBe('Expected_Closure_Date');
    expect(columnName('  Fee (INR)  ')).toBe('Fee_INR');
  });
});

/* ── The watcher it was built for ─────────────────────────────────────── */

describe('Gone Quiet is offered on the activity record', () => {
  /*
   * The activity's time was first named `at`. Every test above passed, and
   * Gone Quiet was never offered — the watcher only binds to a column the
   * `when` role recognises, and `at` is not one. This is the test that would
   * have caught it: the real catalogue, on the real shape.
   */
  it('binds the engagement watchers to Activities', async () => {
    const s = await describeShape({ object: 'Activities' });
    const rows = catalogueFor([{ name: s.name, columns: s.columns, internal: s.internal }]);
    for (const id of ['gone-quiet', 'stopped-coming']) {
      const row = rows.find((r) => r.id === id);
      expect(row?.offered, id).not.toBe(false);
      expect(row.question).toContain('Activities (LeadSquared)');
    }
    expect(rows.find((r) => r.id === 'stopped-coming').question).toContain('activity_date');
  });
});
