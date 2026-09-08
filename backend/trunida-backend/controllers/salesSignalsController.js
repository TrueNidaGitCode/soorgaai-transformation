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
import { sendNext, setSequence, unsubscribeByToken } from '../services/outreachService.js';

/** The unsubscribe page echoes a stored address back into HTML. */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fail(res, err, fallback = 'Sales funnel operation failed.') {
  console.error('[salesSignals]', err);
  const msg = err?.message || '';
  // An error that states its own status is trusted over guessing from wording.
  if (err?.status) return res.status(err.status).json({ error: msg || fallback });
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

  // History is the one thing that DOES come from the client — it is the
  // client's own transcript. The board never does, so a replayed turn can
  // colour the conversation but cannot invent a lead.
  const history = Array.isArray(req.body?.history)
    ? req.body.history
        .filter(t => t && typeof t.text === 'string')
        .slice(-8)
        .map(t => ({ role: t.role === 'user' ? 'user' : 'bot', text: t.text.slice(0, 1500) }))
    : [];

  try {
    // Rebuilt here rather than accepted from the client: the board is the
    // model's only evidence, so letting a caller supply it would let a caller
    // supply facts. It is also what keeps the answer current with the screen.
    const board = renderBoard(await collectSignals());
    return res.json({ answer: await askBoard(board, question, history) });
  } catch (err) {
    console.error('[salesSignals] ask failed:', err);
    return res.status(502).json({ error: `The model could not answer: ${err.message}` });
  }
}

export async function createLead(req, res) {
  try {
    const { email, name, company, note, subject, body } = req.body || {};
    const lead = await addLead({ email, name, company, note, subject, body, addedByUserId: req.user._id });
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

// ── Outreach sequences ───────────────────────────────────────────────────────

export async function sendLeadNow(req, res) {
  try {
    const r = await sendNext(req.params.id, { manual: true, replyTo: req.body?.replyTo || '' });
    // A refusal is a 200 with sent:false, not an error. "They unsubscribed" is
    // the system working, and the screen needs to say so plainly.
    return res.json(r);
  } catch (err) {
    return fail(res, err, 'Could not send.');
  }
}

export async function putSequence(req, res) {
  try {
    const { subject, body, intervalDays, maxSends, enabled } = req.body || {};
    const lead = await setSequence(req.params.id, { subject, body, intervalDays, maxSends, enabled });
    return res.json({ lead });
  } catch (err) {
    return fail(res, err, 'Could not update the sequence.');
  }
}

/** Public — no auth. The link in the footer of every outreach email. */
export async function unsubscribe(req, res) {
  const lead = await unsubscribeByToken(String(req.query.token || '')).catch(() => null);
  const message = lead
    ? `You will not receive any more email from Svarg at ${escapeHtml(lead.email)}.`
    : 'That unsubscribe link is not valid. If you keep receiving email, reply and we will remove you by hand.';

  res.status(lead ? 200 : 404).type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed - Svarg</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#0D0D0D;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="max-width:420px;padding:32px;text-align:center">
    <h1 style="font-size:20px;margin:0 0 12px">${lead ? 'Unsubscribed' : 'Link not valid'}</h1>
    <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0">${message}</p>
  </div>
</body></html>`);
}
