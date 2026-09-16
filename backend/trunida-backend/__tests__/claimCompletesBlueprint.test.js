/**
 * Signing in finishes the blueprint you were shown a preview of.
 *
 * The guest preview generates AI Opportunities and seeds the other five
 * domains as pending, to keep an anonymous visitor cheap. Claiming used to
 * transfer ownership and nothing else — and the only place offering to
 * generate the rest was a button in the workspace sidebar, which the journey
 * skips entirely once the opportunity is approved.
 *
 * Observed in a live demonstration: objective entered as a guest, opportunity
 * generated, signed in, approved, and straight through to Aria — with one
 * domain of six in existence and nothing anywhere saying so. The status field
 * was claiming "completed" at the time, which is fixed separately.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const canvas = read('../controllers/strategyCanvasController.js');

/** The claim handler, on its own. */
const claim = (() => {
  const from = canvas.indexOf('export async function claimGuestBlueprint');
  return canvas.slice(from, canvas.indexOf('export async function', from + 10));
})();

describe('claiming completes what the preview started', () => {
  it('generates the domains that have no content', () => {
    expect(claim).toContain('generateSpecificDomainsAsync(claimed._id, userId, claimed.businessObjective, missing)');
  });

  it('decides what is missing by content, not by the pending flag', () => {
    /*
     * The generation loop marks a domain completed whether or not any
     * capability produced anything, so the flag cannot be trusted. This is
     * the same predicate settleBlueprintStatus uses, deliberately — if the
     * two ever disagree, claim regenerates what settle calls finished.
     */
    expect(claim).toContain(".filter(d => !(d.capabilities || []).some(c => (c.sections || []).length > 0))");
  });

  it('leaves the preview alone rather than paying for it twice', () => {
    // generateSpecificDomainsAsync only runs the ids it is given, so the
    // already-generated opportunities are never re-run.
    expect(claim).toContain('.map(d => d.domainId)');
    expect(claim).not.toMatch(/generateTransformationAsync/);
  });

  it('only counts domains that are still enabled', () => {
    expect(claim).toContain('const wanted = new Set(enabledDomains().map(d => d.id))');
  });

  it('says it is generating, so nothing reads as finished meanwhile', () => {
    const marks = claim.indexOf("status: 'generating'");
    const fires = claim.indexOf('generateSpecificDomainsAsync');
    expect(marks).toBeGreaterThan(-1);
    expect(marks).toBeLessThan(fires);
  });

  it('does not fire when there is nothing missing', () => {
    expect(claim).toContain('if (missing.length) {');
  });

  it('does not make signing in wait for six domains', () => {
    // Fire-and-forget. The page is already polling progress; a login that
    // blocks for minutes trades one bad experience for another.
    expect(claim).toMatch(/generateSpecificDomainsAsync\([^)]*\)\s*\n\s*\.catch\(/);
    const fires = claim.indexOf('generateSpecificDomainsAsync');
    const responds = claim.indexOf('return res.json({ claimed: true');
    expect(fires).toBeLessThan(responds);
  });

  it('tells the page what it started', () => {
    expect(claim).toContain('generating: missing');
  });
});

describe('the preview is still cheap for someone who never signs in', () => {
  const guest = read('../controllers/guestController.js');

  it('a guest still gets one domain, not six', () => {
    /*
     * The whole reason claiming is the moment to spend: an anonymous visitor
     * who never comes back costs one domain, and five of the last month's
     * objectives were junk. The preview generates a fixed, restricted set —
     * widening it here quietly moves that cost back onto strangers.
     */
    expect(guest).toContain("const GUEST_PREVIEW_DOMAIN_IDS = ['ai-use-cases']");
    expect(guest).toContain('generateSpecificDomainsAsync(blueprint._id, null, objective, GUEST_PREVIEW_DOMAIN_IDS)');
  });

  it('refuses a junk objective before spending even that', () => {
    expect(guest).toContain('await checkObjective(objective)');
  });
});
