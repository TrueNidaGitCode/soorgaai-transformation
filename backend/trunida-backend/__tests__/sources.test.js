/**
 * Sources in the application, Phase 1: the industry names its sources and
 * Eame ships only the connectors they call for; rows land by one rule (a
 * key, one row per key, nothing deleted by a sync); the chat's record
 * intent is gated before any model is asked.
 */
import { describe, it, expect } from 'vitest';

const T = '../eame-template/';
const DR = (datasets) => ({ domains: [{ domainId: 'data-readiness', capabilities: [{ sections: [{ brief: { datasets } }] }] }] });

describe('where an industry keeps its data', () => {
  it('reads the sports academies block from the overlay, in its order', async () => {
    const { industrySources } = await import('../services/sourceCatalogService.js');
    const s = industrySources('Sports Academies');
    expect(s.map(x => x.kind)).toEqual(['folder', 'whatsapp']);
    expect(s[1].providers).toEqual(['export', 'business-account']);
    expect(s[0].holds).toContain('attendance');
    expect(industrySources('Automotive')).toEqual([]);
    expect(industrySources('')).toEqual([]);
  });

  it('falls back to what the datasets name, and to a folder when nothing is named', async () => {
    const { sourcesForBlueprint, sourcesFromDatasets } = await import('../services/sourceCatalogService.js');
    expect(sourcesFromDatasets([{ typicalSource: 'Excel sheet in Google Drive' }, { typicalSource: 'WhatsApp groups' }, { typicalSource: 'Jira Service Management' }]).map(s => s.kind)).toEqual(['folder', 'whatsapp', 'jira']);
    expect(sourcesForBlueprint({ industryFit: { industry: 'Automotive' }, ...DR([{ name: 'Defects', typicalSource: 'Jira' }, { name: 'Specs', typicalSource: 'Confluence pages' }]) }).map(s => s.kind)).toEqual(['jira', 'confluence']);
    expect(sourcesForBlueprint({}).map(s => s.kind)).toEqual(['folder']);
  });

  it('the industry block is the list: a dataset naming GitHub does not add a card the industry does not use', async () => {
    const { sourcesForBlueprint, connectorKindsFor, sourcesFromDatasets } = await import('../services/sourceCatalogService.js');
    const s = sourcesForBlueprint({ industryFit: { industry: 'Sports Academies' }, ...DR([{ name: 'Attendance', typicalSource: 'WhatsApp' }, { name: 'Scripts', typicalSource: 'Script repository on GitHub' }]) });
    expect(s.map(x => x.kind)).toEqual(['folder', 'whatsapp']);
    expect(connectorKindsFor(s)).toEqual(['whatsapp']);
    // And "repository" alone never means GitHub.
    expect(sourcesFromDatasets([{ typicalSource: 'a document repository' }]).map(x => x.kind)).toEqual([]);
  });

  it('ships only the connector modules the sources call for', async () => {
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    const paths = (o) => buildRuntime({ appName: 'x', ...o }).map(f => f.path).filter(p => p.startsWith('services/connectors/'));
    expect(paths({}).length).toBe(4);
    /*
     * WhatsApp is always among them, and that is not the filter leaking.
     *
     * whatsappController.js ships with every application and imports the
     * module statically, so an application built without it died on boot with
     * "Cannot find module" — which is what happened to Arthi's. Optional means
     * optional only for the connectors connectorService discovers at boot.
     */
    expect(paths({ connectors: ['jira'] }).sort())
      .toEqual(['services/connectors/jira.js', 'services/connectors/whatsapp.js']);
    expect(paths({ connectors: [] })).toEqual(['services/connectors/whatsapp.js']);
    // Everything else still ships.
    expect(buildRuntime({ appName: 'x', connectors: [] }).map(f => f.path)).toContain('services/connectorService.js');
  });

  it('tells Cob the industry sources in the guidance', async () => {
    const { sourceGuidanceFor } = await import('../services/sourceCatalogService.js');
    const g = sourceGuidanceFor('Sports Academies');
    expect(g).toMatch(/INDUSTRY SOURCES/);
    expect(g).toMatch(/Your folder of spreadsheets/);
    expect(g).toMatch(/WhatsApp/);
    expect(sourceGuidanceFor('Automotive')).toBe('');
  });
});

