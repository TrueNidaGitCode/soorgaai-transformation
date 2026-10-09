/**
 * Svarg — where a business's customers show up, decided by Cob.
 *
 * Two businesses can lose customers the same way and still need different
 * applications. Vesoma's patients never touch software Vesoma wrote: they
 * book, attend and pay, and the record of it sits in a clinic system Vesoma
 * bought. Tenacrity's teachers sign in to Tenacrity's own apps every day,
 * and the first sign of a teacher leaving is in what they stop doing there.
 * The first is read from the systems the business bought (CRM, clinic
 * software, a database); the second also needs the business's own app to
 * tell the retention application what its users do, as it happens.
 *
 * ── Three answers ──────────────────────────────────────────────────────────
 *
 *   own-app         customers use software the business built
 *   bought-systems  customers are recorded in systems the business bought
 *   both            a product with a service business around it
 *
 * ── Why it is not a model call ─────────────────────────────────────────────
 *
 * The evidence is plain and countable: app-store links, "download our app",
 * per-seat pricing, "free trial", against appointments, branches and
 * walk-ins. Counting it gives the same answer every time, says exactly which
 * words decided it (shown to the owner), and costs nothing. When the words
 * are not there the answer is bought-systems, which changes nothing about
 * the application, and the owner can say otherwise in one click.
 */

/** Words a business uses about software it built for its own customers. */
const OWN_APP = [
  { re: /apps\.apple\.com|app store/i,                          w: 3, say: 'App Store' },
  { re: /play\.google\.com|google play/i,                        w: 3, say: 'Google Play' },
  { re: /download (?:our|the) (?:mobile )?app/i,                 w: 3, say: '"download our app"' },
  { re: /\b(?:our|the \w+) (?:mobile |web )?app\b/i,            w: 2, say: '"our app"' },
  { re: /\bmobile app\b|\bios and android\b|\bandroid and ios\b/i, w: 2, say: 'a mobile app' },
  { re: /\bsaas\b|software as a service/i,                       w: 2, say: 'SaaS' },
  { re: /per (?:user|seat|teacher|student|month)\b|\/ ?(?:user|seat|mo|month)\b/i, w: 2, say: 'per-seat pricing' },
  { re: /free trial|start (?:for )?free|try (?:it )?free|freemium/i, w: 2, say: 'a free trial' },
  { re: /\bour (?:platform|product|tool)s?\b/i,                  w: 1, say: '"our platform"' },
  { re: /\b(?:log ?in|sign ?in|sign ?up|create (?:an|your) account)\b/i, w: 1, say: 'sign-in for users' },
  { re: /\bdashboard\b/i,                                        w: 1, say: 'a dashboard' },
  { re: /\b(?:active users|daily users|monthly users|DAU|MAU)\b/i, w: 2, say: 'active users' },
  // "Tools for teachers, students, and schools" is the whole of what some
  // sites serve before their JavaScript runs (Tenacrity's does).
  { re: /\b(?:tools|apps|software) for (?:teachers|students|schools|teams|businesses|creators|developers|users)\b/i, w: 2, say: 'tools for its users' },
  // How an owner describes losing users of their own product.
  { re: /\b(?:stop(?:ped|s)? using|usage (?:drops|falls|declines)|logins?\b|in-app|app usage|uninstall)/i, w: 2, say: 'usage of the product' },
];

/** Words a business uses about serving customers in person or on the phone. */
const BOUGHT = [
  { re: /\b(?:book|schedule) (?:an |a )?(?:appointment|consultation|visit|session|trial class)\b/i, w: 2, say: 'appointments' },
  { re: /\bwalk-?ins?\b|\bvisit us\b|\bour (?:clinic|centre|center|studio|academy|salon|gym|branch)\b/i, w: 2, say: 'a place customers visit' },
  { re: /\bbranches\b|\blocations\b|\bcentres\b|\bcenters\b/i,   w: 1, say: 'branches' },
  { re: /\b(?:clinic|hospital|patients?|treatments?|therap(?:y|ies))\b/i, w: 1, say: 'clinical care' },
  { re: /\b(?:coaches|coaching|batch(?:es)?|classes held)\b/i,   w: 1, say: 'coaching' },
  { re: /\b(?:call us|whatsapp us|enquire now|enquiry)\b/i,      w: 1, say: 'phone and WhatsApp enquiries' },
  { re: /\b(?:membership|members)\b/i,                           w: 1, say: 'memberships' },
];

