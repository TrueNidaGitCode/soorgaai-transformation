import axios from 'axios';
import jwt  from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/user.js';

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
function generateState() {
  const nonce = crypto.randomBytes(16).toString('hex');
  return jwt.sign({ nonce }, JWT_SECRET, { expiresIn: '10m' });
}

function verifyState(state) {
  if (!state) return false;
  try {
    jwt.verify(state, JWT_SECRET);
    return true;
  } catch {
    return false;
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

// ════════════════════════════════════════════════════════════════════════════
// GOOGLE
// ════════════════════════════════════════════════════════════════════════════

export const initiateGoogle = (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CALLBACK_URL) {
    return errorRedirect(res, 'Google sign-in is not configured on this server.');
  }

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
    state:         generateState(),
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

export const googleCallback = async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    const msg = error === 'access_denied'
      ? 'Google sign-in was cancelled.'
      : 'Google authentication failed. Please try again.';
    return errorRedirect(res, msg);
  }

  if (!code) return errorRedirect(res, 'Google authentication failed — no code received.');

  if (!verifyState(state)) {
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
    if (!email) return errorRedirect(res, 'Unable to retrieve your email from Google.');

    const user  = await findOrCreateOAuthUser({ provider: 'google', providerUserId: sub, email, name, profileImage: picture });
    const token = issueAppJWT(user);
    return successRedirect(res, token, user);

  } catch (err) {
    console.error('[OAuth] Google callback error:', err.response?.data || err.message);
    return errorRedirect(res, 'Google authentication failed. Please try again.');
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
