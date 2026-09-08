/**
 * Svarg — cold outreach sequences
 *
 * Sends the first email, then follows up on a cadence until the prospect does
 * something that makes following up wrong.
 *
 * ── Every send passes the same gate ─────────────────────────────────────────
 *
 * canSend() is the only thing allowed to decide an email may go out, and both
 * the manual "Send now" button and the background sweep call it. A guard that
 * one path can skip is not a guard; the manual button is exactly the path
 * somebody would exempt, and it is the one most likely to be pressed by
 * accident on a lead who already unsubscribed.
 *
 * ── What can stop a sequence ────────────────────────────────────────────────
 *
 *   signed up      a User exists with this email — they are a customer now
 *   replied        marked by hand; there is no inbox integration
 *   unsubscribed   the recipient clicked the link
 *   dead           marked by hand
 *   max reached    sentCount hit maxSends
 *
 * Reaching Discovery is NOT among them and cannot be. A guest blueprint is
 * anonymous — it carries no email — so there is no way to know the person you
 * emailed is the person who generated it. Only signup is detectable.
 *
 * ── Why the interval has a floor ────────────────────────────────────────────
 *
 * MIN_INTERVAL_DAYS is enforced here rather than trusted from the request.
 * Cold email to the same address more often than every few days is what gets a
 * sending domain blocked by Brevo and by the mailbox providers, and that damage
 * lands on every email Svarg sends — sign-in codes included. The cost of a
 * follow-up going out a day late is nothing next to losing the domain.
 */

import crypto from 'crypto';
import ColdLead from '../models/ColdLead.js';
import OutreachTemplate from '../models/OutreachTemplate.js';
import { User } from '../models/user.js';
import { sendOutreachEmail } from './mailService.js';

/**
 * The rule: at most six emails to one contact, and never more than one a week.
 *
 * Both are enforced here rather than taken from the request, and the weekly gap
 * applies to the manual button as well as the sweep — see canSend. Slower is
 * always allowed; faster is not, by any route.
 */
export const MIN_INTERVAL_DAYS = 7;
export const MAX_SENDS_CAP = 6;

/**
 * A refusal the operator caused and can fix, as opposed to a server fault.
 *
 * Carries its own status so the controller never has to infer intent from the
 * wording of a message — which is how "Follow-ups must be at least 2 days
 * apart" first reached the screen as an unexplained 500.
 */
export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; this.status = 400; }
}

const DAY = 86400000;

/**
 * Where the unsubscribe link points — the public origin of THIS API, since the
 * link resolves to /api/outreach/unsubscribe on the backend, not the marketing
 * site. FRONTEND_URL is deliberately not a fallback for that reason.
 *
 * RAILWAY_PUBLIC_DOMAIN is injected by the platform, so the common deployment
 * needs no configuration at all. The explicit variables come first for anyone
 * running behind their own domain or off Railway entirely.
 *
 * This started life as PUBLIC_API_URL only, which meant a brand-new variable
 * had to be set before a single email could go out — on a server where mail
 * itself was already working fine for sign-in codes. A guard nobody can
 * satisfy without being told the secret is not a guard, it is an outage.
 */
function publicBase() {
  const explicit = process.env.PUBLIC_API_URL || process.env.BACKEND_URL || '';
  if (explicit) return explicit.replace(/\/+$/, '');

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN || '';
  if (railway) return `https://${railway.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  // Older Railway images expose the full URL under a different name.
  const legacy = process.env.RAILWAY_STATIC_URL || '';
  if (legacy) return (legacy.startsWith('http') ? legacy : `https://${legacy}`).replace(/\/+$/, '');

  return '';
}

