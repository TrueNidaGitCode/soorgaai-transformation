/**
 * Svarg — is this a real prospect, one of ours, or a test row?
 *
 * A sales board where a third of the rows are `test@example.com` and the
 * founder's own addresses is not a sales board — it is a list you have to
 * mentally filter every time you read it, which means you eventually stop
 * reading it.
 *
 * Three kinds:
 *
 *   real      someone outside Svarg who signed up or was emailed
 *   internal  Svarg's own accounts — staff, admins, the addresses used to
 *             build and test the product
 *   test      fabricated data: example.com, test*, demo*, malformed addresses
 *
 * ── Inference proposes; a human decides ────────────────────────────────────
 *
 * The heuristic below cannot know that pranesh.babykannan@kpit.com is the
 * founder's own address at a former employer, or that contact.truenida@gmail
 * is Svarg's. Both look exactly like a real prospect. So an explicit
 * classification stored on the account always wins, and the screen shows which
 * rows were guessed — a silent filter that quietly hides a real customer is
 * far worse than one row of noise.
 *
 * Nothing here deletes or hides anything on its own. It labels; the screen
 * offers a filter; the counts say what is being left out.
 */

/** Domains that are unambiguously Svarg's own. */
const INTERNAL_DOMAINS = new Set([
  'svargai.com',
  'soorgaai.com',
  'soorga.com',
]);

/** Domains that exist to be fake. */
const TEST_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'mailinator.com',
  'tempmail.com',
]);

export const KINDS = ['real', 'internal', 'test'];

function parts(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return { local: s, domain: '', valid: false };
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  // A domain with no dot is not a deliverable address. "Ciaz@0808" is in the
  // users collection because somebody typed a password into the email box.
  return { local, domain, valid: !!local && domain.includes('.') };
}

/**
 * What this address looks like, with no knowledge of who owns it.
 *
 * @returns {{kind: 'real'|'internal'|'test', why: string}}
 */
export function inferKind(email, { role = '' } = {}) {
  const { local, domain, valid } = parts(email);

  if (!valid) return { kind: 'test', why: 'not a deliverable address' };
  if (TEST_DOMAINS.has(domain)) return { kind: 'test', why: `${domain} is a placeholder domain` };

  // A plus-tag naming a test is the convention this team already uses —
  // praneshbabykannan+svargtest@gmail.com is a probe, not a prospect.
  const tag = local.includes('+') ? local.slice(local.indexOf('+') + 1) : '';
  if (tag && /test|probe|demo|harness|sample/.test(tag)) {
    return { kind: 'test', why: `plus-tag "${tag}" marks a test address` };
  }

  if (/^test/.test(local) || /^demo/.test(local) || /^userdemo/.test(local)) {
    return { kind: 'test', why: `local part "${local}" starts like a test account` };
  }

  if (INTERNAL_DOMAINS.has(domain)) return { kind: 'internal', why: `${domain} is a Svarg domain` };
  if (role === 'admin') return { kind: 'internal', why: 'platform administrator' };

  return { kind: 'real', why: '' };
}

/**
 * The classification to use, preferring an explicit one.
 *
 * @param {string} email
 * @param {{role?: string, accountKind?: string}} account
 * @returns {{kind: string, why: string, inferred: boolean}}
 */
export function classify(email, account = {}) {
  const explicit = String(account.accountKind || '').trim().toLowerCase();
  if (KINDS.includes(explicit)) {
    return { kind: explicit, why: 'set by hand', inferred: false };
  }
  const guess = inferKind(email, { role: account.role || '' });
  return { ...guess, inferred: true };
}
