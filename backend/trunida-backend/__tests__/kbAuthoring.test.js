/**
 * Knowledge written by a person reaches the prompt, or somebody is told why.
 *
 * The knowledge base is about to be maintained by researchers interviewing
 * business owners. Their content is read by a parser that fails quietly, and
 * quiet failure is the whole risk: a day of interviewing turned into an
 * excellent file, committed, and reaching no prompt at all, with nothing
 * anywhere saying so.
 *
 * It had already happened three ways. The Automotive overlay — the most
 * iterated in the base — matched none of its pillars after someone
 * restructured its headings into audience segments. Every machine-generated
 * overlay failed the same rule, because the generator writes its own fixed
 * section titles. And the best file in the base, 2,090 hand-written words on
 * sports academies, had 890 of them dropped at a word cap nobody could see.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  getDomainCapabilities, getDomainCapabilityBlueprint, INDUSTRY_WORD_CAP,
} from '../services/strategyCanvasService.js';

const canvas = readFileSync(new URL('../services/strategyCanvasService.js', import.meta.url), 'utf8');

describe('an overlay is used whatever its headings are called', () => {
  it('matches a single-pillar capability without needing a particular heading', () => {
    /*
     * Twelve of sixteen capabilities have exactly one pillar. There is nothing
     * to choose between, so the whole industry document is that pillar's
     * context — and requiring a heading only invents a way to get it wrong.
     */
    const bp = getDomainCapabilityBlueprint('ai-opportunity-discovery', 'AI_Use_Cases', 'Automotive');
    expect(bp.sections).toHaveLength(1);
    expect(bp.sections[0].source).toBe('both');
    expect(bp.sections[0].industryContext).toBeTruthy();
  });

  it('still matches by heading when the heading is right', () => {
    // Sports Academies uses "## AI Opportunity Discovery" and always matched.
    const bp = getDomainCapabilityBlueprint('ai-opportunity-discovery', 'AI_Use_Cases', 'Sports Academies');
    expect(bp.sections[0].source).toBe('both');
  });

  it('does not guess when a capability has several pillars', () => {
    /*
     * The ambiguity is real there: attaching the whole document to every
     * pillar would put the wrong industry text against the wrong pillar, which
     * is worse than none. The doctor reports these for a human to fix.
     */
    const multi = getDomainCapabilities('AI_Strategy')
      .map(c => getDomainCapabilityBlueprint(c.id, 'AI_Strategy', 'Automotive'))
      .filter(b => b.sections.length > 1);
    expect(multi.length).toBeGreaterThan(0);
    expect(canvas).toContain('soleRecipient: pillars.length === 1');
  });

  it('never invents industry text for an industry with no overlay at all', () => {
    const bp = getDomainCapabilityBlueprint('ai-opportunity-discovery', 'AI_Use_Cases', 'Sports Academies');
    const none = getDomainCapabilityBlueprint('ai-opportunity-discovery', 'AI_Use_Cases', 'Nowhere Land');
    expect(bp.sections[0].industryContext).toBeTruthy();
    expect(none.sections[0].industryContext).toBeNull();
    expect(none.sections[0].source).toBe('core');
  });
});

describe('how much of a researcher\'s work reaches the prompt', () => {
  it('carries far more than it used to', () => {
    // 1200 words dropped 43% of the best file in the base.
    expect(INDUSTRY_WORD_CAP).toBeGreaterThanOrEqual(3000);
  });

  it('is still capped, because the objective shares the message', () => {
    // Unbounded, a long industry file eventually crowds out the thing being
    // asked about.
    expect(INDUSTRY_WORD_CAP).toBeLessThanOrEqual(6000);
    expect(canvas).toContain('extractParagraphText(industryContent, INDUSTRY_WORD_CAP)');
  });

  it('lets the whole of the best hand-written file through now', () => {
    const bp = getDomainCapabilityBlueprint('ai-opportunity-discovery', 'AI_Use_Cases', 'Sports Academies');
    const reaching = bp.automotiveBlueprint.split(/\s+/).filter(Boolean).length;
    expect(reaching).toBeGreaterThan(1200);
  });
});

describe('the tool that tells a researcher what happened', () => {
  const doctor = readFileSync(new URL('../scripts/kb_doctor.mjs', import.meta.url), 'utf8');

  it('reports a file whose sections matched nothing, and names the heading to use', () => {
    expect(doctor).toContain('no section matched');
    expect(doctor).toMatch(/rename a section to contain/);
    // And shows what headings the file actually has, so the fix is obvious.
    expect(doctor).toContain("raw.match(/^## .*/gm)");
  });

  it('reports a file longer than what reaches the prompt', () => {
    expect(doctor).toContain('words written, ${INDUSTRY_WORD_CAP} reach the prompt');
  });

  it('reports a capability with no file, and a domain with no overlay', () => {
    expect(doctor).toContain('no industry overlay at all');
    expect(doctor).toContain("note('warn', where, 'missing'");
  });

  it('reports a file nothing can ever read', () => {
    // A capability the Knowledge Architecture table does not list does not
    // exist to the product, however good the file is.
    expect(doctor).toContain('no capability table lists this file, so nothing reads it');
  });

  it('does not nag about a README, which is for whoever opens the folder', () => {
    expect(doctor).toContain("f === 'README.md'");
  });

  it('says nothing is wrong only when nothing is', () => {
    expect(doctor).toContain('Everything in the knowledge base reaches a prompt.');
  });

  it('can fail a commit, but only when asked and only on a real breakage', () => {
    // A capability nobody has written yet must not block unrelated work.
    expect(doctor).toContain('if (strict && errors.length) process.exit(1);');
  });

  it('does not treat a switched-off domain as a problem', () => {
    expect(doctor).toContain('domain switched off');
    expect(doctor).toContain('if (!matched && live)');
  });
});
