/**
 * Cob says what its recommendations rest on.
 *
 * The delivered application is already held to this: the conformance suite
 * fails it if an answer does not name the records it stands on. The layer
 * doing the thinking — the one the product is differentiated on — was held to
 * nothing. Every claim in a blueprint was an assertion, and a reader had no
 * way to tell whether an opportunity came out of the customer's own data or
 * out of nothing in particular.
 *
 * That matters most for the case a buyer is quickest to suspect. "Grounded in
 * how businesses like this one work" is an honest answer for a customer who
 * has connected nothing, and a better one than silence — it is also the
 * clearest possible prompt to connect a source.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { GROUNDS, validateGrounds, opportunityDiscoverySystemPrompt } from '../services/blueprintGenerationService.js';

const ALL = Object.fromEntries(GROUNDS.map(g => [g, true]));
const NOTHING = { 'the method': true };

describe('a claim has to have been earned', () => {
  it('keeps what the prompt actually carried', () => {
    expect(validateGrounds(['their website or profile', 'the industry'], ALL))
      .toEqual(['their website or profile', 'the industry']);
  });

  it('drops a source that was not in the prompt', () => {
    /*
     * The failure this field exists to prevent, committed by the field itself.
     * The model says what it used; only the caller knows what it was given.
     */
    expect(validateGrounds(['their connected data'], NOTHING)).toEqual(['the method']);
    expect(validateGrounds(['prior deployments', 'their website or profile'], NOTHING)).toEqual(['the method']);
  });

  it('drops a ground it invented', () => {
    expect(validateGrounds(['a hunch', 'industry benchmarks'], ALL)).toEqual(['the method']);
  });

  it('falls back to the honest label rather than to nothing', () => {
    // An empty provenance line reads as a bug. "The method" is true of every
    // opportunity and is the weakest thing that can be said.
    expect(validateGrounds([], ALL)).toEqual(['the method']);
    expect(validateGrounds(null, ALL)).toEqual(['the method']);
    expect(validateGrounds('their website or profile', ALL)).toEqual(['the method']);
  });

  it('is not case-sensitive, and says each thing once', () => {
    expect(validateGrounds(['THEIR WEBSITE OR PROFILE', 'their website or profile'], ALL)).toEqual(['their website or profile']);
  });

  it('never needs evidence for the method itself', () => {
    expect(validateGrounds(['the method'], NOTHING)).toEqual(['the method']);
  });
});

describe('what the model is asked for', () => {
  const prompt = opportunityDiscoverySystemPrompt({});

  it('asks for grounds on every opportunity', () => {
    expect(prompt).toContain('"grounds"');
    expect(prompt).toContain('WHAT THIS OPPORTUNITY RESTS ON');
  });

  it('gives it a closed vocabulary rather than free text', () => {
    // Free text cannot be validated, and an unvalidated provenance claim is
    // worse than none.
    for (const g of GROUNDS) expect(prompt, g).toContain(`"${g}"`);
  });

  it('tells it that the weakest answer is a good one', () => {
    expect(prompt).toMatch(/"the method" alone is a perfectly good answer/);
    expect(prompt).toMatch(/Be accurate rather than generous/);
  });

  it('tells it the one thing it must never do', () => {
    expect(prompt).toMatch(/Naming a\s*\n?source that is not in this message is the one thing you must never do/);
  });
});

describe('the value survives being stored and shown', () => {
  const model = readFileSync(new URL('../models/TransformationBlueprint.js', import.meta.url), 'utf8');
  const gen = readFileSync(new URL('../services/blueprintGenerationService.js', import.meta.url), 'utf8');

  it('is declared on the opportunity subschema', () => {
    // A strict subdocument drops an undeclared field on write with nothing
    // said — the same trap that has cost this codebase twice already.
    expect(model).toContain('grounds: [String]');
  });

  it('is validated where what the prompt carried is known', () => {
    expect(gen).toContain('grounds: validateGrounds(o.grounds, available)');
    expect(gen).toContain("'their connected data': !!enterpriseContext,");
    expect(gen).toContain("'prior deployments':    !!priorOutcomes,");
  });

  it('counts the industry layer, which reached stage one', () => {
    // It shaped the problems stage two reasons from, so the claim is true.
    expect(gen).toContain("'the industry':         !!automotiveBlueprint,");
  });

  it('reaches the screen with the opportunity', () => {
    const ui = readFileSync(new URL('../../../frontend/domain/blueprintGenerate.js', import.meta.url), 'utf8');
    expect(ui).toContain('const groundsOf = new Map(');
    expect(ui).toContain("grounds: groundsOf.get(name) || []");
  });

  it('says the honest thing, and the action that would change it', () => {
    const ui = readFileSync(new URL('../../../frontend/domain/blueprintGenerate.js', import.meta.url), 'utf8');
    expect(ui).toContain('connect your data to ground it in yours');
    expect(ui).toContain("g.length === 1 && g[0] === 'the method'");
  });

  it('has a style, or the class does nothing', () => {
    const css = readFileSync(new URL('../../../frontend/domain/workspace.css', import.meta.url), 'utf8');
    expect(css).toContain('.rp-grounds {');
    expect(css).toContain('.rp-grounds--thin {');
    const html = readFileSync(new URL('../../../frontend/domain/domain.html', import.meta.url), 'utf8');
    expect(html).toContain('id="opp-winner-grounds"');
    // These files have no cache-busting of their own.
    expect(html).toContain('workspace.css?v=40');
    expect(html).toContain('blueprintGenerate.js?v=24');
  });
});
