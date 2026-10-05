/**
 * Connecting Clinicea, in the same steps as Zoho CRM and LeadSquared.
 *
 * ── The order this happens in ─────────────────────────────────────────────
 *
 *   scan     the login works — here are the parts of Clinicea holding records
 *   connect  one part: its dataset, its connection, its first read
 *
 * Clinicea has no consent screen to send anybody to; its API takes an API key
 * and a staff login. So those are the first step, and everything after them
 * is Zoho's: find what holds records, connect each as its own dataset, one
 * short request apiece so the page can count them.
 *
 * The credentials are typed by the owner and sent with each request, as
 * LeadSquared's are, and stored only once a part connects, encrypted. Svarg
 * never sees them: there is nothing for Main to broker. Owner-only, like every
 * route on this surface.
 */
import {
  createConnector, defineDataset, syncConnector, listConnectors, deleteConnector,
} from '../services/connectorService.js';
import { listPopulated, describeShape, OBJECTS, isSample } from '../services/connectors/clinicea.js';
import { forgetDataset } from '../services/connectorService.js';
import { requestLookNow } from '../services/agentService.js';


/*
 * The sample clinic takes no credentials: sample is 'yes' and nothing else is
 * read. Anything else is a real account and needs all three.
 */
const credsOf = (body) => (String(body?.sample || '') === 'yes'
  ? { sample: 'yes' }
  : {
    apiKey: String(body?.apiKey || '').trim(),
    username: String(body?.username || '').trim(),
    password: String(body?.password || ''),
  });

const missing = (c) => (isSample(c) ? '' : (!c.apiKey || !c.username || !c.password
  ? 'Enter the Clinicea API key, the staff username and the staff password.' : ''));

/**
 * The sample clinic, gone, once a real Clinicea account connects.
 *
 * Its invented patients must never sit beside a clinic's real ones -- the
 * board would mix them and a report would count them. Forgetting the
 * datasets moves their watchers onto the real records on the next tick.
 */
export async function forgetSampleClinic() {
  const gone = [];
  for (const object of OBJECTS) {
    const name = describeShape({ object, sample: 'yes' }).name;
    if (await forgetDataset(name).catch(() => false)) gone.push(name);
  }
  if (gone.length) console.log('[clinicea] the real clinic connected; the sample is gone:', gone.join(', '));
  return gone;
}

/** Which parts of this clinic's Clinicea hold records -- and nothing else. */
export async function cliniceaScan(req, res) {
  const creds = credsOf(req.body);
  const wrong = missing(creds);
  if (wrong) return res.status(400).json({ error: wrong });
  try {
    const parts = await listPopulated(creds);
    if (!parts.length) {
      return res.status(400).json({ error: 'This Clinicea login can read no appointments, patients, packages or bills from the last year.' });
    }
    return res.json({ parts });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/** One part: its shape, its dataset, its connection, and its first read. */
export async function cliniceaConnectOne(req, res) {
  const creds = credsOf(req.body);
  const wrong = missing(creds);
  if (wrong) return res.status(400).json({ error: wrong });
  const object = String(req.body?.object || '').trim();
  if (!OBJECTS.includes(object)) return res.status(400).json({ error: 'No part of Clinicea was named.' });
  const label = String(req.body?.label || '').trim() || object;

  const config = { ...creds, object };
  try {
    if (!isSample(config)) await forgetSampleClinic();
    const shape = describeShape(config);
    const dataset = await defineDataset({
      name: shape.name, columns: shape.columns, key: shape.key, internal: shape.internal, from: 'clinicea',
    });

    // Reconnecting is a repair, and leaves one connection -- as with Zoho.
    const already = (await listConnectors().catch(() => []))
      .filter((c) => c.kind === 'clinicea' && c.datasetName === dataset.name);
    for (const old of already) await deleteConnector(old.id).catch(() => {});

    const made = await createConnector({ kind: 'clinicea', datasetName: dataset.name, config, schedule: 'hourly' });

    let rows = null;
    try {
      const r = await syncConnector(made.id, { by: 'owner' });
      rows = r && typeof r.rows === 'number' ? r.rows : null;
    } catch (err) {
      console.error('[clinicea] %s connected but the first read failed:', label, err.message);
    }
    // Its watchers run now, not at the next restart.
    requestLookNow();
    return res.json({ module: label, dataset: dataset.name, columns: dataset.columns.length, rows });
  } catch (err) {
    console.error('[clinicea] %s could not be connected:', label, err.message);
    return res.status(502).json({ error: err.message });
  }
}
