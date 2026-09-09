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
import { generate } from './llmService.js';
import { readCompanySite } from './websiteService.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { resolveUseCase } from './blueprintUseCase.js';
import { motionEmails, motionOf, DEFAULT_MOTION } from './gtmMotions.js';

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

  // Only one motion sends anything.
  //
  // First gate on purpose. A warm introduction, a design partner or a workshop
  // attendee reached you through a person who vouched for you, and the fastest
  // way to spend that is a templated cold email arriving from a sweep. This is
  // checked here rather than on the screen because the sweep does not go
  // through the screen, and because re-filing a lead into another lane must
  // stop the machinery immediately rather than at the next page load.
  if (!motionEmails(lead.motion || DEFAULT_MOTION)) {
    const m = motionOf(lead.motion || DEFAULT_MOTION);
    return { ok: false, reason: `${m.label} is not an email motion — Svarg never sends automatically on this lane.` };
  }

  // Belt and braces behind the motion gate above. Email is optional on the
  // model now, so "no address" is a state that can reach here rather than one
  // the schema ruled out — and a send to undefined fails at the provider with
  // a message about the provider rather than about the lead.
  if (!String(lead.email || '').trim()) {
    return { ok: false, reason: 'No email address on this lead — only a mobile number.' };
  }

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
  const filledSubject = fill(subject, lead);

  // Checked here as well as at generation, because the subject can be swapped
  // to an alternate afterwards — and Preview is the last thing seen before
  // Send. Only runs when the subject actually makes the claim.
  const unbackedClaim = makesStoryClaim(filledSubject) && !(await blueprintForCompany(lead.company))
    ? storyWarning(lead) : '';

  return {
    to: lead.email,
    subject: filledSubject,
    body: fill(body, lead),
    link: trackedLink(lead),
    alternates: (lead.subjectAlternates || []).map(a => fill(a, lead)),
    missingContext: /\{\{\s*context\s*\}\}/i.test(body) && !lead.orgContext,
    unbackedClaim,
  };
}

// ── Writing the email ────────────────────────────────────────────────────────

/**
 * Who we sell to, and how each one is approached.
 *
 * This is the ICP, stated once and given to the model verbatim. It is here
 * rather than on the screen because the screen can only remind a person; the
 * model has to be told, every time, or "tailored by function" becomes three
 * identical emails with a different job title at the top.
 */
export const ICP = [
  {
    match: /engineering|cto|vp eng|head of eng|platform|technology/i,
    label: 'VP of Engineering',
    brief: 'Holds budget for engineering productivity tools. Approach directly: '
         + 'crisp, concrete, no marketing language, and offer the self-serve route '
         + 'rather than a meeting. They will judge it on whether the thing works.',
  },
  {
    match: /marketing|growth|demand/i,
    label: 'VP of Marketing',
    brief: 'Approach with a proposition matched to their team size, company scale '
         + 'and how they actually operate. Lead with the operational load their '
         + 'team carries, not with the technology.',
  },
  {
    match: /sales|revenue|cro|business development/i,
    label: 'VP of Sales',
    brief: 'Approach with a proposition matched to their team size, company scale '
         + 'and how they actually operate. Lead with what slows the revenue motion '
         + 'down, not with the technology.',
  },
];

export function icpFor(role) {
  const r = String(role || '');
  return ICP.find(p => p.match.test(r)) || null;
}

