/**
 * ICP interviews on the Sales page: four answers, the playbook they fill,
 * and the wedge found across a vertical. Platform-admin only, like the rest
 * of /api/admin/sales-signals. Every decision lives in icpInterviewService.
 */
import mongoose from 'mongoose';
import IcpInterview from '../models/IcpInterview.js';
import {
  QUESTIONS, listInterviews, createInterview, updateInterview, fillInterview, editCell,
  removeInterview, getWedge, findWedge, lockWedge,
} from '../services/icpInterviewService.js';

const bad = (res, err, code = 400) => res.status(code).json({ error: err.message || String(err) });
const idOk = (id) => mongoose.Types.ObjectId.isValid(String(id));

/** Everything the Target Audience tab draws for one vertical. */
export async function getIcp(req, res) {
  try {
    const vertical = String(req.query.vertical || 'clinics');
    const interviews = await listInterviews(vertical);
    return res.json({ vertical, questions: QUESTIONS, interviews, wedge: await getWedge(vertical, interviews) });
  } catch (err) { return bad(res, err, 500); }
}

/** Counts per vertical, for the vertical switcher. */
export async function getIcpCounts(req, res) {
  try {
    const rows = await IcpInterview.aggregate([{ $group: { _id: '$vertical', n: { $sum: 1 } } }]);
    return res.json({ counts: Object.fromEntries(rows.map((r) => [r._id, r.n])) });
  } catch (err) { return bad(res, err, 500); }
}

export async function postInterview(req, res) {
  try {
    const doc = await createInterview(req.body || {});
    return res.status(201).json({ id: String(doc._id) });
  } catch (err) { return bad(res, err); }
}

export async function patchInterview(req, res) {
  if (!idOk(req.params.id)) return bad(res, new Error('No such interview.'), 404);
  try {
    await updateInterview(req.params.id, req.body || {});
    return res.json({ ok: true });
  } catch (err) { return bad(res, err); }
}

/** The AI fills the playbook from the answers; edited cells are kept. */
export async function postFill(req, res) {
  if (!idOk(req.params.id)) return bad(res, new Error('No such interview.'), 404);
  try {
    await fillInterview(req.params.id);
    return res.json({ ok: true });
  } catch (err) { return bad(res, err, 502); }
}

export async function patchCell(req, res) {
  if (!idOk(req.params.id)) return bad(res, new Error('No such interview.'), 404);
  try {
    await editCell(req.params.id, String(req.params.key), req.body || {});
    return res.json({ ok: true });
  } catch (err) { return bad(res, err); }
}

export async function deleteInterview(req, res) {
  if (!idOk(req.params.id)) return bad(res, new Error('No such interview.'), 404);
  try {
    await removeInterview(req.params.id);
    return res.json({ ok: true });
  } catch (err) { return bad(res, err); }
}

export async function postFindWedge(req, res) {
  try {
    return res.json({ wedge: await findWedge(String(req.params.vertical)) });
  } catch (err) { return bad(res, err, 502); }
}

export async function postLockWedge(req, res) {
  try {
    return res.json({ wedge: await lockWedge(String(req.params.vertical), req.body?.text || '') });
  } catch (err) { return bad(res, err); }
}
