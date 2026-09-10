/**
 * Svarg — somebody opened the site
 *
 * The top of the funnel above the top of the funnel.
 *
 * Discovery records a guest who typed a business objective and generated a
 * blueprint. That is a real signal and a rare one: it takes intent, effort and
 * about a minute. Everyone who opened the link, read the page and closed it
 * left no trace at all — so nine cold emails and four warm introductions could
 * produce twenty visits and the board would show the same empty column it
 * shows for none.
 *
 * That gap is the marketing question. "Did the message land" is answered by
 * opens; "was it interesting" is answered by generations. Only the second was
 * measurable, which made the first unanswerable and the second impossible to
 * read — a zero could mean nobody came or everybody bounced, and those call for
 * opposite fixes.
 *
 * ── One row per session, not per page view ──────────────────────────────────
 *
 * The browser posts once per session, so a visitor who scrolls, opens a second
 * tab and comes back is one row. Page views would make the number large and
 * meaningless; sessions are the thing a person actually did.
 *
 * ── What this is not ────────────────────────────────────────────────────────
 *
 * Not analytics. There is no event stream, no funnel of clicks, no profile that
 * follows anyone between sessions. It records that an address opened the site,
 * when, and which link brought them — which is exactly what is needed to say
 * whether the outreach worked, and nothing beyond it.
 *
 * The IP is kept because it is the only way to tell one company returning from
 * several unrelated strangers; it is the same field, captured the same way, as
 * the one already stored on a guest blueprint.
 */

import mongoose from 'mongoose';

const siteVisitSchema = new mongoose.Schema({
  /**
   * The visitor's address, from req.ip.
   *
   * Trustworthy because server.js sets `trust proxy`, so this is the client
   * rather than Railway's edge. Empty is a real possibility and means the
   * request arrived without one — never "same as another empty".
   */
  ip:          { type: String, default: '', index: true },
  country:     { type: String, default: '' },
  countryName: { type: String, default: '' },

  /**
   * The ref from the tracked link, when they arrived on one.
   *
   * This is what turns "someone opened the site" into "the person you messaged
   * on Tuesday opened the site", and it is the entire reason this record is
   * worth keeping rather than counting.
   */
  ref: { type: String, default: '', index: true },

  /**
   * A per-browser id the page generates and keeps.
   *
   * Not a login and not a fingerprint — a random string in localStorage. It
   * exists so a returning visitor reads as the same person rather than as a
   * new one every time, which is the difference between "six people looked" and
   * "one person looked six times". Cleared with their site data, and that is
   * the correct behaviour: a visitor who wants to be anonymous stays anonymous.
   */
  visitorId: { type: String, default: '', index: true },

  /** Which page, and what sent them there. */
  path:      { type: String, default: '' },
  referer:   { type: String, default: '' },
  userAgent: { type: String, default: '' },

  /**
   * Set when this visitor went on to generate a blueprint.
   *
   * Written by the guest controller using the same visitorId, so the board can
   * separate "opened and left" from "opened and tried it" — which is the one
   * comparison that says whether the landing page is doing its job.
   */
  guestId: { type: String, default: '', index: true },
}, { timestamps: true });

/**
 * A visitor's sessions, newest first. The board reads by recency and nothing
 * else, so one index covers it.
 */
siteVisitSchema.index({ createdAt: -1 });

/**
 * Ninety days, then gone — enforced by MongoDB rather than by remembering.
 *
 * These rows are about campaigns, and a campaign is over long before three
 * months are up. Keeping them beyond that would mean holding data on people
 * who visited once, for a question nobody is going to ask, which is the
 * definition of collecting more than is needed.
 *
 * A TTL index deletes them whether or not anyone thinks about it again, which
 * is the only kind of retention policy that survives contact with a busy year.
 */
siteVisitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model('SiteVisit', siteVisitSchema);
