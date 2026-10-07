/**
 * Svarg — what each of an account's applications has used of its allowance.
 *
 * ── Why a percentage and not dollars ──────────────────────────────────────
 *
 * Every delivered application reaches a model through Svarg's gateway, which
 * meters it in model cost and requests and stops it at a ceiling (see
 * checkAllowance in gatewayService.js). The customer is billed the plan
 * price, not that cost — the cost is what serving them costs Svarg. So the
 * Account page shows how much of the allowance is used, decided on
 * 2026-10-07, and this function is the one place that turns the meter into
 * that figure. It returns no cost, no token counts and no ceiling in dollars,
 * so no page built on it can leak them by accident.
 *
 * ── The window ─────────────────────────────────────────────────────────────
 *
 * The allowance is a rolling 30 days per application, not a calendar month:
 * the gateway rolls usage.periodStart forward on the first request after the
 * window ends. Until that request arrives the stored counters are stale, so a
 * window that has run out is reported as empty — which is exactly what the
 * gateway will do with the next call.
 */

import HostedDeployment from '../models/HostedDeployment.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { PERIOD_MS } from './gatewayService.js';

/** Statuses that are not an application the customer has, or had, running. */
const NOT_AN_APP = new Set(['destroyed']);

const pct = (used, cap) => (cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0);

/**
 * One deployment, as the Account page shows it. Pure: the caller supplies the
 * name and the clock, so it can be tested without a database.
 */
export function allowanceView(dep, { name = '', now = new Date() } = {}) {
  const u = dep.usage || {};
  const l = dep.limits || {};
  const start = u.periodStart ? new Date(u.periodStart) : null;
  const expired = !start || (now - start) > PERIOD_MS;

  const requests = expired ? 0 : (u.requests || 0);
  const costPct = expired ? 0 : pct(u.costUsd || 0, l.maxCostUsd || 0);
  const requestPct = expired ? 0 : pct(requests, l.maxRequests || 0);
  // Whichever runs out first is the allowance the customer actually has.
  const usedPct = Math.max(costPct, requestPct);

  return {
    id: String(dep._id),
    name: name || 'Your application',
    status: dep.status || 'queued',
    url: dep.railway?.url || '',
    requests,
    usedPct,
    // The gateway refuses at 100%; say so rather than show a full bar quietly.
    paused: usedPct >= 100,
    periodStart: expired ? null : start,
    resetsAt: expired || !start ? null : new Date(start.getTime() + PERIOD_MS),
    lastActivityAt: u.lastRequestAt || null,
  };
}

/** Every application the account has, newest first, as allowanceView rows. */
export async function applicationAllowances(userId, now = new Date()) {
  const deps = await HostedDeployment.find({ userId })
    .select('_id blueprintId status railway.url usage limits createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const live = deps.filter((d) => !NOT_AN_APP.has(d.status));

  const ids = live.map((d) => d.blueprintId).filter(Boolean);
  const bps = ids.length
    ? await TransformationBlueprint.find({ _id: { $in: ids }, userId })
      .select('_id appName businessObjective').lean()
    : [];
  const byId = new Map(bps.map((b) => [String(b._id), b]));

  return live.map((d) => {
    const bp = byId.get(String(d.blueprintId));
    const objective = (bp?.businessObjective || '').trim();
    const name = bp?.appName || (objective.length > 60 ? `${objective.slice(0, 57)}…` : objective);
    return allowanceView(d, { name, now });
  });
}
