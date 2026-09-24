/**
 * The ICP interview tab: fifteen minutes, in the order they are spent.
 *
 * ── What this page is for ──────────────────────────────────────────────────
 *
 * It is read during a live call, which makes it the third screen on this page
 * whose mistakes get repeated out loud to a customer. The failure mode of the
 * conversation is always the same one — the seller starts explaining — so the
 * clock is the content: the blocks are consecutive, they cover the whole
 * quarter of an hour, and Svarg is not named until minute thirteen.
 *
 * Each question also names the row of the ICP tab's validation matrix that its
 * answer fills. Two instruments in two vocabularies is how a prospect
 * qualifies on one screen and fails on the next, and this page has done that
 * once already.
 *
 * ── And the class names ────────────────────────────────────────────────────
 *
 * The ICP tab took `.sg-flow`, which the Pitches tab already owned; the newer
 * rules won and the damage showed up on the other tab. This is the fourth
 * component in the same stylesheet, so the no-shared-block invariant is
 * pinned across all four.
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
  it('sits after the playbook, which is the order they are used in', () => {
    const at = html.indexOf('<div class="sg-views"');
    const bar = html.slice(at, html.indexOf('</div>', at));
    expect(bar).toContain('id="sg-view-interview"');
    expect(bar).toContain('ICP Interview');
    expect(bar.indexOf('sg-view-interview')).toBeGreaterThan(bar.indexOf('sg-view-playbook'));
    expect(bar.indexOf('sg-view-interview')).toBeLessThan(bar.indexOf('sg-view-funnel'));
  });

  it('has a panel, and setView shows, hides and renders it', () => {
    expect(html).toContain('id="sg-interview"');
    const view = fn('setView');
    expect(view).toContain("document.getElementById('sg-interview').hidden = !iview;");
    expect(view).toContain('if (iview) renderInterview();');
    expect(view).toMatch(/\['sg-view-interview', iview\]/);
  });

  it('is wired to a click', () => {
    expect(fn('wireAccountControls')).toContain("setView('interview')");
  });

  it('bumps both cache-busting versions', () => {
    expect(Number(/sales\.css\?v=(\d+)/.exec(html)[1])).toBeGreaterThanOrEqual(36);
    expect(Number(/sales\.js\?v=(\d+)/.exec(html)[1])).toBeGreaterThanOrEqual(34);
  });
});

describe('class names the interview owns', () => {
  it('shares no block name with the ICP, playbook or Pitches tabs', () => {
    const mine = blocks(fn('renderInterview'));
    expect(mine.size).toBeGreaterThan(0);
    const theirs = new Set([
      ...blocks(fn('renderIcpView')),
      ...blocks(fn('renderPlaybook')),
      ...blocks(fn('renderPitches')),
    ]);
    expect([...mine].filter((b) => theirs.has(b))).toEqual([]);
  });

  it('is styled, so the names are not merely unused', () => {
    expect(css).toMatch(/^\.sg-iv \{/m);
    expect(css).toMatch(/^\.sg-iv__clock \{/m);
  });
});

describe('fifteen minutes, and the clock is the content', () => {
  const view = fn('renderInterview');

  /** The five blocks as [from, to], in the order they are rendered. */
  const spans = [...view.matchAll(/from: '(\d+)', to: '(\d+)'/g)].map((m) => [Number(m[1]), Number(m[2])]);

  it('has five consecutive blocks covering the whole quarter of an hour', () => {
    expect(spans).toHaveLength(5);
    expect(spans[0][0]).toBe(0);
    expect(spans[spans.length - 1][1]).toBe(15);
    // No gap and no overlap: a minute that belongs to nothing is a minute
    // that gets spent explaining.
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBe(spans[i - 1][1]);
  });

  it('spends eleven of them listening and two on Svarg', () => {
    const listening = spans[spans.length - 1][0] - spans[0][1];
    expect(listening).toBe(11);
    expect(spans[spans.length - 1][1] - spans[spans.length - 1][0]).toBe(2);
  });

  it('does not name Svarg before minute thirteen', () => {
    /*
     * The discipline the whole page exists to enforce. Everything before the
     * last block is the customer's; a product sentence that drifts earlier is
     * this tab failing at its one job.
     */
    const last = view.indexOf("from: '13'");
    expect(last).toBeGreaterThan(-1);
    const before = view.slice(0, last);
    // The rendered strings only — a comment may discuss the product freely.
    const spoken = (before.match(/&ldquo;[\s\S]*?&rdquo;/g) || []).join(' ');
    expect(spoken).not.toMatch(/Svarg/);
    expect(before).toContain('Do not pitch Svarg yet.');
  });

  it('keeps the three questions of the middle block, and marks the one that matters', () => {
    expect(view).toContain('What tends to go wrong most often?');
    expect(view).toContain('Which of these do you usually realise only after the problem has already happened?');
    expect(view).toContain('Can you give me a recent example of when that happened?');
    // The key flag belongs to exactly one question in the whole script.
    expect(view.match(/key: true/g) || []).toHaveLength(1);
  });

  it('carries the three follow-ups that test the hypothesis', () => {
    // A long question is written as two joined literals in the source. Rejoin
    // them, so the test is about the sentence rather than where it wrapped.
    const joined = view.replace(/'\s*\+\s*'/g, '');
    for (const q of [
      'was there any information that could have indicated it earlier?',
      'Where was that information?',
      'Who usually notices it, and how do they find out?',
      'what would you do differently?',
    ]) expect(joined, q).toContain(q);
  });

  it('accepts impact in something other than rupees', () => {
    expect(view).toContain('do not push for rupees');
    for (const c of ['Lost customers', 'Unused capacity', 'Staff hours']) expect(view, c).toContain(c);
  });

  it('is one script for every business, with one blank in it', () => {
    /*
     * The same questions asked of a clinic, a distributor and an academy are
     * what make the answers comparable — the playbook's step 9 is exactly
     * "the same problem at company after company", and it cannot be run on
     * five interviews that each asked something slightly different.
     *
     * So nothing SPOKEN may name an industry. The notes beside the script may
     * (they are about reuse, and the reader is the seller, not the prospect),
     * and so may the comments.
     */
    // Rendered for real, then the seller's own notes stripped out: what is
    // left is the page as a prospect would hear it.
    const el = { innerHTML: '' };
    // eslint-disable-next-line no-new-func
    new Function('document', `${view}; renderInterview();`)({ getElementById: () => el });
    const spoken = el.innerHTML.replace(/<p class="sg-iv__note">[\s\S]*?<\/p>/g, '');
    expect(spoken.length).toBeGreaterThan(1500);
    for (const word of [/patient/i, /clinic/i, /wellness/i, /treatment/i, /academy/i,
      /student/i, /coach/i, /distributor/i, /dealer/i, /hospital/i]) {
      expect(spoken, `spoken: ${word}`).not.toMatch(word);
    }
    // Including the chips, which are the one place a vertical noun crept in:
    // a lost customer is a patient, a buyer or a student depending on the room.
    expect(view).not.toContain('Lost patients');

    // Exactly one blank to fill in before the call, in the opening line.
    const opener = view.slice(view.indexOf("from: '0'"), view.indexOf("from: '2'"));
    expect(opener.match(/sg-iv__slot/g) || []).toHaveLength(1);
    expect(opener).toContain('[team]');
  });

  it('ends on one question, not on a demonstration', () => {
    expect(view).toContain('Would it be useful if we looked at this specific problem');
    expect(view).toContain('Do not turn the last two minutes into a product demo.');
  });
});

describe('what the page admits while somebody is reading it aloud', () => {
  const view = fn('renderInterview');

  it('says that the action half of the thirty-second description is not built', () => {
    /*
     * The ICP tab marks Act as not built. The same sentence is spoken here,
     * so the caveat is spoken here too — otherwise the one screen that is
     * read out loud is the one screen that overstates.
     */
    expect(view).toContain('helps the team take action earlier');
    expect(view).toMatch(/nothing is sent outward yet/);
  });

  it('fills the ICP tab’s own matrix rows, not a second vocabulary', () => {
    const icp = fn('renderIcpView');
    for (const dimension of ['Recurrence', 'Lateness', 'Signal availability',
      'Fragmentation', 'Manual effort', 'Actionability', 'Cost of lateness']) {
      expect(view, `interview: ${dimension}`).toContain(dimension);
      expect(icp, `icp: ${dimension}`).toContain(`'${dimension}'`);
    }
  });
});
