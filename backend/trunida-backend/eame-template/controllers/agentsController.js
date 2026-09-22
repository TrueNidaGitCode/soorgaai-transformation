/**
 * The agents in this application, and what they have found.
 *
 * Thin on purpose: every decision an agent makes lives in agentService, where
 * it is pure and tested. This layer reads a request, hands it over, and turns
 * a refusal into a sentence somebody can act on.
 */
import {
  listAgents, createAgent, setAgentEnabled, deleteAgent,
  findingsCollection, SCHEDULES, adoptTimezone,
} from '../services/agentService.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { catalogueFor, entryFor, fillQuestion, matchDataset, severityFor } from '../services/agentCatalogue.js';
import { readIndex } from '../services/connectorService.js';
import { draftFollowUp } from '../services/draftService.js';
import { sendSignal } from '../services/tenantSignals.js';

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
export function plan() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'agents.json'), 'utf8')) || {}; }
  catch { return {}; }
}

const bad = (res, err) => res.status(400).json({ error: err.message || String(err) });

/**
 * Which business category a watcher belongs to, for this industry.
 *
 * The table comes from the industry knowledge base and is written into
 * data/agents.json at delivery. An application whose industry has no table
 * gets none, and the board falls back to the generic areas every watcher
 * already carries.
 *
 * A watcher the table does not name lands in the last category rather than in
 * one called Other -- a business does not have an Other, and an escape hatch
 * is where findings quietly go to be ignored.
 */
function categoryOf(watcherId) {
  const cats = plan().categories;
  if (!Array.isArray(cats) || !cats.length) return '';
  for (const c of cats) if ((c.watchers || []).includes(watcherId)) return c.name;
  return cats[cats.length - 1].name;
}

/** The shape the board and the detail screen both read. */
function findingView(f) {
  return {
    id: String(f._id),
    key: f.key,
    title: f.title || f.key,
    watcher: f.agentName || '',
    watcherId: f.watcherId || '',
    category: categoryOf(f.watcherId || ''),
    severity: f.severity || 'medium',
    state: f.state || 'open',
    since: f.firstSeenAt || null,
    lastSeenAt: f.lastSeenAt || null,
    resolvedAt: f.resolvedAt || null,
    evidence: f.evidence || null,
  };
}

/**
 * Everything open, worst first — the first screen of the application.
 *
 * ── Why this is not owner-only ─────────────────────────────────────────────
 *
 * Deciding WHAT is watched is the owner's: a watcher runs unattended and sends
 * mail in their name. Reading what it found is not. The person who chases the
 * parent who stopped coming is the front desk, and a product whose whole
 * promise is "nothing important gets missed" cannot hide the findings from the
 * person who would act on them.
 *
 * Severity first, then longest-open — a thing that has been true for three
 * weeks is worse than one noticed this morning, and neither of those is a
 * judgement the model makes.
 */
export async function listFindingsHandler(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) return res.json({ open: [], resolved: [], counts: {} });

    const open = await findingsCollection()
      .find({ state: 'open' }).sort({ firstSeenAt: 1 }).limit(200).toArray();

    // Resolved is a reassurance, not a to-do list: the most recent handful.
    const resolved = await findingsCollection()
      .find({ state: 'resolved' }).sort({ resolvedAt: -1 }).limit(20).toArray();

    const RANK = { high: 0, medium: 1, low: 2 };
    const rows = open.map(findingView).sort((a, b) =>
      (RANK[a.severity] ?? 1) - (RANK[b.severity] ?? 1)
      || new Date(a.since || 0) - new Date(b.since || 0));

    const counts = { high: 0, medium: 0, low: 0 };
    for (const r of rows) counts[r.severity] = (counts[r.severity] || 0) + 1;

    /*
     * The business categories, in the order the industry's table names them,
     * each with how many open findings sit under it.
     *
     * Every category, including the ones at zero. A board that drops its empty
     * headings changes shape depending on the morning, and a quiet day then
     * looks like a broken application rather than a good one: the reader sees
     * an empty panel where a structure used to be.
     *
     * Five categories reading zero is a sentence — we watched all of these and
     * they are clear — and it is a better one than "nothing to show". The
     * screen keeps its shape and the numbers do the talking.
     */
    const defined = Array.isArray(plan().categories) ? plan().categories : [];
    const byCategory = defined.map(c => ({
      name: c.name,
      asks: c.asks || '',
      count: rows.filter(r => r.category === c.name).length,
    }));

    const agents = await listAgents();
    return res.json({
      open: rows,
      resolved: resolved.map(findingView),
      counts,
      categories: byCategory,
      examples: rows.length ? [] : examples(),
      watching: agents.filter(a => a.enabled && a.status !== 'degraded').length,
      degraded: agents.filter(a => a.status === 'degraded').length,
      // So the screen can say "your first check is at 09:30" instead of
      // showing an empty board that looks like a broken product.
      nextDueAt: agents.map(a => a.nextDueAt).filter(Boolean).sort()[0] || null,
      everRan: agents.some(a => a.lastRunAt),
    });
  } catch (err) {
    console.error('[findings] list failed:', err.message);
    return res.status(500).json({ error: 'Could not read the findings.' });
  }
}

