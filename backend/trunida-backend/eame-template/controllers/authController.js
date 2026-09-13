/**
 * Sign-in: who is using this application.
 *
 * People sign in with Google, through Svarg. This application runs at an
 * address Google was never told about, so it cannot do the exchange itself;
 * instead the door sends the person to Svarg's Google sign-in with this
 * application's tenant id (SVARG_AUTH_URL), Svarg does the exchange on the
 * callback it registered, and comes back here with an ASSERTION: the
 * person's Google identity, signed with a secret only this application and
 * Svarg know (SVARG_AUTH_SECRET). The assertion is good for minutes and for
 * this application only; from it, the application writes its own record of
 * the person (svarg_users, in its own database) and mints its own session,
 * which is what every request from then on carries. Svarg keeps nothing:
 * the person is this application's.
 *
 * Without SVARG_AUTH_URL -- an install someone runs themselves, a local
 * check -- there is no Google to offer, and the door falls back to the open
 * session server.js mints when APP_PUBLIC_ACCESS is on.
 *
 * The owner key (controllers/dataController.js) is a different door for a
 * different purpose: it opens the Data page, whoever is signed in.
 */
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const SESSION_TTL = '30d';

export function configured() {
  return !!(process.env.SVARG_AUTH_URL && process.env.SVARG_AUTH_SECRET);
}

function usersCollection() {
  return mongoose.connection.collection('svarg_users');
}

/** This application's own address, as the browser reached it. */
function ownOrigin(req) {
  if (process.env.APP_PUBLIC_URL) return String(process.env.APP_PUBLIC_URL).replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** The front door, told what happened: a token to keep, or a reason. */
function backToDoor(res, req, params) {
  const q = new URLSearchParams(params).toString();
  // In the fragment, not the query: a session token must not reach access
  // logs, and the front door reads the fragment and clears it.
  res.redirect(`${ownOrigin(req)}/#${q}`);
}

/** What the door may offer. */
export function providers(req, res) {
  res.json({
    google: configured(),
    public: process.env.APP_PUBLIC_ACCESS === 'true' && !configured(),
  });
}

/** Off to Svarg's Google sign-in, saying who is asking and where to come back. */
export function google(req, res) {
  if (!configured()) return backToDoor(res, req, { 'signin-error': 'Sign-in with Google is not set up on this application.' });
  const url = new URL(process.env.SVARG_AUTH_URL);
  url.searchParams.set('return_to', ownOrigin(req));
  res.redirect(url.toString());
}

/**
 * Back from Svarg with the person, or with why not. The assertion is
 * checked against the shared secret, this application's id as audience and
 * Svarg as issuer; anything else is refused at the door, not later.
 */
export async function callback(req, res) {
  const error = String(req.query.error || '');
  if (error) return backToDoor(res, req, { 'signin-error': error.slice(0, 200) });

  const assertion = String(req.query.assertion || '');
  if (!assertion || !configured()) return backToDoor(res, req, { 'signin-error': 'Sign-in did not complete. Please try again.' });

  let who;
  try {
    const tenant = new URL(process.env.SVARG_AUTH_URL).searchParams.get('tenant') || '';
    who = jwt.verify(assertion, process.env.SVARG_AUTH_SECRET, { issuer: 'svarg', audience: tenant });
  } catch (err) {
    return backToDoor(res, req, { 'signin-error': 'That sign-in has expired or is not for this application. Please try again.' });
  }

  const email = String(who.email || '').toLowerCase();
  if (!email) return backToDoor(res, req, { 'signin-error': 'Google did not say who you are. Please try again.' });

  try {
    const now = new Date();
    const r = await usersCollection().findOneAndUpdate(
      { email },
      {
        $set: { name: String(who.name || ''), picture: String(who.picture || ''), provider: 'google', providerId: String(who.sub || ''), lastSeenAt: now },
        $setOnInsert: { email, role: 'user', firstSeenAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    );
    const user = r?.value || r;
    const token = jwt.sign(
      { userId: String(user._id), role: user.role || 'user', email, name: user.name || '' },
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: SESSION_TTL },
    );
    return backToDoor(res, req, { token });
  } catch (err) {
    console.error('[auth] could not record the sign-in —', err.message);
    return backToDoor(res, req, { 'signin-error': 'The application could not record your sign-in. Please try again.' });
  }
}

/** Who this session is, after `protect`. An open session has no name. */
export async function me(req, res) {
  const id = req.user?._id;
  if (!id || id === 'public-session' || id === 'owner') {
    return res.json({ signedIn: true, role: req.user?.role || 'user', name: '', email: '' });
  }
  try {
    const user = mongoose.isValidObjectId(id)
      ? await usersCollection().findOne({ _id: new mongoose.Types.ObjectId(id) }, { projection: { email: 1, name: 1, picture: 1, role: 1 } })
      : null;
    if (!user) return res.status(401).json({ error: 'This session belongs to nobody the application knows.' });
    return res.json({ signedIn: true, role: user.role || 'user', name: user.name || '', email: user.email || '', picture: user.picture || '' });
  } catch (err) {
    return res.status(500).json({ error: 'Could not read the session.' });
  }
}
