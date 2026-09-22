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
 * Four recognisable problems were tried in the hero alongside this and taken
 * out again: they pushed the primary action below the fold on a laptop, which
 * costs more than the recognition was buying. The objective box still accepts
 * one in ?objective=, so a link sent to a named prospect can open with their
 * own problem already in it — which is where that idea actually belongs.
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

  it('names the failure of timing, not a shortage of software', () => {
    /*
     * ── Why this replaced "the path between them" ──────────────────────────
     *
     * The path framing was right about the market and wrong about the product.
     * It described what Svarg BUILDS — strategy, then data, then models, then
     * an application — which is the setup, not the thing the customer keeps.
     * What they keep is something that watches, and the pain it removes is
     * finding out too late.
     *
     * So the headline is now about timing: the business is changing, the signs
     * are already there, and nobody is joining them up.
     */
    const h1 = hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
    expect(h1).toMatch(/late/i);

    const sub = hero.match(/class="mkt-hero__sub">([\s\S]*?)<\/p>/)[1];
    // The mechanism, and the half that makes it recognisable: the information
    // exists, it is scattered, and no person is joining it up.
    expect(sub).toMatch(/already in your systems/i);
    expect(sub).toMatch(/nobody is joining them up/i);
  });

  it('promises watching and evidence, not a build', () => {
    /*
     * A hero that only names the pain is an essay. The reader has to learn
     * what they get — and what they get is no longer "an application in a
     * week". It is something that watches and can show its working, which is
     * the claim the product can actually keep today.
     */
    const sub = hero.match(/class="mkt-hero__sub">([\s\S]*?)<\/p>/)[1];
    expect(sub).toMatch(/watches/i);
    expect(sub).toMatch(/needs attention/i);
    // Evidence is the differentiator and belongs above the fold.
    expect(sub).toMatch(/records it read/i);
  });

  it('asks them to say what to watch, not to begin a journey', () => {
    const cta = hero.match(/id="mkt-cta-hero"[^>]*>([^<]+)</)[1];
    expect(cta).toMatch(/watch/i);
    expect(cta).not.toMatch(/journey/i);
  });
});

describe('the hero stays one idea and one action', () => {
  it('does not stack a second thing to read above the button', () => {
    /*
     * The pain cards lived here briefly. On a 900px laptop they pushed
     * "Describe your problem" to the bottom edge of the viewport, and a
     * primary action below the fold is worth less than any copy above it.
     */
    expect(hero).not.toContain('mkt-pain');
    const beforeCta = hero.slice(0, hero.indexOf('mkt-cta-hero'));
    // Eyebrow, heading, subheading. Nothing else between the reader and the
    // thing they are meant to press.
    expect((beforeCta.match(/<p |<h1 /g) || []).length).toBeLessThanOrEqual(3);
  });

  it('leaves no stylesheet rules behind for markup that is gone', () => {
    expect(read('marketing.css')).not.toContain('mkt-pain');
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
  it('is cache-busted on every edit', () => {
    // Five files on domain.html taught this lesson once already: a stylesheet
    // edit behind a stale ?v= is a UI bug nobody can reproduce. A deletion is
    // an edit too — rules whose markup is gone are harmless, but the habit of
    // bumping on every change is what catches the one that is not.
    const v = Number(html.match(/marketing[.]css[?]v=([0-9]+)/)[1]);
    expect(v).toBeGreaterThanOrEqual(4);
  });

  it('bumps cob.html past the version with no prefill', () => {
    const v = Number(read('cob.html').match(/index\.js\?v=(\d+)/)[1]);
    expect(v).toBeGreaterThanOrEqual(12);
  });
});
