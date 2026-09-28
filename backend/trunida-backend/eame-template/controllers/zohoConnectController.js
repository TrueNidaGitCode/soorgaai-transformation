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
import { createConnector, defineDataset, syncConnector } from '../services/connectorService.js';
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

/**
 * The credentials behind a handoff: already held, or claimed now.
 *
 * Svarg hands a refresh token over once and once only, so whichever step
 * asks first has to be the one that claims. That used to be the module
 * listing; when the listing went, nothing claimed at all and finishing
 * reported "that connection attempt has expired" about a consent that had
 * just succeeded — the id was good, there was simply nothing behind it.
 *
 * So the claim lives here rather than in a step, and any step can be first.
 */
async function credsFor(handoff) {
  const already = heldFor(handoff);
  if (already) return already;
  const claimed = await claimConsent(handoff);
  const creds = { refreshToken: claimed.refreshToken, region: claimed.region };
  hold(handoff, creds);
  return creds;
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

  let creds;
  try {
    creds = await credsFor(handoff);
  } catch (err) {
    return res.status(400).json({ error: err.message });
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

/**
 * Which modules hold anything — and nothing else.
 *
 * Split out from connecting so the browser can show what is really
 * happening. Reading nine modules takes twenty or thirty seconds, and a
 * single request that returns at the end of it leaves a page with nothing
 * true to say meanwhile: a spinner that claims progress it cannot see is a
 * worse answer than no spinner.
 *
 * So this answers quickly with the list, the browser draws it, and each
 * module is connected by its own short request. The progress is then a fact
 * rather than an animation — and no single request is long enough for a
 * proxy to lose patience with.
 */
export async function zohoScan(req, res) {
  const handoff = String(req.body?.handoff || '').trim();
  if (!handoff) return res.status(400).json({ error: 'No connection attempt was named.' });

  let creds;
  try {
    creds = await credsFor(handoff);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const base = { region: creds.region, refreshToken: creds.refreshToken, brokered: 'yes' };
  try {
    const all = await listModules(base);
    const populated = (await listPopulated(base, all)).slice(0, MOST_AT_ONCE);
    if (!populated.length) {
      return res.status(400).json({
        error: 'Every module in this Zoho account is empty, so there is nothing to read yet. '
          + 'Add a record and connect again.',
      });
    }
    return res.json({ modules: populated.map((m) => ({ apiName: m.apiName, label: m.label })) });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}

/**
 * One module: its shape, its dataset, its connection, and its first read.
 *
 * One at a time because that is what lets the page count them. A failure
 * here is that module's failure and nobody else's — a CRM where one module
 * is locked down should still give up the rest.
 */
export async function zohoConnectOne(req, res) {
  const handoff = String(req.body?.handoff || '').trim();
  const apiName = String(req.body?.module || '').trim();
  const label = String(req.body?.label || '').trim() || apiName;
  if (!apiName) return res.status(400).json({ error: 'No module was named.' });

  let creds;
  try {
    creds = await credsFor(handoff);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const config = {
    region: creds.region, refreshToken: creds.refreshToken,
    module: apiName, criteria: '', brokered: 'yes',
  };

  try {
    const shape = await describeShape(config);
    const dataset = await defineDataset({
      name: `${label} (Zoho CRM)`,
      columns: shape.columns,
      key: shape.key,
      from: 'zoho-crm',
    });
    const made = await createConnector({ kind: 'zoho-crm', datasetName: dataset.name, config, schedule: 'hourly' });

    let rows = null;
    try {
      const r = await syncConnector(made.id, { by: 'owner' });
      rows = r && typeof r.rows === 'number' ? r.rows : null;
    } catch (err) {
      // Connected, and it will be read again on the hour.
      console.error('[zoho] %s connected but the first read failed:', apiName, err.message);
    }
    return res.json({ module: label, dataset: dataset.name, columns: dataset.columns.length, rows });
  } catch (err) {
    console.error('[zoho] %s could not be connected:', apiName, err.message);
    return res.status(502).json({ error: err.message });
  }
}

export async function zohoFinish(req, res) {
  const handoff = String(req.body?.handoff || '').trim();
  if (!handoff) return res.status(400).json({ error: 'No connection attempt was named.' });

  let creds;
  try {
    creds = await credsFor(handoff);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

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
      const made = await createConnector({ kind: 'zoho-crm', datasetName: dataset.name, config, schedule: 'hourly' });
      /*
       * And read it now.
       *
       * createConnector schedules; it does not fetch. So a page that had
       * just reported nine connections showed nine rows of "Not synced yet"
       * and no records, and would have gone on doing so for up to an hour.
       * Somebody who has just connected their CRM is standing in front of
       * the screen — that is the moment the data should arrive.
       *
       * A module whose first read fails is still connected and will be
       * retried on the hour, so the failure is logged rather than unwound.
       */
      let rows = null;
      try {
        const r = await syncConnector(made.id, { by: 'owner' });
        rows = r && typeof r.rows === 'number' ? r.rows : null;
      } catch (err) {
        console.error('[zoho] %s connected but the first read failed:', m.apiName, err.message);
      }
      connected.push({ module: m.label, dataset: dataset.name, columns: dataset.columns.length, rows });
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

  let creds;
  try {
    creds = await credsFor(handoff);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

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
