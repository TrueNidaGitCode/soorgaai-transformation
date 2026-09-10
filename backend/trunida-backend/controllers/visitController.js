/**
 * Svarg — recording that someone opened the site
 *
 * One public endpoint, called by the landing page once per browser session.
 *
 * ── Why this is a beacon and not a middleware ───────────────────────────────
 *
 * Logging every request that reaches the API would count asset fetches, health
 * checks, the sales board polling itself and every call the app makes while a
 * customer works — thousands of rows describing nobody. The page knows when a
 * person arrived; the server does not. So the page says so, once, and the
 * server records who said it.
 *
 * ── Never a reason for the page to fail ─────────────────────────────────────
 *
 * A visit record is worth nothing next to the visit itself. Every failure here
 * returns 204 and is swallowed: a full disk, a bad payload or a database that
 * is briefly away must not produce a console error on a prospect's first look
 * at the product.
 */

import SiteVisit from '../models/SiteVisit.js';
import { resolveVisitCountry, truncateIp } from '../services/geoService.js';

/**
 * The same shape of protection the guest generator uses: in-memory, per-IP,
 * resets on deploy. It is not there to stop a determined flood — Railway sits
 * in front of that — but to keep one enthusiastic tab from writing a thousand
 * rows and making the number a lie.
 */
const MAX_PER_WINDOW = 30;
const WINDOW_MS = 60 * 60 * 1000;
const _hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const hits = (_hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) { _hits.set(ip, hits); return true; }
  hits.push(now);
  _hits.set(ip, hits);
  return false;
}

/** POST /api/guest/visit — public, unauthenticated, fire-and-forget. */
export async function recordVisit(req, res) {
  // Answer first. The page is not waiting on us and must never be.
  res.status(204).end();

  try {
    /**
     * Rate limiting sees the full address; the database never does.
     *
     * The limiter is transient and in memory — a security control for the
     * length of a window, not a record. Truncating there would let one abusive
     * host spend a whole /24's quota. Everything that is written down is the
     * network block instead, which answers "is this the same office coming
     * back" without identifying a machine.
     */
    const fullIp = req.ip || '';
    if (tooMany(fullIp)) return;
    const ip = truncateIp(fullIp);

    const visitorId = String(req.body?.visitorId || '').slice(0, 64);
    const ref = String(req.body?.ref || '').slice(0, 64);

    /**
     * One row per session, enforced here as well as in the page.
     *
     * The browser only posts once per session, but a reload of a page that
     * failed halfway, or two tabs opened together, can both arrive. Collapsing
     * anything from the same visitor within the hour keeps the count meaning
     * "a person came to look" rather than "a tab was opened".
     */
    if (visitorId) {
      const recent = await SiteVisit.findOne({
        visitorId,
        createdAt: { $gt: new Date(Date.now() - WINDOW_MS) },
      }).select('_id').lean();
      if (recent) return;
    }

    const visit = await SiteVisit.create({
      ip,
      visitorId,
      ref,
      path:      String(req.body?.path || '').slice(0, 200),
      referer:   String(req.get('referer') || '').slice(0, 300),
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
    });

    // Where they are, resolved after the fact. Never awaited: a geolocation
    // service being slow is not a reason for anything here to be slow, and the
    // row is already saved and useful without it.
    resolveVisitCountry(SiteVisit, visit._id, ip);
  } catch (err) {
    console.error('[visit] non-fatal:', err.message);
  }
}
