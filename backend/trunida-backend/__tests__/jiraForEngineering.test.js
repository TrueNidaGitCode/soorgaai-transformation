/**
 * Jira, read for a delivery head rather than a support desk.
 *
 * The first Jira connector read a summary, a status and an assignee, and
 * mapped them into a dataset somebody had to pick. That is what a support
 * queue needs. An engineering organisation asks whether work is due, how much
 * was estimated and how much has been spent -- and with none of those read,
 * not one deadline or effort watcher could bind to a Jira project.
 *
 * Response shapes are Jira Cloud's documented ones (REST v3), faked at the
 * HTTP layer. The catalogue binding at the end is the test that matters most:
 * it runs the real watchers on the real shape, which is what would have
 * caught a column the watchers cannot see.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => ({ get: M.get }) } }));

const J = await import('../eame-template/services/connectors/jira.js');
const { catalogueFor, matchDataset, entryFor } = await import('../eame-template/services/agentCatalogue.js');

const CONFIG = { siteUrl: 'https://orion.atlassian.net', email: 'ops@orion.in', apiToken: 't', jql: 'ORION', projectName: 'Project Orion' };

const FIELDS = [
  { id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
  { id: 'customfield_10016', name: 'Story point estimate', schema: {} },
  { id: 'customfield_10021', name: 'Flagged', schema: {} },
  { id: 'summary', name: 'Summary', schema: {} },
];

const ISSUE = {
  key: 'ORION-42', self: 'https://orion.atlassian.net/rest/api/3/issue/1042',
  fields: {
    summary: 'Firmware integration on the HIL bench', issuetype: { name: 'Story' }, status: { name: 'In Progress' },
    priority: { name: 'High' }, assignee: { displayName: 'Asha Rao' }, reporter: { displayName: 'PMO' },
    labels: ['firmware'], created: '2026-08-01T09:00:00.000+0530', updated: '2026-09-20T09:00:00.000+0530',
    resolutiondate: null, duedate: '2026-10-15',
    timeoriginalestimate: 360000, timespent: 590400, timeestimate: 72000,
    fixVersions: [{ name: 'R2.1' }], components: [{ name: 'ECU' }, { name: 'Bootloader' }],
    parent: { key: 'ORION-7', fields: { summary: 'Customer FAT readiness' } },
    customfield_10020: [{ name: 'Sprint 13', state: 'closed' }, { name: 'Sprint 14', state: 'active' }],
    customfield_10016: 8,
    customfield_10021: [{ value: 'Impediment' }],
  },
};

beforeEach(() => { M.get.mockReset(); });

describe('an issue, as a delivery head reads it', () => {
  it('carries the due date, the estimate and time spent in hours, the sprint and the release', () => {
    const row = J.toRow(ISSUE, { sprint: 'customfield_10020', points: 'customfield_10016', flagged: 'customfield_10021' });
    expect(row).toMatchObject({
      key: 'ORION-42', status: 'In Progress', assignee: 'Asha Rao', due_date: '2026-10-15',
      original_estimate_hours: '100', time_spent_hours: '164', remaining_hours: '20',
      sprint: 'Sprint 14', release: 'R2.1', components: 'ECU; Bootloader',
      epic: 'ORION-7 Customer FAT readiness', story_points: '8', flagged: 'yes',
      url: 'https://orion.atlassian.net/browse/ORION-42',
    });
  });

  it('leaves a figure Jira did not send blank, not zero', () => {
    const row = J.toRow({ key: 'X-1', fields: { summary: 's' } }, {});
    for (const k of ['due_date', 'original_estimate_hours', 'time_spent_hours', 'sprint', 'story_points', 'flagged']) {
      expect(row[k], k).toBe('');
    }
  });

  it('reads a sprint in the old string form too', () => {
    expect(J.sprintName(['com.atlassian.greenhopper.service.sprint.Sprint@1[id=3,state=ACTIVE,name=Sprint 9,goal=]'])).toBe('Sprint 9');
  });

  it('finds the custom fields by name, because their ids differ on every site', async () => {
    M.get.mockResolvedValue({ data: FIELDS });
    expect(await J.customFieldIds({ get: M.get })).toEqual({
      sprint: 'customfield_10020', points: 'customfield_10016', flagged: 'customfield_10021',
    });
  });

  it('reads without them on a site that has none', async () => {
    M.get.mockRejectedValue(Object.assign(new Error('403'), { response: { status: 403 } }));
    expect(await J.customFieldIds({ get: M.get })).toEqual({ sprint: null, points: null, flagged: null });
  });

  it('asks Jira for the custom fields it found, on every page', async () => {
    M.get.mockImplementation(async (url, opts) => {
      if (url === '/rest/api/3/field') return { data: FIELDS };
      return { data: { issues: [ISSUE] } };
    });
    const rows = await J.pull(CONFIG);
    expect(rows[0].sprint).toBe('Sprint 14');
    const search = M.get.mock.calls.find(([u]) => u === '/rest/api/3/search/jql')[1];
    expect(search.params.fields).toMatch(/duedate,timeoriginalestimate,timespent/);
    expect(search.params.fields).toMatch(/customfield_10020,customfield_10016,customfield_10021$/);
  });
});

describe('a project is its own dataset, found rather than typed', () => {
  it('names the dataset after the project and keeps bookkeeping internal', () => {
    const shape = J.describeShape(CONFIG);
    expect(shape.name).toBe('Project Orion issues (Jira)');
    expect(shape.key).toBe('key');
    expect(shape.internal).toEqual(expect.arrayContaining(['url', 'reporter']));
  });

  it('lists only the projects holding an issue, as Zoho lists its modules', async () => {
    M.get.mockImplementation(async (url, opts) => {
      if (url === '/rest/api/3/project/search') return { data: { values: [{ key: 'ORION', name: 'Project Orion' }, { key: 'OLD', name: 'Archive' }] } };
      if (url === '/rest/api/3/search/jql') return { data: { issues: opts.params.jql === 'project = ORION' ? [{ key: 'ORION-1' }] : [] } };
      throw new Error('unexpected ' + url);
    });
    expect(await J.listPopulated(CONFIG)).toEqual([{ key: 'ORION', name: 'Project Orion' }]);
  });
});

describe('the watchers an engineering organisation needs, on the real Jira shape', () => {
  /*
   * The trap this guards against: a connector can read every field correctly
   * and still give the watchers nothing they recognise. LeadSquared's activity
   * time was called `at` and Gone Quiet was never offered.
   */
  const shape = J.describeShape(CONFIG);
  const ds = { name: shape.name, columns: shape.columns, internal: shape.internal };

  it('offers the schedule and effort watchers on a Jira project', () => {
    const ready = catalogueFor([ds]).filter((r) => r.ready).map((r) => r.id);
    for (const id of ['blocked-work', 'unassigned-work', 'no-progress', 'deadline-approaching', 'promise-overdue', 'over-estimate']) {
      expect(ready, id).toContain(id);
    }
  });

  it('reads an issue by its summary, its owner as the assignee, and time against the estimate', () => {
    expect(matchDataset(entryFor('unassigned-work'), ds).using).toMatchObject({ slot: 'summary', who: 'assignee' });
    expect(matchDataset(entryFor('over-estimate'), ds).using).toMatchObject({
      hours: 'time_spent_hours', estimate: 'original_estimate_hours',
    });
    expect(matchDataset(entryFor('deadline-approaching'), ds).using.due).toBe('due_date');
  });
});
