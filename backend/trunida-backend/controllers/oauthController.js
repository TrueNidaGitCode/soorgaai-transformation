import axios from 'axios';
import jwt  from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/user.js';
import HostedDeployment from '../models/HostedDeployment.js';
import { returnOrigin, signAssertion, isTenantCall, requestTenantOtp, verifyTenantOtp } from '../services/tenantAuthService.js';

const JWT_SECRET    = process.env.JWT_SECRET;
const FRONTEND_URL  = process.env.FRONTEND_URL || 'http://localhost:5500';

const GOOGLE_CLIENT_ID       = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET   = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL    = process.env.GOOGLE_OAUTH_CALLBACK_URL;

const MICROSOFT_CLIENT_ID     = process.env.MICROSOFT_OAUTH_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
const MICROSOFT_CALLBACK_URL  = process.env.MICROSOFT_OAUTH_CALLBACK_URL;
// 'common' supports personal + work/school Microsoft accounts
const MICROSOFT_TENANT        = process.env.MICROSOFT_OAUTH_TENANT || 'common';

// ── CSRF state: signed JWT (stateless — no session or cookie needed) ─────────
// Only our server can produce a valid signature, so attackers cannot forge state.
// The state may also carry WHO asked: a delivered application signing its
// people in through Svarg (see tenantAuthService) puts its tenant id and
// checked return address here, and the callback reads them back. Signed,
// so neither can be swapped on the way through Google.
function generateState(extra = {}) {
  const nonce = crypto.randomBytes(16).toString('hex');
  return jwt.sign({ nonce, ...extra }, JWT_SECRET, { expiresIn: '10m' });
}

