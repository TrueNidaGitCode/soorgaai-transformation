/**
 * Svarg — the finance board
 *
 * GET  /api/admin/finance                 The BOM for a month, plus the tiers.
 * GET  /api/admin/finance/periods         Which months have any usage.
 * PUT  /api/admin/finance/assumptions     Change the costs nothing meters.
 *
 * Platform-admin only, enforced on the route. Every figure here is Svarg's own
 * cost and margin per named customer, which is the last thing that should be
 * reachable with a customer's token.
 */

import { bom, periods, saveAssumptions, assumptions, periodOf } from '../services/financeService.js';

/** The board. `period` defaults to this calendar month. */
export async function getBom(req, res) {
  try {
    const period = /^\d{4}-\d{2}$/.test(String(req.query.period || ''))
      ? String(req.query.period)
      : periodOf();

    const board = await bom(period);
    res.json({ ...board, assumptions: await assumptions() });
  } catch (err) {
    console.error('[finance] could not build the BOM:', err.message);
    res.status(500).json({ message: 'Could not read the consumption figures.' });
  }
}

export async function getPeriods(req, res) {
  try {
    const found = await periods();
    // This month, even when nothing has been spent in it yet — a picker that
    // cannot offer the current month looks broken on the first of the month.
    const now = periodOf();
    res.json({ periods: found.includes(now) ? found : [now, ...found] });
  } catch (err) {
    console.error('[finance] could not list periods:', err.message);
    res.status(500).json({ message: 'Could not list the months.' });
  }
}

export async function putAssumptions(req, res) {
  try {
    const by = req.user?.email || req.user?.name || '';
    const saved = await saveAssumptions(req.body || {}, by);
    // The board too, so the page shows recomputed margins without a second
    // round trip — and so what it shows is what the server now holds rather
    // than what the browser hoped it saved.
    const period = /^\d{4}-\d{2}$/.test(String(req.body?.period || ''))
      ? String(req.body.period)
      : periodOf();
    res.json({ assumptions: saved, ...(await bom(period)) });
  } catch (err) {
    console.error('[finance] could not save assumptions:', err.message);
    res.status(500).json({ message: 'Could not save those figures.' });
  }
}
