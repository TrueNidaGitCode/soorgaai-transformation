/**
 * Connecting Jira, in the same steps as Zoho CRM and LeadSquared.
 *
 * ── The order this happens in ─────────────────────────────────────────────
 *
 *   scan     the token is good — here are the projects that hold issues
 *   connect  one project: its dataset, its connection, its first read
 *
 * Every connector behind a top card on the Data page takes these steps: the
 * credential once, then the application reads what is there without asking
 * which part. Jira's parts are projects. Nobody is asked to type a project key
 * or write JQL; the projects holding issues are found and connected, each as
 * its own dataset, one short request apiece so the page can count them.
 *
 * ── Why the connector is loaded on demand ─────────────────────────────────
 *
 * services/connectors/jira.js ships only to an application whose industry
 * keeps its work in Jira. This controller ships to every application,
 * because routes/ is auto-mounted. A static import would make every other
 * application die on boot with "Cannot find module" -- which is what happened
 * to one with WhatsApp. So it is imported when a request asks for it, and an
 * application without it answers that Jira is not part of it.
 *
 * Owner-only, like every route on this surface. The token is the owner's own,
 * stored encrypted here once a project connects, and never sent to Svarg.
 */
import {
  createConnector, defineDataset, syncConnector, listConnectors, deleteConnector,
} from '../services/connectorService.js';

async function jira() {
  try {
    return await import('../services/connectors/jira.js');
  } catch {
    return null;
  }
}

const credsOf = (body) => ({
  siteUrl: String(body?.siteUrl || '').trim().replace(/\/+$/, ''),
  email: String(body?.email || '').trim(),
  apiToken: String(body?.apiToken || '').trim(),
});

function missing(c) {
  if (!/^https?:\/\//.test(c.siteUrl)) return 'The site address should start with https://';
  if (!c.email || !c.apiToken) return 'Enter the Atlassian email and the API token.';
  return '';
}

/** Which projects this token can see that hold any issue -- and nothing else. */
export async function jiraScan(req, res) {
  const j = await jira();
  if (!j) return res.status(404).json({ error: 'Jira is not part of this application.' });
  const creds = credsOf(req.body);
  const wrong = missing(creds);
  if (wrong) return res.status(400).json({ error: wrong });
  try {
    await j.test(creds);
    const projects = await j.listPopulated(creds);
    if (!projects.length) {
      return res.status(400).json({ error: 'This account can see no Jira project with an issue in it yet.' });
    }
    return res.json({ projects });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/** One project: its shape, its dataset, its connection, and its first read. */
export async function jiraConnectOne(req, res) {
  const j = await jira();
  if (!j) return res.status(404).json({ error: 'Jira is not part of this application.' });
  const creds = credsOf(req.body);
  const wrong = missing(creds);
  if (wrong) return res.status(400).json({ error: wrong });
  const key = String(req.body?.project || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return res.status(400).json({ error: 'No Jira project was named.' });
  const label = String(req.body?.label || '').trim() || key;

  const config = { ...creds, jql: key, projectName: label };
  try {
    const shape = await j.describeShape(config);
    const dataset = await defineDataset({
      name: shape.name, columns: shape.columns, key: shape.key, internal: shape.internal, from: 'jira',
    });

    // Reconnecting is a repair, and leaves one connection -- as with Zoho.
    const already = (await listConnectors().catch(() => []))
      .filter((c) => c.kind === 'jira' && c.datasetName === dataset.name);
    for (const old of already) await deleteConnector(old.id).catch(() => {});

    const made = await createConnector({ kind: 'jira', datasetName: dataset.name, config, schedule: 'hourly' });

    let rows = null;
    try {
      const r = await syncConnector(made.id, { by: 'owner' });
      rows = r && typeof r.rows === 'number' ? r.rows : null;
    } catch (err) {
      console.error('[jira] %s connected but the first read failed:', key, err.message);
    }
    return res.json({ module: label, dataset: dataset.name, columns: dataset.columns.length, rows });
  } catch (err) {
    console.error('[jira] %s could not be connected:', key, err.message);
    return res.status(502).json({ error: err.message });
  }
}
