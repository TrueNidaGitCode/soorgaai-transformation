/**
 * Cob shows the whole landscape, not a shortlist.
 *
 * The market is crowded with products that generate an application from a
 * prompt. The part nobody else is doing is the thinking that comes first —
 * reading a business and working out where AI actually fits — and a VC looking
 * at a lot of pitches picked that out as the differentiator.
 *
 * Discovery asked the model for "3 to 4 items" and the parser threw away
 * anything past six. Three ideas read as three ideas somebody had. Twelve,
 * covering every step of the workflow, reads as an analysis — and it is the
 * same run either way, because the model has already read the business by the
 * time it writes them.
 *
 * Narrowing is the NEXT capability's job. Prioritization ranks them into
 * quadrants and names one to start with. Discovery narrowing first meant the
 * ranking only ever saw a shortlist somebody else had already made.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../services/blueprintGenerationService.js', import.meta.url), 'utf8');

/** The instruction block both the full and the two-stage path share. */
const discovery = src.slice(src.indexOf('8. aiOpportunities'), src.indexOf('9.', src.indexOf('8. aiOpportunities')));

describe('what discovery is asked for', () => {
  it('no longer asks for three or four', () => {
    expect(src).not.toContain('aiOpportunities (3 to 4 items)');
  });

  it('asks for as many as the work supports', () => {
    expect(discovery).toMatch(/as many as the work genuinely supports/);
    expect(discovery).toMatch(/6 to 12/);
  });

  it('tells it to walk the workflow rather than pick favourites', () => {
    // Coverage is what makes a long list an analysis instead of a brainstorm.
    expect(discovery).toMatch(/workflowSteps and highEffortActivities in turn/);
    expect(discovery).toMatch(/span several steps/);
  });

  it('says plainly that narrowing is the next capability\'s job', () => {
    expect(discovery).toMatch(/Prioritization .*is what\s+narrows it/s);
  });
});

describe('what stops it becoming padding', () => {
  it('forbids splitting one system into several entries', () => {
    // The failure mode of asking for more: the same thing, three times, in
    // different words. A padded list is worse than a short one.
    expect(discovery).toMatch(/would be built as the SAME system are one item/);
    expect(discovery).toMatch(/Never restate one opportunity in different words/);
  });

  it('would rather leave a step out than invent something for it', () => {
    expect(discovery).toMatch(/left out, not padded/);
    expect(discovery).toMatch(/Ten\s+specific opportunities are the goal; ten generic ones are worse than three/);
  });

  it('requires every item to be grounded in what the company does', () => {
    expect(discovery).toMatch(/grounded in something this company actually does/);
  });
});

describe('the ceilings the parser applies', () => {
  it('keeps one backstop, and says it is not an editorial limit', () => {
    expect(src).toContain('const MAX_OPPORTUNITIES = 24;');
    expect(src).toMatch(/backstop, not an editorial choice/);
  });

  it('does not throw away opportunities past the sixth any more', () => {
    expect(src).not.toMatch(/\.filter\(o => o\.name\)\s*\n\s*\.slice\(0, 6\)/);
    expect(src).toContain('.slice(0, MAX_OPPORTUNITIES)');
  });

  it('carries the per-opportunity sections to the same depth', () => {
    /*
     * Both prompts say "one item per identified AI opportunity", and both
     * parsers capped at 8. With twelve opportunities the last four silently
     * lost their classification and their value line — which is how a fuller
     * list starts looking like a broken one.
     */
    expect(src.match(/\.slice\(0, MAX_OPPORTUNITIES\)/g).length).toBeGreaterThanOrEqual(3);
    const perOpportunity = src.slice(src.indexOf('const opportunityClassifications'), src.indexOf('const rawModelLifecycleStages'));
    expect(perOpportunity).not.toContain('.slice(0, 8)');
  });
});

describe('two names for one system', () => {
  it('is caught in code as well as forbidden in the prompt', async () => {
    // Asking for coverage makes a near-duplicate likelier than asking for
    // three did, and a thorough list that repeats itself reads as padded.
    expect(src).toContain('function sameOpportunity(a, b)');
    expect(src).toContain('all.findIndex(x => sameOpportunity(x.name, o.name)) === i');
  });

  it('compares the words, not the spelling', () => {
    const fn = src.slice(src.indexOf('function sameOpportunity'), src.indexOf('}', src.indexOf('return key(a) === key(b);')));
    // "Predictive Fee Default Scoring" vs "Predictive fee-default scoring".
    expect(fn).toContain("replace(/[^a-z0-9]+/g, ' ')");
    expect(fn).toContain('toLowerCase()');
  });
});

describe('what the rest of the pipeline does with a longer list', () => {
  it('still asks prioritisation to place every one of them', () => {
    // It already did, and it must keep doing it: an opportunity discovered and
    // never ranked disappears from the screen entirely, because the ranked
    // list is what the view reads when there is one.
    expect(src).toContain('Distribute ALL identified AI opportunities from Capability 1');
    expect(src).toMatch(/do NOT leave it empty if there are remaining identified opportunities/);
  });

  it('still sequences every one of them into a delivery phase', () => {
    expect(src).toMatch(/Sequence ALL identified opportunities from Capability 1/);
    expect(src).toMatch(/Every opportunity must appear in exactly one phase; do not drop any/);
  });

  it('does not cap the initiatives inside a quadrant', () => {
    const quadrants = src.slice(src.indexOf('const priorityQuadrants ='), src.indexOf('const rawDimensionCards'));
    // Four quadrants, yes. A limit on what goes in them, no.
    expect(quadrants).toContain('.slice(0, 4)');
    expect(quadrants).toContain('q.initiatives.map(String).filter(Boolean)');
    expect(quadrants).not.toMatch(/initiatives.*\.slice\(0, [0-9]+\)/);
  });
});
