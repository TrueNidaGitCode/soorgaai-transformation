/**
 * Two things worth knowing about a row before you spend attention on it.
 *
 * Both came from reading the same two accounts twice:
 *
 *   gewesa3986@duidir.com   objective "hi",          ₹0.90,  signed up 19:31, last seen 19:31
 *   tomiw84957@wmbee.com    objective "surprise me", ₹26.80, signed up 09:01, last seen 09:01
 *
 * The funnel presented them as prospects — "approved an opportunity",
 * "application built" — because those are true statements about what the
 * records contain. Neither account ever came back, and neither address
 * belongs to anybody.
 *
 * These are SIGNALS, never filters. A throwaway address is a reason to look
 * more carefully, not a reason to be shut out: the guard at the door already
 * refuses nonsense objectives, and refusing a person is a different and much
 * more expensive kind of mistake than showing a pill next to their name.
 */

/**
 * Throwaway mail services.
 *
 * Not exhaustive and never will be — there are thousands of these and the
 * list turns over weekly. It covers the ones actually seen here plus the
 * common providers, and the point is to catch the obvious case, not to win an
 * arms race against someone determined to hide.
 */
const DISPOSABLE_DOMAINS = new Set([
  // Seen in this funnel
  'duidir.com', 'wmbee.com',
  // The widely used services
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org',
  'throwawaymail.com', 'yopmail.com', 'yopmail.fr', 'maildrop.cc',
  'getnada.com', 'nada.email', 'trashmail.com', 'trashmail.de', 'dispostable.com',
  'fakeinbox.com', 'mailnesia.com', 'mytemp.email', 'moakt.com', 'tempr.email',
  'emailondeck.com', 'spamgourmet.com', 'mohmal.com', 'inboxkitten.com',
  'burnermail.io', 'anonaddy.me', 'mailsac.com', 'harakirimail.com',
  'discard.email', 'tempmailo.com', 'luxusmail.org', 'vmailpro.net',
  'byom.de', 'cock.li', 'atomicmail.io',
]);

/**
 * Patterns the list cannot keep up with.
 *
 * Most of these services rotate domains constantly, so the shape of the name
 * catches more than the name itself does.
 */
const DISPOSABLE_SHAPES = [
  /(^|\.)(temp|tmp|trash|fake|burner|throwaway|disposable|guerrilla|spam)[-a-z0-9]*mail/i,
  /(^|\.)mail(inator|drop|sac|nesia)/i,
  /^\d+minutemail\./i,
];

const domainOf = (email) => String(email || '').trim().toLowerCase().split('@')[1] || '';

/** Does this address belong to a throwaway mail service? */
export function isDisposableEmail(email) {
  const domain = domainOf(email);
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  return DISPOSABLE_SHAPES.some(re => re.test(domain));
}

/**
 * Did they ever come back?
 *
 * The strongest signal on the board, and the cheapest: a person who signed up
 * and never returned is not evaluating anything, whatever the record says they
 * did in that one visit. Both throwaway accounts were last seen in the minute
 * they arrived.
 *
 * A minute of tolerance, because signing up and being redirected writes
 * lastSeenAt a moment after createdAt on a perfectly real account.
 */
const RETURN_TOLERANCE_MS = 60 * 1000;

export function neverReturned(user, now = Date.now()) {
  const created = user?.createdAt ? new Date(user.createdAt).getTime() : null;
  if (!created) return false;

  /*
   * No lastSeenAt means we do not know, and saying nothing is the only
   * honest answer.
   *
   * The first version treated a missing value as createdAt, which made the
   * comparison trivially true. Run against the real accounts it flagged 33
   * out of 33 — the team's own included, and a customer whose application was
   * running at that moment. A badge that appears on every row tells you
   * nothing and trains you to ignore the ones that matter.
   *
   * Absence is also indistinguishable between a brand-new account and one
   * that predates the field, which is a second reason not to guess.
   */
  if (!user?.lastSeenAt) return false;
  const seen = new Date(user.lastSeenAt).getTime();
  // Somebody who signed up in the last few minutes has not had the chance yet,
  // and marking them cold on arrival would be wrong about every new account.
  if (now - created < 10 * 60 * 1000) return false;
  return (seen - created) <= RETURN_TOLERANCE_MS;
}

/**
 * A lead with nobody to contact yet.
 *
 * A walk-in is added before anybody there is a contact — the institute is all
 * you have until you have visited. That is legitimate, and it is also exactly
 * what the contact backstop warns about: a name in a list that sits at the top
 * of the funnel for ever.
 *
 * So it is allowed, and it is labelled. The row says what is missing, which is
 * the difference between a plan and a graveyard.
 */
export function awaitingContact(lead) {
  if (!lead) return false;
  const has = (v) => !!String(v ?? '').trim();
  return !has(lead.email) && !has(lead.phone) && has(lead.company);
}

/**
 * What to say about this row, if anything.
 *
 * Returns an array so the screen can render nothing at all for the ordinary
 * case, which is most of them.
 */
export function qualitySignals(user, now = Date.now()) {
  const out = [];
  if (isDisposableEmail(user?.email)) {
    out.push({ key: 'throwaway', label: 'Throwaway address', tone: 'bad' });
  }
  if (neverReturned(user, now)) {
    out.push({ key: 'never-returned', label: 'Never came back', tone: 'warn' });
  }
  return out;
}

/** The same, for a lead row rather than an account. */
export function leadSignals(lead) {
  const out = [];
  if (isDisposableEmail(lead?.email)) {
    out.push({ key: 'throwaway', label: 'Throwaway address', tone: 'bad' });
  }
  if (awaitingContact(lead)) {
    out.push({ key: 'awaiting-contact', label: 'No contact yet', tone: 'warn' });
  }
  return out;
}