export const SURFACES = ['own-app', 'bought-systems', 'both'];

/** What each answer means, in the owner's words. */
export const SURFACE_LINE = {
  'own-app':        'Your customers use your own app, so the retention application watches what they do in it as it happens.',
  'bought-systems': 'Your customers are recorded in the systems you already use, so the retention application reads from those.',
  'both':           'Your customers use your own app and are also recorded in the systems you already use, so the retention application reads both.',
};

function score(rules, text) {
  const hits = [];
  let total = 0;
  for (const r of rules) {
    if (r.re.test(text)) { total += r.w; hits.push(r.say); }
  }
  return { total, hits };
}

/**
 * Decide from what the business has said about itself: its objective, and
 * its company context or website text. Pure, so it is tested directly.
 */
export function decideCustomerSurface({ objective = '', evidence = '', engagement = '' } = {}) {
  const text = `${objective}\n${evidence}`.slice(0, 60000);
  const own = score(OWN_APP, text);
  const bought = score(BOUGHT, text);
  // Cob's engagement reading (engagementClassifierService) already decided
  // whether the work is on the business's own product; it counts, not decides.
  if (engagement === 'product-ai') { own.total += 2; own.hits.push('AI in your own product'); }

  let surface = 'bought-systems';
  if (own.total >= 4 && bought.total >= 3) surface = 'both';
  else if (own.total >= 4) surface = 'own-app';

  // Nothing found either way is a default, not a finding, and says so.
  const strength = surface === 'bought-systems' ? bought.total + (own.total === 0 ? 2 : 0) : own.total;
  const confidence = strength >= 7 ? 'high' : strength >= 4 ? 'medium' : 'low';

  const said = surface === 'bought-systems' ? bought.hits : own.hits;
  const reason = said.length
    ? `Read from what you told us and your website: ${said.slice(0, 4).join(', ')}.`
    : 'Nothing about your own app was found, so the systems you already use are read.';

  return {
    surface,
    confidence,
    reason,
    evidence: { ownApp: own.hits, boughtSystems: bought.hits },
    userSet: false,
    decidedAt: new Date(),
  };
}

/** True when the retention application should take events from the business's own app. */
export function takesAppEvents(bp) {
  const s = bp?.customerSurface?.surface;
  return s === 'own-app' || s === 'both';
}

/**
 * The decision for a blueprint made before this existed, made once at its
 * next build and kept. An owner's own choice is never replaced. Never throws:
 * without it the application is built as it always was.
 */
export async function ensureCustomerSurface(bp) {
  try {
    if (!bp || bp.customerSurface?.surface) return bp?.customerSurface || null;
    const [{ getCompanyEvidence }, { default: TransformationBlueprint }] = await Promise.all([
      import('./companyContextService.js'),
      import('../models/TransformationBlueprint.js'),
    ]);
    const evidence = bp.userId ? await getCompanyEvidence(bp.userId).catch(() => '') : '';
    const decided = decideCustomerSurface({
      objective: bp.businessObjective || '',
      evidence: `${bp.brand?.name || ''}\n${evidence}`,
      engagement: bp.engagement?.category || '',
    });
    if (bp._id) {
      await TransformationBlueprint.updateOne(
        { _id: bp._id, 'customerSurface.surface': { $exists: false } },
        { $set: { customerSurface: decided } },
      ).catch(() => {});
    }
    bp.customerSurface = decided;
    return decided;
  } catch (err) {
    console.warn('[customer-surface] skipped —', err.message);
    return null;
  }
}
