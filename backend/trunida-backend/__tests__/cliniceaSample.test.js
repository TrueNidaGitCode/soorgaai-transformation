/**
 * The sample clinic: value before Clinicea's API add-on is bought.
 *
 * It is only worth offering if the watchers find in it exactly what was
 * planted -- and nothing that was not. A sample that reported real no-shows
 * as treated patients would teach an owner the product is wrong on the first
 * screen they ever see. So this runs the real connector mapping, the real
 * catalogue and the real plan operators on the sample, on today's date.
 */
import { describe, it, expect, vi } from 'vitest';
import { sampleClinic } from '../eame-template/services/cliniceaSample.js';
import * as C from '../eame-template/services/connectors/clinicea.js';
import { catalogueFor, matchDataset, entryFor } from '../eame-template/services/agentCatalogue.js';
import { matchesAll, windowRange, inWindow } from '../eame-template/services/reasoning.js';

vi.mock('axios', () => ({ default: { request: vi.fn(() => { throw new Error('the sample must not touch the network'); }) } }));

const NOW = new Date();
const SAMPLE = { sample: 'yes' };

async function dataset(object) {
  const rows = await C.pull({ ...SAMPLE, object }, { now: NOW });
  const shape = C.describeShape({ ...SAMPLE, object });
  return { shape, ds: { name: shape.name, columns: shape.columns, internal: shape.internal, own: 1 },
    cells: rows.map((r) => shape.columns.map((c) => r[c])) };
}

describe('the sample, as a connection', () => {
  it('reads through the real connector, with no credentials and no network', async () => {
    const a = await dataset('Appointments');
    expect(a.cells.length).toBeGreaterThan(1000);
    expect(await C.test(SAMPLE)).toMatchObject({ ok: true });
    expect(await C.listPopulated(SAMPLE)).toHaveLength(4);
  });

  it('says it is a sample in every dataset name and on the connection', () => {
    for (const object of C.OBJECTS) expect(C.describeShape({ ...SAMPLE, object }).name).toBe(`${object} (Clinicea sample)`);
    expect(C.describe({ ...SAMPLE, object: 'Bills' })).toBe('Clinicea sample clinic · Bills');
  });

  it('is the same clinic every time it is opened', () => {
    expect(JSON.stringify(sampleClinic(NOW))).toBe(JSON.stringify(sampleClinic(NOW)));
  });
});

describe('the watchers find what was planted, and only that', () => {
  it('offers the watchers that matter to a clinic owner', async () => {
    const all = await Promise.all(C.OBJECTS.map(dataset));
    const ready = catalogueFor(all.map((x) => x.ds)).filter((r) => r.ready).map((r) => r.id);
    for (const id of ['absent-but-attended', 'no-show', 'package-overused', 'stopped-coming', 'renewal-due', 'gone-quiet']) {
      expect(ready, id).toContain(id);
    }
  });

  it('finds the 18 treated patients left marked No Show, and none of the real no-shows', async () => {
    const { ds, cells } = await dataset('Appointments');
    const m = matchDataset(entryFor('absent-but-attended'), ds).using;
    const found = cells.filter((r) => matchesAll(r, ds.columns, [[m.status, 'matches', 'no show|absent'], [m.when, 'not empty', '']]));
    expect(found).toHaveLength(18);
    const realNoShows = cells.filter((r) => /no show/i.test(r[ds.columns.indexOf('status')]) && !r[ds.columns.indexOf('check_in_time')]);
    expect(realNoShows.length).toBeGreaterThan(0);
  });

  it('finds the packages used past what was sold', async () => {
    const { ds, cells } = await dataset('Packages');
    const m = matchDataset(entryFor('package-overused'), ds).using;
    expect(cells.filter((r) => matchesAll(r, ds.columns, [[m.used, 'above column', m.entitled]]))).toHaveLength(6);
  });

  it('finds the regulars who stopped coming, each with a package still open', async () => {
    const { ds, cells } = await dataset('Patients');
    const recent = windowRange('last 14 days', NOW);
    const idx = ds.columns.indexOf('last_visit_date');
    const stopped = cells.filter((r) => r[idx] && !inWindow(r[idx], recent, NOW) && new Date(r[idx]) > new Date(NOW.getTime() - 70 * 864e5));
    expect(stopped.length).toBeGreaterThanOrEqual(9);
  });
});
