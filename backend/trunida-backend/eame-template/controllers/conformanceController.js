/**
 * The conformance report, for whoever is entitled to ask for it.
 *
 * Two callers, and they authenticate differently on purpose.
 *
 * ── Svarg ───────────────────────────────────────────────────────────────────
 *
 * Svarg runs this at go-live and whenever the report is refreshed, and it must
 * do so without becoming a user of the customer's application. Signing in as
 * somebody would create an account and spend one of their seats: a compliance
 * check that quietly adds a user is its own finding.
 *
 * So it presents a short-lived token signed with SVARG_AUTH_SECRET — the same
 * secret this application already verifies sign-ins with, derived by Svarg from
 * the deployment id and never stored by either side. The difference is the
 * purpose claim: an assertion that says `conformance` may run this and nothing
 * else, and a sign-in assertion cannot be replayed here to get one. No session
 * is minted, no user is recorded, no seat is taken.
 *
 * ── The owner ───────────────────────────────────────────────────────────────
 *
 * The person who created the application can ask for the same report from
 * inside it, with their ordinary session. They are already a user; nothing is
 * created by asking.
 *
 * ── Why a failing report is still a 200 ─────────────────────────────────────
 *
 * The check ran and produced findings. That is a successful request with an
 * unhappy answer, and it is the difference between "this application has three
 * findings" and "the report could not be produced" — which a status code alone
 * would make indistinguishable.
 */

import jwt from 'jsonwebtoken';
import { runConformance } from '../services/conformance.js';

/** This application's id, as Svarg addresses it. */
function tenantId() {
  try { return new URL(process.env.SVARG_AUTH_URL).searchParams.get('tenant') || ''; } catch { return ''; }
}

/**
 * Svarg, asking — or nobody.
 *
 * Verified against the same secret, issuer and audience as a sign-in, plus a
 * purpose of its own. Without the purpose check, an assertion minted to sign
 * somebody in would also start a paid run of the suite.
 */
export function svargOnly(req, res, next) {
  const secret = process.env.SVARG_AUTH_SECRET || '';
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !token) {
    return res.status(403).json({ error: 'This report is for Svarg or the application owner.' });
  }
  try {
    const claim = jwt.verify(token, secret, { issuer: 'svarg', audience: tenantId() });
    if (claim.purpose !== 'conformance') {
      return res.status(403).json({ error: 'That token is not for this.' });
    }
    return next();
  } catch {
    return res.status(403).json({ error: 'That token has expired or is not for this application.' });
  }
}

/**
 * Either door. Svarg's token, or the owner's own session — checked in that
 * order because Svarg's is the automated path and carries no session at all.
 */
export function svargOrOwner(protect, ownerOnly) {
  return (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const secret = process.env.SVARG_AUTH_SECRET || '';
    if (secret && token) {
      try {
        const claim = jwt.verify(token, secret, { issuer: 'svarg', audience: tenantId() });
        if (claim.purpose === 'conformance') return next();
      } catch { /* not Svarg's — fall through to the ordinary session check */ }
    }
    return protect(req, res, (err) => (err ? next(err) : ownerOnly(req, res, next)));
  };
}

/** POST /api/conformance — run the checks now and return what they found. */
export async function runReport(req, res) {
  try {
    const report = await runConformance();
    return res.json(report);
  } catch (err) {
    // Never a 500 with a stack. The caller is a machine that has to record
    // something, and "it could not run, here is why" is recordable.
    console.error('[conformance] the suite could not run:', err.message);
    return res.status(200).json({
      ok: false,
      ran: false,
      passed: 0,
      failed: 0,
      skipped: 0,
      checks: [],
      at: new Date().toISOString(),
      error: String(err.message || err).slice(0, 300),
    });
  }
}
