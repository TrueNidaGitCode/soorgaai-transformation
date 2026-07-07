/**
 * SoorgaAI — Mail Service
 *
 * Thin nodemailer wrapper. SMTP credentials come from env:
 *   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
 * (e.g. smtp.gmail.com / 587 / gmail address / Gmail app password)
 *
 * When SMTP is not configured:
 *   - development: the OTP is logged to the server console so the flow can
 *     be exercised end-to-end without a mailbox
 *   - production: callers should surface "email sign-in unavailable" — check
 *     `mailConfigured` before relying on delivery
 */

import nodemailer from 'nodemailer';

export const mailConfigured = !!(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
);

const transporter = mailConfigured
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

export async function sendOtpEmail(to, code) {
  if (!mailConfigured) {
    console.log(`[mail] SMTP not configured — OTP for ${to}: ${code}`);
    return;
  }

  try {
    await sendViaSmtp(to, code);
  } catch (err) {
    // Surface the exact failure class in server logs: ETIMEDOUT/ESOCKET =
    // egress blocked or unreachable; EAUTH = bad credentials
    console.error(`[mail] OTP send failed for ${to}: code=${err.code || 'n/a'} — ${err.message}`);
    throw err;
  }
}

async function sendViaSmtp(to, code) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: `${code} is your SoorgaAI sign-in code`,
    text:
`Your SoorgaAI sign-in code is: ${code}

It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html:
`<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 4px;color:#111">Soorga<span style="color:#5CC5A7">AI</span></h2>
  <p style="color:#444;font-size:14px">Use this code to sign in:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111;margin:16px 0">${code}</p>
  <p style="color:#888;font-size:12.5px">The code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
</div>`,
  });
}