const WRITER_PROMPT =
`You write one cold email for Svarg, an AI transformation platform.

Svarg takes a business problem described in plain English and returns a working
AI application — deployed, running, with the source code handed over — usually
inside fifteen minutes. It decides what to build, what data it needs, builds it
and puts it live. It is not a code assistant: the user does not have to know
what to build.

WHAT TO WRITE
Return ONLY compact JSON, no other text:
{"subject": "...", "alternates": ["...", "..."], "context": "..."}

subject     The line that decides whether any of this gets read.
alternates  Two more, each taking a DIFFERENT angle from the first and from
            each other — not three rewordings of one idea.
context     TWO sentences. Not three. It is dropped into a template that
            already carries the pitch and the link, so write only the part
            that is about them.

WRITING THE TWO SENTENCES
Sentence one — what they visibly do, and where their effort therefore goes:
  "With <company> working on <what they actually build>, I imagine a lot of
   <their function>'s bandwidth naturally goes toward <their core work>."

Sentence two — the common need that sits AROUND that core:
  "Yet teams often still need <the unglamorous work nobody is staffed for>."

HEDGE THE FIRST SENTENCE. "I imagine", "I'd guess", "presumably". You are
outside their company looking in, and writing as though you know their sprint
allocation is the fastest way to be dismissed by someone who actually does.
A reader forgives a guess offered as a guess; they do not forgive being told
about their own team.

GENERALISE THE SECOND. "teams often", "usually", "tends to". The pain is a
pattern you have seen, not an accusation about them specifically — which is
also the honest framing, because you have not seen inside their backlog.

Name the core work from their website. That specificity is what makes the
guess land as informed rather than generic.

Do not pitch, do not mention Svarg, do not propose anything. The template
does all of that immediately below. These two sentences exist only to show
you understood what they do before asking for their time.

WRITING THE SUBJECT
Four to eight words. Under 50 characters — a phone truncates around forty, and
a subject that arrives cut in half has already failed.

Write it the way one person writes to another, not the way a company writes to
a list. Sentence case, or plain lowercase. Title Case Reads As A Campaign.

Earn the open with specificity, never with curiosity you do not pay off. Name
their company, their function's actual problem, or something true you read on
their site. A subject the body then delivers on is what makes the second email
get opened too — and there are five more after this one.

Three angles. The subject takes one and the two alternates take the other two,
so the operator is choosing between real options rather than three rewordings:

  STORY    I gave <company>'s problem to an AI
           I ran <company> through it
  PROBLEM  <company>'s <the problem their function owns>
           a question about <company>'s <specific thing>
  OUTCOME  <their specific thing>, without the build
           fifteen minutes, one running app

BANNED, all of it. Every one of these is either a spam-filter trigger, a
marketing tell, or a lie:
  transform · unlock · revolutionise · supercharge · boost · game-changer
  AI-powered · cutting-edge · solution · leverage · synergy · elevate
  exclamation marks · ALL CAPS · emoji · "FREE" · "URGENT" · "ACT NOW"
  fake "Re:" or "Fwd:" prefixes · [BRACKETS] · a personal name you were not given

Never promise in the subject what the paragraph does not deliver. This domain
has almost no sending history: one spam complaint costs more than every open a
clever subject could win.

RULES
- Write about THEIR business. If you were given text from their website, use
  something specific and true from it. If you were not, stay at the level of
  what their function plainly involves — never invent a product, a customer,
  a metric, a funding round or a headcount.
- Plain sentences a person would actually type. No bullet points, no bold, no
  markdown, no greeting, no sign-off — the template supplies those.
- Never claim to have used their product, met them, or been referred.
- If you genuinely have nothing specific, write about the problem their
  function owns. A short honest paragraph beats a confident invented one.`;

/**
 * Draft the subject and the organisation paragraph for one lead.
 *
 * Reads their website when one is given, because an email that names something
 * true about the business is the only kind worth sending — and the difference
 * between that and a generic one is entirely in what the model was shown.
 *
 * Writes the result onto the lead rather than returning it for the caller to
 * save, so a draft can never be previewed and then lost.
 */
