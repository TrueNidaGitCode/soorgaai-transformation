/**
 * Who may use this application.
 *
 * Until now, anyone Svarg could sign in got an account here on first arrival.
 * That is the right default for an application with one user and the wrong one
 * for an academy: the person who created it had no way to say who their
 * colleagues are, and no way to see who had let themselves in.
 *
 * ── The owner ─────────────────────────────────────────────────────────────
 *
 * The email that created the application is its owner, named at go-live in
 * APP_OWNER_EMAIL. They become the owner the first time they sign in — no key
 * to copy, nothing to configure. The owner key (APP_OWNER_KEY) still works and
 * still opens the Data page; this is the same role reached by being the person
 * who asked for the application rather than by holding a secret.
 *
 * ── Invitations ───────────────────────────────────────────────────────────
 *
 * With an owner named, this application is invite-only: the owner, anyone who
 * already had an account, and anyone the owner adds. Without one it behaves
 * exactly as before, so every application delivered before this is unchanged.
 *
 * Seats come from the plan (APP_SEATS). Inviting past the limit is refused
 * with what the limit is and who to ask, because there is no self-serve
 * upgrade to send them to.
 */

import mongoose from 'mongoose';

function usersCollection() {
  return mongoose.connection.collection('svarg_users');
}

const clean = (e) => String(e || '').trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The email that created this application, if Svarg named one. */
export function ownerEmail() {
  return clean(process.env.APP_OWNER_EMAIL);
}

