/**
 * Svarg — what "a lost customer" means for this business.
 *
 * The delivered application learns which signals came before customers left
 * (eame-template/services/churnPatterns.js). It can only learn that once it
 * knows who left, and "left" differs by business: a gym member gone quiet for
 * two months has left, a hotel guest gone quiet for two months has not.
 *
 * So Cob proposes the definition from the kind of business it is, and it is
 * written into data/agents.json at delivery beside the watcher plan. The
 * owner sees it as one sentence on the Data page and can change it.
 *
 * ── Why this is code, and not a question for the model ─────────────────────
 *
 * The same reason the watcher plan is: it is a decision, it must be the same
 * every time, and a confident wrong answer would be invisible. The business
 * types are the five the sales pages and the site use, matched in the same
 * order as the sales admin's funnel (frontend/admin/sales.js): high-value
 * repeat services before recurring services, because a dental clinic is the
 * occasional high-ticket visit, not a course of sessions.
 */

const TYPES = [
  {
    id: 'high-value', label: 'High-Value Repeat Services',
    is: /dental|dentist|auto ?service|car service|garage|automobile service|home service|premium health|hospital(?!ity)|diagnostic|eye care|dermatolog/i,
    definition: { inactiveDays: 180, statusWords: ['cancelled', 'not renewed', 'lost'] },
  },
  {
    id: 'recurring', label: 'Recurring Services',
    is: /clinic|wellness|physio|rehab|therap|spa\b|salon|beauty|health|fitness|gym|yoga|pilates|nutrition|medic/i,
    // Not "cancelled": a cancelled appointment is one visit, not a customer.
    definition: { inactiveDays: 60, statusWords: ['not renewed', 'expired', 'lapsed', 'discontinued'] },
  },
  {
    id: 'education', label: 'Education & Memberships',
    is: /academy|academies|sport|cricket|tennis|football|badminton|coaching|athlet|school|edtech|education|tuition|learning|college|university|institute|music|dance|membership/i,
    definition: { inactiveDays: 45, statusWords: ['withdrawn', 'dropped', 'left', 'discontinued', 'not renewed'] },
  },
  {
    id: 'subscription', label: 'Subscription & Repeat Purchase',
    is: /subscription|d2c|direct.to.consumer|meal|food|\bpets?\b|pet care|consumable|grocery|e-?commerce|repeat purchase/i,
    definition: { inactiveDays: null, gapMultiple: 3, minDays: 30, statusWords: ['cancelled', 'unsubscribed'] },
  },
  {
    id: 'hospitality', label: 'Hospitality & Leisure',
    is: /hotel|resort|hospitality|travel|tour|club|leisure|experience|restaurant|cafe|homestay/i,
    definition: { inactiveDays: 540, statusWords: ['not renewed', 'expired', 'cancelled membership'] },
  },
];

const GENERAL = {
  businessType: 'general', label: 'General',
  inactiveDays: null, gapMultiple: 3, minDays: 30,
  statusWords: ['cancelled', 'unsubscribed', 'not renewed', 'churned', 'closed lost', 'withdrawn'],
};

/** The words Cob has about this business. */
function businessText(bp = {}) {
  return [
    bp.businessObjective, bp.appName, bp.industry,
    bp.industryFit?.industry, bp.company?.name, bp.companyProfile?.industry,
  ].filter(Boolean).join(' ');
}

/**
 * The proposed definition for a blueprint. Never null: a business no type
 * matches gets the general one, which still learns, just less precisely.
 */
export function churnDefinitionFor(bp) {
  const text = businessText(bp);
  const t = TYPES.find((x) => x.is.test(text));
  if (!t) return { ...GENERAL };
  return {
    businessType: t.id,
    label: t.label,
    inactiveDays: null, gapMultiple: null, minDays: 30,
    ...t.definition,
  };
}

export const BUSINESS_TYPES = TYPES.map(({ id, label }) => ({ id, label }));
