/**
 * SoorgaAI — Mail Service
 *
 * Two delivery paths, checked in order:
 *
 *   1. Brevo HTTP API (preferred on Railway — outbound SMTP ports are
 *      blocked there, HTTPS is not):
 *        BREVO_API_KEY  — xkeysib-… from Brevo → Settings → SMTP & API
 *        Sender address — EMAIL_FROM or EMAIL_USER; must be a verified
 *                         sender in Brevo (Senders & Domains → Senders)
 *
 *   2. SMTP via nodemailer (works for local/dev or hosts with open egress):
 *        EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
 *
 * When neither is configured:
 *   - development: the OTP is logged to the server console so the flow can
 *     be exercised end-to-end without a mailbox
 *   - production: callers should surface "email sign-in unavailable" — check
 *     `mailConfigured` before relying on delivery
 */

import nodemailer from 'nodemailer';

const BREVO_API_KEY = process.env.BREVO_API_KEY;

const smtpConfigured = !!(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
);

export const mailConfigured = !!BREVO_API_KEY || smtpConfigured;

/**
 * How mail is configured, for the boot log.
 *
 * Written after an OTP that was never sent looked exactly like an OTP that
 * was: with nothing configured, sendOtpEmail logged the code and returned,
 * the endpoint answered "Code sent", and the only trace was one line in a
 * container log nobody had reason to open. Saying this once at startup is
 * the difference between "email is down" and "email was never turned on".
 */
export function describeMailConfig() {
  return {
    transport: BREVO_API_KEY ? 'brevo' : (smtpConfigured ? 'smtp' : 'none'),
    sender: senderParts().email || '',
    configured: mailConfigured,
  };
}

// Sender: parse 'Name <addr>' out of EMAIL_FROM, fall back to EMAIL_USER
function senderParts() {
  const raw = process.env.EMAIL_FROM || process.env.EMAIL_USER || '';
  const match = raw.match(/^(.*?)\s*<(.+)>$/);
  if (match) return { name: match[1].trim() || 'SoorgaAI', email: match[2].trim() };
  return { name: 'SoorgaAI', email: raw.trim() };
}

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host:   process.env.EMAIL_HOST,
      port:   Number(process.env.EMAIL_PORT || 587),
      secure: Number(process.env.EMAIL_PORT || 587) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // Fail fast instead of hanging the request when the host blocks
      // outbound SMTP or the server is unreachable
      connectionTimeout: 10000,
      greetingTimeout:   10000,
      socketTimeout:     15000,
    })
  : null;

function otpSubject(code) { return `${code} is your SoorgaAI sign-in code`; }

function otpText(code) {
  return `Your SoorgaAI sign-in code is: ${code}

It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
}

function otpHtml(code) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 4px;color:#111">Soorga<span style="color:#5CC5A7">AI</span></h2>
  <p style="color:#444;font-size:14px">Use this code to sign in:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111;margin:16px 0">${code}</p>
  <p style="color:#888;font-size:12.5px">The code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
</div>`;
}

async function sendViaBrevo({ to, replyTo, subject, text, html }) {
  const body = {
    sender:      senderParts(),
    to:          [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html,
  };
  if (replyTo) body.replyTo = { email: replyTo };

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key':      BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`Brevo ${resp.status}: ${errBody.slice(0, 300)}`);
  }
}

async function sendViaSmtp({ to, replyTo, subject, text, html }) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    replyTo,
    subject,
    text,
    html,
  });
}

// Generic send — both sendOtpEmail and sendContactFormEmail funnel through
// this so the Brevo/SMTP branching and "not configured" fallback only
// live in one place.
async function sendMail({ to, replyTo, subject, text, html, logLabel }) {
  if (!mailConfigured) {
    console.log(`[mail] Not configured — ${logLabel || 'email'} for ${to} not sent`);
    return;
  }

  try {
    if (BREVO_API_KEY) {
      await sendViaBrevo({ to, replyTo, subject, text, html });
    } else {
      await sendViaSmtp({ to, replyTo, subject, text, html });
    }
  } catch (err) {
    // Failure class in server logs: ETIMEDOUT/ESOCKET = egress blocked or
    // unreachable; EAUTH = bad SMTP credentials; Brevo 401 = bad API key
    console.error(`[mail] ${logLabel || 'Send'} failed for ${to}: code=${err.code || 'n/a'} — ${err.message}`);
    throw err;
  }
}

/**
 * @returns {Promise<'sent'|'console'>} — how the code reached the user.
 *
 * Returning this rather than nothing is the point: the caller has to decide
 * what to tell someone staring at an empty inbox, and it cannot do that if
 * "delivered" and "written to a log file" are the same return value.
 */
export async function sendOtpEmail(to, code) {
  if (!mailConfigured) {
    console.warn(`[mail] NOT CONFIGURED — OTP for ${to} was not emailed. The code is: ${code}`);
    return 'console';
  }
  await sendMail({
    to,
    subject: otpSubject(code),
    text:    otpText(code),
    html:    otpHtml(code),
    logLabel: 'OTP send',
  });
  return 'sent';
}

const CONTACT_FORM_RECIPIENT = 'praneshbabykannan@soorgaai.com';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sends a contact-form submission to CONTACT_FORM_RECIPIENT, with the
 * submitter set as replyTo so a direct "Reply" goes straight to them.
 */
export async function sendContactFormEmail({ name, email, company, message }) {
  const subject = `New contact form submission — ${name}`;
  const text = `Name: ${name}
Email: ${email}
Company: ${company || '(not provided)'}

${message}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px;color:#111">New contact form submission</h2>
  <p style="margin:0 0 6px;color:#444"><strong>Name:</strong> ${escapeHtml(name)}</p>
  <p style="margin:0 0 6px;color:#444"><strong>Email:</strong> ${escapeHtml(email)}</p>
  <p style="margin:0 0 16px;color:#444"><strong>Company:</strong> ${escapeHtml(company || '(not provided)')}</p>
  <p style="margin:0 0 4px;color:#444"><strong>Message:</strong></p>
  <p style="white-space:pre-wrap;color:#222">${escapeHtml(message)}</p>
</div>`;

  await sendMail({
    to:      CONTACT_FORM_RECIPIENT,
    replyTo: email,
    subject,
    text,
    html,
    logLabel: 'Contact form send',
  });
}
