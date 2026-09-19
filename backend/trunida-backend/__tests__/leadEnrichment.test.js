/**
 * A company name becomes an industry, and an industry becomes a question.
 *
 * The manual loop this replaces: meet a prospect, write down the company,
 * open a laptop, work out the industry, check whether there is a knowledge
 * base for it, and if not prepare one by hand in the format the code accepts.
 *
 * Every piece of that already existed — detectCompanyIndustry, resolveIndustry,
 * ensureIndustryCoverage, and the admin page that generates and publishes.
 * What was missing was the wire, and these are about the two things the wire
 * must not get wrong: what it costs, and what it decides on its own.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  enrichableLeads, PER_SWEEP, DAILY_CAP, RECHECK_DAYS, SWEEP_MS,
} from '../services/leadEnrichmentService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-19T10:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000);

const lead = (over = {}) => ({
  _id: 'l1', company: 'Kaynes Technology', industry: '', industryCheckedAt: null, ...over,
});

describe('which leads are worth looking up', () => {
  it('takes one with a company and no industry', () => {
    expect(enrichableLeads([lead()], NOW)).toHaveLength(1);
  });

  it('leaves alone one that already has an industry', () => {
    // Including one a person typed, which always wins over a lookup.
    expect(enrichableLeads([lead({ industry: 'Semiconductors' })], NOW)).toHaveLength(0);
  });

  it('skips a lead with no company, because there is nothing to look up', () => {
    expect(enrichableLeads([lead({ company: '' })], NOW)).toHaveLength(0);
    expect(enrichableLeads([lead({ company: '   ' })], NOW)).toHaveLength(0);
  });

  it('does not ask again about a company it could not place', () => {
    /*
     * The stamp goes on whether or not an answer came back, because asking
     * again costs exactly what asking cost. Without this, a company the model
     * cannot identify is a web search every ten minutes for ever.
     */
    expect(enrichableLeads([lead({ industryCheckedAt: daysAgo(1) })], NOW)).toHaveLength(0);
    expect(enrichableLeads([lead({ industryCheckedAt: daysAgo(RECHECK_DAYS - 1) })], NOW)).toHaveLength(0);
  });

  it('is willing to try again eventually', () => {
    expect(enrichableLeads([lead({ industryCheckedAt: daysAgo(RECHECK_DAYS + 1) })], NOW)).toHaveLength(1);
  });

  it('survives a list with rubbish in it', () => {
    expect(enrichableLeads([null, undefined, {}, lead()], NOW)).toHaveLength(1);
    expect(enrichableLeads(null)).toEqual([]);
  });
});

