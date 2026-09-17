/**
 * The knowledge base actually reaches the thinking.
 *
 * Svarg is differentiated on Cob — the layer that reads a business and works
 * out where AI fits. The knowledge base is the asset that layer is supposed to
 * think with. Three ways it was not arriving:
 *
 *   The flagship capability read the least of it. AI Opportunity Discovery
 *   runs a staged pipeline that used only the section's one-line definition.
 *   The Core document's Consultant Reasoning Process, Discovery Framework, AI
 *   Approach Options, constraint handling and Quality Checklist were parsed
 *   into `consultantGuide` and dropped. A summary of the same material sat
 *   duplicated in SECTION_TEMPLATES as hardcoded JavaScript, so editing the
 *   knowledge base changed nothing — and "edit the KB, re-run the objective"
 *   is the team's own validated method for improving output.
 *
 *   Every customer was told they were automotive. The prompt header was the
 *   literal string AUTOMOTIVE INDUSTRY REFERENCE whatever the industry was.
 *
 *   Table rows were deleted before the prompt. Automotive's Business Value
 *   overlay carries 27 rows mapping a business challenge to the AI opportunity
 *   that addresses it; none of them reached the model.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { opportunityDiscoverySystemPrompt } from '../services/blueprintGenerationService.js';
import { getDomainCapabilityBlueprint } from '../services/strategyCanvasService.js';

const src = readFileSync(new URL('../services/blueprintGenerationService.js', import.meta.url), 'utf8');

describe('the method reaches the flagship capability', () => {
  it('puts the knowledge base method into the prompt', () => {
    const guide = 'MARKER: the consultant reasoning process';
    expect(opportunityDiscoverySystemPrompt({ consultantGuide: guide })).toContain(guide);
  });

  it('is what the generator actually calls, not a copy of it', () => {
    expect(src).toContain('const stage2System = opportunityDiscoverySystemPrompt({ consultantGuide: section.consultantGuide });');
  });

  it('carries the real Core document, not an empty string', () => {
    // The read the generator makes. If the file moves or a heading is renamed
    // this returns nothing, and the capability silently loses its method.
    const cap = getDomainCapabilityBlueprint('ai-opportunity-discovery', 'AI_Use_Cases', 'Sports Academies');
    const guide = cap.sections[0]?.consultantGuide || '';
    expect(guide.split(/\s+/).length).toBeGreaterThan(300);
    for (const heading of ['Consultant Reasoning Process', 'AI Approach Options', 'Quality Checklist']) {
      expect(guide, heading).toContain(heading);
    }
  });

  it('tells the model which output contract wins', () => {
    // The Core document describes an output shape of its own, and this stage
    // emits a different, narrower one. Without this the model can be pulled
    // toward fields the stage does not want.
    const p = opportunityDiscoverySystemPrompt({ consultantGuide: 'x' });
    expect(p).toMatch(/the OUTPUT FORMAT at the end of this message wins/);
    expect(p.indexOf('CONSULTANT METHODOLOGY')).toBeLessThan(p.indexOf('OUTPUT FORMAT'));
  });

  it('still produces a usable prompt when the knowledge base is missing', () => {
    // Both file reads fail closed. A capability with no method at all is worse
    // than one with the compact version the template still carries.
    const p = opportunityDiscoverySystemPrompt({});
    expect(p).not.toContain('CONSULTANT METHODOLOGY');
    expect(p).toContain('OUTPUT FORMAT');
    expect(p).toContain('aiOpportunities');
  });
});

describe('the industry block says which industry', () => {
  const block = (industry, text) => {
    const fn = new Function('return ' + src.match(/function industryReferenceBlock[\s\S]*?\n}/)[0] + ';')();
    return fn(industry, text);
  };

  it('names the industry that was actually resolved', () => {
    expect(block('Sports Academies', 'text')).toContain('SPORTS ACADEMIES INDUSTRY REFERENCE');
    expect(block('Education Technology', 'text')).toContain('EDUCATION TECHNOLOGY INDUSTRY REFERENCE');
  });

  it('never tells a non-automotive customer they are automotive', () => {
    expect(block('Sports Academies', 'text')).not.toContain('AUTOMOTIVE');
    // And the old hardcoded header is gone from both prompt builders. Read
    // past the comments: this file now explains the bug in prose, and the
    // explanation names the string it removed.
    const code = src
      .split(String.fromCharCode(10))
      .filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join(String.fromCharCode(10));
    expect(code).not.toContain('AUTOMOTIVE INDUSTRY REFERENCE');
  });

  it('drops the label when no industry was matched', () => {
    // 'General' is the sentinel for "industryFit found nothing".
    expect(block('General', 'text').split('\n')[0]).toBe('INDUSTRY REFERENCE:');
  });

  it('says which source wins on a conflict, as every other block does', () => {
    // This was the only context block in the prompt with no precedence rule.
    expect(block('Sports Academies', 'text')).toMatch(/the company's\s*\n?own words win/);
  });

  it('emits nothing at all when there is no industry text', () => {
    expect(block('Sports Academies', '')).toBe('');
  });
});

describe('what the industry overlay contributes', () => {
  it('no longer deletes its table rows', () => {
    // Automotive Business Value Definition is the densest: 27 rows mapping a
    // challenge to the opportunity that addresses it.
    const cap = getDomainCapabilityBlueprint('business-value-definition', 'AI_Use_Cases', 'Automotive');
    expect(cap.automotiveBlueprint).toContain(' — ');
  });

  it('drops the separator row, which carries nothing', () => {
    const canvas = readFileSync(new URL('../services/strategyCanvasService.js', import.meta.url), 'utf8');
    expect(canvas).toContain("cells.every(c => /^:?-{2,}:?$/.test(c))");
  });

  it('leaves an overlay with no tables exactly as it was', () => {
    // The hand-written Sports Academies files use prose throughout.
    const cap = getDomainCapabilityBlueprint('ai-opportunity-discovery', 'AI_Use_Cases', 'Sports Academies');
    expect(cap.automotiveBlueprint.length).toBeGreaterThan(200);
  });
});
