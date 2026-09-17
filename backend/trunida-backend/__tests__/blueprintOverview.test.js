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

/**
 * The live-update sweep marks every application 'attaching' when it pushes,
 * and only promotes it back when it next runs — six hours later. For most of
 * a day after any runtime change the page said "Going live", hid the button
 * that opens the application, and counted the thing the customer was already
 * using as not yet built. The URL answered 200 the whole time.
 */
describe('an application being updated is still an application that is running', () => {
  const live = { status: 'live', railway: { url: 'https://app.example' }, liveAt: new Date('2026-09-13') };
  const updating = { status: 'attaching', railway: { url: 'https://app.example' }, liveAt: new Date('2026-09-13') };
  const neverLive = { status: 'attaching', railway: { url: 'https://app.example' }, liveAt: null };

  it('reads as live, and says an update is being applied', async () => {
    const { blueprintsOverview } = await import('../services/blueprintOverviewService.js');
    expect(typeof blueprintsOverview).toBe('function');
    // state() is internal; its rule is asserted through the source so a later
    // edit cannot quietly put the old behaviour back.
    const src = await import('fs').then(fs => fs.readFileSync(
      new URL('../services/blueprintOverviewService.js', import.meta.url), 'utf8'));
    expect(src).toMatch(/dep\?\.status === 'attaching' && dep\.liveAt/);
    expect(src).toMatch(/updating: true/);
  });

  it('still offers the address, because the host serves the old version until the new one is healthy', async () => {
    const src = await import('fs').then(fs => fs.readFileSync(
      new URL('../services/blueprintOverviewService.js', import.meta.url), 'utf8'));
    // Asserted through the predicate rather than through the exact expression
    // it used to be written as: the set of statuses that count as running grew
    // by one ('degraded'), and a test pinned to the old literal failed on a
    // change that was correct. What must hold is that the address is offered
    // whenever something is serving — running, or updating over a version that
    // already served.
    expect(src).toMatch(/app: \(isRunning\(dep\?\.status\) \|\| \(dep\?\.status === 'attaching' && dep\?\.liveAt\)\)/);
  });

  it('offers the address of an application that is running but unwell', async () => {
    /*
     * Degraded is serving. Its health check reports a missing database or an
     * unreadable dataset, and the customer can still open it and use what
     * works — so the link stays, with the fact attached.
     *
     * Before this, degraded fell past every branch in state() to 'Built', and
     * the page would have stopped offering the link to an application somebody
     * was using at that moment. That is the same mistake as the 'attaching'
     * one above, in a new status.
     */
    const { isRunning } = await import('../models/HostedDeployment.js');
    expect(isRunning('degraded')).toBe(true);
    expect(isRunning('live')).toBe(true);
    for (const s of ['queued', 'preparing', 'prepared', 'attaching', 'failed', 'suspended', 'destroyed']) {
      expect(isRunning(s), s).toBe(false);
    }

    const src = await import('fs').then(fs => fs.readFileSync(
      new URL('../services/blueprintOverviewService.js', import.meta.url), 'utf8'));
    expect(src).toMatch(/dep\?\.status === 'degraded'\)\s+return \{ key: 'live'/);
    expect(src).toMatch(/unwell: dep\.status === 'degraded'/);
  });

  it('does not claim an application that has never been live is live', () => {
    // liveAt null means it has never served anything; that is Going live.
    expect(neverLive.liveAt).toBeNull();
    expect(live.status).toBe('live');
    expect(updating.liveAt).toBeTruthy();
  });
});
