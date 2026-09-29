/**
 * The connectors on the Data page: owner only, every one of them.
 *
 * Thin on purpose. What a connector is, how its credentials are kept and how
 * a sync lands rows is all in services/connectorService.js; this turns
 * requests into those calls and errors into sentences.
 */
import {
  catalog, listConnectors, createConnector, updateConnector, testConnector, deleteConnector, syncConnector,
  freshenConnections,
} from '../services/connectorService.js';
import { connectionLimit } from '../services/coverage.js';

const fail = (res, err, code = 400) => res.status(code).json({ error: String(err?.message || err) });

export async function list(req, res) {
  try {
    /*
     * Opening this page is the signal to look again.
     *
     * Connections read every hour, which is right for a business running all
     * day and wrong for the moment somebody has just changed something in the
     * source and come here to see it. An hour of "the application disagrees
     * with my CRM" is the whole product's credibility, and the fix used to be
     * a Sync now button on every row — nine of them, each inviting somebody
     * to believe nothing happens unless they press it.
     *
     * So there is no button. Opening the page is the intent, and it is the
     * one moment where being current matters more than being cheap. Anything
     * read in the last few minutes is left alone, so reloading twice costs
     * nothing, and it never blocks the response: the page draws from what is
     * held and the rows arrive on the refresh the page already does when the
     * data changes.
     */
    freshenConnections().catch(() => {});

    const connectors = await listConnectors();
    res.json({
      kinds: catalog(),
      connectors,
      // So the page can say "2 of 2 used" rather than offering a button that
      // will be refused. null is no limit.
      connectionLimit: connectionLimit(),
      connectionsUsed: connectors.length,
    });
  } catch (err) { fail(res, err, 500); }
}

export async function create(req, res) {
  try {
    /*
     * The plan's second lever: how many places records may come from.
     *
     * Counted here rather than on the Svarg side, because this is where the
     * connectors actually are. An uploaded folder is not a connection -- it
     * is a file somebody dropped in, and charging for it would price the
     * cheapest way to get started out of the cheapest plan.
     */
    const limit = connectionLimit();
    if (limit) {
      const used = (await listConnectors()).length;
      if (used >= limit) {
        return fail(res, new Error(
          'Your plan connects ' + limit + ' data source' + (limit === 1 ? '' : 's')
          + ', and ' + used + ' ' + (used === 1 ? 'is' : 'are') + ' already connected. '
          + 'Remove one, or move to a plan that connects more.'), 403);
      }
    }
    const { kind, datasetName, config, mapping, schedule } = req.body || {};
    const c = await createConnector({ kind, datasetName, config: config || {}, mapping, schedule });
    res.status(201).json({ connector: c });
  } catch (err) { fail(res, err); }
}

export async function update(req, res) {
  try {
    const { config, mapping, schedule } = req.body || {};
    res.json({ connector: await updateConnector(req.params.id, { config, mapping, schedule }) });
  } catch (err) { fail(res, err); }
}

export async function test(req, res) {
  try {
    res.json(await testConnector(req.params.id));
  } catch (err) { fail(res, err); }
}

export async function sync(req, res) {
  try {
    const r = await syncConnector(req.params.id, { by: req.user?.role || 'owner' });
    res.json({ ok: true, ...r });
  } catch (err) { fail(res, err); }
}

export async function remove(req, res) {
  try {
    res.json(await deleteConnector(req.params.id));
  } catch (err) { fail(res, err); }
}
