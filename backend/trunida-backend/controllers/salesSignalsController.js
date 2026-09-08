/**
 * Svarg — Sales Funnel Controller
 *
 * Platform-admin-only. Every route here is gated by adminMiddleware.js's
 * adminOnly (mounted in routes/salesSignalsRoutes.js).
 *
 * GET    /api/admin/sales-signals            The five-stage funnel.
 * POST   /api/admin/sales-signals/ask        Ask a question about it.
 * POST   /api/admin/sales-signals/leads      Add a cold lead (stage 1).
 * PATCH  /api/admin/sales-signals/leads/:id  Update status / note.
 * DELETE /api/admin/sales-signals/leads/:id  Remove one.
 *
 * The board is recomputed on every read rather than cached. It is a handful of
 * lean finds, read by one or two people a day, and a sales board that is
 * quietly minutes stale is worse than one that takes an extra moment — the
 * whole value is that the operator can trust a row while dialling.
 */

import {
  collectSignals, renderBoard, askBoard,
  addLead, updateLead, deleteLead,
} from '../services/salesSignalsService.js';

function fail(res, err, fallback = 'Sales funnel operation failed.') {
  console.error('[salesSignals]', err);
  const msg = err?.message || '';
  if (/required|Unknown status|Nothing to update|valid email/i.test(msg)) return res.status(400).json({ error: msg });
  if (/not found/i.test(msg)) return res.status(404).json({ error: msg });
  return res.status(500).json({ error: fallback });
}

export async function getBoard(req, res) {
  try {
    const signals = await collectSignals();
    return res.json({ signals, board: renderBoard(signals) });
  } catch (err) {
    return fail(res, err, 'Could not read the sales funnel.');
  }
}

export async function ask(req, res) {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'A question is required.' });
  if (question.length > 2000) return res.status(400).json({ error: 'Question is too long.' });

  try {
    // Rebuilt here rather than accepted from the client: the board is the
    // model's only evidence, so letting a caller supply it would let a caller
    // supply facts. It is also what keeps the answer current with the screen.
    const board = renderBoard(await collectSignals());
    return res.json({ answer: await askBoard(board, question) });
  } catch (err) {
    console.error('[salesSignals] ask failed:', err);
    return res.status(502).json({ error: `The model could not answer: ${err.message}` });
  }
}

export async function createLead(req, res) {
  try {
    const { email, name, company, note } = req.body || {};
    const lead = await addLead({ email, name, company, note, addedByUserId: req.user._id });
    return res.status(201).json({ lead });
  } catch (err) {
    return fail(res, err, 'Could not add the lead.');
  }
}

export async function patchLead(req, res) {
  try {
    const { status, note, name, company, markContacted } = req.body || {};
    const lead = await updateLead(req.params.id, { status, note, name, company, markContacted });
    return res.json({ lead });
  } catch (err) {
    return fail(res, err, 'Could not update the lead.');
  }
}

export async function removeLead(req, res) {
  try {
    await deleteLead(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err, 'Could not delete the lead.');
  }
}
