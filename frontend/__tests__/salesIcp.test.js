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
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

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

  it('leaves sg-flow unused by anybody, now the Pitches tab has dropped it', () => {
    /*
     * This used to assert that renderPitches still owned the name, which was
     * the other half of the collision guard above. The demonstration
     * structure it styled has been removed from the Pitches tab, so nothing
     * claims sg-flow at all — and the rules went with it. A stronger
     * invariant than the one it replaces: the name is free, so nobody is
     * fighting over it.
     */
    expect(js).not.toMatch(/class="sg-flow/);
    expect(css).not.toMatch(/^\.sg-flow/m);
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

  it('styles the name it kept, so it is not merely unused', () => {
    /*
     * Guards the reverse mistake: renaming the markup and leaving the rules
     * behind reads as "no collision" while rendering unstyled.
     *
     * Only sg-chain now. sg-flow's markup left with the demonstration
     * structure and its rules left with it, which the test above asserts.
     */
    expect(css).toMatch(/^\.sg-chain \{/m);
  });

  it('puts the preparation tabs before the tabs that are worked', () => {
    /*
     * The bar reads in the order the work happens: who we sell to, the method
     * that tests it, the interview that runs the method, what to say in the
     * room — and only then the funnel and the reports, which are records
     * rather than preparation. Pitches sat last, on the far side of two
     * read-only tabs, which put the thing said out loud in a meeting furthest
     * from the three screens it belongs with.
     */
    const at = html.indexOf('<div class="sg-views"');
    const bar = html.slice(at, html.indexOf('</div>', at));
    const order = [...bar.matchAll(/id="sg-view-([a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['icp', 'playbook', 'interview', 'audience', 'pitches', 'funnel', 'reports']);
  });

  it('lights the tabs from one list, in the same order as the bar', () => {
    // A tab missing from this list stays lit after you leave it; one out of
    // order is the next reader wondering which of the two is authoritative.
    const m = /for \(const \[id, on\] of \[([\s\S]*?)\]\) \{/.exec(js);
    expect(m, 'the toggle list').toBeTruthy();
    const order = [...m[1].matchAll(/'sg-view-([a-z]+)'/g)].map((x) => x[1]);
    expect(order).toEqual(['icp', 'playbook', 'interview', 'audience', 'pitches', 'funnel', 'reports']);
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
    const problem = view.indexOf('businesses lose customers and growth because they are reactive by default');
    const icp = view.indexOf('the customer relationship, not the company size');
    const gtm = view.indexOf('win one customer problem, then expand');
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
    // Three since the scoring names them too, as the reach gate.
    expect((view.match(/Buying access/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((view.match(/Deployment friction/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(view).toMatch(/counted only when H and I are both 3 or more/);
  });
});

describe('what the page admits about itself', () => {
  it('marks every pitched verb with whether it is built', () => {
    const view = icpView();
    // Six stages since 6 October 2026, and Explain and Recommend built the
    // same day (customerSpine.js in the delivered app). Act stays partly:
    // Svarg records the step and never sends. Measure counts findings that
    // stopped, not rupees; Learn has no customer with enough outcomes yet.
    for (const [verb, state] of [['Detect', 'yes'], ['Explain', 'yes'], ['Recommend', 'yes'],
      ['Act', 'part'], ['Measure', 'part'], ['Learn', 'part']]) {
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
    // Counted from the spine itself, so the sentence cannot drift from it.
    expect(icpView()).toContain('${built} of the ${SPINE.length} are built, ${part} are partly built,');
    expect(icpView()).toContain('and ${not} are not built.');
  });
});

/**
 * The sentence to say out loud, and the two words in it that outrun the product.
 *
 * Two clinic interviews produced a sharper problem statement than the page had:
 * not "they find out late" but "the record disagrees with what happened".
 * Lateness is what the gap costs, so it moved into the sentence as the
 * consequence.
 *
 * The risk that comes with a good sentence is that it is easy to say and hard
 * to hold to. "The systems you already use" implies connectors that do not
 * exist, and "put it in front of the person who can fix it" implies an action
 * the product does not take. This page's own rule is that anything it
 * overstates is overstated out loud to a customer — so the caveat travels with
 * the sentence, and the shipped connector list is checked rather than trusted.
 */
describe('the problem, as two interviews described it', () => {
  const view = icpView();

  it('names the outcome, keeps the cause, and keeps the record gap as one way it shows', () => {
    // Retention and growth since 6 October 2026. Reactive-by-default stays as
    // why; the record disagreeing with what happened stays as one way it shows,
    // and unbilled delivered work counts as growth, by decision.
    expect(view).toMatch(/lose customers, and growth from the customers they keep, because they are reactive by default/);
    expect(view).toMatch(/revenue earned and never\s+billed, which is growth/);
  });

  it('carries the one sentence a buyer repeats back', () => {
    expect(view).toMatch(/to find the customers\s+you are at risk of losing and the customers you could grow/);
  });

  it('never ships that sentence without what it may not claim', () => {
    /*
     * The pairing is the test. If the product sentence is on the page, the two
     * qualifications are too — delete either one and the page starts promising
     * a CRM integration and an action, in a room, to a customer.
     */
    if (!/systems you already use/.test(view)) return;
    // What the sentence may not be allowed to imply, as of today. "No CRM
    // connector" used to be one of these and was retired when one shipped;
    // what replaced it is the claim the product still cannot make.
    expect(view).toMatch(/morning email/);
    expect(view).toMatch(/joining signals ACROSS\s+agents.*is still not built/s);
  });

  it('names every connector that ships, and claims no more', () => {
    /*
     * The other direction of staleness, and the one nobody notices: the page
     * says a capability is missing, somebody builds it, and the page keeps
     * talking a seller out of a claim they could now make.
     *
     * This tripwire fired exactly as designed. The page said "there is no CRM
     * connector and none for a phone system" for weeks after both shipped, so
     * a seller reading it was told to promise less than the product does.
     *
     * Turned around rather than deleted: the list on the page must match the
     * directory in both directions, so it cannot go stale again in either.
     */
    const dir = join(dirname(fileURLToPath(import.meta.url)),
      '../../backend/trunida-backend/eame-template/services/connectors');
    const shipped = readdirSync(dir).map((f) => f.replace(/\.js$/, ''));
    expect(shipped.length, 'no connectors found — has the directory moved?')
      .toBeGreaterThan(0);

    /** What the page calls each shipped connector. 'svarg' talks to itself. */
    const SAID = {
      zohocrm: /Zoho CRM/, leadsquared: /Zoho CRM, LeadSquared/, clinicea: /LeadSquared, Clinicea/, phone: /cloud telephony/i, whatsapp: /WhatsApp/,
      database: /database/, confluence: /Confluence/, github: /GitHub/, jira: /Jira/,
    };
    for (const c of shipped.filter((x) => x !== 'svarg')) {
      expect(SAID[c], `${c} ships but this test does not know what the page calls it`)
        .toBeTruthy();
      expect(view, `${c} ships but the page does not mention it`).toMatch(SAID[c]);
    }

    // And the other way: nothing is described as missing once it exists.
    expect(view).not.toMatch(/no CRM connector/);
    expect(view).not.toMatch(/none for a\s+phone system/);
    // And the ones the page does name are the ones that are there.
    for (const named of ['confluence', 'github', 'jira', 'whatsapp']) {
      expect(shipped, named).toContain(named);
    }
  });
});

describe('the problem is argued once, not twice', () => {
  it('does not keep the older framing running beside the new one', () => {
    /*
     * This tab has contradicted itself before — a validation matrix asking for
     * one thing while the criteria beside it asked for another — and the
     * failure mode is always the same: a sentence gets rewritten and the one
     * three paragraphs above it does not. Both blocks here close on a
     * statement, and both now close on the gap.
     */
    const view = icpView().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(view).not.toMatch(/discover important problems too\s+late because/);
    expect(view).toMatch(/the record says otherwise<\/b>/);
  });
});
