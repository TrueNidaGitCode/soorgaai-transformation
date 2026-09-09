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
import {
  sendNext, setSequence, unsubscribeByToken,
  getTemplate, setTemplate, previewFor, generateOutreach, trackedLink,
} from '../services/outreachService.js';
import { motionRegistry, motionEmails, motionSharesLink, DEFAULT_MOTION } from '../services/gtmMotions.js';

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
  if (/required|Unknown status|Unknown motion|Nothing to update|valid email/i.test(msg)) return res.status(400).json({ error: msg });
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
    const {
      email, name, company, role, companyUrl, linkedinUrl, note, subject, body, orgContext,
      motion, via, nextStep, nextStepAt, phone, relationship, location,
    } = req.body || {};
    // A new lead with nothing written starts from the shared template, so the
    // generic body is authored once and only orgContext is typed per prospect.
    // Only for the one motion that sends: seeding a warm introduction with a
    // cold-email body would put a draft nobody wrote behind a Send button.
    const wantsMail = motionEmails(motion || DEFAULT_MOTION);
    const tpl = wantsMail ? await getTemplate() : { subject: '', body: '' };
    const lead = await addLead({
      email, name, company, role, companyUrl, linkedinUrl, note, orgContext,
      motion, via, nextStep, nextStepAt, phone, relationship, location,
      subject: subject || tpl.subject,
      body:    body    || tpl.body,
      addedByUserId: req.user._id,
    });
    // The link comes back with the row so the screen can offer it immediately.
    // On a warm introduction this IS the deliverable — the operator adds the
    // person in order to get something to paste into WhatsApp, and making them
    // reload the board to find it would be the slowest possible way to say it.
    return res.status(201).json({
      lead,
      inviteLink: motionSharesLink(lead.motion || DEFAULT_MOTION) ? trackedLink(lead) : '',
    });
  } catch (err) {
    return fail(res, err, 'Could not add the lead.');
  }
}

/**
 * The go-to-market motions, for the screen.
 *
 * Served rather than hard-coded in sales.js so the plays, the lanes and the
 * validator cannot drift apart. Static, so it is cheap to fetch on load.
 */
export async function getMotions(req, res) {
  try {
    return res.json(motionRegistry());
  } catch (err) {
    return fail(res, err, 'Could not read the motions.');
  }
}

export async function readTemplate(req, res) {
  try {
    return res.json({ template: await getTemplate() });
  } catch (err) {
    return fail(res, err, 'Could not read the template.');
  }
}

export async function writeTemplate(req, res) {
  try {
    const { subject, body } = req.body || {};
    const t = await setTemplate({ subject, body, updatedByUserId: req.user._id });
    return res.json({ template: { subject: t.subject, body: t.body } });
  } catch (err) {
    return fail(res, err, 'Could not save the template.');
  }
}

/** The email exactly as it would arrive, without sending it. */
export async function previewLead(req, res) {
  try {
    return res.json(await previewFor(req.params.id));
  } catch (err) {
    return fail(res, err, 'Could not build the preview.');
  }
}

export async function patchLead(req, res) {
  try {
    const {
      status, note, name, company, markContacted, motion, via, nextStep, nextStepAt,
      phone, relationship, location,
    } = req.body || {};
    const lead = await updateLead(req.params.id, {
      status, note, name, company, markContacted, motion, via, nextStep, nextStepAt,
      phone, relationship, location,
    });
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
    const { subject, body, orgContext, name, intervalDays, maxSends, enabled } = req.body || {};
    const lead = await setSequence(req.params.id, { subject, body, orgContext, name, intervalDays, maxSends, enabled });
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

/**
 * What mail is actually configured, so a key swap can be checked without a
 * deploy and without sending anything.
 *
 * Reports no secret — whether a key exists, never any part of it. The sending
 * DOMAIN is the field that matters: mail leaving on a provider's shared domain
 * is filtered however good the rest of the setup is, and until this endpoint
 * existed there was no way to see that from outside the container logs.
 */
export async function mailStatus(req, res) {
  try {
    const { describeMailConfig } = await import('../services/mailService.js');
    const cfg = describeMailConfig();
    const { outreachReadiness } = await import('../services/outreachService.js');
    return res.json({ mail: cfg, outreach: outreachReadiness() });
  } catch (err) {
    return fail(res, err, 'Could not read the mail configuration.');
  }
}

/**
 * Reclassify an account: real, internal, test — or '' to go back to inferring.
 *
 * Needed because no heuristic can know that a gmail address belongs to the
 * founder, or that a colleague's address at a former employer is not a
 * prospect. The inference proposes; this decides.
 */
export async function setAccountKind(req, res) {
  const kind = String(req.body?.kind ?? '').trim().toLowerCase();
  if (kind !== '' && !KINDS.includes(kind)) {
    return res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')} — or empty to infer it.` });
  }
  try {
    const u = await User.findByIdAndUpdate(
      req.params.id, { $set: { accountKind: kind } }, { new: true }
    ).select('email accountKind').lean();
    if (!u) return res.status(404).json({ error: 'Account not found.' });
    auditKind(req.user._id, u.email, kind);
    return res.json({ email: u.email, accountKind: u.accountKind });
  } catch (err) {
    return fail(res, err, 'Could not reclassify the account.');
  }
}

function auditKind(byUserId, email, kind) {
  console.log(JSON.stringify({
    audit: 'AccountKind', action: 'SET', by: String(byUserId),
    email, kind: kind || '(inferred)', ts: new Date().toISOString(),
  }));
}

/**
 * Have the agent draft this lead's email.
 *
 * Writes the draft onto the lead rather than returning it for the screen to
 * hold, so a generated email can never be previewed and then lost by a reload.
 * The operator's next two actions are Preview and Send — nothing else.
 */
export async function generateLeadEmail(req, res) {
  try {
    return res.json(await generateOutreach(req.params.id));
  } catch (err) {
    return fail(res, err, 'Could not write the email.');
  }
}
