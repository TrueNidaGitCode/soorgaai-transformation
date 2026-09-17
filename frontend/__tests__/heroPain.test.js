/**
 * The landing page has to let a stranger recognise themselves.
 *
 * Somebody met at a trade show put the address into an industry WhatsApp
 * group. That is the first traffic that arrives with nobody standing next to
 * it to explain — and what it found was a hero built for a different reader:
 * "enterprise problem", and a subheading listing six disciplines, aimed at a
 * buyer who already knows what those words are worth. The companies now
 * clicking are thirty-to-two-hundred-person manufacturers. "Enterprise" tells
 * them this is not for them and they close the tab.
 *
 * The framing here is the one a VC correlated with immediately: the gap is not
 * the models and not the intent. Strategy, data, models, the application and
 * the integration each have a different owner, and nobody owns the path
 * between them.
 *
 * Then the part that does the recognising — four problems in plain operational
 * language, each carrying a full sentence into the objective box, because the
 * blank field is where a first-time visitor leaves.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, '..', p), 'utf8');

const html = read('index.html');
const hero = html.slice(html.indexOf('class="mkt-hero"'), html.indexOf('mkt-hero__visual'));

describe('the hero speaks to the reader who is actually arriving', () => {
  it('does not size them out of it with "enterprise"', () => {
    /*
     * The single word that loses the audience clicking today. It is not banned
     * from the site — only from the first thing a stranger reads, where it is a
     * statement about who this is for.
     */
    expect(hero.toLowerCase()).not.toContain('enterprise problem');
    const h1 = hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
    expect(h1.toLowerCase()).not.toContain('enterprise');
  });

  it('names the gap rather than listing what we do', () => {
    const h1 = hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
    expect(h1).toMatch(/path between them/i);

    const sub = hero.match(/class="mkt-hero__sub">([\s\S]*?)<\/p>/)[1];
    // The mechanism, which is the half that made it land: it is not that the
    // steps are hard, it is that each one has a different owner.
    expect(sub).toMatch(/different owner/i);
    expect(sub).toMatch(/nobody owns the whole path/i);
  });

  it('still makes the concrete promise, not just the diagnosis', () => {
    // A hero that only names the pain is an essay. The reader has to learn
    // what they get and roughly when.
    const sub = hero.match(/class="mkt-hero__sub">([\s\S]*?)<\/p>/)[1];
    expect(sub).toMatch(/working\s+application/i);
    expect(sub).toMatch(/your own data/i);
    expect(sub).toMatch(/week/i);
  });

  it('asks them to describe a problem, not to begin a journey', () => {
    const cta = hero.match(/id="mkt-cta-hero"[^>]*>([^<]+)</)[1];
    expect(cta).toMatch(/describe/i);
    expect(cta).not.toMatch(/journey/i);
  });
});

describe('four problems somebody recognises', () => {
  const items = [...hero.matchAll(/class="mkt-pain__item" href="([^"]+)">([^<]+)</g)];

  it('offers several, in the reader\u2019s own operational language', () => {
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const [, , label] of items) {
      // A sentence about their work, not a category name. "Quality
      // inspection" is a heading; "every board is inspected by eye" is
      // somebody's Tuesday.
      expect(label.length).toBeGreaterThan(40);
      // A full sentence, which is the test that separates a situation somebody
      // recognises from a category nobody does.
      expect(label.trim().endsWith('.'), label).toBe(true);
      expect(label.trim().split(' ').length).toBeGreaterThan(7);
    }
  });

  it('carries a fuller sentence into the objective box', () => {
    for (const [, href] of items) {
      expect(href.startsWith('/cob.html?objective=')).toBe(true);
      const obj = decodeURIComponent(href.split('objective=')[1]);
      // Long enough to be worth generating on. The short line is what fits on
      // a card; the box needs the paragraph that makes a blueprint possible.
      expect(obj.length).toBeGreaterThan(120);
      // First person: the objective has to read as the customer describing
      // their own business, which is what makes it worth generating on.
      expect(obj).toMatch(/\b(we|our)\b/i);
    }
  });

  it('gives each one a distinct problem', () => {
    const labels = items.map(([, , l]) => l);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('the box on the other side is not empty', () => {
  const js = read('index.js');

  it('reads the chosen problem out of the address', () => {
    /*
     * Without this, clicking the thing that described your business lands you
     * on a blank field — the exact moment a first-time visitor leaves, because
     * an empty box asks them to translate their business into whatever this
     * thing wants.
     */
    expect(js).toContain("new URLSearchParams(window.location.search).get('objective')");
    expect(js).toContain('input.value = wanted.slice(0, 2000)');
  });

  it('never overwrites something they have already typed', () => {
    expect(js).toMatch(/if \(wanted && !input\.value\)/);
  });

  it('leaves it theirs to edit and submits nothing for them', () => {
    const block = js.slice(js.indexOf("get('objective')"), js.indexOf("get('objective')") + 900);
    expect(block).toContain('input.focus()');
    expect(block).toContain('setSelectionRange');
    expect(block).not.toMatch(/\.submit\(\)|requestSubmit/);
  });

  it('survives a browser that will not give it a URL', () => {
    // A blocked history or a missing URL API must cost the prefill, never the
    // box: the page's one job still works.
    const block = js.slice(js.indexOf("get('objective')") - 400, js.indexOf("get('objective')") + 900);
    expect(block).toMatch(/try \{/);
    expect(block).toMatch(/catch \{/);
  });
});

describe('the stylesheet reaches the browser', () => {
  it('is cache-busted past the version that had no pain block', () => {
    // Five files on domain.html taught this lesson once already: a stylesheet
    // edit behind a stale ?v= is a UI bug nobody can reproduce.
    const v = Number(html.match(/marketing\.css\?v=(\d+)/)[1]);
    expect(v).toBeGreaterThanOrEqual(3);
    expect(read('marketing.css')).toContain('.mkt-pain__item');
  });

  it('bumps cob.html past the version with no prefill', () => {
    const v = Number(read('cob.html').match(/index\.js\?v=(\d+)/)[1]);
    expect(v).toBeGreaterThanOrEqual(12);
  });
});
