/**
 * Connecting LeadSquared, in the same steps as Zoho CRM.
 *
 * ── The order this happens in ─────────────────────────────────────────────
 *
 *   scan     the keys are good — here is what this account holds
 *   connect  one part: its shape, its dataset, its connection, its first read
 *
 * Zoho's one-click path finds every module holding a record and connects
 * each as its own dataset, one short request apiece so the page can count
 * them. Both CRMs sit behind the one CRM card, and somebody connecting either
 * should meet the same steps: keys or consent first, then the application
 * reads what is there without asking which parts.
 *
 * The difference is only the credential. Zoho's consent leaves a refresh
 * token that Svarg hands over once, held behind a handoff id; LeadSquared's
 * keys are typed by the owner and sent with each request, as every other
 * connector's credentials are. They are stored only once a part connects,
 * encrypted, like every connection's.
 *
 * Owner-only, like every route on this surface.
 */
import {
  createConnector, defineDataset, syncConnector, listConnectors, deleteConnector,
} from '../services/connectorService.js';
import { listPopulated, describeShape, OBJECTS } from '../services/connectors/leadsquared.js';

const keysOf = (body) => ({
  accessKey: String(body?.accessKey || '').trim(),
  secretKey: String(body?.secretKey || '').trim(),
});

/** Which parts of this account hold anything — and nothing else. */
export async function leadsquaredScan(req, res) {
  const keys = keysOf(req.body);
  if (!keys.accessKey || !keys.secretKey) return res.status(400).json({ error: 'Enter both the access key and the secret key.' });
  try {
    const parts = await listPopulated(keys);
    if (!parts.length) {
      return res.status(400).json({
        error: 'This LeadSquared account has no leads, activities or opportunities from the last year, '
          + 'so there is nothing to read yet.',
      });
    }
    return res.json({ parts });
  } catch (err) {
    // Wrong keys in every region lands here, said as the thing to fix.
    return res.status(400).json({ error: err.message });
  }
}

/**
 * One part: its shape, its dataset, its connection, and its first read.
 *
 * A failure here is that part's and nobody else's.
 */
export async function leadsquaredConnectOne(req, res) {
  const keys = keysOf(req.body);
  const object = String(req.body?.object || '').trim();
  const opportunityType = String(req.body?.opportunityType || '').trim();
  if (!OBJECTS.includes(object)) return res.status(400).json({ error: 'No part of LeadSquared was named.' });
  const label = String(req.body?.label || '').trim() || object;

  const config = { ...keys, object, opportunityType: object === 'Opportunities' ? opportunityType : '' };

  try {
    const shape = await describeShape(config);
    const dataset = await defineDataset({
      name: shape.name,
      columns: shape.columns,
      key: shape.key,
      internal: shape.internal,
      from: 'leadsquared',
    });

    // Reconnecting is a repair, and leaves one connection — as with Zoho.
    const already = (await listConnectors().catch(() => []))
      .filter((c) => c.kind === 'leadsquared' && c.datasetName === dataset.name);
    for (const old of already) await deleteConnector(old.id).catch(() => {});

    const made = await createConnector({ kind: 'leadsquared', datasetName: dataset.name, config, schedule: 'hourly' });

    let rows = null;
    try {
      const r = await syncConnector(made.id, { by: 'owner' });
      rows = r && typeof r.rows === 'number' ? r.rows : null;
    } catch (err) {
      // Connected, and it will be read again on the hour.
      console.error('[leadsquared] %s connected but the first read failed:', label, err.message);
    }
    return res.json({ module: label, dataset: dataset.name, columns: dataset.columns.length, rows });
  } catch (err) {
    console.error('[leadsquared] %s could not be connected:', label, err.message);
    return res.status(502).json({ error: err.message });
  }
}
