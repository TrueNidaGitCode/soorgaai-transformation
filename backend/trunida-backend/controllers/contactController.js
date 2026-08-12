/**
 * SoorgaAI — Contact Form Controller
 *
 * Public, unauthenticated endpoint behind the marketing site's
 * "Contact us" page. Bounded by a per-IP rate limit (in-memory —
 * resets on deploy, acceptable for abuse protection, not billing-grade
 * quota) since there's no account to key off of.
 */

import { sendContactFormEmail } from '../services/mailService.js';

const MAX_MESSAGE_LENGTH = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATE_LIMIT_MAX = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const _ipHits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (_ipHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) { _ipHits.set(ip, hits); return true; }
  hits.push(now);
  _ipHits.set(ip, hits);
  return false;
}

/**
 * POST /api/contact
 * Body: { name, email, company?, message }
 */
export async function submitContactForm(req, res) {
  try {
    const name    = req.body?.name?.trim();
    const email   = req.body?.email?.trim();
    const company = req.body?.company?.trim();
    const message = req.body?.message?.trim();

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` });
    }
    if (isRateLimited(req.ip)) {
      return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    }

    await sendContactFormEmail({ name, email, company, message });
    res.json({ success: true });
  } catch (err) {
    console.error('[contact] submission failed:', err.message);
    res.status(500).json({ error: 'Something went wrong sending your message. Please try again or email us directly.' });
  }
}
