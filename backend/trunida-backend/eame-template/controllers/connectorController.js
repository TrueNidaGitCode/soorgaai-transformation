/**
 * The connectors on the Data page: owner only, every one of them.
 *
 * Thin on purpose. What a connector is, how its credentials are kept and how
 * a sync lands rows is all in services/connectorService.js; this turns
 * requests into those calls and errors into sentences.
 */
import {
  catalog, listConnectors, createConnector, updateConnector, testConnector, deleteConnector, syncConnector,
} from '../services/connectorService.js';

const fail = (res, err, code = 400) => res.status(code).json({ error: String(err?.message || err) });

export async function list(req, res) {
  try {
    res.json({ kinds: catalog(), connectors: await listConnectors() });
  } catch (err) { fail(res, err, 500); }
}

export async function create(req, res) {
  try {
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
