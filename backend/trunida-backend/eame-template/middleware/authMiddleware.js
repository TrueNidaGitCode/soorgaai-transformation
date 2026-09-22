/**
 * Who is making this request, in a delivered application.
 *
 * ── Why this file exists rather than being borrowed ────────────────────────
 *
 * Every delivered application used to be shipped Svarg's OWN auth middleware,
 * copied out of the platform repository. It worked, because both sides mint
 * the same token — `{ userId, role }` signed with JWT_SECRET — but it carried
 * something that has no meaning here: a `lastSeenAt` write against Svarg's
 * User model, reached by a dynamic import of `../models/user.js`.
 *
 * A delivered application has no such model. At runtime the import failed and
 * was swallowed, so nothing broke and nobody noticed. Then verification, which
 * reads imports rather than running them, correctly refused to pass a project
 * containing a reference to a file that is not in it — and a clinic's build
 * failed three times over a line that existed to record analytics for a
 * different product.
 *
 * So the application owns its own. The rule it makes concrete: a customer's
 * application should carry nothing that exists for Svarg's benefit. It has its
 * own users, its own database and its own reasons; how often somebody signs in
 * to Svarg is not one of them.
 *
 * ── The contract ───────────────────────────────────────────────────────────
 *
 * Identical to what this application already issues — see authController's
 * jwt.sign and scripts/mint-token.mjs. Same secret, same claims, same shape on
 * req.user, so nothing that reads req.user needs to change.
 */
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

/** The claims this application signs, as the rest of the code expects them. */
function asUser(decoded) {
  return {
    // Both spellings, because some readers use _id and some use id.
    _id: decoded.userId,
    id: decoded.userId,
    role: decoded.role || 'user',
    email: decoded.email || '',
  };
}

/** A session is required. Anything without a valid one is refused. */
export const protect = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    req.user = asUser(jwt.verify(token, SECRET_KEY));
    return next();
  } catch (err) {
    // Said once, without the token in it. A log line carrying a live session
    // is a credential sitting in a log file.
    console.error('[auth] token rejected:', err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * A session is welcome but not required.
 *
 * An expired or malformed token is treated as anonymous rather than refused:
 * the caller asked for a page that does not need a session, and failing it
 * because of a stale one would be worse than serving it.
 */
export const optionalAuth = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) return next();

  const token = authHeader.split(' ')[1];
  if (!token) return next();

  try {
    req.user = asUser(jwt.verify(token, SECRET_KEY));
  } catch {
    /* anonymous */
  }
  return next();
};

export default protect;
