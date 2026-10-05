/**
 * Connecting Clinicea in Zoho's steps: scan, then one request per part.
 *
 * The connector's own reading is pinned in cliniceaConnector.test.js. This
 * pins what the two routes do with it: each part its own dataset, reconnecting
 * replaces rather than doubles, and one part failing is that part's only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({
  listPopulated: vi.fn(), describeShape: vi.fn(),
  defineDataset: vi.fn(), createConnector: vi.fn(), syncConnector: vi.fn(),
  listConnectors: vi.fn(), deleteConnector: vi.fn(), forgetDataset: vi.fn(), requestLookNow: vi.fn(),
}));

vi.mock('../eame-template/services/connectors/clinicea.js', () => ({
  OBJECTS: ['Appointments', 'Patients', 'Packages', 'Bills'],
  listPopulated: M.listPopulated,
  describeShape: M.describeShape,
  isSample: (c) => String(c?.sample || '') === 'yes',
}));
vi.mock('../eame-template/services/agentService.js', () => ({ requestLookNow: M.requestLookNow }));
vi.mock('../eame-template/services/connectorService.js', () => ({
  defineDataset: M.defineDataset, createConnector: M.createConnector, syncConnector: M.syncConnector,
  listConnectors: M.listConnectors, deleteConnector: M.deleteConnector, forgetDataset: M.forgetDataset,
}));

const { cliniceaScan, cliniceaConnectOne } = await import('../eame-template/controllers/cliniceaConnectController.js');

function reply() {
  const res = { code: 200, body: null };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const CREDS = { apiKey: 'key-123', username: 'frontdesk', password: 'pw' };

beforeEach(() => {
  Object.values(M).forEach((f) => f.mockReset());
  M.describeShape.mockImplementation((c) => ({ name: `${c.object} ${c.sample === 'yes' ? '(Clinicea sample)' : '(Clinicea)'}`, columns: ['id', 'name', 'status'], key: 'id', internal: [] }));
  M.forgetDataset.mockResolvedValue(false);
  M.defineDataset.mockImplementation(async (d) => ({ name: d.name, columns: d.columns }));
  M.createConnector.mockResolvedValue({ id: 'new' });
  M.syncConnector.mockResolvedValue({ rows: 418 });
  M.listConnectors.mockResolvedValue([]);
});

describe('scan', () => {
  it('answers with the parts holding records', async () => {
    M.listPopulated.mockResolvedValue([{ object: 'Appointments', label: 'Appointments' }]);
    const res = reply();
    await cliniceaScan({ body: CREDS }, res);
    expect(res.body).toEqual({ parts: [{ object: 'Appointments', label: 'Appointments' }] });
    expect(M.listPopulated).toHaveBeenCalledWith(CREDS);
  });

  it('asks for the key and the login before calling Clinicea', async () => {
    const res = reply();
    await cliniceaScan({ body: { apiKey: 'key-123' } }, res);
    expect(res.code).toBe(400);
    expect(M.listPopulated).not.toHaveBeenCalled();
  });

  it('passes Clinicea\'s refusal through as the thing to fix', async () => {
    M.listPopulated.mockRejectedValue(new Error('Clinicea refused the API key, username or password.'));
    const res = reply();
    await cliniceaScan({ body: CREDS }, res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/refused/);
  });
});

describe('connect one part', () => {
  it('makes the part its own dataset, connects it hourly and reads it once', async () => {
    const res = reply();
    await cliniceaConnectOne({ body: { ...CREDS, object: 'Appointments', label: 'Appointments' } }, res);
    expect(M.createConnector).toHaveBeenCalledWith({
      kind: 'clinicea', datasetName: 'Appointments (Clinicea)', schedule: 'hourly',
      config: { ...CREDS, object: 'Appointments' },
    });
    expect(res.body).toEqual({ module: 'Appointments', dataset: 'Appointments (Clinicea)', columns: 3, rows: 418 });
  });

  it('replaces the connection already reading that part rather than adding a second', async () => {
    M.listConnectors.mockResolvedValue([
      { id: 'old', kind: 'clinicea', datasetName: 'Appointments (Clinicea)' },
      { id: 'zoho', kind: 'zoho-crm', datasetName: 'Appointments (Clinicea)' },
    ]);
    await cliniceaConnectOne({ body: { ...CREDS, object: 'Appointments' } }, reply());
    expect(M.deleteConnector.mock.calls.map((c) => c[0])).toEqual(['old']);
  });

  it('refuses a part Clinicea is not read for', async () => {
    const res = reply();
    await cliniceaConnectOne({ body: { ...CREDS, object: 'Prescriptions' } }, res);
    expect(res.code).toBe(400);
    expect(M.createConnector).not.toHaveBeenCalled();
  });
});

describe('the sample clinic', () => {
  it('connects with no credentials at all', async () => {
    const res = reply();
    await cliniceaConnectOne({ body: { sample: 'yes', object: 'Appointments', label: 'Appointments' } }, res);
    expect(M.createConnector.mock.calls[0][0]).toMatchObject({ datasetName: 'Appointments (Clinicea sample)', config: { sample: 'yes', object: 'Appointments' } });
    expect(M.forgetDataset).not.toHaveBeenCalled();
  });

  it('is removed, every part of it, the moment a real Clinicea connects', async () => {
    await cliniceaConnectOne({ body: { ...CREDS, object: 'Appointments' } }, reply());
    expect(M.forgetDataset.mock.calls.map((c) => c[0])).toEqual([
      'Appointments (Clinicea sample)', 'Patients (Clinicea sample)', 'Packages (Clinicea sample)', 'Bills (Clinicea sample)',
    ]);
  });

  it('asks the watchers to look now, after either', async () => {
    await cliniceaConnectOne({ body: { sample: 'yes', object: 'Packages' } }, reply());
    expect(M.requestLookNow).toHaveBeenCalled();
  });
});
