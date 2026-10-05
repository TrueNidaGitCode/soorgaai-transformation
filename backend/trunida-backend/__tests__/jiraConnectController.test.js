/**
 * Connecting Jira in Zoho's steps: scan, then one request per project.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({
  test: vi.fn(), listPopulated: vi.fn(), describeShape: vi.fn(),
  defineDataset: vi.fn(), createConnector: vi.fn(), syncConnector: vi.fn(),
  listConnectors: vi.fn(), deleteConnector: vi.fn(),
}));

vi.mock('../eame-template/services/connectors/jira.js', () => ({
  test: M.test, listPopulated: M.listPopulated, describeShape: M.describeShape,
}));
vi.mock('../eame-template/services/connectorService.js', () => ({
  defineDataset: M.defineDataset, createConnector: M.createConnector, syncConnector: M.syncConnector,
  listConnectors: M.listConnectors, deleteConnector: M.deleteConnector,
}));

const { jiraScan, jiraConnectOne } = await import('../eame-template/controllers/jiraConnectController.js');

function reply() {
  const res = { code: 200, body: null };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const CREDS = { siteUrl: 'https://orion.atlassian.net/', email: 'ops@orion.in', apiToken: 'tok' };

beforeEach(() => {
  Object.values(M).forEach((f) => f.mockReset());
  M.test.mockResolvedValue({ ok: true });
  M.describeShape.mockImplementation((c) => ({ name: `${c.projectName} issues (Jira)`, columns: ['key', 'summary'], key: 'key', internal: [] }));
  M.defineDataset.mockImplementation(async (d) => ({ name: d.name, columns: d.columns }));
  M.createConnector.mockResolvedValue({ id: 'new' });
  M.syncConnector.mockResolvedValue({ rows: 214 });
  M.listConnectors.mockResolvedValue([]);
});

describe('scan', () => {
  it('checks the token, then answers with the projects holding issues', async () => {
    M.listPopulated.mockResolvedValue([{ key: 'ORION', name: 'Project Orion' }]);
    const res = reply();
    await jiraScan({ body: CREDS }, res);
    expect(M.test).toHaveBeenCalled();
    expect(res.body).toEqual({ projects: [{ key: 'ORION', name: 'Project Orion' }] });
    // The trailing slash a pasted address carries is not part of the site.
    expect(M.listPopulated.mock.calls[0][0].siteUrl).toBe('https://orion.atlassian.net');
  });

  it('refuses an address that is not one before calling Jira', async () => {
    const res = reply();
    await jiraScan({ body: { ...CREDS, siteUrl: 'orion.atlassian.net' } }, res);
    expect(res.code).toBe(400);
    expect(M.test).not.toHaveBeenCalled();
  });

  it('passes Jira\'s refusal through as the thing to fix', async () => {
    M.test.mockRejectedValue(new Error('Jira refused the email and token.'));
    const res = reply();
    await jiraScan({ body: CREDS }, res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/refused/);
  });
});

describe('connect one project', () => {
  it('makes the project its own dataset, connects it hourly and reads it once', async () => {
    const res = reply();
    await jiraConnectOne({ body: { ...CREDS, project: 'orion', label: 'Project Orion' } }, res);
    expect(M.createConnector).toHaveBeenCalledWith({
      kind: 'jira', datasetName: 'Project Orion issues (Jira)', schedule: 'hourly',
      config: { siteUrl: 'https://orion.atlassian.net', email: 'ops@orion.in', apiToken: 'tok', jql: 'ORION', projectName: 'Project Orion' },
    });
    expect(res.body).toEqual({ module: 'Project Orion', dataset: 'Project Orion issues (Jira)', columns: 2, rows: 214 });
  });

  it('replaces the connection already reading that project rather than adding a second', async () => {
    M.listConnectors.mockResolvedValue([
      { id: 'old', kind: 'jira', datasetName: 'Project Orion issues (Jira)' },
      { id: 'other', kind: 'jira', datasetName: 'Validation issues (Jira)' },
    ]);
    await jiraConnectOne({ body: { ...CREDS, project: 'ORION', label: 'Project Orion' } }, reply());
    expect(M.deleteConnector.mock.calls.map((c) => c[0])).toEqual(['old']);
  });

  it('refuses JQL where a project key belongs', async () => {
    const res = reply();
    await jiraConnectOne({ body: { ...CREDS, project: 'project = ORION OR 1=1' } }, res);
    expect(res.code).toBe(400);
    expect(M.createConnector).not.toHaveBeenCalled();
  });
});