export async function generateOutreach(leadId) {
  const lead = await ColdLead.findById(leadId);
  if (!lead) throw new Error('Lead not found.');
  if (!lead.company && !lead.role) {
    throw new ValidationError('Add an organisation or a designation first — there is nothing to write about.');
  }

  // Minted here as well as on first send, so the Preview shows the tracked link
  // the recipient will actually get. Without it the operator reviews a bare
  // svargai.com and the sent mail carries a ?ref they never saw.
  if (!lead.refCode) {
    lead.refCode = crypto.randomBytes(6).toString('base64url');
    await lead.save();
  }

  const icp = icpFor(lead.role);

  let siteText = '';
  let siteNote = 'No website was given, so nothing specific about this company was read.';
  if (lead.companyUrl) {
    try {
      const { pages } = await readCompanySite(lead.companyUrl);
      siteText = pages.slice(0, 3).map(p => `[${p.title}]\n${p.text.slice(0, 1800)}`).join('\n\n');
      siteNote = siteText ? '' : 'Their website returned no readable text.';
    } catch (err) {
      // Never fatal. A site that will not load is a reason to write a more
      // general paragraph, not a reason to refuse to write one.
      siteNote = `Their website could not be read (${err.message}). Do not invent what it might say.`;
    }
  }

  // Has their problem actually been through Svarg? The STORY angle claims it
  // has, so the writer is told the truth either way — not to block it, but so
  // a story subject can name what was found instead of gesturing at it.
  const blueprint = await blueprintForCompany(lead.company);

  const userMessage = [
    `Organisation: ${lead.company || '(not given)'}`,
    `Person: ${lead.name || '(name not given)'}`,
    `Their function: ${lead.role || '(not given)'}`,
    icp ? `\nHOW THIS FUNCTION IS APPROACHED — ${icp.label}:\n${icp.brief}` : '',
    blueprint
      ? `\nYOU HAVE RUN THEIR PROBLEM THROUGH SVARG. It returned: "${blueprint.useCase}".\n`
        + 'A STORY subject may say so, and should name that rather than being vague.'
      : '\nYOU HAVE NOT RUN THEIR PROBLEM THROUGH SVARG. A STORY subject may still\n'
        + 'speak generally about giving a problem to an AI, but must never claim a\n'
        + 'finding, a result or a number you do not have.',
    siteText ? `\nFROM THEIR WEBSITE:\n${siteText}` : `\n${siteNote}`,
  ].filter(Boolean).join('\n');

  const { text } = await generate({
    systemPrompt: WRITER_PROMPT,
    userMessage,
    label: 'outreach-writer',
    maxTokens: 700,
  });

  let parsed;
  try {
    parsed = JSON.parse(String(text).replace(/^```(?:json)?|```$/gm, '').trim());
  } catch {
    throw new Error('The model did not return usable JSON. Try Generate again.');
  }

  const subject = String(parsed.subject || '').trim().slice(0, 300);
  const context = String(parsed.context || '').trim().slice(0, 4000);
  // Kept so a different angle is one click away rather than another
  // generation — the operator knows their market better than the model does,
  // and re-rolling the whole email to change six words is a bad trade.
  const alternates = (Array.isArray(parsed.alternates) ? parsed.alternates : [])
    .map(a => String(a || '').trim().slice(0, 300))
    .filter(a => a && a !== subject)
    .slice(0, 2);
  if (!subject || !context) throw new Error('The model returned an empty draft. Try Generate again.');

  const tpl = await getTemplate();
  lead.sequence.subject = subject;
  lead.subjectAlternates = alternates;
  if (!lead.sequence.body) lead.sequence.body = tpl.body;
  lead.orgContext = context;
  await lead.save();

  return {
    subject, alternates, context,
    groundedInWebsite: !!siteText,
    hasBlueprint: !!blueprint,
    // The operator verifies the story claim rather than the system blocking it,
    // so the fact has to arrive with the draft. Empty when there is nothing to
    // check — a warning that fires on every send is one nobody reads.
    unbackedClaim: !blueprint && makesStoryClaim(subject) ? storyWarning(lead) : '',
  };
}

/**
 * Does this subject imply their problem has been through Svarg?
 *
 * Two forms, because the writer uses both. The first is explicit — "I ran
 * Zetwerk through it". The second is the gerund, "giving Flux Auto's problem to
 * an AI", which claims nothing grammatically and everything in practice: it was
 * the first subject the model actually produced, and a check that missed it
 * would have been decorative.
 */
const STORY_CLAIM = [
  /\b(i|we)\s+(gave|ran|put|built|fed|took|showed)\b/i,
  /\b(giving|running|putting|feeding|showing)\b[^.]*\b(to an ai|through it|through svarg|to svarg)\b/i,
];

export function makesStoryClaim(subject) {
  const s = String(subject || '');
  return STORY_CLAIM.some(rx => rx.test(s));
}

function storyWarning(lead) {
  const whose = lead.company ? `${lead.company}'s` : 'their';
  return `This subject says you ran ${whose} problem through Svarg. `
       + 'No blueprint exists for them yet — generate one, or pick another subject.';
}

/**
 * The most recent blueprint belonging to this company, if any.
 *
 * Matched on the company name appearing in either the stored companyName or the
 * objective text, because the objective is where a name reliably ends up and
 * companyName is often blank. Deliberately loose: this decides whether a
 * warning is shown, never whether an email may be sent, so a false positive
 * costs a warning nobody needed and a false negative costs nothing at all.
 */
async function blueprintForCompany(company) {
  const name = String(company || '').trim();
  if (name.length < 3) return null;

  // Escaped: a company name is operator input and reaches a regex here.
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(safe, 'i');

  const bp = await TransformationBlueprint
    .findOne({ archived: { $ne: true }, $or: [{ companyName: rx }, { businessObjective: rx }] })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);
  if (!bp) return null;

  const uc = resolveUseCase(bp);
  return { id: String(bp._id), useCase: uc?.name || String(bp.businessObjective).slice(0, 120) };
}
