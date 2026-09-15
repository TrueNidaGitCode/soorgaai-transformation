/**
 * Sign-in: who is using this application.
 *
 * People sign in with Google, or with a code sent to their email, through
 * Svarg. This application runs at an address Google was never told about,
 * so it cannot do the exchange itself; instead the door sends the person
 * to Svarg's Google sign-in with this application's tenant id
 * (SVARG_AUTH_URL), Svarg does the exchange on the callback it registered,
 * and comes back here with an ASSERTION: the person's identity, signed with
 * a secret only this application and Svarg know (SVARG_AUTH_SECRET). An
 * address that is not a Google one gets a code instead: this server asks
 * Svarg to send it (Svarg has the mail transport; this application does
 * not) and to check it, with the same secret, and the answer is the same
 * assertion. Either way it is good for minutes and for this application
 * only; from it, the application writes its own record of the person
 * (svarg_users, in its own database) and mints its own session, which is
 * what every request from then on carries. Svarg keeps nothing: the person
 * is this application's.
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
import { maySignIn, markOwner, ownerEmail } from './accessController.js';

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
    email: configured(),
    public: process.env.APP_PUBLIC_ACCESS === 'true' && !configured(),
  });
}

/** Off to Svarg's Google sign-in, saying who is asking and where to come back. */
export function google(req, res) {
  if (!configured()) return backToDoor(res, req, { 'signin-error': 'Sign-in with Google is not set up on this application.' });
  const url = new URL(process.env.SVARG_AUTH_URL);
  url.searchParams.set('return_to', ownOrigin(req));
  // The address already typed on the door, so Google opens on that account.
  const hint = String(req.query.hint || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint)) url.searchParams.set('login_hint', hint);
  res.redirect(url.toString());
}

// ── A code by email ─────────────────────────────────────────────────────────

function tenantId() {
  try { return new URL(process.env.SVARG_AUTH_URL).searchParams.get('tenant') || ''; } catch { return ''; }
}

/** Svarg's tenant sign-in endpoints, beside the Google one. */
async function askSvarg(path, body) {
  const base = new URL(process.env.SVARG_AUTH_URL);
  const url = `${base.origin}/api/auth/oauth/tenant/${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SVARG_AUTH_SECRET}` },
    body: JSON.stringify({ tenant: tenantId(), ...body }),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

/** POST { email }: Svarg sends the code. */
export async function otpRequest(req, res) {
  if (!configured()) return res.status(503).json({ error: 'Email sign-in is not set up on this application.' });
  try {
    const { status, data } = await askSvarg('otp/request', { email: String(req.body?.email || '') });
    if (status !== 200) return res.status(status).json({ error: data.error || 'The code could not be sent.' });
    return res.json({ ok: true, delivery: data.delivery || 'sent' });
  } catch (err) {
    console.error('[auth] code request failed —', err.message);
    return res.status(502).json({ error: 'Svarg could not be reached to send the code. Please try again.' });
  }
}

/** POST { email, code }: Svarg checks it, and a session comes back as JSON. */
export async function otpVerify(req, res) {
  if (!configured()) return res.status(503).json({ error: 'Email sign-in is not set up on this application.' });
  try {
    const { status, data } = await askSvarg('otp/verify', { email: String(req.body?.email || ''), code: String(req.body?.code || '') });
    if (status !== 200 || !data.assertion) return res.status(status === 200 ? 502 : status).json({ error: data.error || 'The code could not be checked.' });
    const session = await sessionFromAssertion(data.assertion);
    if (session.error) return res.status(401).json({ error: session.error });
    return res.json({ token: session.token });
  } catch (err) {
    console.error('[auth] code check failed —', err.message);
    return res.status(502).json({ error: 'Svarg could not be reached to check the code. Please try again.' });
  }
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
  const session = await sessionFromAssertion(assertion);
  if (session.error) return backToDoor(res, req, { 'signin-error': session.error });
  return backToDoor(res, req, { token: session.token });
}

/**
 * From Svarg's word on who this is to this application's own session:
 * checked against the shared secret, this application's id as audience and
 * Svarg as issuer; then the person recorded, and a session minted. What
 * came back from Google and what came back from a code end here the same.
 */
async function sessionFromAssertion(assertion) {
  let who;
  try {
    who = jwt.verify(assertion, process.env.SVARG_AUTH_SECRET, { issuer: 'svarg', audience: tenantId() });
  } catch (err) {
    return { error: 'That sign-in has expired or is not for this application. Please try again.' };
  }
  const email = String(who.email || '').toLowerCase();
  if (!email) return { error: 'Svarg did not say who you are. Please try again.' };

  /*
   * How many people may hold an account here.
   *
   * Nothing used to ask. Anyone Svarg could sign in was upserted on arrival,
   * so an academy on a one-person plan could put thirty coaches into its
   * application and no part of Svarg noticed — the plan said one account and
   * the application had never been told.
   *
   * Someone who already signed in is never turned away. Locking a coach out
   * mid-season over billing is a support incident, not a nudge; the limit
   * stops the NEXT person, and the owner can see the list and decide.
   */
  /*
   * May this person be here at all?
   *
   * accessController owns the answer — the owner named at go-live, anybody
   * who already has an account, anybody the owner invited, and the seat limit
   * behind all three. It is asked BEFORE the upsert, because the upsert is
   * what grants access, and a check after it has already let them in.
   */
  const may = await maySignIn(email);
  if (!may.allowed) return { error: may.error };

  try {
    const now = new Date();
    const provider = String(who.provider || 'google');
    // A name Google gave is kept; a code has no name to give, and must not
    // blank one already on record.
    const set = { provider, lastSeenAt: now };
    if (who.name) set.name = String(who.name);
    if (who.picture) set.picture = String(who.picture);
    if (who.sub) set.providerId = String(who.sub);
    const r = await usersCollection().findOneAndUpdate(
      { email },
      { $set: set, $setOnInsert: { email, role: 'user', firstSeenAt: now, ...(who.name ? {} : { name: '' }) } },
      { upsert: true, returnDocument: 'after' },
    );
    const user = r?.value || r;
    // The email that asked for this application runs it, without a key to
    // copy from a screen they saw once.
    await markOwner(email);
    const isOwner = email === ownerEmail() || user.role === 'owner';
    const token = jwt.sign(
      { userId: String(user._id), role: isOwner ? 'owner' : (user.role || 'user'), email, name: user.name || '' },
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: SESSION_TTL },
    );
    return { token };
  } catch (err) {
    console.error('[auth] could not record the sign-in —', err.message);
    return { error: 'The application could not record your sign-in. Please try again.' };
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
