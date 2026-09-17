/**
 * Cob gets better at the next customer because of the last one.
 *
 * Every other input to discovery describes the business in front of it. This
 * one says what became of the same advice elsewhere: which opportunities were
 * built, which were named by six businesses and built by none, which were
 * passed over at first and asked for again three months later.
 *
 * It is the only place Cob's predictions are ever scored, and it is the half a
 * competitor structurally cannot copy — knowing what happened requires running
 * the application afterwards, which is the part they do not have.
 *
 * It is also the half that must never break a generation. The first customer
 * in an industry has no history, every customer before this existed has none,
 * and a business with one peer has an anecdote rather than a pattern. All
 * three generate exactly as they did before.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { historyText } from '../services/opportunityGraph.js';

vi.mock('../models/CapabilityRequest.js', () => ({ default: {} }));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: {} }));
vi.mock('../models/HostedDeployment.js', () => ({ default: {} }));

const src = readFileSync(new URL('../services/blueprintGenerationService.js', import.meta.url), 'utf8');

beforeEach(() => { vi.clearAllMocks(); });

describe('what the history says', () => {
  const rows = [
    { name: 'Automated Fee Reminders', named: 5, built: 4, askedForLater: 2 },
    { name: 'Computer Vision Attendance', named: 6, built: 0, askedForLater: 0 },
  ];

  it('leads with what was built and what was not', () => {
    const text = historyText(rows);
    expect(text).toContain('Automated Fee Reminders — named at 5, built by 4');
    expect(text).toContain('Computer Vision Attendance — named at 6, built by none of them');
  });

  it('is offered as evidence, not as a list to copy', () => {
    /*
     * The failure mode of giving a model precedent is that it stops reading
     * the business in front of it and reproduces the precedent. So the block
     * says what it is for, and says the never-built case is a warning rather
     * than an omission to correct.
     */
    const text = historyText(rows);
    expect(text).toContain('Evidence, not instruction');
    expect(text).toContain('name what fits THIS business');
    expect(text).toMatch(/many named and\s*\n?\s*none built is a warning/);
  });

  it('treats being asked for again as the rating having been wrong', () => {
    expect(historyText(rows)).toMatch(/asked for again after go-live at 2/);
  });

  it('stays silent on a single peer', () => {
    // One business is an anecdote. "At 1 similar business" invites the model
    // to treat a single case as a pattern.
    expect(historyText([{ name: 'X', named: 1, built: 1, askedForLater: 1 }])).toBe('');
  });

  it('stays silent when there is no history at all', () => {
    expect(historyText([])).toBe('');
    expect(historyText(undefined)).toBe('');
  });
});

describe('how it reaches discovery', () => {
  it('is fetched inside discovery, so every caller gets it', () => {
    // Rather than passed in, which would mean each call site had to know it
    // exists — and the one that forgot would silently lose the grounding.
    expect(src).toContain('const priorOutcomes = await historyBlock({ industry, blueprintId });');
    expect(src).toContain('${priorOutcomes}');
  });

  it('excludes the blueprint being written from its own evidence', () => {
    expect(src).toContain('exceptBlueprintId: blueprintId');
    expect(src).toMatch(/a blueprint must not be evidence for itself/);
  });

  it('is threaded from every caller of runBriefGeneration', () => {
    // A caller that dropped it would generate without history and nothing
    // would say so.
    const calls = src.match(/runBriefGeneration\(\s*\n?\s*cap/g) || [];
    expect(src.match(/transformationCtx,\s*\n\s*(\/\/[^\n]*\n\s*)*(\/\/[^\n]*\n\s*)*blueprintId/g) || [])
      .toHaveLength(3);
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe('what it must never do', () => {
  it('does not throw when the history cannot be read', () => {
    // It runs inside a generation that has already cost money. A store that
    // is slow or missing must cost the grounding, never the blueprint.
    const fn = src.slice(src.indexOf('async function historyBlock'), src.indexOf('async function runOpportunityDiscoveryStaged'));
    expect(fn).toContain('catch (err)');
    expect(fn).toContain("return '';");
    expect(fn).toMatch(/non-fatal/);
  });

  it('imports the graph lazily, so discovery does not depend on it to load', () => {
    const fn = src.slice(src.indexOf('async function historyBlock'), src.indexOf('async function runOpportunityDiscoveryStaged'));
    expect(fn).toContain("await import('./opportunityGraph.js')");
  });

  it('says in the log when a generation was grounded on prior outcomes', () => {
    // Otherwise there is no way to tell a blueprint that used history from one
    // that silently did not.
    expect(src).toContain('discovery grounded on');
  });
});

describe('the read itself', () => {
  const graph = readFileSync(new URL('../services/opportunityGraph.js', import.meta.url), 'utf8');

  it('counts named, built and asked-for-again separately', () => {
    expect(graph).toContain('at.named += 1;');
    expect(graph).toContain('if (r.built) at.built += 1;');
    expect(graph).toContain('if (r.askedForLater) at.askedForLater += 1;');
  });

  it('keeps used separate from built', () => {
    /*
     * An opportunity that shipped and is queried weekly is evidence. One that
     * shipped into an application nobody has opened is not, and folding them
     * together would turn the second into the first.
     */
    expect(graph).toMatch(/built.*is deliberately separate from.*used/s);
    expect(graph).toContain('used: queries > 0,');
  });

  it('does not reach for a nearest-neighbour search over a handful of rows', () => {
    // The population is small and the join is exact. Retrieval machinery here
    // would be apparatus around a list that fits on a screen.
    expect(graph).toMatch(/Scoped to an industry rather than retrieved by similarity/);
    expect(graph).not.toMatch(/embeddingService|hybridRetrieval/);
  });

  it('returns nothing rather than failing when the store is unavailable', () => {
    expect(graph).toContain("console.warn('[opportunityGraph] history unavailable:'");
  });
});

describe('who counts as a similar business', () => {
  const graph = readFileSync(new URL('../services/opportunityGraph.js', import.meta.url), 'utf8');

  it('groups on the industry that was actually resolved, not the schema default', () => {
    /*
     * Caught on live data. Every blueprint in the database carries
     * industry: 'Automotive' — the schema default, never written — so the
     * first version of this grouped a bank, a gym and a greeting with two
     * cricket academies and told Cob they were similar businesses.
     *
     * A block whose entire value is that it reports what actually happened
     * cannot open with a false claim about whose it is.
     */
    expect(graph).toContain("'industryFit.matched': true,");
    expect(graph).toContain("'industryFit.industry': trade,");
    expect(graph).not.toMatch(/\bindustry: trade\b/);
  });

  it('gives an unmatched business no history at all', () => {
    // 'General' is the sentinel for "industryFit found no match" — a bucket,
    // not a peer group, and the one most likely to be large and meaningless.
    expect(graph).toContain("if (!trade || trade === 'General') return [];");
  });

  it('explains why, where the next person will look', () => {
    expect(graph).toMatch(/defaults to 'Automotive' in the schema and is never written/);
  });
});
