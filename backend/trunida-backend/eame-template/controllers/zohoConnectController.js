/**
 * Connecting Zoho CRM in one click, from this application's side.
 *
 * Three steps, and the browser only ever carries an opaque id:
 *
 *   status  is the one-click path available on this Svarg server?
 *   start   open a consent; the browser is sent to the URL this returns
 *   finish  the browser came back with an id; claim the token and connect
 *
 * Owner-only, like every other route on this surface. The refresh token this
 * produces is the customer's own and is stored encrypted here, exactly as a
 * hand-typed one is: what Svarg brokered is the permission, not the data.
 */
import { available, startConsent, claimConsent } from '../services/svargZohoService.js';
import { createConnector } from '../services/connectorService.js';

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
 * The consent came back. Make the connection.
 *
 * The dataset and module are sent now rather than carried through Zoho:
 * they were chosen in this browser before the redirect and are no business
 * of Zoho's. The token is claimed over the gateway, so it never touches a
 * URL, a log or a browser history.
 */
export async function zohoFinish(req, res) {
  const handoff = String(req.body?.handoff || '').trim();
  const datasetName = String(req.body?.datasetName || '').trim();
  const moduleName = String(req.body?.module || '').trim() || 'Contacts';
  if (!handoff) return res.status(400).json({ error: 'No connection attempt was named.' });
  if (!datasetName) return res.status(400).json({ error: 'Choose which dataset the records go into.' });

  let claimed;
  try {
    claimed = await claimConsent(handoff);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const connector = await createConnector({
      kind: 'zoho-crm',
      datasetName,
      config: {
        region: claimed.region,
        refreshToken: claimed.refreshToken,
        module: moduleName,
        criteria: String(req.body?.criteria || '').trim(),
        // What tells the connector to ask Svarg for access tokens rather
        // than reach for a client secret it does not have.
        brokered: 'yes',
      },
      schedule: 'hourly',
    });
    return res.json({ connector });
  } catch (err) {
    /*
     * createConnector tests before it keeps, so reaching here means the
     * consent worked and Zoho still refused the read — almost always the
     * module name. Said as that, rather than as a failed connection.
     */
    return res.status(400).json({ error: err.message });
  }
}