describe('what it is allowed to spend', () => {
  it('looks up a few at a time, not a lane at a time', () => {
    /*
     * Detection is a web-search-grounded model call. Firing one per lead as
     * it is added would mean a bulk import of sixty-three companies spending
     * sixty-three of them in a burst, on a click meant to be instant.
     */
    expect(PER_SWEEP).toBeLessThanOrEqual(5);
    expect(SWEEP_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it('has a daily ceiling, counted from the records rather than memory', () => {
    // A restart must not hand the sweep a fresh allowance.
    expect(DAILY_CAP).toBeGreaterThan(0);
    const svc = read('../services/leadEnrichmentService.js');
    expect(svc).toContain('ColdLead.countDocuments({ industryCheckedAt: { $gte: start } })');
  });

  it('does not fire on boot', () => {
    // Same reason the outreach sweep does not: a crash-looping server must
    // never become a spending loop.
    const svc = read('../services/leadEnrichmentService.js');
    expect(svc).toMatch(/crash-looping server must never become a spending loop/);
    expect(svc).not.toMatch(/tick\(\);\s*$/m);
  });

  it('can be switched off entirely', () => {
    const svc = read('../services/leadEnrichmentService.js');
    expect(svc).toContain('LEAD_ENRICHMENT_DISABLED');
  });
});

describe('what it decides on its own', () => {
  const svc = read('../services/leadEnrichmentService.js');

  it('creates a shell and never generates a knowledge base', () => {
    /*
     * The money gate, and the one thing that must not be "helpfully" removed.
     * A new industry is around sixteen web-search-grounded calls, and there
     * are thirty-two industries sitting in the walk-in lane — generating on
     * detection would spend five hundred of them the first time this ran.
     *
     * The shell appearing as `pending` on the industry page is the
     * indication to go and generate it. That is the whole design.
     */
    expect(svc).toContain('ensureIndustryCoverage(');
    expect(svc).not.toContain('triggerGeneration');
    expect(svc).not.toContain('generateIndustryCapabilityKnowledge');
  });

  it('resolves the label, so one industry does not become two', () => {
    // "Semiconductor" and "Semiconductors" would otherwise each cost a full
    // generation batch to say the same thing.
    expect(svc).toContain('resolveIndustry(');
    expect(svc).toContain('knownIndustries: known');
  });

  it('stamps the lead before the answer arrives', () => {
    const enrich = svc.slice(svc.indexOf('export async function enrichLead'));
    expect(enrich.indexOf('const checkedAt = new Date();'))
      .toBeLessThan(enrich.indexOf('await detectCompanyIndustry('));
  });

  it('says whether there is a knowledge base, which is the question being asked', () => {
    expect(svc).toContain('covered');
    const script = read('../scripts/enrich_leads.mjs');
    expect(script).toContain('knowledge base ready');
    expect(script).toContain('no knowledge base');
  });
});

describe('it runs, and the board already knows how to show it', () => {
  it('is started with the other sweeps', () => {
    const server = read('../server.js');
    expect(server).toContain('startEnrichmentScheduler');
    expect(server).toContain('startLeadEnrichment();');
  });

  it('writes the field the sales board already renders', () => {
    /*
     * No new screen. The industry cell added with the field marks an industry
     * the knowledge base does not cover, so the moment the sweep writes one
     * the board says which prospects are grounded and which are not.
     */
    const ui = read('../../../frontend/admin/sales.js');
    expect(ui).toContain('function industryCell(r)');
    expect(ui).toContain('sg-industry--ungrounded');
  });

  it('remembers when it looked, on the lead', () => {
    const model = read('../models/ColdLead.js');
    expect(model).toMatch(/industryCheckedAt: \{ type: Date, default: null \}/);
  });
});

describe('the provider refusing is not an answer about a company', () => {
  const svc = read('../services/leadEnrichmentService.js');
  const research = read('../services/companyResearchService.js');

  it('tells a refusal apart from "I could not place this"', async () => {
    /*
     * Found by running it for real. The OpenAI account had no credits, the
     * call came back 429, and the first version of this recorded "Could not
     * place this company" and stamped the lead — hiding it for thirty days
     * because of a billing problem that might be fixed in ten minutes, and
     * leaving a record saying somebody had looked into a company nobody had.
     *
     * The same mistake the conformance suite made once: a spend cap is not
     * the thing failing.
     */
    const { isUpstream } = await import('../services/companyResearchService.js');
    expect(isUpstream({ status: 429 })).toBe(true);
    expect(isUpstream({ status: 402 })).toBe(true);
    expect(isUpstream({ status: 503 })).toBe(true);
    expect(isUpstream({ message: 'You have no credits remaining.' })).toBe(true);
    expect(isUpstream({ message: 'Rate limit reached' })).toBe(true);
    expect(isUpstream({ message: 'ETIMEDOUT' })).toBe(true);
    // A genuine failure of this call, not of the provider.
    expect(isUpstream({ status: 400, message: 'Unexpected token in JSON' })).toBe(false);
  });

  it('keeps every existing caller working, because both are falsy on .industry', () => {
    // createLibraryEntry reads `found?.industry` and must be unaffected.
    expect(research).toContain("return { error: isUpstream(err) ? 'upstream' : 'failed', message: err.message };");
  });

  it('writes nothing and spends nothing when the provider refused', () => {
    const enrich = svc.slice(svc.indexOf('export async function enrichLead'), svc.indexOf('export async function runEnrichmentSweep'));
    const refusal = enrich.indexOf("found?.error === 'upstream'");
    const stamp = enrich.indexOf('industryCheckedAt: checkedAt');
    expect(refusal).toBeGreaterThan(-1);
    // The refusal returns before anything is written.
    expect(refusal).toBeLessThan(stamp);
    expect(enrich).toContain('return { company, industry: \'\', covered: false, upstream: true, reason: found.message };');
  });

  it('stops the sweep rather than burning the batch against a dead provider', () => {
    // One refusal means the next call is refused too. Trying the rest learns
    // nothing and logs the same error three times.
    expect(svc).toContain('if (r.upstream) return');
    expect(svc).toContain('The model provider refused:');
  });

  it('says the real reason, so the fix is obvious', () => {
    // "Could not place this company" sends somebody looking at the company.
    // "You have no credits remaining" sends them to the billing page.
    expect(svc).toContain('reason: found.message');
  });
});