describe('the one rule for rows', () => {
  it('guesses the key: an identifier, else date + person for events, else the person, else nothing', async () => {
    const { datasetKey } = await import(T + 'services/connectorService.js');
    expect(datasetKey({ columns: ['Name', 'Student ID', 'Batch', '_source'] })).toBe('Student ID');
    expect(datasetKey({ columns: ['date', 'time', 'name', 'reply', 'status'] })).toBe('date + name');
    expect(datasetKey({ columns: ['Coach name', 'Specialty'] })).toBe('Coach name');
    expect(datasetKey({ columns: ['Guardian phone', 'child'] })).toBe('child');
    expect(datasetKey({ columns: ['Session', 'Venue'] })).toBe('');
    expect(datasetKey({ key: 'Venue', columns: ['Session', 'Venue'] })).toBe('Venue');
    expect(datasetKey({ key: ['Session', 'Venue'], columns: ['Session', 'Venue'] })).toBe('Session + Venue');
  });

  it('updates by key, adds the rest, marks what the sheet no longer has, blanks nothing', async () => {
    const { mergeRows } = await import(T + 'services/connectorService.js');
    const r = mergeRows(
      [['S1', 'Priya', 'U14', '98'], ['S2', 'Arjun', 'U16', '']],
      [['S2', 'Arjun', 'U14', ''], ['S3', 'Meera', 'U12', '97'], ['', 'Nobody', '', '']],
      [0],
    );
    expect(r.rows).toEqual([['S1', 'Priya', 'U14', '98'], ['S2', 'Arjun', 'U14', ''], ['S3', 'Meera', 'U12', '97'], ['', 'Nobody', '', '']]);
    expect([r.added, r.updated, r.unchanged]).toEqual([2, 1, 0]);
    expect(r.missing).toEqual(['s1']);
    expect(r.seen).toEqual(['s2', 's3']);
    // An empty incoming cell does not blank a value the sheet had.
    const keep = mergeRows([['S1', 'Priya', 'U14', '98']], [['S1', 'Priya', '', '']], [0]);
    expect(keep.rows[0][3]).toBe('98');
    expect(keep.unchanged).toBe(1);
  });

  it('keys events by date and person together, and matches case- and space-insensitively', async () => {
    const { mergeRows } = await import(T + 'services/connectorService.js');
    const r = mergeRows(
      [['12/03', '06:00', 'Priya', 'yes', 'present']],
      [['12/03', '06:05', 'priya ', 'yes', 'present'], ['12/03', '06:10', 'Arjun', 'no', 'absent'], ['13/03', '06:00', 'Priya', 'no', 'absent']],
      [0, 2],
    );
    expect(r.rows.length).toBe(3);
    expect([r.added, r.updated]).toEqual([2, 1]);
  });

  it('without a key, adds everything but an exact duplicate', async () => {
    const { mergeRows } = await import(T + 'services/connectorService.js');
    const r = mergeRows([['a', 'b']], [['a', 'b'], ['c', 'd']], []);
    expect(r.rows.length).toBe(2);
    expect([r.added, r.unchanged, r.missing.length]).toEqual([1, 1, 0]);
  });

  it('reads back the CSV it writes', async () => {
    const { parseCsv } = await import(T + 'services/connectorService.js');
    expect(parseCsv('a,b\n"x, 1","say ""hi"""\n\n')).toEqual([['a', 'b'], ['x, 1', 'say "hi"']]);
  });
});

describe('the chat writing a record', () => {
  it('only asks the model about a message that starts like a record', async () => {
    const { looksLikeRecord } = await import(T + 'controllers/dataController.js');
    expect(looksLikeRecord('Add Priya Nair to the U14 Tuesday batch')).toBe(true);
    expect(looksLikeRecord('  mark Arjun paid for March')).toBe(true);
    expect(looksLikeRecord('Which learners are at risk this week?')).toBe(false);
    expect(looksLikeRecord('How do I add a student?')).toBe(false);
  });

  it('offers what the industry and the shipped connectors allow, and nothing else', async () => {
    const { listSources } = await import(T + 'controllers/dataController.js');
    const r = { body: null, json(b) { this.body = b; return this; } };
    listSources({}, r);
    // The template itself carries no sources.json: the default is a folder.
    expect(r.body.sources.map(s => s.kind)).toEqual(['folder']);
  });

  it('refuses a writer who is neither the owner session nor an owner/admin account', async () => {
    const { requireWriter } = await import(T + 'controllers/dataController.js');
    const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    let passed = false;
    await requireWriter({ user: { role: 'owner', _id: 'owner' } }, r, () => { passed = true; });
    expect(passed).toBe(true);
    passed = false;
    await requireWriter({ user: { role: 'user', _id: 'public-session' } }, r, () => { passed = true; });
    expect(passed).toBe(false);
    expect(r.code).toBe(403);
  });
});
