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

async function sendViaBrevo(to, code) {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key':      BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body: JSON.stringify({
      sender:      senderParts(),
      to:          [{ email: to }],
      subject:     otpSubject(code),
      textContent: otpText(code),
      htmlContent: otpHtml(code),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Brevo ${resp.status}: ${body.slice(0, 300)}`);
  }
}

async function sendViaSmtp(to, code) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: otpSubject(code),
    text:    otpText(code),
    html:    otpHtml(code),
  });
}

export async function sendOtpEmail(to, code) {
  if (!mailConfigured) {
    console.log(`[mail] Not configured — OTP for ${to}: ${code}`);
    return;
  }

  try {
    if (BREVO_API_KEY) {
      await sendViaBrevo(to, code);
    } else {
      await sendViaSmtp(to, code);
    }
  } catch (err) {
    // Failure class in server logs: ETIMEDOUT/ESOCKET = egress blocked or
    // unreachable; EAUTH = bad SMTP credentials; Brevo 401 = bad API key
    console.error(`[mail] OTP send failed for ${to}: code=${err.code || 'n/a'} — ${err.message}`);
    throw err;
  }
}
