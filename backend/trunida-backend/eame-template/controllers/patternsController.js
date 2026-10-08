/**
 * Learned churn patterns: what the application learned from the customers
 * who left, and the owner's say over it.
 *
 * GET    /api/patterns             — the definition, the learning status, the patterns
 * PUT    /api/patterns/definition  — the owner changes what "lost" means; learns again
 * POST   /api/patterns/learn       — learn again now
 * POST   /api/patterns/:id/approve — start watching for one pattern
 * POST   /api/patterns/:id/dismiss — never suggest it again
 *
 * A pattern never alerts until the owner approves it. See services/churnPatterns.js.
 */
import { plan } from './agentsController.js';
import { isOwner } from './accessController.js';
import { findingsCollection, startPatternAgent } from '../services/agentService.js';
import {
  currentDefinition, saveDefinition, definitionSentence, relearn, learningStatus,
  listPatterns, dismissPattern, patternsCollection, MIN_CHURNED,
} from '../services/churnPatterns.js';

const planned = () => plan().churn || null;
const findings = () => findingsCollection().find({}).toArray();

/** Open findings per learned-pattern agent, keyed by agent id. */
async function openByAgent() {
  const rows = await findingsCollection().aggregate([
    { $match: { watcherId: 'learned-pattern', state: 'open' } },
    { $group: { _id: '$agentId', n: { $sum: 1 } } },
  ]).toArray();
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
}

export async function relearnNow() {
  return relearn({ planned: planned(), findings: await findings() });
}

export async function listPatternsHandler(req, res) {
  try {
    const definition = await currentDefinition(planned());
    return res.json({
      canManage: await isOwner(req),
      definition: { ...definition, sentence: definitionSentence(definition) },
      status: (await learningStatus()) || { churned: 0, stayed: 0, enough: false, learnedAt: null, minChurned: MIN_CHURNED },
      patterns: await listPatterns(await openByAgent()),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not read the learned patterns.' });
  }
}

export async function putDefinitionHandler(req, res) {
  try {
    const b = req.body || {};
    const base = await currentDefinition(planned());
    const next = await saveDefinition({
      ...base,
      inactiveDays: b.inactiveDays === '' || b.inactiveDays == null ? null : Number(b.inactiveDays),
      gapMultiple: b.inactiveDays ? null : base.gapMultiple || 3,
      statusWords: Array.isArray(b.statusWords) ? b.statusWords : String(b.statusWords || '').split(','),
    });
    const status = await relearnNow();
    return res.json({ definition: { ...next, sentence: definitionSentence(next) }, status });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not save the definition.' });
  }
}

export async function learnHandler(req, res) {
  try {
    return res.json({ status: await relearnNow() });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not learn.' });
  }
}

export async function approveHandler(req, res) {
  try {
    const p = await patternsCollection().findOne({ _id: String(req.params.id) });
    if (!p) return res.status(404).json({ error: 'No such pattern.' });
    if (p.agentId) return res.json({ ok: true, agentId: p.agentId });
    const agent = await startPatternAgent({ patternId: p._id, label: p.label, tz: req.body?.tz || 'UTC' });
    await patternsCollection().updateOne({ _id: p._id }, { $set: { state: 'approved', agentId: agent.id, approvedAt: new Date() } });
    return res.json({ ok: true, agentId: agent.id });
  } catch (err) {
    // The watcher room is the plan's: say its sentence, as the agents route does.
    return res.status(err?.code === 'WATCHER_LIMIT' ? 403 : 400).json({ error: err.message || 'Could not start watching.' });
  }
}

export async function dismissHandler(req, res) {
  try {
    await dismissPattern(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(404).json({ error: err.message || 'No such pattern.' });
  }
}
