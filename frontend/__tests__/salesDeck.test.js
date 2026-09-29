/**
 * The presentation: the third thing that leaves this page.
 *
 * ── The finding this was built on ──────────────────────────────────────────
 *
 * The deck it replaces had a Chief of Agents connecting a No Show, a phone
 * call and an unkept promise into "Rahul needs attention". That is the most
 * persuasive slide in it, and it is the one thing the product does not do.
 * composeDigest walks the results agent by agent and never compares two;
 * nothing joins a finding from one watcher to a finding from another.
 *
 * Sold in the present tense, that is the claim a buyer discovers in week one
 * — and everything else in the deck gets re-examined when they do. Stated as
 * where this is going, it is a roadmap they can be excited by, and the rest
 * of the deck keeps its credibility.
 *
 * So this file's real job is the one thing no renderer can enforce: that the
 * unbuilt claims stay on the unbuilt side.
 *
 * ── And the numbers ────────────────────────────────────────────────────────
 *
 * A deck goes stale the day it is exported, and the stale part is always the
 * figures. An earlier version said five agents watch for five things; the
 * catalogue is thirty-six across seven areas. So every countable claim is
 * counted from the running product, and none of them is typed into the page.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../admin/sales.js');
const css = read('../admin/sales.css');
const html = read('../admin/sales.html');

/** The deck's own block, so a match elsewhere in the file cannot pass for it. */
const deck = js.slice(js.indexOf('/* ── The presentation'), js.indexOf('/*\n * Pitches, by industry.'));

describe('the three things that leave this page', () => {
  it('still sends an email and a short message', () => {
    expect(js).toContain('<p class="sg-fm__kind">Email</p>');
    expect(js).toContain('<p class="sg-fm__kind">WhatsApp or LinkedIn</p>');
  });

  it('now also has the presentation, beside them', () => {
    expect(js).toContain('<p class="sg-fm__kind">Presentation</p>');
  });

  it('puts the deck where the card points', () => {
    expect(js).toContain('href="#sg-deck"');
    expect(js).toContain('<div id="sg-deck"></div>');
  });
});

describe('what runs, and what does not', () => {
  it('separates the two, in that order', () => {
    expect(deck).toContain('Runs today');
    expect(deck).toContain('Next \\u2014 say so as next');
    expect(deck.indexOf('sg-deck__when--now')).toBeLessThan(deck.indexOf('sg-deck__when--next'));
  });

  it('puts joining signals across agents on the unbuilt side', () => {
    /*
     * The whole reason this file exists. If this assertion ever has to be
     * changed, the thing to change first is notifyService — and then this.
     */
    const next = deck.slice(deck.indexOf('next: ['), deck.indexOf('n: \'04\''));
    expect(next).toContain('Signals joined across agents');
    expect(next).toContain('it is not built');
  });

  it('puts ranking on the unbuilt side too', () => {
    const next = deck.slice(deck.indexOf('next: ['), deck.indexOf('n: \'04\''));
    expect(next).toContain('Ranked, not just listed');
    expect(next).toContain('no implementation yet');
  });

  it('claims drafting, which is built, and never sending', () => {
    const today = deck.slice(deck.indexOf('today: ['), deck.indexOf('next: ['));
    expect(today).toContain('A follow-up is drafted');
    expect(today).toContain('A person sends it');
    expect(today).toContain('holds no mail credentials');
  });

  it('gives the unbuilt half a colour it shares with nothing else', () => {
    // So a claim cannot quietly change category by being restyled.
    expect(css).toContain('.sg-deck__when--next { color: #E8A34A; }');
    const others = css.split('#E8A34A').length - 1;
    const amber = css.split('232, 163, 74').length - 1;
    expect(others).toBe(1);
    // The only other uses are the two borders on the same block.
    expect(amber).toBeLessThanOrEqual(2);
  });
});

describe('the numbers', () => {
  it('are read, never written into the page', () => {
    // 36 watchers and 7 areas are facts about the catalogue. The moment one
    // of them is a literal in this file, the deck can go stale.
    expect(deck).not.toMatch(/\b36 watchers\b/);
    expect(deck).not.toMatch(/\bthirty-six watchers\b/i);
    expect(deck).toContain('f.watchers.total');
    expect(deck).toContain('f.watchers.areas.length');
    expect(deck).toContain('f.connectors.total');
  });

  it('come from the product, over its own endpoint', () => {
    expect(deck).toContain("api('/deck')");
  });

  it('each carry where they came from, so "how do you know" is answerable', () => {
    expect(deck).toContain('function deckStat(value, label, source)');
    expect(deck).toContain('f.watchers.source');
    expect(deck).toContain('f.connectors.source');
  });

  it('draw the deck even when the figures have not arrived', () => {
    // A slow answer must show a deck missing its numbers, not an empty panel.
    expect(deck).toContain(".catch(() => { renderDeck(); })");
    expect(deck).toContain("if (!f) return '<p class=\"sg-deck__wait\">");
  });
});

describe('what the deck is not allowed to know', () => {
  it('shows no customer of anybody\'s, because the wire carries none', () => {
    expect(deck).toContain('no finding, no name, no row');
  });

  it('says so on the slide rather than in a policy somewhere', () => {
    expect(deck).toContain('u.boundary');
    expect(deck).toContain('What Svarg receives');
  });

  it('keeps the worked example as prose, not as a live record', () => {
    // "Rahul" is a demonstration account the founder owns, written here by
    // hand. It must never become something fetched.
    const slide1 = deck.slice(deck.indexOf("n: '01'"), deck.indexOf("n: '02'"));
    expect(slide1).toContain('One customer, one week');
    expect(slide1).not.toContain('deckFacts');
    expect(slide1).not.toContain('api(');
  });
});

describe('the page serves it', () => {
  it('bumps the cache-busting version, or nobody sees any of this', () => {
    const jsv = Number((html.match(/sales\.js\?v=(\d+)/) || [])[1]);
    const cssv = Number((css ? html.match(/sales\.css\?v=(\d+)/) : []) [1]);
    expect(jsv).toBeGreaterThanOrEqual(51);
    expect(cssv).toBeGreaterThanOrEqual(43);
  });

  it('renders four slides and no more, because a fifth is a different deck', () => {
    const ids = [...deck.matchAll(/n: '(\d\d)'/g)].map((m) => m[1]);
    expect(ids).toEqual(['01', '02', '03', '04']);
  });
});
