/**
 * Svarg — sign-in for the applications it delivers
 *
 * A delivered application lets its people in with Google, the way Svarg's
 * own front door does. It cannot talk to Google itself: Google only answers
 * a callback address registered in advance, one per site, and every
 * application runs on an address of its own that nobody registered. So the
 * application sends the person to Svarg's Google sign-in with its tenant id,
 * Svarg does the exchange on the one callback it has, and hands the
 * application a short-lived ASSERTION -- who this is, signed with a secret
 * only that application holds. The application keeps its own user record
 * and mints its own session from it (eame-template/controllers/
 * authController.js). Svarg keeps nothing about the person: no user is
 * created here, the profile is in flight for the length of one redirect.
 *
 * The secret is derived, not stored: HMAC of the deployment id under
 * Svarg's JWT_SECRET. It goes to the tenant's environment once, and Svarg
 * recomputes it whenever it has to sign, so there is no second credential
 * to keep and nothing new to leak from the database.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const ASSERTION_TTL = '5m';

function rootKey() {
  return process.env.JWT_SECRET || '';
}

/** The secret one application verifies assertions with. '' when Svarg has no JWT_SECRET. */
export function tenantAuthSecret(deploymentId) {
  const key = rootKey();
  if (!key || !deploymentId) return '';
  return crypto.createHmac('sha256', key).update('svarg-tenant-auth:' + String(deploymentId)).digest('hex');
}

/**
 * What the tenant's environment carries so its door can offer Google:
 * where to send the person, and the secret to check what comes back.
 * Empty when it cannot be offered, and the application then falls back
 * to the open session it always had.
 */
export function tenantAuthEnv({ deployment, gatewayBaseUrl }) {
  const id = deployment?._id ? String(deployment._id) : '';
  const secret = tenantAuthSecret(id);
  if (!secret || !gatewayBaseUrl) return {};
  let origin;
  try { origin = new URL(gatewayBaseUrl).origin; } catch { return {}; }
  return {
    SVARG_AUTH_URL: `${origin}/api/auth/oauth/google?tenant=${encodeURIComponent(id)}`,
    SVARG_AUTH_SECRET: secret,
  };
}

/**
 * Where Svarg may send the person back to: the address the deployment is
 * recorded at, and nothing else. A return_to that names any other origin
 * is refused, so a link cannot use Svarg's sign-in to land a Google
 * profile somewhere of its own choosing. Returns the checked origin, or ''.
 */
export function returnOrigin(deployment, returnTo) {
  const recorded = String(deployment?.railway?.url || '').trim();
  if (!recorded || !returnTo) return '';
  try {
    const want = new URL(String(returnTo)).origin;
    const have = new URL(/^https?:\/\//i.test(recorded) ? recorded : 'https://' + recorded).origin;
    return want === have ? want : '';
  } catch {
    return '';
  }
}

/** The signed assertion the application exchanges for its own session. */
export function signAssertion({ deployment, profile }) {
  const id = String(deployment._id);
  const secret = tenantAuthSecret(id);
  if (!secret) throw new Error('Svarg has no JWT_SECRET, so it cannot sign for a tenant.');
  return jwt.sign({
    sub: String(profile.sub || ''),
    email: String(profile.email || '').toLowerCase(),
    name: String(profile.name || ''),
    picture: String(profile.picture || ''),
    provider: 'google',
  }, secret, { issuer: 'svarg', audience: id, expiresIn: ASSERTION_TTL });
}
