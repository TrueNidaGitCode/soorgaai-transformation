/**
 * Connecting Zoho CRM, from this application's side.
 *
 * ── The order this happens in, and why ────────────────────────────────────
 *
 *   status   is the one-click path available on this Svarg server?
 *   start    open a consent; the browser is sent to the URL this returns
 *   modules  the browser came back — here are THEIR modules, by their labels
 *   finish   make the dataset from the module's own fields, and connect
 *
 * The consent comes first because everything worth asking can only be asked
 * afterwards. Before it, the only questions available are the ones nobody
 * should have to answer: type your module's API name, choose which of our
 * invented datasets this should pretend to be. After it, the CRM can be
 * asked what it actually holds.
 *
 * Owner-only, like every other route on this surface. The refresh token is
 * the customer's own and is stored encrypted here: Svarg brokered the
 * permission, it did not take custody of the data.
 */
import { available, startConsent, claimConsent } from '../services/svargZohoService.js';
import { createConnector, defineDataset } from '../services/connectorService.js';
import { listModules, listPopulated, describeShape } from '../services/connectors/zohocrm.js';

/*
 * The token between the consent and the connection.
 *
 * Claiming it from Svarg can only happen once, and the questions that follow
 * — which module, and therefore which fields — need it. So it is held here,
 * in this container's memory, for as long as it takes somebody to read a
 * list and pick. Not written to the database: a connection that is never
 * finished should leave nothing behind.
 */
const HOLD_MS = 15 * 60 * 1000;
const held = new Map();

function hold(handoff, value) {
  for (const [k, v] of held) if (v.until <= Date.now()) held.delete(k);
  held.set(handoff, { ...value, until: Date.now() + HOLD_MS });
}

function heldFor(handoff) {
  const h = held.get(String(handoff || ''));
  if (!h || h.until <= Date.now()) return null;
  return h;
}

export async function zohoStatus(req, res) {
  try {
    return res.json({ available: await available() });
  } catch {
    // Unavailable, not broken: the Data page falls back to the manual fields.
    return res.json({ available: false });
  }
}