/** Absent means unlimited — every application delivered before seats existed. */
export function seatLimit() {
  const n = parseInt(process.env.APP_SEATS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Only the owner manages access. A signed-in colleague is not an administrator. */
export async function ownerOnly(req, res, next) {
  if (req.user?.role === 'owner') return next();
  const email = clean(req.user?.email);
  if (email && email === ownerEmail()) return next();
  try {
    const id = req.user?.userId;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      const u = await usersCollection().findOne({ _id: new mongoose.Types.ObjectId(id) }, { projection: { role: 1 } });
      if (u && u.role === 'owner') return next();
    }
  } catch { /* falls through to the refusal */ }
  return res.status(403).json({ error: 'Only the person who created this application can manage who uses it.' });
}

/**
 * May this email sign in?
 *
 * Called by the sign-in path before an account is created. Order matters: the
 * owner and anyone who already has an account are never refused, whatever the
 * seat count says, because taking away access somebody already had is a
 * support incident rather than a billing nudge.
 */
export async function maySignIn(email) {
  const who = clean(email);
  if (!who) return { allowed: false, error: 'No email was given.' };
  if (who === ownerEmail()) return { allowed: true };

  let existing = null;
  try {
    existing = await usersCollection().findOne({ email: who }, { projection: { _id: 1, invited: 1 } });
  } catch (err) {
    // A check that cannot run must not become a locked door.
    console.warn('[access] could not be checked, letting them in —', err.message);
    return { allowed: true };
  }
  if (existing) return { allowed: true };

  // Invite-only applies only once an owner has been named, so applications
  // delivered before this are not suddenly closed to their own users.
  if (ownerEmail()) {
    return {
      allowed: false,
      error: `${process.env.APP_NAME || 'This application'} is invite-only. `
        + 'Ask the person who set it up to add your email address.',
    };
  }

  const limit = seatLimit();
  if (!limit) return { allowed: true };
  try {
    const held = await usersCollection().countDocuments({});
    if (held < limit) return { allowed: true };
  } catch { return { allowed: true }; }

  const plan = process.env.APP_PLAN_LABEL || '';
  return {
    allowed: false,
    error: `${process.env.APP_NAME || 'This application'} is on ${plan ? 'the ' + plan + ' plan' : 'a plan'}, `
      + `which covers ${limit === 1 ? 'one account' : limit + ' accounts'}, and ${limit === 1 ? 'it is' : 'they are'} already in use. `
      + 'The SvargAI team will get back to you about adding more people.',
  };
}

/** Mark the owner on their own record, so the role survives the session. */
export async function markOwner(email) {
  const who = clean(email);
  if (!who || who !== ownerEmail()) return;
  try {
    await usersCollection().updateOne({ email: who }, { $set: { role: 'owner', ownerSince: new Date() } });
  } catch (err) {
    console.warn('[access] could not mark the owner —', err.message);
  }
}

// ── GET /api/access ─────────────────────────────────────────────────────────

/** Everyone who can use this application, and how much room is left. */
export async function listAccess(req, res) {
  try {
    const limit = seatLimit();
    const people = await usersCollection()
      .find({}, { projection: { email: 1, name: 1, role: 1, invited: 1, lastSeenAt: 1, firstSeenAt: 1 } })
      .sort({ firstSeenAt: 1 })
      .limit(200)
      .toArray();

    const owner = ownerEmail();
    return res.json({
      owner,
      plan: process.env.APP_PLAN_LABEL || '',
      seats: limit || null,
      used: people.length,
      full: !!limit && people.length >= limit,
      people: people.map(p => ({
        email: p.email || '',
        name: p.name || '',
        isOwner: clean(p.email) === owner || p.role === 'owner',
        invited: !!p.invited,
        // Somebody invited who has not arrived yet is worth showing apart from
        // somebody using the application every day.
        signedIn: !!p.lastSeenAt,
        lastSeenAt: p.lastSeenAt || null,
      })),
    });
  } catch (err) {
    console.error('[access] list failed —', err.message);
    return res.status(500).json({ error: 'The list of people could not be read.' });
  }
}

// ── POST /api/access { email } ──────────────────────────────────────────────

/** Let somebody in. They still sign in through Svarg; this says they may. */
export async function grantAccess(req, res) {
  try {
    const email = clean(req.body?.email);
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'That does not look like an email address.' });

    const already = await usersCollection().findOne({ email }, { projection: { _id: 1 } });
    if (already) return res.json({ added: false, email, message: `${email} already has access.` });

    const limit = seatLimit();
    if (limit) {
      const held = await usersCollection().countDocuments({});
      if (held >= limit) {
        const plan = process.env.APP_PLAN_LABEL || '';
        return res.status(409).json({
          error: `${plan ? 'The ' + plan + ' plan covers' : 'This plan covers'} `
            + `${limit === 1 ? 'one account' : limit + ' accounts'}, and ${limit === 1 ? 'it is' : 'they are'} already in use. `
            + 'The SvargAI team will get back to you about enabling a higher plan.',
          full: true, seats: limit, used: held,
        });
      }
    }

    await usersCollection().insertOne({
      email, name: '', role: 'user', invited: true,
      invitedBy: clean(req.user?.email) || 'owner',
      firstSeenAt: new Date(), lastSeenAt: null,
    });

    return res.json({ added: true, email, message: `${email} can now sign in to this application.` });
  } catch (err) {
    console.error('[access] grant failed —', err.message);
    return res.status(500).json({ error: 'That person could not be added.' });
  }
}

// ── DELETE /api/access/:email ───────────────────────────────────────────────

/** Take access away, and the seat back with it. */
export async function revokeAccess(req, res) {
  try {
    const email = clean(req.params?.email);
    if (!email) return res.status(400).json({ error: 'No email address was given.' });
    if (email === ownerEmail()) {
      return res.status(400).json({ error: 'The person who created this application cannot be removed from it.' });
    }
    if (email === clean(req.user?.email)) {
      return res.status(400).json({ error: 'That would remove your own access.' });
    }

    const r = await usersCollection().deleteOne({ email });
    if (!r.deletedCount) return res.status(404).json({ error: `${email} does not have access to remove.` });
    return res.json({ removed: true, email, message: `${email} can no longer sign in, and the seat is free.` });
  } catch (err) {
    console.error('[access] revoke failed —', err.message);
    return res.status(500).json({ error: 'That person could not be removed.' });
  }
}