/**
 * What a finding will look like, for a board that has none.
 *
 * A first-time reader opens this screen, sees nothing, and cannot tell a
 * working application from a broken one -- and a customer being shown the
 * product sees a blank page where the whole promise was supposed to be.
 *
 * So when there is nothing open, the board shows one example per category.
 * Every word of it is true and already in the application: the category is
 * the industry's, the watcher is one this application actually has, and the
 * question is the one it actually asks, with this customer's own dataset
 * named in it. Nothing is invented -- no person, no number, no date -- because
 * an example finding carrying a made-up client would be indistinguishable
 * from a real one the moment somebody screenshots it.
 *
 * They are returned under their own key, never mixed into `open`, so no
 * count, chip or digest can ever include one.
 */
function examples() {
  const cats = Array.isArray(plan().categories) ? plan().categories : [];
  const ready = catalogueFor(readIndex(), plan()).filter(c => c.ready && c.question);
  if (!ready.length) return [];

  // One per category, in the industry's order, so the examples line up with
  // the chips above them. An application whose industry named no categories
  // still gets a few, taken in the catalogue's own order.
  const out = [];
  if (cats.length) {
    for (const c of cats) {
      const pick = ready.find(e => categoryOf(e.id) === c.name);
      if (pick) out.push({ ...pick, category: c.name });
    }
  }
  for (const e of ready) {
    if (out.length >= 5) break;
    if (!out.some(o => o.id === e.id)) out.push({ ...e, category: categoryOf(e.id) });
  }
  return out.slice(0, 5).map(e => ({
    id: e.id,
    category: e.category || '',
    watcher: e.name,
    says: e.says,
    question: e.question,
    dataset: e.using || '',
    severity: e.severity || 'medium',
  }));
}

/** One finding, with the evidence behind it. The screen that earns trust. */
export async function getFindingHandler(req, res) {
  try {
    const _id = new mongoose.Types.ObjectId(String(req.params.id));
    const f = await findingsCollection().findOne({ _id });
    if (!f) return res.status(404).json({ error: 'No such finding.' });
    return res.json({ finding: findingView(f) });
  } catch {
    return res.status(404).json({ error: 'No such finding.' });
  }
}

/**
 * Write the follow-up. Do not send it.
 *
 * The facts come from the finding's stored evidence — computed in code and
 * validated before it was written down. The model supplies the sentence and
 * nothing else. See draftService for why the line is drawn exactly there.
 */
export async function draftFindingHandler(req, res) {
  try {
    const _id = new mongoose.Types.ObjectId(String(req.params.id));
    const f = await findingsCollection().findOne({ _id });
    if (!f) return res.status(404).json({ error: 'No such finding.' });
    const draft = await draftFollowUp(f);
    return res.json({ draft });
  } catch (err) {
    return bad(res, err);
  }
}

/**
 * Somebody read a finding.
 *
 * Reported because "which findings get opened, and which get ignored" is the
 * evidence for which kinds of problem a customer actually cares about — and it
 * cannot be inferred from anything else. Carries the catalogue id only: Svarg
 * learns that a watcher's finding was read, never which finding.
 */
/**
 * The owner opened the application; learn what time it is where they are.
 *
 * Owner-only because it changes when watchers fire, and a colleague in
 * another country must not move the owner's briefing. Only watchers that
 * have never run and are still on the UTC default are moved.
 */
export async function timezoneHandler(req, res) {
  try {
    const { moved } = await adoptTimezone(req.body?.tz);
    return res.json({ moved });
  } catch (err) {
    return bad(res, err);
  }
}

export async function findingOpenedHandler(req, res) {
  sendSignal('finding_opened', { watcherId: req.body?.watcherId || '' });
  return res.json({ ok: true });
}

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
    /*
     * The live agent behind each catalogue entry, matched on the watcher id
     * it was started with rather than on its name -- a name the owner can
     * edit, and did.
     */
    const byWatcher = new Map();
    for (const a of withFindings) if (a.watcherId) byWatcher.set(a.watcherId, a);
    const catalogue = catalogueFor(readIndex(), plan())
      .map((c) => {
        const live = byWatcher.get(c.id) || null;
        return {
          ...c,
          running: running.has(c.name) || !!live,
          category: categoryOf(c.id),
          // What the map draws a dot for. Every value here is read off the
          // agent's own record: there is no state meaning "thinking about
          // it", so none is reported.
          state: !live ? (c.ready ? 'off' : 'blocked')
            : live.status === 'degraded' ? 'stopped'
            : (!live.enabled || live.status === 'paused') ? 'paused'
            : 'running',
          agentId: live ? live.id : '',
          openCount: live ? live.openCount : 0,
          lastRunAt: live ? live.lastRunAt || null : null,
        };
      });

    return res.json({
      agents: withFindings,
      catalogue,
      /*
       * The industry's categories, in the order its table names them, and
       * every one of them -- including a category nothing is watching yet.
       * A map that drew only the occupied columns would say "this is all
       * there is to watch", which is the opposite of what it is for.
       */
      categories: (Array.isArray(plan().categories) ? plan().categories : []).map((c) => ({
        name: c.name, asks: c.asks || '',
      })),
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
    // Kept or dropped is the signal that matters: started says what sounded
    // useful, still-enabled a fortnight later says what actually was.
    if (!req.body.enabled) sendSignal('watcher_disabled', { watcherId: agent.watcherId || '' });
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
      // Carried so a finding knows how much it matters and telemetry knows
      // which watcher it came from, without either asking a model.
      watcherId: entry.id,
      severity: severityFor(entry.id),
    });
    // Which watcher, never what it watches.
    sendSignal('watcher_started', { watcherId: entry.id });
    return res.status(201).json({ agent });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