/** The state's payload when it is ours and current, else null. */
function verifyState(state) {
  if (!state) return null;
  try {
    return jwt.verify(state, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── JWT for the app session (same shape as email/password login) ──────────────
function issueAppJWT(user) {
  return jwt.sign(
    { userId: user._id, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ── Redirect helpers ──────────────────────────────────────────────────────────
function successRedirect(res, token, user) {
  const params = new URLSearchParams({
    token,
    userId:   user._id.toString(),
    username: user.name || user.email.split('@')[0],
    role:     user.role || 'user',
  });
  return res.redirect(`${FRONTEND_URL}/login/oauth-callback.html?${params}`);
}

function errorRedirect(res, msg) {
  const params = new URLSearchParams({ error: msg });
  return res.redirect(`${FRONTEND_URL}/login/oauth-callback.html?${params}`);
}

// ── A delivered application's sign-in ────────────────────────────────────────
// The application's own callback (eame-template/controllers/authController.js)
// takes either an assertion or an error, and finishes the sign-in itself.
function tenantRedirect(res, origin, params) {
  return res.redirect(`${origin}/api/auth/callback?${new URLSearchParams(params)}`);
}

/**
 * ?tenant=<deployment id>&return_to=<the application's address>. Both are
 * checked here, before Google is involved: the deployment must exist and the
 * address must be the one it is recorded at. Returns what the state should
 * carry, or an error message for the application, or null when this is an
 * ordinary Svarg sign-in.
 */
async function tenantContext(req) {
  const tenant = String(req.query.tenant || '').trim();
  if (!tenant) return null;
  const returnTo = String(req.query.return_to || '');
  const dep = /^[a-f0-9]{24}$/i.test(tenant) ? await HostedDeployment.findById(tenant).lean() : null;
  if (!dep) return { error: 'This application is not known to Svarg.' };
  const origin = returnOrigin(dep, returnTo);
  if (!origin) return { error: 'This application is not at the address Svarg has for it.' };
  return { tenant, returnTo: origin };
}

// ── Find existing user or create new OAuth user ───────────────────────────────
async function findOrCreateOAuthUser({ provider, providerUserId, email, name, profileImage }) {
  // 1. Exact match on provider + providerUserId (fastest path for returning users)
  let user = await User.findOne({ authProvider: provider, providerUserId });
  if (user) return user;

  // 2. Email match — link provider to existing local account
  user = await User.findOne({ email });
  if (user) {
    user.authProvider   = provider;
    user.providerUserId = providerUserId;
    user.emailVerified  = true;
    if (profileImage && !user.profileImage) user.profileImage = profileImage;
    await user.save();
    return user;
  }

  // 3. Brand-new user — create with OAuth provider
  user = new User({
    name:           name || email.split('@')[0],
    email,
    authProvider:   provider,
    providerUserId,
    profileImage:   profileImage || null,
    emailVerified:  true,
    // password intentionally omitted — OAuth users have no local password
  });
  await user.save();
  return user;
}

/**
 * A code by email for a delivered application's person, requested and
 * checked by the application's server with its tenant secret (never from a
 * browser: the secret stays on the server, and so does the tenant id).
 * The answer is the same assertion the Google path ends with.
 */
async function tenantCaller(req, res) {
  const tenant = String(req.body?.tenant || '').trim();
  const dep = /^[a-f0-9]{24}$/i.test(tenant) ? await HostedDeployment.findById(tenant).lean() : null;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!dep || !isTenantCall(dep, bearer)) {
    res.status(401).json({ error: 'This application is not known to Svarg.' });
    return null;
  }
  return dep;
}

export const tenantOtpRequest = async (req, res) => {
  try {
    const dep = await tenantCaller(req, res);
    if (!dep) return;
    const r = await requestTenantOtp({ deployment: dep, email: req.body?.email });
    if (r.error) return res.status(r.status).json({ error: r.error });
    return res.json({ ok: true, delivery: r.delivery });
  } catch (err) {
    console.error('[OAuth] tenant code request failed:', err.message);
    return res.status(500).json({ error: 'The code could not be sent. Please try again.' });
  }
};

export const tenantOtpVerify = async (req, res) => {
  try {
    const dep = await tenantCaller(req, res);
    if (!dep) return;
    const r = await verifyTenantOtp({ deployment: dep, email: req.body?.email, code: req.body?.code });
    if (r.error) return res.status(r.status).json({ error: r.error });
    return res.json({ assertion: r.assertion });
  } catch (err) {
    console.error('[OAuth] tenant code check failed:', err.message);
    return res.status(500).json({ error: 'The code could not be checked. Please try again.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GOOGLE
// ════════════════════════════════════════════════════════════════════════════

export const initiateGoogle = async (req, res) => {
  // A delivered application's person, or one of Svarg's own?
  let ctx = null;
  try {
    ctx = await tenantContext(req);
  } catch (err) {
    console.error('[OAuth] tenant lookup failed:', err.message);
    ctx = { error: 'Svarg could not look this application up. Please try again.' };
  }
  if (ctx?.error) {
    // With no checked address there is nowhere to send the error but back to
    // where the person came from, when that is an address at all.
    const back = String(req.query.return_to || '');
    if (/^https?:\/\//i.test(back)) {
      try { return tenantRedirect(res, new URL(back).origin, { error: ctx.error }); } catch { /* fall through */ }
    }
    return res.status(400).send(ctx.error);
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CALLBACK_URL) {
    if (ctx) return tenantRedirect(res, ctx.returnTo, { error: 'Google sign-in is not configured on Svarg.' });
    return errorRedirect(res, 'Google sign-in is not configured on this server.');
  }

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
    state:         generateState(ctx || {}),
  });

  // Preselect the account when the user already typed their Gmail address
  const hint = req.query.login_hint;
  if (hint && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint)) params.set('login_hint', hint);

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

export const googleCallback = async (req, res) => {
  const { code, state, error } = req.query;

  // Read before anything else: an error for a tenant's person goes back to
  // the tenant, not to Svarg's own callback page.
  const st = verifyState(state);
  const tenant = st?.tenant ? { id: st.tenant, origin: st.returnTo } : null;
  const fail = (msg) => (tenant ? tenantRedirect(res, tenant.origin, { error: msg }) : errorRedirect(res, msg));

  if (error) {
    const msg = error === 'access_denied'
      ? 'Google sign-in was cancelled.'
      : 'Google authentication failed. Please try again.';
    return fail(msg);
  }

  if (!code) return fail('Google authentication failed — no code received.');

  if (!st) {
    return errorRedirect(res, 'Invalid security state. Please try signing in again.');
  }

  try {
    // Exchange code for access token
    const { data: tokens } = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  GOOGLE_CALLBACK_URL,
      grant_type:    'authorization_code',
    });

    // Fetch user profile from Google
    const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const { sub, email, name, picture } = profile;
    if (!email) return fail('Unable to retrieve your email from Google.');

    // A delivered application's person: no Svarg user, no record. The
    // profile goes to the application, signed, and the application keeps it.
    if (tenant) {
      const dep = await HostedDeployment.findById(tenant.id).lean();
      if (!dep) return fail('This application is not known to Svarg.');
      const assertion = signAssertion({ deployment: dep, profile: { sub, email, name, picture } });
      return tenantRedirect(res, tenant.origin, { assertion });
    }

    const user  = await findOrCreateOAuthUser({ provider: 'google', providerUserId: sub, email, name, profileImage: picture });
    const token = issueAppJWT(user);
    return successRedirect(res, token, user);

  } catch (err) {
    console.error('[OAuth] Google callback error:', err.response?.data || err.message);
    return fail('Google authentication failed. Please try again.');
  }
};

// ════════════════════════════════════════════════════════════════════════════
// MICROSOFT
// ════════════════════════════════════════════════════════════════════════════

export const initiateMicrosoft = (req, res) => {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CALLBACK_URL) {
    return errorRedirect(res, 'Microsoft sign-in is not configured on this server.');
  }

  const params = new URLSearchParams({
    client_id:     MICROSOFT_CLIENT_ID,
    redirect_uri:  MICROSOFT_CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile User.Read',
    response_mode: 'query',
    prompt:        'select_account',
    state:         generateState(),
  });

  res.redirect(`https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize?${params}`);
};

export const microsoftCallback = async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    const msg = error === 'access_denied'
      ? 'Microsoft sign-in was cancelled.'
      : 'Microsoft authentication failed. Please try again.';
    return errorRedirect(res, msg);
  }

  if (!code) return errorRedirect(res, 'Microsoft authentication failed — no code received.');

  if (!verifyState(state)) {
    return errorRedirect(res, 'Invalid security state. Please try signing in again.');
  }

  try {
    // Exchange code for access token (Microsoft requires form-encoded body)
    const { data: tokens } = await axios.post(
      `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id:     MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        redirect_uri:  MICROSOFT_CALLBACK_URL,
        grant_type:    'authorization_code',
        code,
        scope:         'openid email profile User.Read',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Fetch user profile from Microsoft Graph
    const { data: profile } = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      params: { $select: 'id,displayName,mail,userPrincipalName' },
    });

    const email = profile.mail || profile.userPrincipalName;
    if (!email) return errorRedirect(res, 'Unable to retrieve your email from Microsoft.');

    const user  = await findOrCreateOAuthUser({ provider: 'microsoft', providerUserId: profile.id, email, name: profile.displayName });
    const token = issueAppJWT(user);
    return successRedirect(res, token, user);

  } catch (err) {
    console.error('[OAuth] Microsoft callback error:', err.response?.data || err.message);
    return errorRedirect(res, 'Microsoft authentication failed. Please try again.');
  }
};
