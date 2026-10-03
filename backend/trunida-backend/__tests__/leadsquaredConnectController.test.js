/**
 * Connecting LeadSquared in Zoho's steps: scan, then one request per part.
 *
 * The connector's own reading is pinned in leadsquaredConnector.test.js. This
 * pins what the two routes do with it — the dataset each part becomes, that
 * reconnecting replaces rather than doubles, and that one part failing is
 * that part's failure only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({
  listPopulated: vi.fn(), describeShape: vi.fn(),
  defineDataset: vi.fn(), createConnector: vi.fn(), syncConnector: vi.fn(),
  listConnectors: vi.fn(), deleteConnector: vi.fn(),
}));

vi.mock('../eame-template/services/connectors/leadsquared.js', () => ({
  OBJECTS: ['Leads', 'Activities', 'Opportunities'],
  listPopulated: M.listPopulated,
  describeShape: M.describeShape,
}));
vi.mock('../eame-template/services/connectorService.js', () => ({
  defineDataset: M.defineDataset, createConnector: M.createConnector, syncConnector: M.syncConnector,
  listConnectors: M.listConnectors, deleteConnector: M.deleteConnector,
}));

const { leadsquaredScan, leadsquaredConnectOne } = await import('../eame-template/controllers/leadsquaredConnectController.js');

function reply() {
  const res = { code: 200, body: null };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const KEYS = { accessKey: 'u$r1', secretKey: 's3cr3t' };

beforeEach(() => {
  Object.values(M).forEach((f) => f.mockReset());
  M.describeShape.mockResolvedValue({ name: 'Activities (LeadSquared)', columns: ['id', 'name', 'activity_date'], key: 'id', internal: [] });
  M.defineDataset.mockImplementation(async (d) => ({ name: d.name, columns: d.columns }));
  M.createConnector.mockResolvedValue({ id: 'new' });
  M.syncConnector.mockResolvedValue({ rows: 812 });
  M.listConnectors.mockResolvedValue([]);
});

describe('scan', () => {
  it('answers with the parts holding records', async () => {
    M.listPopulated.mockResolvedValue([{ object: 'Activities', label: 'Activities' }]);
    const res = reply();
    await leadsquaredScan({ body: KEYS }, res);
    expect(res.body).toEqual({ parts: [{ object: 'Activities', label: 'Activities' }] });
    expect(M.listPopulated).toHaveBeenCalledWith(KEYS);
  });

  it('asks for both keys before calling LeadSquared', async () => {
    const res = reply();
    await leadsquaredScan({ body: { accessKey: 'x' } }, res);
    expect(res.code).toBe(400);
    expect(M.listPopulated).not.toHaveBeenCalled();
  });

  it('says plainly when an account holds nothing', async () => {
    M.listPopulated.mockResolvedValue([]);
    const res = reply();
    await leadsquaredScan({ body: KEYS }, res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/nothing to read yet/);
  });

  it('passes the wrong-keys sentence through as the thing to fix', async () => {
    M.listPopulated.mockRejectedValue(new Error('LeadSquared refused those keys in every region.'));
    const res = reply();
    await leadsquaredScan({ body: KEYS }, res);
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/every region/);
  });
});

describe('connect one part', () => {
  it('makes the dataset from the shape, connects it hourly, and reads it once', async () => {
    const res = reply();
    await leadsquaredConnectOne({ body: { ...KEYS, object: 'Activities', label: 'Activities' } }, res);
    expect(M.defineDataset).toHaveBeenCalledWith(expect.objectContaining({ name: 'Activities (LeadSquared)', from: 'leadsquared' }));
    expect(M.createConnector).toHaveBeenCalledWith({
      kind: 'leadsquared', datasetName: 'Activities (LeadSquared)', schedule: 'hourly',
      config: { ...KEYS, object: 'Activities', opportunityType: '' },
    });
    expect(res.body).toEqual({ module: 'Activities', dataset: 'Activities (LeadSquared)', columns: 3, rows: 812 });
  });

  it('carries the opportunity type the scan found', async () => {
    M.describeShape.mockResolvedValue({ name: 'Treatment Plan (LeadSquared)', columns: ['id'], key: 'id', internal: [] });
    await leadsquaredConnectOne({ body: { ...KEYS, object: 'Opportunities', opportunityType: '12005', label: 'Treatment Plans' } }, reply());
    expect(M.createConnector.mock.calls[0][0].config.opportunityType).toBe('12005');
  });

  it('replaces the connection already reading that dataset rather than adding a second', async () => {
    M.listConnectors.mockResolvedValue([
      { id: 'old', kind: 'leadsquared', datasetName: 'Activities (LeadSquared)' },
      { id: 'zoho', kind: 'zoho-crm', datasetName: 'Activities (LeadSquared)' },
      { id: 'leads', kind: 'leadsquared', datasetName: 'Leads (LeadSquared)' },
    ]);
    await leadsquaredConnectOne({ body: { ...KEYS, object: 'Activities' } }, reply());
    expect(M.deleteConnector.mock.calls.map((c) => c[0])).toEqual(['old']);
  });

  it('stays connected when only the first read fails', async () => {
    M.syncConnector.mockRejectedValue(new Error('timeout'));
    const res = reply();
    await leadsquaredConnectOne({ body: { ...KEYS, object: 'Activities' } }, res);
    expect(res.code).toBe(200);
    expect(res.body.rows).toBeNull();
  });

  it('refuses a part LeadSquared does not have', async () => {
    const res = reply();
    await leadsquaredConnectOne({ body: { ...KEYS, object: 'Deals' } }, res);
    expect(res.code).toBe(400);
    expect(M.createConnector).not.toHaveBeenCalled();
  });
});
