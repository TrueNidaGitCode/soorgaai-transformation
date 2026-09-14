/**
 * The catalogue was rebuilt from every row, on every question.
 *
 * Building it reads all rows of all datasets out of the database — to count
 * them, and to collect a few example values per column for the planner's
 * prompt. The result is identical from one question to the next until someone
 * imports something, and it was being recomputed every time. Measured on the
 * academy's data, that was most of the ~0.8s the application spent around its
 * two model calls.
 *
 * Correctness matters more than the saving here: a cache that outlives an
 * import would answer about data the customer had just replaced. So it is
 * keyed on a version that changes at the moment the rows do, and these tests
 * are mostly about that.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const reads = { count: 0 };
let indexRows = [{ name: 'Roster', columns: ['name', 'batch'], file: 'roster.csv' }];

vi.mock('../eame-template/services/connectorService.js', async () => {
  let version = 0;
  return {
    dataVersion: () => version,
    bumpDataVersion: () => { version++; },
    readIndex: () => indexRows,
    datasetKey: () => 'name',
    findDataset: (n) => indexRows.find(d => d.name === n),
    readAllRows: async () => {
      reads.count++;
      return { columns: ['name', 'batch'], rows: [{ cells: ['Arjun', 'U16'] }], sample: false };
    },
  };
});

vi.mock('../eame-template/services/llmService.js', () => ({
  generate: vi.fn(async () => ({ text: '' })),
  generateRaw: vi.fn(async () => ({ text: '' })),
}));

beforeEach(() => { reads.count = 0; vi.resetModules(); });

describe('the catalogue is built once per change, not once per question', () => {
  it('reads the rows the first time and not the second', async () => {
    const { catalogue } = await import('../eame-template/services/answerService.js');
    await catalogue('own');
    const afterFirst = reads.count;
    expect(afterFirst).toBeGreaterThan(0);
    await catalogue('own');
    await catalogue('own');
    expect(reads.count).toBe(afterFirst);
  });

  it('rebuilds as soon as the data changes, with no window of staleness', async () => {
    const conn = await import('../eame-template/services/connectorService.js');
    const { catalogue } = await import('../eame-template/services/answerService.js');
    await catalogue('own');
    const afterFirst = reads.count;

    // An import lands. The very next question must see it — not the one after
    // a timeout, which is the bug a TTL cache would have introduced here.
    conn.bumpDataVersion();
    await catalogue('own');
    expect(reads.count).toBeGreaterThan(afterFirst);
  });

  it('keeps the owner\'s records and the simulated ones apart', async () => {
    const { catalogue } = await import('../eame-template/services/answerService.js');
    await catalogue('own');
    const afterOwn = reads.count;
    // A cache that ignored the kind would serve simulated rows to a customer
    // who has their own, or the reverse.
    await catalogue('sample');
    expect(reads.count).toBeGreaterThan(afterOwn);
  });

  it('notices a dataset that appears without any row being written', async () => {
    const conn = await import('../eame-template/services/connectorService.js');
    const { catalogue } = await import('../eame-template/services/answerService.js');
    const first = await catalogue('own');
    expect(first.map(d => d.name)).toEqual(['Roster']);

    indexRows = [...indexRows, { name: 'Fees', columns: ['name', 'status'], file: 'fees.csv' }];
    conn.bumpDataVersion();               // connecting a source bumps it too
    const second = await catalogue('own');
    expect(second.map(d => d.name)).toEqual(['Roster', 'Fees']);
  });
});

describe('what bumps the version', () => {
  const read = () => import('fs').then(fs =>
    fs.readFileSync(new URL('../eame-template/services/connectorService.js', import.meta.url), 'utf8'));

  it('writing rows does', async () => {
    const src = await read();
    expect(src).toMatch(/async function writeSourceRows[\s\S]{0,200}bumpDataVersion\(\)/);
  });

  it('connecting or changing a source does', async () => {
    const src = await read();
    expect(src).toContain('bumpDataVersion();\n  const r = await connectorsCollection().insertOne(doc);');
    expect(src).toMatch(/bumpDataVersion\(\); await connectorsCollection\(\)\.updateOne/);
  });
});
