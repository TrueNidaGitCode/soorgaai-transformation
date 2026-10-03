/**
 * The deck, with its numbers read rather than typed.
 *
 * ── Why this is a service and not four slides in the page ──────────────────
 *
 * A pitch deck goes stale the day it is exported. "Five agents watch for" was
 * true when somebody drew it; the catalogue is thirty-six across seven areas
 * and neither the slide nor the person presenting it knows that. The first
 * question after a demo is some version of "how many of these are real", and
 * the worst answer is a number from a slide that nobody can trace.
 *
 * So the claims that are countable are counted, here, from the same code the
 * product runs on. If the catalogue grows tomorrow the deck says so tomorrow.
 *
 * ── What it is allowed to know ─────────────────────────────────────────────
 *
 * Nothing about anybody's customers, and this is not a policy — it is what
 * the wire carries. A delivered application sends Svarg one field per
 * watching signal: which catalogue watcher. Not the finding, not its key, not
 * a name, not a row. See tenantSignalService.normaliseSignal, where the
 * allow-list drops everything else before it is stored.
 *
 * That makes the honest deck the only available deck, which is the happy
 * case. "Rahul Sharma missed his appointment and asked about an upgrade" is a
 * worked example from a demonstration account and travels as prose, written
 * into the page by the person who owns that account. What comes from here is
 * the shape of the product and how much of it is actually being used:
 *
 *   - how many watchers exist, and across which areas of a business
 *   - which systems can be connected
 *   - how many applications are live
 *   - how many watchers customers have started, and kept
 *   - how many findings have been raised and resolved
 *
 * Every one of those is Svarg's own fact about Svarg. None of them is a
 * customer's.
 *
 * ── And a number nobody can defend is worse than no number ─────────────────
 *
 * Each figure carries where it came from, so the page can show it and the
 * person presenting can answer "how do you know". A count that would be zero
 * or one is reported as it is rather than rounded into a claim: an early
 * product saying "1 application live" is credible, and the same product
 * implying more is the first thing a buyer checks.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { AREAS, CATALOGUE } from '../eame-template/services/agentCatalogue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** How far back the usage figures look. A quarter: long enough to be a fact. */
export const WINDOW_DAYS = 90;

/**
 * The watchers, counted by the area of a business they belong to.
 *
 * Straight off the catalogue the delivered applications run, so this cannot
 * drift from what a customer would actually get. Areas with nothing in them
 * are dropped rather than shown as zero — an empty row on a slide invites the
 * question "why is Compliance empty" in the middle of a pitch.
 */
export function watcherAreas(catalogue = CATALOGUE) {
  const by = new Map(AREAS.map((a) => [a, []]));
  for (const c of catalogue) {
    if (!by.has(c.area)) by.set(c.area, []);
    by.get(c.area).push({ id: c.id, name: c.name, says: c.says });
  }
  return [...by.entries()]
    .filter(([, list]) => list.length)
    .map(([area, list]) => ({ area, count: list.length, watchers: list }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
}

/**
 * The systems a delivered application can read, by what is actually shipped.
 *
 * Read off the directory rather than written down, for the same reason the
 * application reads it: a list of connectors in a slide is a promise, and the
 * directory is the fact. A connector removed from the product disappears from
 * the deck on the next load instead of being sold for another six months.
 */
export function connectorsShipped() {
  const dir = path.join(__dirname, '..', 'eame-template', 'services', 'connectors');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  const NAME = {
    'zohocrm': 'Zoho CRM', 'leadsquared': 'LeadSquared', 'phone': 'Cloud telephony', 'whatsapp': 'WhatsApp Business',
    'database': 'Your database', 'jira': 'Jira', 'confluence': 'Confluence',
    'github': 'GitHub', 'svarg': 'Svarg',
  };
  return files
    .filter((f) => /^[a-z0-9-]+\.js$/.test(f))
    .map((f) => f.replace(/\.js$/, ''))
    .filter((k) => k !== 'svarg')
    .map((k) => ({ kind: k, name: NAME[k] || k }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What customers have actually done with the watchers, from the signals.
 *
 * `started` counts watchers switched on and `stopped` those switched off
 * again, which is the only pair worth putting in front of a buyer: the first
 * says what sounds valuable and the difference says what turned out to be.
 * Findings are counted opened against resolved, because "we raised four
 * hundred things" is a nuisance and "and two hundred were closed" is a
 * product.
 */
export function summariseUse(rows = []) {
  const n = (kind) => rows.filter((r) => r.kind === kind).length;
  const started = n('watcher_started');
  const stopped = n('watcher_disabled');
  const opened = n('finding_opened');
  const resolved = n('finding_resolved');

  // Which watchers customers reach for first. Ids only — the catalogue names
  // them, and the signal carries nothing else.
  const byId = new Map();
  for (const r of rows) {
    if (r.kind !== 'watcher_started' || !r.watcherId) continue;
    byId.set(r.watcherId, (byId.get(r.watcherId) || 0) + 1);
  }
  const named = new Map(CATALOGUE.map((c) => [c.id, c.name]));
  const popular = [...byId.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([id, count]) => ({ id, name: named.get(id) || id, count }));

  return { started, stopped, kept: Math.max(0, started - stopped), opened, resolved, popular };
}

/** Never throws, and never invents: an unreadable count is null, not zero. */
async function count(model, where) {
  try {
    const M = mongoose.models[model];
    return M ? await M.countDocuments(where) : null;
  } catch { return null; }
}

/**
 * Everything the deck's live half is built from.
 *
 * Shaped as claims rather than as a database reading, because that is what a
 * slide needs: a figure, what it means, and where it came from. The page
 * renders it and the person in the room can answer for it.
 */
export async function deckFacts({ now = new Date(), windowDays = WINDOW_DAYS } = {}) {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const areas = watcherAreas();
  const connectors = connectorsShipped();

  let signals = [];
  try {
    const S = mongoose.models.TenantSignal;
    if (S) {
      signals = await S.find(
        { receivedAt: { $gte: since } },
        { kind: 1, watcherId: 1, _id: 0 },
      ).lean();
    }
  } catch { signals = []; }
  const use = summariseUse(signals);

  const live = await count('HostedDeployment', { 'railway.url': { $exists: true, $ne: '' } });

  return {
    generatedAt: now.toISOString(),
    windowDays,
    watchers: {
      total: areas.reduce((n, a) => n + a.count, 0),
      areas,
      source: 'The catalogue every delivered application runs on',
    },
    connectors: {
      total: connectors.length,
      list: connectors,
      source: 'The connectors shipped in the application template',
    },
    applications: {
      live,
      source: 'Applications Svarg has delivered and is hosting',
    },
    use: {
      ...use,
      source: `Signals from delivered applications, last ${windowDays} days`,
      /*
       * Said on the slide, not buried here. The single most likely question
       * in the room is whether this is reading customer records, and the
       * answer is on the wire rather than in a policy.
       */
      boundary: 'Each signal carries which watcher fired and nothing else — '
        + 'no finding, no name, no row.',
    },
  };
}
