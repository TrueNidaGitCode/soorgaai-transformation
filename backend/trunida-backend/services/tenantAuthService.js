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
import EmailOtp from '../models/EmailOtp.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { sendOtpEmail, mailConfigured } from './mailService.js';

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

/**
 * Is this call from the application it claims to be? The application
 * holds the tenant secret; Svarg recomputes it. Constant-time, so nothing
 * about the secret leaks in how long a wrong one takes to refuse.
 */
export function isTenantCall(deployment, bearer) {
  const want = tenantAuthSecret(deployment?._id);
  if (!want || !bearer) return false;
  const a = crypto.createHash('sha256').update(String(bearer)).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── A code by email, for an address that is not a Google one ────────────────
// The same codes Svarg's own door sends (models/EmailOtp), kept apart from
// Svarg's by scoping the key to the tenant: the same person signing in to
// Svarg and to an application holds two codes, not one overwriting the other.
// The application asks for these through its own server, with the tenant
// secret, and gets back the same assertion Google gives.

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const otpKey = (deployment, email) => `${String(deployment._id)}:${email}`;

export function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
}

/** The name the code arrives under: the application's, as the blueprint names it. */
async function brandFor(deployment) {
  const bp = await TransformationBlueprint.findById(deployment.blueprintId).select('appName').lean().catch(() => null);
  return String(bp?.appName || '').trim() || 'your application';
}

/** Send a code. Returns { ok } or { status, error } for the application to relay. */
export async function requestTenantOtp({ deployment, email }) {
  email = String(email || '').trim().toLowerCase();
  if (!isEmail(email)) return { status: 400, error: 'A valid email address is required.' };
  const consoleAllowed = process.env.ALLOW_CONSOLE_OTP === '1' || process.env.NODE_ENV === 'development';
  if (!mailConfigured && !consoleAllowed) return { status: 503, error: 'Email sign-in is not available right now. Please continue with Google.' };

  const key = otpKey(deployment, email);
  const existing = await EmailOtp.findOne({ email: key }).lean();
  if (existing?.lastSentAt && Date.now() - new Date(existing.lastSentAt).getTime() < OTP_RESEND_MS) {
    return { status: 429, error: 'A code was just sent. Wait a minute before asking for another.' };
  }
  const code = crypto.randomInt(100000, 1000000);
  await EmailOtp.updateOne({ email: key }, { $set: { codeHash: hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, lastSentAt: new Date() } }, { upsert: true });
  try {
    const delivery = await sendOtpEmail(email, code, { brand: await brandFor(deployment) });
    return { ok: true, delivery };
  } catch (err) {
    await EmailOtp.updateOne({ email: key }, { $set: { lastSentAt: null } }).catch(() => {});
    console.error('[tenant-auth] code send failed:', err.message);
    return { status: 500, error: 'The code could not be sent. Please try again.' };
  }
}

/** Check a code. Returns { assertion } or { status, error }. */
export async function verifyTenantOtp({ deployment, email, code }) {
  email = String(email || '').trim().toLowerCase();
  code = String(code || '').trim();
  if (!isEmail(email) || !code) return { status: 400, error: 'The email address and the code are both needed.' };
  const key = otpKey(deployment, email);
  const otp = await EmailOtp.findOne({ email: key });
  if (!otp || otp.expiresAt < new Date()) return { status: 400, error: 'That code has expired. Ask for a new one.' };
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await EmailOtp.deleteOne({ _id: otp._id });
    return { status: 429, error: 'Too many tries. Ask for a new code.' };
  }
  if (otp.codeHash !== hashOtp(code)) {
    await EmailOtp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    return { status: 400, error: 'That is not the code. Check the email and try again.' };
  }
  await EmailOtp.deleteOne({ _id: otp._id });
  return { assertion: signAssertion({ deployment, profile: { sub: '', email, name: '', picture: '' }, provider: 'email' }) };
}

/** The signed assertion the application exchanges for its own session. */
export function signAssertion({ deployment, profile, provider = 'google' }) {
  const id = String(deployment._id);
  const secret = tenantAuthSecret(id);
  if (!secret) throw new Error('Svarg has no JWT_SECRET, so it cannot sign for a tenant.');
  return jwt.sign({
    sub: String(profile.sub || ''),
    email: String(profile.email || '').toLowerCase(),
    name: String(profile.name || ''),
    picture: String(profile.picture || ''),
    provider,
  }, secret, { issuer: 'svarg', audience: id, expiresIn: ASSERTION_TTL });
}
