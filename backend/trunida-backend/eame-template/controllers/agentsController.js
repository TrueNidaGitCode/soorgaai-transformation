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

    return res.json({ agents: withFindings, schedules: Object.keys(SCHEDULES) });
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
