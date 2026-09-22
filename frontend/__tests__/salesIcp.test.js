/**
 * The ICP tab: one hypothesis, one vocabulary, and class names it actually owns.
 *
 * ── The bug this file exists for ───────────────────────────────────────────
 *
 * The ICP tab needed a left-to-right chain of steps, so it got a `.sg-flow`
 * list. The Pitches tab already owned `.sg-flow` — as a *section* wrapper with
 * its own `__title`, `__steps` and `__step` children. Both rules lived in the
 * same stylesheet, the newer one won, and the Pitches section quietly became a
 * wrapping flex row with a border drawn around every one of its steps.
 *
 * Nothing on the ICP tab looked wrong. The damage was on the other tab, which
 * is exactly the kind of breakage a screenshot of the thing you just built
 * does not catch.
 *
 * ── And the other half ────────────────────────────────────────────────────
 *
 * The tab was rebuilt around "businesses discover problems too late". It had
 * previously argued a different hypothesis — SMB administration and operations
 * coordination — and the leftovers were not harmless: the validation matrix
 * asked a prospect to be operationally administrative while the criteria list
 * beside it asked them to have a recurring late-discovered problem, and the
 * "not this" card excluded sales workflows while cluster B's test problem was
 * a quotation going cold. A sales page that contradicts itself gets read aloud
 * to a customer.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js  = read('../admin/sales.js');
const css = read('../admin/sales.css');
const html = read('../admin/sales.html');

/** Just the ICP view, so the assertions cannot pass on some other tab's code. */
function icpView() {
  const start = js.indexOf('function renderIcpView() {');
  expect(start, 'renderIcpView not found').toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) return js.slice(start, i + 1);
  }
  throw new Error('renderIcpView is unbalanced');
}

/** Just renderPitches, the other half of the collision. */
function pitchesView() {
  const start = js.indexOf('function renderPitches() {');
  expect(start, 'renderPitches not found').toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) return js.slice(start, i + 1);
  }
  throw new Error('renderPitches is unbalanced');
}

/**
 * The block-level class names a view renders, ignoring __element and --modifier
 * suffixes: `sg-chain__foo` and `sg-chain--down` both belong to `sg-chain`.
 */
function blocks(view) {
  const found = new Set();
  for (const m of view.matchAll(/class="([^"]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      const bare = /^sg-[a-z0-9-]+/.exec(cls.split('__')[0].split('--')[0]);
      if (bare) found.add(bare[0]);
    }
  }
  return found;
}

describe('class names the ICP tab owns', () => {
  it('uses sg-chain for its step chains, never the Pitches tab\'s sg-flow', () => {
    const view = icpView();
    expect(view).toContain('sg-chain');
    // The whole bug in one assertion.
    expect(view).not.toMatch(/class="sg-flow/);
    expect(view).not.toMatch(/'\s*sg-flow--/);
  });

  it('leaves sg-flow to renderPitches, which still uses it', () => {
    expect(js).toMatch(/<section class="sg-flow">/);
    expect(js).toContain('sg-flow__steps');
  });

  it('shares no block name with the Pitches tab', () => {
    /*
     * The invariant the bug broke, stated directly: two tabs rendering the
     * same block name are two components fighting over one set of rules, and
     * the loser is whichever is declared first in the stylesheet. Shared
     * layout primitives would be fine — these two share none, and sg-flow was
     * never meant to be one.
     */
    const shared = [...blocks(icpView())].filter((b) => blocks(pitchesView()).has(b));
    expect(shared).toEqual([]);
  });

  it('styles both of them, so neither name is merely unused', () => {
    // Guards the reverse mistake: renaming the markup and leaving the rules
    // behind reads as "no collision" while rendering unstyled.
    expect(css).toMatch(/^\.sg-chain \{/m);
    expect(css).toMatch(/^\.sg-flow \{/m);
  });

  it('is cache-busted, because the tab is styled entirely from this sheet', () => {
    const m = /sales\.css\?v=(\d+)/.exec(html);
    expect(m, 'sales.css must carry a ?v=').toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(34);
  });
});

describe('one hypothesis, argued once', () => {
  const view = icpView();

  it('leads with the problem, not with the customer profile', () => {
    // Problem -> ICP -> GTM. The ICP only means anything as "where the problem
    // in the first block costs money".
    const problem = view.indexOf('businesses are reactive by default');
    const icp = view.indexOf('start where early detection has measurable value');
    const gtm = view.indexOf('win one problem, then expand');
    expect(problem).toBeGreaterThan(-1);
    expect(icp).toBeGreaterThan(problem);
    expect(gtm).toBeGreaterThan(icp);
  });

  it('carries no leftover vocabulary from the administration hypothesis', () => {
    /*
     * Comments may discuss what was removed — that is how the next reader
     * learns why. Only what reaches the screen is checked.
     */
    const rendered = view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const stale of [/staff productivity/i, /Is administration central/i, /Engineering workflows/i]) {
      expect(rendered, `stale: ${stale}`).not.toMatch(stale);
    }
  });

  it('does not exclude sales workflows, because cluster B is one', () => {
    // "An enquiry or quotation goes cold between email, WhatsApp and the ERP"
    // is a sales workflow. The old "not this" card ruled it out by function.
    expect(view).toMatch(/quotation goes cold/);
    expect(view).not.toMatch(/<p>Sales workflows\./);
  });

  it('asks the matrix and the criteria for the same seven things', () => {
    /*
     * Two instruments in two vocabularies is how a prospect qualifies on one
     * screen and fails on the next. Each criterion needs its matrix row.
     */
    for (const dimension of ['Recurrence', 'Signal availability', 'Fragmentation',
      'Manual effort', 'Lateness', 'Cost of lateness', 'Actionability', 'Measurability']) {
      expect(view, dimension).toContain(`'${dimension}'`);
    }
  });

  it('keeps the two qualifiers that are about us, in both instruments', () => {
    // A perfect problem at a company we cannot reach is not an opportunity —
    // and these were the rows most easily lost in a rewrite.
    expect(view.match(/Buying access/g) || []).toHaveLength(2);
    expect(view.match(/Deployment friction/g) || []).toHaveLength(2);
  });
});

describe('what the page admits about itself', () => {
  it('marks every pitched verb with whether it is built', () => {
    const view = icpView();
    for (const [verb, state] of [['Detect', 'yes'], ['Understand', 'part'], ['Act', 'no'], ['Learn', 'no']]) {
      expect(view, verb).toMatch(new RegExp(`\\['${verb}', '${state}'`));
    }
  });

  it('says out loud that two of the four are not built', () => {
    /*
     * This screen is read during live conversations, which makes it the one
     * place an overstatement is repeated to a customer. If Act ships, this
     * test fails — and updating it is the point at which somebody checks that
     * the claim is now true.
     */
    expect(icpView()).toMatch(/Two of the four are not built/);
  });
});
