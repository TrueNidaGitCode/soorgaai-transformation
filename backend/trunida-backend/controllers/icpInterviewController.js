/**
 * ICP interviews on the Sales page: read-only since 7 October 2026.
 *
 * The four answers are shared in the Claude chat and the playbook is filled
 * there, then written with scripts/icp_record.mjs. This only serves what the
 * Target Audience tab draws. Platform-admin only, like the rest of
 * /api/admin/sales-signals.
 */
import IcpInterview from '../models/IcpInterview.js';
import { QUESTIONS, listInterviews, getWedge } from '../services/icpInterviewService.js';

const bad = (res, err, code = 500) => res.status(code).json({ error: err.message || String(err) });

/** Everything the Target Audience tab draws for one vertical. */
export async function getIcp(req, res) {
  try {
    const vertical = String(req.query.vertical || 'clinics');
    return res.json({ vertical, questions: QUESTIONS, interviews: await listInterviews(vertical), wedge: await getWedge(vertical) });
  } catch (err) { return bad(res, err); }
}

/** Counts per vertical, for the vertical switcher. */
export async function getIcpCounts(req, res) {
  try {
    const rows = await IcpInterview.aggregate([{ $group: { _id: '$vertical', n: { $sum: 1 } } }]);
    return res.json({ counts: Object.fromEntries(rows.map((r) => [r._id, r.n])) });
  } catch (err) { return bad(res, err); }
}
