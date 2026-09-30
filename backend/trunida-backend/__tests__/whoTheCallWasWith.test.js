/**
 * Who the call was WITH, which is not always who it was from.
 *
 * ── Measured on the first outbound call ────────────────────────────────────
 *
 * A clinic rang a patient back about a package he had asked about. Exotel
 * reported it honestly:
 *
 *     From  07349250500     the clinic's own line
 *     To    7349250983      the patient
 *
 * The connector took `from` for both the name and the phone. So the finding
 * was titled with the clinic's own number, and the patient's number appeared
 * nowhere in the application at all — fetched from Exotel, parsed correctly,
 * and then dropped, because `provides` had no column for it.
 *
 * The owner went looking for the patient's number in the data and could not
 * find it. Half of a clinic's calls are outbound — the reminder, the result,
 * the call back somebody promised — and on every one of them the customer is
 * `to`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import * as phone from '../eame-template/services/connectors/phone.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('which number is the customer', () => {
  it('is the one called, on a call the clinic made', () => {
    expect(phone.otherParty({ direction: 'out', from: '07349250500', to: '7349250983' }))
      .toBe('7349250983');
  });

  it('is the one calling, on a call the clinic received', () => {
    expect(phone.otherParty({ direction: 'in', from: '9845012345', to: '08047188888' }))
      .toBe('9845012345');
  });

  it('is the one calling when the provider did not say which way it went', () => {
    // An unknown call is far more often one that came in.
    expect(phone.otherParty({ direction: '', from: '9845012345', to: '08047188888' }))
      .toBe('9845012345');
  });

  it('falls back rather than returning nothing', () => {
    expect(phone.otherParty({ direction: 'out', from: '07349250500', to: '' })).toBe('07349250500');
    expect(phone.otherParty({ direction: 'in', from: '', to: '08047188888' })).toBe('08047188888');
    expect(phone.otherParty({})).toBe('');
  });
});

describe('what a call row carries', () => {
  const src = read('../eame-template/services/connectors/phone.js');

  it('puts the customer in the name and the phone', () => {
    expect(src).toContain('name: c.name || otherParty(c),');
    expect(src).toContain('phone: otherParty(c),');
  });

  it('no longer takes whichever end happened to dial', () => {
    expect(src).not.toContain("phone: c.from || '',");
  });

  it('keeps both numbers as the provider reported them', () => {
    // So a row can be checked against the provider's own record of it.
    expect(phone.provides).toContain('called_from');
    expect(phone.provides).toContain('called_to');
    expect(src).toContain("called_from: c.from || '',");
    expect(src).toContain("called_to: c.to || '',");
  });

  it('marks those two as bookkeeping, so no watcher binds a person to them', () => {
    /*
     * A watcher binding "who" to called_from would be right half the time and
     * name the clinic the other half. `phone` is the column that means the
     * customer, whichever way the call went.
     */
    const internal = phone.describeShape({ provider: 'exotel' }).internal;
    expect(internal).toContain('called_from');
    expect(internal).toContain('called_to');
    expect(internal).not.toContain('phone');
    expect(internal).not.toContain('name');
  });
});

/**
 * And the shape has to reach a dataset that already exists.
 *
 * Fixing the connector fixed nothing on the application that found this: the
 * dataset had been defined when the connection was made and had no column for
 * the new field to land in.
 */
describe('a source that has learned to report more', () => {
  const svc = read('../eame-template/services/connectorService.js');
  const sync = svc.slice(svc.indexOf('export async function syncConnector'), svc.indexOf('// ── The schedule ──'));

  it('adds the columns it did not have', () => {
    expect(sync).toContain('const shape = await kind.describeShape(openConfig(kind, doc.config));');
    expect(sync).toContain('.filter((c) => !(dataset.columns || []).includes(c))');
  });

  it('only ever adds them', () => {
    // Removing one would drop rows somebody has, and a source that stops
    // reporting something is no reason to throw away what it reported before.
    expect(sync).toContain('...(dataset.columns || []).filter((c) => c !== \'_source\'), ...missing');
  });

  it('needs no change to a mapping the owner may have adjusted', () => {
    // mapOntoColumns falls back to the column's own name.
    expect(svc).toContain("const v = from ? o[from] : (c in o ? o[c] : '');");
  });

  it('carries the bookkeeping across with them', () => {
    expect(sync).toContain('internal: [...new Set([...(dataset.internal || []), ...(shape.internal || [])])]');
  });

  it('reads the dataset back, because it has just changed', () => {
    expect(sync).toContain('dataset = findDataset(doc.datasetName);');
  });
});
