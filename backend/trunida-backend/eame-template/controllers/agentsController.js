/**
 * The agents in this application, and what they have found.
 *
 * Thin on purpose: every decision an agent makes lives in agentService, where
 * it is pure and tested. This layer reads a request, hands it over, and turns
 * a refusal into a sentence somebody can act on.
 */
import {
  listAgents, createAgent, setAgentEnabled, deleteAgent,
  findingsCollection, SCHEDULES,
} from '../services/agentService.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { catalogueFor, entryFor, fillQuestion, matchDataset } from '../services/agentCatalogue.js';
import { readIndex } from '../services/connectorService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * Cob's reading of which watchers matter here, written by Eame.
 *
 * The same shape as data/sources.json, and it degrades the same way: no file
 * means the default order, and the application works. Cob's judgement is an
 * improvement, never a dependency — and it can promote an entry but never
 * remove one.
 */
function plan() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'agents.json'), 'utf8')) || {}; }
  catch { return {}; }
}

const bad = (res, err) => res.status(400).json({ error: err.message || String(err) });

export async function listAgentsHandler(req, res) {
  try {
    const agents = await listAgents();

    /*
     * What each one is currently holding open.
     *
     * The board is the durable copy: an owner who missed the message, or whose
     * application cannot reach Svarg at all, still sees everything the agents
     * noticed. That is why a finding is recorded before anything is sent, and
     * why nothing here depends on the sending having worked.
     */
    const withFindings = [];
    for (const a of agents) {
      const open = await findingsCollection()
        .find({ agentId: new mongoose.Types.ObjectId(a.id), state: 'open' })
        .sort({ firstSeenAt: -1 })
        .limit(20)
        .toArray()
        .catch(() => []);
      withFindings.push({
        ...a,
        open: open.map(f => ({ key: f.key, since: f.firstSeenAt || null })),
        openCount: open.length,
      });
    }

    /*
      * What this application could be watching, alongside what it is.
      *
      * The whole catalogue, every time. An entry the data cannot support is
      * shown greyed with the records it would need, because that line is what
      * makes somebody connect a source — and an entry withheld would be
      * undiscoverable.
      */
    const running = new Set(withFindings.map((a) => a.name));
    const catalogue = catalogueFor(readIndex(), plan())
      .map((c) => ({ ...c, running: running.has(c.name) }));

    return res.json({
      agents: withFindings,
      catalogue,
      areas: [...new Set(catalogue.map((c) => c.area))],
      schedules: Object.keys(SCHEDULES),
    });
  } catch (err) {
    console.error('[agents] list failed:', err.message);
    return res.status(500).json({ error: 'Could not read the agents.' });
  }
}

export async function createAgentHandler(req, res) {
  try {
    const { name, question, schedule, atHour, tz, condition } = req.body || {};
    const agent = await createAgent({ name, question, schedule, atHour, tz, condition });
    return res.status(201).json({ agent });
  } catch (err) {
    return bad(res, err);
  }
}

export async function patchAgentHandler(req, res) {
  try {
    if (typeof req.body?.enabled !== 'boolean') {
      return bad(res, new Error('Say whether it should be enabled.'));
    }
    const agent = await setAgentEnabled(req.params.id, req.body.enabled);
    return res.json({ agent });
  } catch (err) {
    return bad(res, err);
  }
}

export async function deleteAgentHandler(req, res) {
  try {
    await deleteAgent(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }
}

/**
 * Start watching one of the catalogue entries.
 *
 * The question is built from the columns that actually matched, not from
 * the words in the catalogue — so the agent asks about this application’s
 * own column names and the answer pipeline has something it can plan.
 */
export async function startFromCatalogueHandler(req, res) {
  try {
    const entry = entryFor(req.params.id);
    if (!entry) return res.status(404).json({ error: 'No such watcher.' });

    let match = null;
    for (const d of readIndex()) { match = matchDataset(entry, d); if (match) break; }
    if (!match) {
      return res.status(400).json({ error: `Nothing here holds the records this needs yet.` });
    }

    const agent = await createAgent({
      name: entry.name,
      question: fillQuestion(entry, match),
      schedule: req.body?.schedule || 'weekdays',
      atHour: Number.isInteger(req.body?.atHour) ? req.body.atHour : 7,
      tz: req.body?.tz || 'UTC',
      condition: entry.condition || null,
    });
    return res.status(201).json({ agent });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