export async function zohoStart(req, res) {
  try {
    const r = await startConsent({
      region: String(req.body?.region || 'com'),
      // Where Svarg returns the browser. Checked there against the address
      // recorded for this deployment rather than trusted as sent.
      back: String(req.body?.back || ''),
    });
    if (!r.ok) {
      return res.status(r.reason === 'not-configured' ? 503 : 502).json({
        error: r.reason === 'not-configured'
          ? 'One-click connection is not set up on this Svarg server.'
          : r.reason,
      });
    }
    return res.json({ url: r.url });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}

/**
 * The consent came back. Ask the CRM what it holds.
 *
 * This is the only moment the refresh token is claimed, so the answer is
 * kept against the handoff for the one question that follows it.
 */
export async function zohoModules(req, res) {
  const handoff = String(req.body?.handoff || '').trim();
  if (!handoff) return res.status(400).json({ error: 'No connection attempt was named.' });

  let creds = heldFor(handoff);
  if (!creds) {
    try {
      const claimed = await claimConsent(handoff);
      creds = { refreshToken: claimed.refreshToken, region: claimed.region };
      hold(handoff, creds);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  try {
    const modules = await listModules({
      region: creds.region, refreshToken: creds.refreshToken, brokered: 'yes',
    });
    return res.json({ modules, region: creds.region });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}

/**
 * Connect everything in this CRM that holds anything.
 *
 * ── Why nobody is asked which module ──────────────────────────────────────
 *
 * Zoho ships around forty modules and a business uses a handful. A dropdown
 * of all of them asks somebody to tell the software something the software
 * can find out in three seconds — and "which module are your appointments
 * in" is a question a clinic owner often cannot answer, because a consultant
 * set it up two years ago.
 *
 * So every module is asked whether it holds a record, and the ones that do
 * are connected. Each becomes its own dataset, with that module's own fields
 * as columns and Zoho's record id as the key. Nothing maps, so nothing is
 * dropped — a package and a session count survive because nobody had to
 * think of them in advance.
 *
 * A module that fails to connect does not stop the others. A CRM where one
 * module is locked down should still give up the rest.
 */
const MOST_AT_ONCE = 15;

export async function zohoFinish(req, res) {
  const handoff = String(req.body?.handoff || '').trim();
  const creds = heldFor(handoff);
  if (!creds) return res.status(400).json({ error: 'That connection attempt has expired. Press Connect again.' });

  const base = { region: creds.region, refreshToken: creds.refreshToken, brokered: 'yes' };

  let populated;
  try {
    const all = await listModules(base);
    populated = (await listPopulated(base, all)).slice(0, MOST_AT_ONCE);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
  if (!populated.length) {
    return res.status(400).json({
      error: 'Every module in this Zoho account is empty, so there is nothing to read yet. '
        + 'Add a record and connect again.',
    });
  }

  const connected = [];
  const skipped = [];
  for (const m of populated) {
    const config = { ...base, module: m.apiName, criteria: '' };
    try {
      const shape = await describeShape(config);
      /*
       * Named for the module and the system, because a business can keep
       * people in more than one place and "Contacts" alone stops being an
       * answer the moment a second CRM or a spreadsheet arrives.
       */
      const dataset = await defineDataset({
        name: `${m.label} (Zoho CRM)`,
        columns: shape.columns,
        key: shape.key,
        from: 'zoho-crm',
      });
      await createConnector({ kind: 'zoho-crm', datasetName: dataset.name, config, schedule: 'hourly' });
      connected.push({ module: m.label, dataset: dataset.name, columns: dataset.columns.length });
    } catch (err) {
      console.error('[zoho] %s could not be connected:', m.apiName, err.message);
      skipped.push({ module: m.label, reason: err.message });
    }
  }

  if (!connected.length) {
    return res.status(502).json({
      error: 'Zoho approved, but none of the modules holding records could be read. '
        + (skipped[0] ? skipped[0].reason : ''),
    });
  }

  held.delete(handoff);
  return res.json({ connected, skipped });
}

/** Kept for the manual path, which still names one module. */
export async function zohoFinishOne(req, res) {
  const handoff = String(req.body?.handoff || '').trim();
  const moduleName = String(req.body?.module || '').trim();
  if (!moduleName) return res.status(400).json({ error: 'Choose which module to read.' });

  const creds = heldFor(handoff);
  if (!creds) return res.status(400).json({ error: 'That connection attempt has expired. Press Connect again.' });

  const config = {
    region: creds.region,
    refreshToken: creds.refreshToken,
    module: moduleName,
    criteria: String(req.body?.criteria || '').trim(),
    brokered: 'yes',
  };

  let shape;
  try {
    shape = await describeShape(config);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  try {
    const dataset = await defineDataset({
      name: `${shape.name} (Zoho CRM)`,
      columns: shape.columns,
      key: shape.key,
      from: 'zoho-crm',
    });

    const connector = await createConnector({
      kind: 'zoho-crm',
      datasetName: dataset.name,
      config,
      schedule: 'hourly',
    });
    held.delete(handoff);
    return res.json({ connector, dataset: { name: dataset.name, columns: dataset.columns.length } });
  } catch (err) {
    /*
     * Two very different things land here, and telling them apart is the
     * difference between a message somebody can act on and one they cannot.
     *
     * createConnector tests before it keeps, so a refusal from Zoho — a
     * module that cannot be read, a scope that was not granted — arrives as
     * a sentence about Zoho, and is passed on as one.
     *
     * A fault in this application arrives as whatever the runtime threw.
     * "Cannot read properties of undefined (reading 'replace')" was the real
     * one: a dataset created without a slug, thrown from three calls deep on
     * the first sync, reported to the customer as an untraceable error on a
     * connection that had just succeeded. Those are logged with the step
     * they came from, so the next one can be found from the logs instead of
     * guessed at.
     */
    const zoho = /zoho|module|scope|token|refused/i.test(err.message || '');
    if (!zoho) {
      console.error('[zoho] connecting %s failed after the consent:', moduleName, err);
      return res.status(500).json({
        error: 'Zoho approved, but this application could not finish the connection. '
          + 'The reason has been logged: ' + (err.message || 'no message'),
      });
    }
    return res.status(400).json({ error: err.message });
  }
}
