/**
 * What this application's plan bought, as the application itself sees it.
 *
 * ── Coverage, and since 5 October 2026 a count as well ─────────────────────
 *
 * A customer buys how much of their business is watched: which BUSINESS
 * CATEGORIES are covered, how many places records may come from, and how often
 * the covered areas are checked.
 *
 * Until 5 October 2026 that was all, and this file said nothing here would
 * ever count watchers, on the reasoning that rationing them gives a customer a
 * reason to switch some off. The pricing was changed deliberately to sell a
 * number of active watchers and a monthly number of monitoring evaluations as
 * well, so both are read here. The reasoning has not gone away: a plan's
 * watcher allowance should be generous for its tier, and a watcher refused
 * for room is said plainly on the screen rather than silently not started.
 *
 * ── Why the application decides, and not Svarg ─────────────────────────────
 *
 * Svarg sells the allowance; this decides what it means here. The application
 * is the only thing that knows how many categories its industry actually has
 * and which watcher belongs to which, and a limit enforced two planes away
 * from that knowledge is a limit that drifts. Same reasoning as seats, which
 * have worked this way since they existed.
 *
 * ── Absent means unlimited ─────────────────────────────────────────────────
 *
 * Every limit here is read from the environment, and an unset variable means
 * no limit rather than a limit of zero. That is what lets an application
 * delivered before coverage existed keep watching everything it already
 * watches: Svarg simply does not send the variable, and nothing here has to
 * know about grandfathering at all.
 */

/** A positive integer from the environment, or null for "no limit". */
function limitOf(name) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function categoryLimit() { return limitOf('APP_CATEGORY_LIMIT'); }
export function connectionLimit() { return limitOf('APP_MAX_CONNECTIONS'); }
/** How many watchers may be switched on at once. */
export function watcherLimit() { return limitOf('APP_WATCHER_LIMIT'); }
/** How many watcher runs a calendar month may make. */
export function evaluationLimit() { return limitOf('APP_EVALUATION_LIMIT'); }

/** 'daily', 'hourly', 'custom', or '' when the plan does not say. */
export function monitoringFrequency() {
  return String(process.env.APP_MONITORING || '').trim().toLowerCase();
}

/**
 * Which categories this application may watch, in the industry's own order.
 *
 * When the plan covers fewer categories than the industry names, the covered
 * ones are chosen by what the customer's objective was about, not by the
 * order the table happens to list them in: the watchers Cob ranked highest
 * are already in plan.order, so a category is ranked by the best-ranked
 * watcher it contains. A clinic whose objective was about money gets Cash
 * covered before Compliance without anybody choosing.
 *
 * Returned in the table's order regardless, so the Agent Map always draws its
 * columns the same way round.
 */
export function activeCategories(plan) {
  const cats = Array.isArray(plan?.categories) ? plan.categories : [];
  if (!cats.length) return [];
  const limit = categoryLimit();
  if (!limit || limit >= cats.length) return cats.map((c) => c.name);

  const order = Array.isArray(plan?.order) ? plan.order : [];
  const rankOf = (c) => {
    let best = Infinity;
    for (const w of c.watchers || []) {
      const i = order.indexOf(w);
      if (i !== -1 && i < best) best = i;
    }
    return best;
  };
  const chosen = cats
    .map((c, i) => ({ name: c.name, rank: rankOf(c), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map((c) => c.name);

  return cats.filter((c) => chosen.includes(c.name)).map((c) => c.name);
}

/** Is this category one the plan covers? An industry with no table covers all. */
export function coversCategory(plan, name) {
  const cats = Array.isArray(plan?.categories) ? plan.categories : [];
  if (!cats.length || !categoryLimit()) return true;
  return activeCategories(plan).includes(String(name || ''));
}

/**
 * Is this watcher inside covered ground?
 *
 * A watcher its industry's table does not name is covered. The table is
 * knowledge that can lag the catalogue, and refusing to watch something
 * because a markdown file has not caught up would be the product failing for
 * a reason the customer cannot see or fix.
 */
export function coversWatcher(plan, watcherId) {
  const cats = Array.isArray(plan?.categories) ? plan.categories : [];
  if (!cats.length || !categoryLimit()) return true;
  const owner = cats.find((c) => (c.watchers || []).includes(watcherId));
  if (!owner) return true;
  return activeCategories(plan).includes(owner.name);
}

/**
 * The schedule this plan allows, given the one asked for.
 *
 * Narrows, never widens: a plan that bought hourly monitoring does not force
 * an hourly watcher on somebody who wanted a daily one. Applied when a
 * watcher is created AND when one is found due, because clamping only on
 * write would let a watcher created under Ultra keep running hourly after the
 * account moved to Pro.
 */
export function allowedSchedule(asked) {
  const want = String(asked || 'daily').toLowerCase();
  const plan = monitoringFrequency();
  // '' is an application delivered before coverage existed; 'custom' is an
  // Enterprise contract. Neither is narrowed here.
  if (!plan || plan === 'custom' || plan === 'hourly') return want;
  return want === 'hourly' ? 'daily' : want;
}

/** Everything a screen needs to say what is covered, in one object. */
export function coverageSummary(plan) {
  const cats = Array.isArray(plan?.categories) ? plan.categories : [];
  const active = activeCategories(plan);
  return {
    plan: process.env.APP_PLAN_LABEL || '',
    categories: { covered: categoryLimit() ? active.length : cats.length, of: cats.length, active },
    connections: connectionLimit(),
    frequency: monitoringFrequency() || 'daily',
    watchers: watcherLimit(),
    evaluations: evaluationLimit(),
  };
}
