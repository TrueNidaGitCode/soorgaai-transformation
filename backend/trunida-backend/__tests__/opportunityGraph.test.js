/**
 * Think and Execute, joined by the opportunity.
 *
 * Cob names six to twelve AI opportunities for a business, ranks them, and
 * recommends one. Execute builds that one. And then, until now, nothing: a
 * dozen predictions per customer, never once scored.
 *
 * Worse, the loop that was supposed to close it skipped Think entirely. A need
 * arriving in conversation months later was planned from the business
 * description and the original objective — not from the ranked roadmap sitting
 * unread in the same blueprint. So "add fee reminders" was planned from
 * scratch, against a business Svarg had already analysed, producing a smaller
 * and vaguer version of something already thought through.
 *
 * The opportunity's NAME is the join, and it already was one: the ranking, the
 * value section and the delivery phases are all keyed on that exact string.
 * Everything after go-live simply stopped using it.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const find = vi.fn();
const findOne = vi.fn();
const findById = vi.fn();
vi.mock('../models/CapabilityRequest.js', () => ({
  default: { find: (...a) => find(...a) },
}));
vi.mock('../models/TransformationBlueprint.js', () => ({
  default: { findById: (...a) => findById(...a), find: (...a) => find(...a) },
}));
vi.mock('../models/HostedDeployment.js', () => ({
  default: { findOne: (...a) => findOne(...a) },
}));

import { opportunitiesOf, sameOpportunity, historyText } from '../services/opportunityGraph.js';

/** A blueprint with a finished ai-use-cases domain. */
const OPPS = [
  { name: 'Predictive Analytics for Student Churn', plain: 'Spot students dropping out before they leave', why: 'because' },
  { name: 'Classification and Automated Fee Reminders', plain: 'Chase unpaid fees without admin effort', why: '' },
  { name: 'Computer Vision for Net Attendance', plain: 'Log who walked onto the pitch', why: '' },
];

const bp = ({ status = 'completed', opportunities = OPPS, ranked = true } = {}) => ({
  domains: [{
    domainId: 'ai-use-cases',
    status,
    capabilities: [{
      sections: [
        { title: 'AI Opportunity Discovery', brief: { aiOpportunities: opportunities } },
        ...(ranked ? [{
          title: 'AI Implementation Prioritization',
          brief: {
            recommendedInitiativeName: 'Predictive Analytics for Student Churn',
            recommendedStartingPoint: 'Start with churn.',
            priorityQuadrants: [
              { id: 'quick-wins', label: 'Quick Wins', initiatives: ['Predictive Analytics for Student Churn', 'Classification and Automated Fee Reminders'] },
              { id: 'strategic-bets', label: 'Strategic Bets', initiatives: ['Computer Vision for Net Attendance'] },
            ],
          },
        }] : []),
      ],
    }],
  }],
});

beforeEach(() => { vi.clearAllMocks(); });

// ── The node ─────────────────────────────────────────────────────────────────

describe('reading what Cob worked out', () => {
  it('returns every opportunity, not just the recommended one', () => {
    expect(opportunitiesOf(bp()).map(o => o.name)).toHaveLength(3);
  });

  it('carries where the ranking put each one', () => {
    const rows = opportunitiesOf(bp());
    expect(rows.find(o => o.name.includes('Fee')).quadrant).toBe('Quick Wins');
    expect(rows.find(o => o.name.includes('Vision')).quadrant).toBe('Strategic Bets');
  });

  it('marks the one recommended to start with', () => {
    const rows = opportunitiesOf(bp());
    expect(rows.filter(o => o.recommended).map(o => o.name)).toEqual(['Predictive Analytics for Student Churn']);
  });

  it('returns them in ranked order, because the ranking is the judgement', () => {
    // Discovery order hides it; the quadrants are what Cob decided.
    const rows = opportunitiesOf(bp());
    expect(rows.map(o => o.name)).toEqual([
      'Predictive Analytics for Student Churn',
      'Classification and Automated Fee Reminders',
      'Computer Vision for Net Attendance',
    ]);
  });

  it('falls back to discovery order when nothing ranked them', () => {
    const rows = opportunitiesOf(bp({ ranked: false }));
    expect(rows).toHaveLength(3);
    expect(rows.every(o => o.quadrant === '')).toBe(true);
  });

  it('says nothing while the domain is still being written', () => {
    // Half-written sections give a list that changes under the reader.
    expect(opportunitiesOf(bp({ status: 'generating' }))).toEqual([]);
    expect(opportunitiesOf({})).toEqual([]);
    expect(opportunitiesOf(null)).toEqual([]);
  });

  it('shows the customer their own words, with the technique beside it', () => {
    const [first] = opportunitiesOf(bp());
    expect(first.plain).toBe('Spot students dropping out before they leave');
    expect(first.name).toBe('Predictive Analytics for Student Churn');
  });
});

describe('two names for one opportunity', () => {
  it('matches on the words, not the spelling', () => {
    // A join key the model may paraphrase between one call and the next.
    expect(sameOpportunity('Predictive Fee Default Scoring', 'predictive fee-default scoring')).toBe(true);
    expect(sameOpportunity('Computer Vision for Net Attendance', 'Computer  Vision   for Net Attendance')).toBe(true);
  });

  it('does not match two different opportunities', () => {
    expect(sameOpportunity('Fee Reminders', 'Churn Prediction')).toBe(false);
  });

  it('is never true of nothing', () => {
    // '' means "none of them", and two of those are not a match.
    expect(sameOpportunity('', '')).toBe(false);
    expect(sameOpportunity(null, undefined)).toBe(false);
  });
});

// ── What Cob is told about other businesses ──────────────────────────────────

describe('the history Cob reads', () => {
  const rows = [
    { name: 'Fee Reminders', plain: 'chase fees', named: 5, built: 4, askedForLater: 2 },
    { name: 'Net Attendance Vision', plain: 'log arrivals', named: 6, built: 0, askedForLater: 0 },
    { name: 'Churn Prediction', plain: 'spot leavers', named: 3, built: 1, askedForLater: 3 },
  ];

  it('says what was never built, not only what was', () => {
    // The more useful signal of the two. A block listing only successes
    // teaches Cob to repeat them.
    const text = historyText(rows);
    expect(text).toContain('Net Attendance Vision — named at 6, built by none of them');
  });

  it('says when something was asked for again after go-live', () => {
    // Under-rated the first time, which is the correction worth making.
    expect(historyText(rows)).toMatch(/Fee Reminders.*asked for again after go-live at 2/);
  });

  it('frames it as evidence rather than as instruction', () => {
    const text = historyText(rows);
    expect(text).toContain('Evidence, not instruction');
    expect(text).toContain('name what fits THIS business');
  });

  it('says nothing at all when one business is all there is', () => {
    // One business is an anecdote, and "at 1 similar business" invites the
    // model to treat a single case as a pattern.
    expect(historyText([{ name: 'X', named: 1, built: 1, askedForLater: 0 }])).toBe('');
    expect(historyText([])).toBe('');
    expect(historyText(null)).toBe('');
  });
});