function unsubscribeUrl(lead) {
  const base = publicBase();
  return base ? `${base}/api/outreach/unsubscribe?token=${lead.unsubscribeToken}` : '';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Where a tracked link sends the prospect. The public site, not the API. */
function siteBase() {
  return (process.env.FRONTEND_URL || 'https://www.svargai.com').replace(/\/+$/, '');
}

/**
 * This lead's tracked link.
 *
 * The ref is what lets a click become an attributed row rather than another
 * anonymous guest — see models/ColdLead.js refCode.
 */
export function trackedLink(lead) {
  return lead.refCode ? `${siteBase()}/?ref=${encodeURIComponent(lead.refCode)}` : siteBase();
}

/**
 * Personalisation, kept to what we actually know. A token we cannot fill is
 * replaced with nothing rather than left as {{name}} in a stranger's inbox.
 *
 * {{context}} is the organisation-specific paragraph, which is the whole point
 * of the split: the template is generic, this is not.
 */
function fill(template, lead) {
  return String(template || '')
    .replace(/\{\{\s*name\s*\}\}/gi, lead.name || 'there')
    .replace(/\{\{\s*company\s*\}\}/gi, lead.company || 'your team')
    .replace(/\{\{\s*email\s*\}\}/gi, lead.email || '')
    .replace(/\{\{\s*context\s*\}\}/gi, lead.orgContext || '')
    .replace(/\{\{\s*link\s*\}\}/gi, trackedLink(lead))
    // A {{context}} that filled to nothing leaves its own blank line behind,
    // which reads as a missing paragraph rather than a tighter email.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── The gate ─────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
export async function canSend(lead, { ignoreSchedule = false } = {}) {
  if (!lead) return { ok: false, reason: 'Lead not found.' };
  if (lead.unsubscribedAt) return { ok: false, reason: 'They unsubscribed.' };
  if (lead.status === 'dead') return { ok: false, reason: 'Marked dead.' };
  if (lead.status === 'replied') return { ok: false, reason: 'They replied — follow-ups stop here.' };

  // Refusing to send is the correct behaviour here, not a degraded one. Without
  // a public base URL there is no working unsubscribe link, and cold email with
  // a decorative opt-out is the kind of mistake that ends with the sending
  // domain blocked and every sign-in code undeliverable.
  if (!publicBase()) {
    return { ok: false, reason: 'No public API URL is resolvable (set PUBLIC_API_URL), so no unsubscribe link can be built. Refusing to send.' };
  }

  const seq = lead.sequence || {};
  if (!seq.subject || !seq.body) return { ok: false, reason: 'No subject or message written yet.' };

  // A template that asks for an organisation paragraph and never gets one
  // sends an email with a hole where the only reason to reply should be.
  //
  // Guarded here rather than on the add form, because the form was only one
  // of two ways to send: the per-row Send now button skipped the check, and
  // the first real cold email went out entirely generic because of it. Only
  // fires when the body actually asks for {{context}} — a body written
  // without the token is a deliberate choice and is left alone.
  if (/\{\{\s*context\s*\}\}/i.test(seq.body) && !String(lead.orgContext || '').trim()) {
    return { ok: false, reason: 'No organisation paragraph written — the email would be entirely generic.' };
  }

  const max = Math.min(seq.maxSends || MAX_SENDS_CAP, MAX_SENDS_CAP);
  if ((seq.sentCount || 0) >= max) return { ok: false, reason: `All ${max} emails already sent.` };

  // Checked live rather than trusted from the lead's status, so a signup that
  // happened five minutes ago still stops the next follow-up.
  const signedUp = await User.exists({ email: String(lead.email).toLowerCase() });
  if (signedUp) return { ok: false, reason: 'They signed up — they are past outreach.' };

  // One email a week to a contact, whatever the path.
  //
  // Outside the ignoreSchedule branch on purpose. "Send now" is allowed to
  // ignore the SCHEDULE — a paused sequence, a date not yet reached — but not
  // this. With it inside, six clicks of the button in one afternoon would send
  // a stranger six emails in an afternoon, which is the exact outcome the
  // limit exists to prevent, reachable by the easiest action on the screen.
  if (seq.lastSentAt) {
    const waited = Date.now() - new Date(seq.lastSentAt).getTime();
    if (waited < MIN_INTERVAL_DAYS * DAY) {
      const left = Math.ceil((MIN_INTERVAL_DAYS * DAY - waited) / DAY);
      return { ok: false, reason: `Last email went ${Math.floor(waited / DAY)}d ago — one a week means ${left}d to wait.` };
    }
  }

  if (!ignoreSchedule) {
    if (!seq.enabled) return { ok: false, reason: 'Sequence is paused.' };
    if (seq.nextSendAt && new Date(seq.nextSendAt) > new Date()) {
      return { ok: false, reason: `Not due until ${new Date(seq.nextSendAt).toISOString().slice(0, 10)}.` };
    }
  }

  return { ok: true };
}

// ── Composing ────────────────────────────────────────────────────────────────

/**
 * Where a reply should land.
 *
 * Cold outreach that replies into an unmonitored address wastes the only
 * outcome worth having, so this is configurable rather than left to whatever
 * the sending address happens to be.
 */
function defaultReplyTo() {
  return process.env.OUTREACH_REPLY_TO || '';
}

function compose(lead, replyTo) {
  const subject = fill(lead.sequence.subject, lead);
  const bodyText = fill(lead.sequence.body, lead);
  const unsub = unsubscribeUrl(lead);

  const text = unsub
    ? `${bodyText}\n\n—\nNot interested? Unsubscribe: ${unsub}`
    : bodyText;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#222;font-size:15px;line-height:1.6">
  <div style="white-space:pre-wrap">${escapeHtml(bodyText)}</div>
  ${unsub ? `<hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px">
  <p style="color:#888;font-size:12px;margin:0">
    You received this because we thought Svarg was relevant to your work.
    <a href="${unsub}" style="color:#888">Unsubscribe</a> and we will not email you again.
  </p>` : ''}
</div>`;

  return { subject, text, html, replyTo, unsubscribeUrl: unsub };
}

// ── Sending ──────────────────────────────────────────────────────────────────

/**
 * Send the next email for one lead.
 *
 * @param {string} leadId
 * @param {{manual?: boolean, replyTo?: string}} opts
 *   manual bypasses only the SCHEDULE, never the gate — see canSend.
 */
export async function sendNext(leadId, { manual = false, replyTo = '' } = {}) {
  const lead = await ColdLead.findById(leadId);
  if (!lead) throw new Error('Lead not found.');

  // Both tokens are minted lazily so leads created before either existed pick
  // them up on their first send rather than needing a migration.
  if (!lead.unsubscribeToken || !lead.refCode) {
    if (!lead.unsubscribeToken) lead.unsubscribeToken = crypto.randomUUID();
    // Short and URL-safe: this one is read by a human out of an email body,
    // and a UUID in a visible link looks like tracking, because it is.
    if (!lead.refCode) lead.refCode = crypto.randomBytes(6).toString('base64url');
    await lead.save();
  }

  const verdict = await canSend(lead, { ignoreSchedule: manual });
  if (!verdict.ok) {
    // A blocked send is a normal outcome, not an exception: the sweep hits
    // this constantly and the screen needs the reason, not a stack trace.
    if (!manual) {
      lead.sequence.enabled = false;
      lead.sequence.nextSendAt = null;
      lead.sequence.stoppedReason = verdict.reason;
      await lead.save();
    }
    return { sent: false, reason: verdict.reason };
  }

  const mail = compose(lead, replyTo || defaultReplyTo());
  let ok = false, error = '';
  try {
    await sendOutreachEmail({ to: lead.email, ...mail });
    ok = true;
  } catch (err) {
    error = err.message || String(err);
  }

  lead.sends.push({ at: new Date(), subject: mail.subject, ok, error, manual });

  if (ok) {
    const interval = Math.max(lead.sequence.intervalDays || 7, MIN_INTERVAL_DAYS);
    const max = Math.min(lead.sequence.maxSends || MAX_SENDS_CAP, MAX_SENDS_CAP);
    lead.sequence.sentCount = (lead.sequence.sentCount || 0) + 1;
    lead.sequence.lastSentAt = new Date();

    if (lead.sequence.sentCount >= max) {
      lead.sequence.enabled = false;
      lead.sequence.nextSendAt = null;
      lead.sequence.stoppedReason = `All ${max} emails sent.`;
    } else {
      lead.sequence.nextSendAt = new Date(Date.now() + interval * DAY);
      lead.sequence.stoppedReason = '';
    }

    if (lead.status === 'to-contact') lead.status = 'contacted';
    lead.lastContactedAt = new Date();
  } else {
    // A failed send does not burn one of the six. It does back the schedule
    // off, so a misconfigured key does not retry every fifteen minutes.
    lead.sequence.nextSendAt = new Date(Date.now() + DAY);
    lead.sequence.stoppedReason = `Last attempt failed: ${error.slice(0, 200)}`;
  }

  await lead.save();
  return { sent: ok, reason: ok ? '' : error, sentCount: lead.sequence.sentCount };
}

// ── The sweep ────────────────────────────────────────────────────────────────

/**
 * Send every follow-up that is due.
 *
 * Claims each lead by clearing nextSendAt under a condition before sending, so
 * two overlapping runs cannot both send the same email.
 */
export async function runOutreachSweep({ limit = 25 } = {}) {
  const now = new Date();
  const due = await ColdLead.find({
    'sequence.enabled': true,
    'sequence.nextSendAt': { $ne: null, $lte: now },
    unsubscribedAt: null,
  }).select('_id').limit(limit).lean();

  const results = { due: due.length, sent: 0, skipped: 0, failed: 0 };

  for (const { _id } of due) {
    // Claim: only one run can flip nextSendAt away from a due value.
    const claimed = await ColdLead.findOneAndUpdate(
      { _id, 'sequence.nextSendAt': { $ne: null, $lte: now } },
      { $set: { 'sequence.nextSendAt': null } },
      { new: false }
    );
    if (!claimed) continue; // another run got it

    try {
      const r = await sendNext(String(_id));
      if (r.sent) results.sent += 1; else results.skipped += 1;
    } catch (err) {
      results.failed += 1;
      console.error(`[outreach] send failed for ${_id}:`, err.message);
    }
  }

  if (results.due) console.log('[outreach] sweep', JSON.stringify(results));
  return results;
}

// ── Unsubscribe ──────────────────────────────────────────────────────────────

export async function unsubscribeByToken(token) {
  if (!token) return null;
  const lead = await ColdLead.findOneAndUpdate(
    { unsubscribeToken: token },
    {
      $set: {
        unsubscribedAt: new Date(),
        status: 'dead',
        'sequence.enabled': false,
        'sequence.nextSendAt': null,
        'sequence.stoppedReason': 'They unsubscribed.',
      },
    },
    { new: true }
  ).lean();
  return lead;
}

// ── Sequence settings ────────────────────────────────────────────────────────

export async function setSequence(leadId, { subject, body, orgContext, name, intervalDays, maxSends, enabled }) {
  const lead = await ColdLead.findById(leadId);
  if (!lead) throw new Error('Lead not found.');
  if (lead.unsubscribedAt && enabled) throw new ValidationError('They unsubscribed — a sequence cannot be restarted.');

  if (subject !== undefined) lead.sequence.subject = String(subject).slice(0, 300);
  if (body !== undefined)    lead.sequence.body    = String(body).slice(0, 10000);
  if (orgContext !== undefined) lead.orgContext    = String(orgContext).slice(0, 4000);
  // Editable from the composer as well as the add form: the name is the first
  // word a prospect reads, and "Hi there," went out because there was nowhere
  // on the screen to type it.
  if (name !== undefined) lead.name = String(name).trim().slice(0, 120);

  if (intervalDays !== undefined) {
    const n = Number(intervalDays);
    if (!Number.isFinite(n)) throw new ValidationError('intervalDays must be a number.');
    if (n < MIN_INTERVAL_DAYS) throw new ValidationError(`Follow-ups must be at least ${MIN_INTERVAL_DAYS} days apart.`);
    lead.sequence.intervalDays = Math.round(n);
  }

  if (maxSends !== undefined) {
    const n = Number(maxSends);
    if (!Number.isFinite(n) || n < 1) throw new ValidationError('maxSends must be at least 1.');
    if (n > MAX_SENDS_CAP) throw new ValidationError(`At most ${MAX_SENDS_CAP} emails per lead.`);
    lead.sequence.maxSends = Math.round(n);
  }

  if (enabled !== undefined) {
    lead.sequence.enabled = !!enabled;
    if (enabled) {
      if (!lead.sequence.subject || !lead.sequence.body) throw new ValidationError('Write a subject and a message first.');
      lead.sequence.stoppedReason = '';
      // Starting a sequence schedules the first email now rather than sending
      // it inline, so turning it on never blocks the request on Brevo.
      if (!lead.sequence.nextSendAt) lead.sequence.nextSendAt = new Date();
    } else {
      lead.sequence.nextSendAt = null;
      lead.sequence.stoppedReason = 'Paused.';
    }
  }

  await lead.save();
  return lead.toObject();
}

/**
 * Whether outreach could send right now, and what would stop it.
 *
 * Separate from canSend because that answers "may this lead be emailed"; this
 * answers "is the machinery wired up at all", which is the question during a
 * provider migration.
 */
export function outreachReadiness() {
  const base = publicBase();
  return {
    unsubscribeBase: base,
    canBuildUnsubscribeLink: !!base,
    minIntervalDays: MIN_INTERVAL_DAYS,
    maxSends: MAX_SENDS_CAP,
    schedulerDisabled: process.env.OUTREACH_SWEEP_DISABLED === 'true',
  };
}

// ── The shared template ──────────────────────────────────────────────────────

/**
 * What a brand-new lead starts from when nothing has been written yet.
 *
 * Deliberately carries {{context}} on its own line: the surrounding paragraphs
 * are the same for everyone, and the sentence that earns a reply is the one
 * about their business. Seeing the token sitting alone makes that obvious
 * without a paragraph of instructions on the screen.
 */
const STARTER_TEMPLATE = {
  subject: 'An AI opportunity blueprint for {{company}}',
  body: `Hi {{name}},

{{context}}

SvargAI takes a business problem described in plain English and returns a
working application — deployed, running, with the source code handed over.
Not a mockup. Something you open and use, usually inside fifteen minutes.

You can try it on your own problem here:
{{link}}

I'd genuinely like to hear what you make of it.

Best,
Pranesh
Founder, SvargAI`,
};

export async function getTemplate() {
  const doc = await OutreachTemplate.findOne({ key: 'default' }).lean();
  if (doc && (doc.subject || doc.body)) return { subject: doc.subject, body: doc.body };
  return { ...STARTER_TEMPLATE };
}

export async function setTemplate({ subject, body, updatedByUserId }) {
  const set = { updatedByUserId: updatedByUserId || null };
  if (subject !== undefined) set.subject = String(subject).slice(0, 300);
  if (body !== undefined)    set.body    = String(body).slice(0, 10000);
  if (!Object.keys(set).length) throw new ValidationError('Nothing to update.');

  return OutreachTemplate.findOneAndUpdate(
    { key: 'default' },
    { $set: set, $setOnInsert: { key: 'default' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

/**
 * The email exactly as this lead would receive it, without sending anything.
 *
 * The point of a preview is to catch an unfilled {{context}} or a stray token
 * before a stranger reads it, which a preview built any other way could not do
 * — so it runs the same fill() the real send does.
 */
export async function previewFor(leadId) {
  const lead = await ColdLead.findById(leadId).lean();
  if (!lead) throw new Error('Lead not found.');
  const tpl = await getTemplate();
  const subject = lead.sequence?.subject || tpl.subject;
  const body    = lead.sequence?.body    || tpl.body;
  return {
    to: lead.email,
    subject: fill(subject, lead),
    body: fill(body, lead),
    link: trackedLink(lead),
    missingContext: /\{\{\s*context\s*\}\}/i.test(body) && !lead.orgContext,
  };
}
