/**
 * A blueprint that says "done" has to be done.
 *
 * During a live demonstration the screen showed the blueprint complete. One
 * domain of six had been generated; the other five were empty. The customer
 * was told the thing was ready while five sixths of it did not exist.
 *
 * The cause was one field doing two jobs. `status` described the blueprint AND
 * told the SSE stream when to stop polling, and the second job won: every
 * generation path ended by asserting 'completed' whatever it had produced —
 * one of them carrying the comment "Always mark blueprint completed so the SSE
 * stream terminates". generateSpecificDomainsAsync regenerates ONE domain, by
 * its own documentation, and then declared the whole blueprint finished.
 *
 * It was not a demo-day glitch. Of 35 blueprints claiming to be complete, 21
 * were not, and four had nothing in them at all.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

const found = { doc: null };
const updates = [];

vi.mock('../models/TransformationBlueprint.js', () => ({
  default: {
    findById: () => ({ select: () => ({ lean: () => ({ catch: async () => found.doc }) }) }),
    updateOne: async (q, u) => { updates.push(u.$set); return { modifiedCount: 1 }; },
  },
}));

vi.mock('../config/domainRegistry.js', () => ({
  enabledDomains: () => ([
    { id: 'ai-use-cases' }, { id: 'ai-strategy' }, { id: 'data-readiness' },
    { id: 'technology-infrastructure' }, { id: 'skills-workforce' }, { id: 'governance-security' },
  ]),
  getDomain: () => null,
}));

/** A domain with n capabilities that actually produced sections. */
const domain = (id, withContent, flagged = 'completed') => ({
  domainId: id,
  status: flagged,
  capabilities: [{ capabilityId: 'c1', status: flagged, sections: withContent ? [{ title: 'x' }] : [] }],
});

const ALL = ['ai-use-cases', 'ai-strategy', 'data-readiness',
  'technology-infrastructure', 'skills-workforce', 'governance-security'];

async function settle(domains) {
  found.doc = { domains };
  updates.length = 0;
  const { settleBlueprintStatus } = await import('../services/blueprintGenerationService.js');
  return settleBlueprintStatus('bp1');
}

// No resetModules: the service registers mongoose models at import, and
// re-importing it a second time throws OverwriteModelError.
beforeEach(() => { updates.length = 0; });

describe('the status is read from the blueprint, not asserted', () => {
  it('is partial when one domain of six has content — the demo case exactly', async () => {
    const out = await settle(ALL.map((id, i) => domain(id, i === 0)));
    expect(out).toBe('partial');
    expect(updates[0].status).toBe('partial');
  });

  it('is completed only when every domain has content', async () => {
    expect(await settle(ALL.map(id => domain(id, true)))).toBe('completed');
  });

  it('is error when nothing was produced at all', async () => {
    // Four blueprints were in exactly this state and reported "completed".
    expect(await settle(ALL.map(id => domain(id, false)))).toBe('error');
  });

  it('ignores a domain flagged completed that holds nothing', async () => {
    /*
     * The same lie one level down: the generation loop marked each domain
     * completed unconditionally, whether or not any capability succeeded. So
     * the flag cannot be trusted — content is counted instead.
     */
    const domains = ALL.map((id, i) => domain(id, i < 2, 'completed'));
    expect(await settle(domains)).toBe('partial');
  });

  it('is not confused by a domain that is no longer enabled', async () => {
    const domains = [...ALL.map(id => domain(id, true)), domain('leadership', false)];
    expect(await settle(domains)).toBe('completed');
  });
});

describe('the field is no longer asserted anywhere', () => {
  const src = readFileSync(new URL('../services/blueprintGenerationService.js', import.meta.url), 'utf8');

  it('no generation path declares the blueprint complete on its own say-so', () => {
    // The exact shape that caused this: a blind write of 'completed' on the
    // blueprint document at the end of a run.
    expect(src).not.toMatch(/_id: blueprintId \},\s*\{ \$set: \{ status: 'completed'/);
  });

  it('settles the capability-shaped blueprint too, not only the domain one', () => {
    // CompanyBlueprint had the identical flaw: mark each capability 'error' on
    // failure, then declare the blueprint completed regardless.
    expect(src).toContain('await settleCompanyBlueprintStatus(blueprintId)');
  });

  it('every path settles instead', () => {
    expect((src.match(/await settleBlueprintStatus\(blueprintId\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the stream still stops', () => {
  const canvas = readFileSync(new URL('../controllers/strategyCanvasController.js', import.meta.url), 'utf8');
  const guest = readFileSync(new URL('../controllers/guestController.js', import.meta.url), 'utf8');

  it('ends on anything that is not still running, so partial does not hang', () => {
    /*
     * This is why the lie existed. The poll waited for 'completed' or 'error'
     * specifically, so a run that produced a partial blueprint had to claim
     * completion or leave the page spinning forever.
     */
    for (const [name, src] of [['canvas', canvas], ['guest', guest]]) {
      expect(src, name).toContain("bp.status !== 'generating' && bp.status !== 'in-progress'");
      expect(src, name).not.toContain("bp.status === 'completed' || bp.status === 'error'");
    }
  });

  it('allows partial on the model, or the write is silently invalid', () => {
    // updateOne skips validators, so an out-of-enum value writes cleanly and
    // then fails on the next save() of that document.
    const model = readFileSync(new URL('../models/TransformationBlueprint.js', import.meta.url), 'utf8');
    expect(model).toContain("enum:    ['generating', 'completed', 'partial', 'error']");
  });
});
