/**
 * The B2B playbook tab: ten steps, in order, on class names it owns.
 *
 * ── Why the class-name half is here ────────────────────────────────────────
 *
 * The ICP tab needed a chain of steps and took `.sg-flow`, which the Pitches
 * tab already owned as a section wrapper. The newer rules won and the Pitches
 * section quietly became a wrapping flex row with a border round every step —
 * damage on a tab nobody was looking at. This tab is a third component in the
 * same stylesheet, so the same invariant is pinned before it can happen again.
 *
 * ── And the content half ───────────────────────────────────────────────────
 *
 * The playbook is a method whose ORDER is its content: looking for the same
 * problem at five companies is worthless before step 2 has found that problem
 * in the customer's own words. A rewrite that keeps all ten steps and loses
 * the sequence has lost the thing, so the sequence is what the test asserts —
 * along with the three counted targets, which are the only places the method
 * can be measurably behind.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../admin/sales.js');
const css = read('../admin/sales.css');
const html = read('../admin/sales.html');

/** One top-level function's source, so assertions cannot pass on another tab. */
function fn(name) {
  const start = js.search(new RegExp(`^function ${name}\\([a-z]*\\) \\{`, 'm'));
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) return js.slice(start, i + 1);
  }
  throw new Error(`${name} is unbalanced`);
}

/** Block-level class names a view renders, ignoring __element and --modifier. */
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

describe('the tab is reachable', () => {
  it('sits next to ICP in the view bar', () => {
    const bar = html.slice(html.indexOf('<div class="sg-views"'), html.indexOf('</div>', html.indexOf('<div class="sg-views"')));
    expect(bar).toContain('id="sg-view-playbook"');
    expect(bar).toContain('B2B Playbook');
    // Next to ICP, as asked — not appended after the working tabs.
    expect(bar.indexOf('sg-view-playbook')).toBeGreaterThan(bar.indexOf('sg-view-icp'));
    expect(bar.indexOf('sg-view-playbook')).toBeLessThan(bar.indexOf('sg-view-funnel'));
  });

  it('has a panel, and setView shows and hides it like every other view', () => {
    expect(html).toContain('id="sg-playbook"');
    const view = fn('setView');
    expect(view).toContain("document.getElementById('sg-playbook').hidden = !play;");
    expect(view).toContain('if (play) renderPlaybook();');
    // Every tab button is toggled from one list; a tab missing from it stays
    // lit after you leave it.
    expect(view).toMatch(/\['sg-view-playbook', play\]/);
  });

  it('is wired to a click, which is the half that is easy to forget', () => {
    expect(fn('wireAccountControls')).toContain("setView('playbook')");
  });

  it('bumps the cache-busting version, because the tab is entirely new CSS', () => {
    const c = /sales\.css\?v=(\d+)/.exec(html);
    const j = /sales\.js\?v=(\d+)/.exec(html);
    expect(Number(c[1])).toBeGreaterThanOrEqual(35);
    expect(Number(j[1])).toBeGreaterThanOrEqual(33);
  });
});

describe('class names the playbook owns', () => {
  it('shares no block name with the ICP or Pitches tabs', () => {
    const mine = blocks(fn('renderPlaybook'));
    expect(mine.size).toBeGreaterThan(0);
    const theirs = new Set([...blocks(fn('renderIcpView')), ...blocks(fn('renderPitches'))]);
    expect([...mine].filter((b) => theirs.has(b))).toEqual([]);
  });

  it('is styled, so the names are not merely unused', () => {
    expect(css).toMatch(/^\.sg-pb \{/m);
    expect(css).toMatch(/^\.sg-pb__steps \{/m);
  });

  it('puts its narrow-screen rules below the ones they override', () => {
    // A media query above its own rules is overridden by them and the layout
    // never collapses — the exact mistake made on the delivered app's CSS.
    const at = css.lastIndexOf('.sg-pb__buckets,\n  .sg-pb__repeat { grid-template-columns: 1fr; }');
    expect(at).toBeGreaterThan(css.indexOf('.sg-pb__buckets {'));
  });
});

describe('ten steps, and the order is the content', () => {
  const view = fn('renderPlaybook');

  const TITLES = [
    'Find the Acute Problem',
    'Find the Acute ICP',
    'Separate Acute ICP from Vanity Users',
    'Embed Yourself in the ICP',
    'Run Reverse Problem Sessions',
    'Build the Smallest Possible Solution',
    'Run Design-Partner Pilots',
    'Prove the Economic Value',
    'Validate Repeatability',
    'Convert the Niche into a Product Wedge',
  ];

  it('has all ten', () => {
    for (const t of TITLES) expect(view, t).toContain(t);
  });

  it('keeps them in order', () => {
    const at = TITLES.map((t) => view.indexOf(t));
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('numbers them from the position, so nothing can renumber itself wrongly', () => {
    // The digit comes from the index rather than being typed beside each
    // title: inserting a step in the middle then cannot leave two sevens.
    expect(view).toMatch(/sg-pb__n">\$\{i \+ 1\}/);
  });

  it('carries the three counted targets', () => {
    // The only places this method can be measurably behind. Buried in prose
    // they stop being targets.
    expect(view).toContain('5&ndash;7 problem hypotheses');
    expect(view).toContain('30&ndash;40 interviews');
    expect(view).toContain('3&ndash;5 companies');
  });

  it('sorts prospects into three buckets and builds for one of them', () => {
    for (const b of ['Acute', 'Adjacent', 'Vanity']) expect(view, b).toContain(`'${b}'`);
    expect(view).toMatch(/Build for/);
  });

  it('ends on a wedge with three blanks, not on a slogan', () => {
    /*
     * "Svarg helps [customer] detect [problem] before [outcome]" is the whole
     * output of the method. The three slots are marked as slots so nobody
     * reads the sentence as already answered.
     */
    const wedge = view.slice(view.indexOf('sg-pb__wedge'));
    expect(wedge.match(/<em>/g) || []).toHaveLength(3);
    for (const slogan of ['AI platform for enterprises', 'Proactive AI']) {
      expect(view, slogan).toContain(slogan);
    }
    expect(view.indexOf('sg-pb__wedge')).toBeLessThan(view.indexOf('AI platform for enterprises'));
  });

  it('qualifies a problem on the same seven conditions as the ICP tab', () => {
    /*
     * Two instruments in two vocabularies is how a prospect qualifies on one
     * screen and fails on the next. Step 1's filter and the ICP tab's "what
     * has to be true of them" are the same list, deliberately.
     */
    const icp = fn('renderIcpView');
    for (const [pb, on] of [
      ['It happens frequently', 'The problem recurs'],
      ['Warning signals already exist', 'The early signals already exist'],
      ['The problem is discovered too late', 'more expensive when found late'],
      ['There is a clear action once detected', 'There is a clear action'],
    ]) {
      expect(view, pb).toContain(pb);
      expect(icp, on).toContain(on);
    }
  });
});
