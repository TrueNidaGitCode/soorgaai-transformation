/**
 * GET /api/reports — what went wrong, by week, month and year to date.
 *
 * `protect` alone, deliberately, and for the same reason the findings list
 * takes `protect` alone: the people who would act on a problem are not the
 * person who owns the application, and a history only the owner can read is a
 * history nobody reads. Nothing here can change anything.
 */
import { reports } from '../services/reportService.js';

export async function reportsHandler(req, res) {
  try {
    return res.json(await reports());
  } catch (err) {
    console.error('[reports] could not build the summary:', err.message);
    return res.status(500).json({ error: 'Could not read the history.' });
  }
}
