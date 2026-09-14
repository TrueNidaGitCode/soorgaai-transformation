/**
 * The Blueprints page's data: which opportunity is the one being built, which
 * are merely found, and the one word the page says about each objective.
 *
 * The winner matters more than it looks. Every later stage is keyed on it, and
 * the page shows it as "what this does" — naming the wrong one there would
 * describe an application as something it is not.
 */
import { describe, it, expect } from 'vitest';
import { resolveOpportunities } from '../services/blueprintOverviewService.js';

/** A completed ai-use-cases domain carrying the two sections that matter. */
const bp = (sections) => ({
  domains: [{ domainId: 'ai-use-cases', status: 'completed', capabilities: [{ sections }] }],
});

const discovery = (list) => ({ title: 'AI Opportunity Discovery', brief: { aiOpportunities: list } });
const ranked = (brief) => ({ title: 'AI Implementation Prioritization', brief });

describe('which opportunity is being built', () => {
  it('prefers the model naming its own pick over the sentence it wrote', () => {
    const r = resolveOpportunities(bp([
      ranked({
        recommendedInitiativeName: 'Roll Call Capture',
        // The justification names a DIFFERENT initiative first; the explicit
        // field is what decides, or a paraphrase would change the answer.
        recommendedStartingPoint: 'Attendance Risk Scoring is attractive, but Roll Call Capture pays back sooner.',
        priorityQuadrants: [{ initiatives: ['Attendance Risk Scoring', 'Roll Call Capture'] }],
      }),
    ]));
    expect(r.winner.name).toBe('Roll Call Capture');
    expect(r.others.map(o => o.name)).toEqual(['Attendance Risk Scoring']);
    expect(r.ranked).toBe(true);
  });

  it('falls back to the longest initiative named in the justification', () => {
    const r = resolveOpportunities(bp([
      ranked({
        recommendedStartingPoint: 'Start with Semantic Matching for Defects.',
        // 'Semantic Matching' is a prefix of the real winner: longest wins, or
        // the shorter one is picked and the two are silently swapped.
        priorityQuadrants: [{ initiatives: ['Semantic Matching', 'Semantic Matching for Defects'] }],
      }),
    ]));
    expect(r.winner.name).toBe('Semantic Matching for Defects');
    expect(r.others.map(o => o.name)).toEqual(['Semantic Matching']);
  });

  it('shows the customer their own words, and keeps the technique beside it', () => {
    const r = resolveOpportunities(bp([
      discovery([
        { name: 'Roll Call Capture', plain: 'Take the roll call from WhatsApp replies' },
        { name: 'Fee Default Early Warning', plain: 'See which fees will go unpaid' },
      ]),
      ranked({ recommendedInitiativeName: 'Roll Call Capture', priorityQuadrants: [{ initiatives: ['Roll Call Capture', 'Fee Default Early Warning'] }] }),
    ]));
    expect(r.winner).toEqual({ name: 'Roll Call Capture', plain: 'Take the roll call from WhatsApp replies' });
    expect(r.others[0].plain).toBe('See which fees will go unpaid');
  });

  it('uses the name when a blueprint predates the plain wording', () => {
    const r = resolveOpportunities(bp([
      discovery([{ name: 'Roll Call Capture' }]),
      ranked({ recommendedInitiativeName: 'Roll Call Capture', priorityQuadrants: [{ initiatives: ['Roll Call Capture'] }] }),
    ]));
    expect(r.winner.plain).toBe('Roll Call Capture');
  });

  it('falls back to discovery when nothing was ranked', () => {
    const r = resolveOpportunities(bp([
      discovery([{ name: 'A', plain: 'first', why: 'because' }, { name: 'B', plain: 'second' }]),
    ]));
    expect(r.winner.plain).toBe('first');
    expect(r.why).toBe('because');
    expect(r.others.map(o => o.plain)).toEqual(['second']);
    expect(r.ranked).toBe(false);
  });

  it('says nothing while the domain is still being written', () => {
    // Half-written sections would give a list that changes under the reader.
    const half = { domains: [{ domainId: 'ai-use-cases', status: 'generating', capabilities: [{ sections: [discovery([{ name: 'A' }])] }] }] };
    expect(resolveOpportunities(half).winner).toBeNull();
    expect(resolveOpportunities({}).winner).toBeNull();
    expect(resolveOpportunities(bp([])).winner).toBeNull();
  });
});
