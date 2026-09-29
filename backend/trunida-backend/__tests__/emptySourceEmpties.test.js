/**
 * Deleting records in the source deletes them here.
 *
 * ── Measured on a live application ─────────────────────────────────────────
 *
 * Eight Zoho modules were emptied in the CRM. Every sync read zero rows and
 * recorded a clean run — and the application went on holding every one of
 * them. Leads, Deals, Tasks, Notes and Calls that no longer existed anywhere
 * were still on the Data page and still producing findings, including a
 * "promise overdue" about three sample contacts that had been deleted.
 *
 *     Leads (Zoho CRM)   synced=07:43  lastRows=0  held=10
 *     Deals (Zoho CRM)   synced=07:43  lastRows=0  held=10
 *     Tasks (Zoho CRM)   synced=07:43  lastRows=0  held=12
 *
 * Two guards conspired. syncConnector returned before landing anything when a
 * pull came back empty, and landRows refuses empty rows outright.
 *
 * The second guard is right for a person uploading a file: an empty
 * spreadsheet is a mistake, not an instruction to delete everything. It is
 * wrong for a connection that has read the whole of a module and found it
 * empty — which is exactly what emptying that module looks like.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const svc = read('../eame-template/services/connectorService.js');
const ctl = read('../eame-template/controllers/dataController.js');

const sync = svc.slice(svc.indexOf('export async function syncConnector'), svc.indexOf('// ── The schedule ──'));

describe('a source that has been emptied', () => {
  it('no longer returns before landing anything', () => {
    expect(sync).not.toContain("return { rows: 0, message: 'The source returned nothing to import.' };");
  });

  it('lands the emptiness, as the whole of what the source holds', () => {
    expect(sync).toContain("mode: 'replace', complete: true, allowEmpty: true");
  });

  it('still records the run and the count', () => {
    expect(sync).toContain('lastSyncAt: new Date(), lastRows: landed.rows');
  });
});

describe('who may empty a dataset', () => {
  it('is opt-in, not inferred from the mode', () => {
    expect(svc).toContain('allowEmpty = false');
    expect(svc).toContain("if (!Array.isArray(rows) || (!rows.length && !allowEmpty)) throw new Error('No rows to land.');");
  });

  it('is not the upload path, which refuses an empty file before it gets here', () => {
    // An empty spreadsheet is a mistake, not an instruction.
    expect(ctl).toContain("if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows were sent.' });");
    const upload = ctl.slice(ctl.indexOf('const landed = await landRows({'), ctl.indexOf('res.json({ ok: true, datasetName: dataset.name'));
    expect(upload).not.toContain('allowEmpty');
  });

  it('only counts as empty when the source answered, because a read that fails throws', () => {
    expect(sync).toContain('} catch (err) {');
    expect(sync).toContain("status: 'error', lastError:");
  });
});

/**
 * And opening the Data page is the signal to look again.
 *
 * Connections read every hour — right for a business running all day, wrong
 * for the moment somebody has just changed something in the source and come
 * here to see it. An hour of "the application disagrees with my CRM" is the
 * whole product's credibility.
 *
 * The old answer was a Sync now button on every row. Nine of them, each
 * inviting somebody to believe that nothing happens unless they press it. So
 * there is no button: opening the page IS the intent.
 */
describe('opening the Data page', () => {
  const conn = read('../eame-template/controllers/connectorController.js');
  const freshen = svc.slice(svc.indexOf('export async function freshenConnections'), svc.indexOf('// ── The schedule ──'));

  it('reads anything that has gone stale', () => {
    expect(conn).toContain('freshenConnections()');
  });

  it('never makes the page wait for a slow CRM', () => {
    // Not awaited: the page draws from what is held, and redraws when the
    // data changes.
    expect(conn).toContain('freshenConnections().catch(() => {});');
  });

  it('leaves alone anything read a moment ago, so reloading costs nothing', () => {
    expect(freshen).toContain('now - last >= FRESHEN_MS');
    expect(svc).toContain('export const FRESHEN_MS = 2 * 60 * 1000;');
  });

  it('does not start a second read of something already syncing', () => {
    expect(freshen).toContain("if (running.has(String(d._id))) return false;");
  });

  it('adds no button, because a button invites somebody to press it', () => {
    const ui = read('../eame-template/frontend/data.js');
    expect(ui).not.toContain('data-sync=');
    // And nothing tells anybody to press one. That sentence outlived the
    // button by several releases.
    expect(ui).not.toContain('Press Sync now');
  });
});
