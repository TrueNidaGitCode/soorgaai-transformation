/**
 * The first message, and the one word in it that matters.
 *
 * ── What this checks and why ───────────────────────────────────────────────
 *
 * The draft said "we found examples such as patients being treated but
 * recorded as No Show". We did not find them: a wellness centre told us, in a
 * fifteen-minute interview. A prospect reads "we found" as "your product
 * detected this", asks how, and the honest answer undoes the mail.
 *
 * It is also the weaker sentence. "A wellness centre in Bengaluru told us"
 * says you have already sat with somebody in their trade and listened, which
 * is the one thing a cold mail can offer that a product page cannot.
 *
 * The same discipline the ICP tab applies to what is built, applied to what
 * is claimed — on the only screen whose words leave the building verbatim.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../admin/sales.js');
const css = read('../admin/sales.css');

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

/** The whole FIRST_MESSAGE literal, as one searchable string. */
function copy() {
  const at = js.indexOf('const FIRST_MESSAGE = {');
  expect(at, 'FIRST_MESSAGE').toBeGreaterThan(-1);
  let depth = 0;
  for (let i = js.indexOf('{', at); i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) return js.slice(at, i + 1);
  }
  throw new Error('FIRST_MESSAGE is unbalanced');
}

describe('the pitches tab is split by industry', () => {
  it('opens on the industry being worked', () => {
    expect(js).toMatch(/let pitchSegment = 'clinics';/);
    const segs = js.slice(js.indexOf('const PITCH_SEGMENTS'), js.indexOf('const PITCH_SEGMENT_OF'));
    expect(segs).toContain('Clinics &amp; Wellness');
    expect(segs).toContain('Other industries');
  });

  it('keeps the patterns from earlier conversations rather than deleting them', () => {
    /*
     * These cost real meetings to learn. One industry being the focus is not
     * a reason to lose the rest — an academy walking in next month should not
     * find an empty screen.
     *
     * Four, not five: the clinics pattern was removed when the Pitches tab
     * became the messages and the presentation. That was a deliberate edit to
     * the tab, not an industry being dropped.
     */
    const view = fn('renderPitches');
    expect(view).toContain("PITCH_SEGMENT_OF[p.id] || 'other'");
    expect(js.match(/id: '[a-z-]+',\n\s*industry:/g) || []).toHaveLength(4);
  });

  it('leaves the clinics tab as the messages and the presentation', () => {
    /*
     * The walk-through that used to sit here was written before there was a
     * deck to walk through, and the two said the same thing twice. What
     * leaves the building is the email, the short message and the deck.
     */
    expect(js).toContain('const PITCH_SEGMENT_OF = {};');
    expect(js).toContain('<p class="sg-fm__kind">Email</p>');
    expect(js).toContain('<p class="sg-fm__kind">Presentation</p>');
    expect(js).toContain('<div id="sg-deck"></div>');
  });

  it('owns its class names, and styles them', () => {
    const mine = new Set([...fn('renderFirstMessage').matchAll(/class="(sg-[a-z0-9_-]+)/g)].map((m) => m[1]));
    expect(mine.size).toBeGreaterThan(3);
    for (const c of mine) expect(c.startsWith('sg-fm'), c).toBe(true);
    expect(css).toMatch(/^\.sg-fm \{/m);
    expect(css).toMatch(/^\.sg-seg \{/m);
  });
});

describe('what the first message claims', () => {
  const text = copy();

  /**
   * The words that get sent.
   *
   * The avoid list quotes the bad sentences on purpose, so it is cut off; and
   * a long line is written as two joined literals, so those are rejoined —
   * the test is about the sentence, not about where it wrapped.
   */
  const sent = text.slice(0, text.indexOf('avoid:')).replace(/'\s*\+\s*'/g, '');

  it('credits the centre with finding it, never us', () => {
    /*
     * Both messages attribute it, in their own words: the email says the
     * centre told us, the short one says the centre found them. Either is
     * true. "We found" is the one that gets asked about.
     */
    expect(sent).toMatch(/recently shared two examples with us/);
    expect(sent).toMatch(/a wellness centre in Bengaluru found/);
    expect(sent).not.toMatch(/we found/i);
    expect(sent).not.toMatch(/we detected/i);
  });

  it('sends people to a domain that answers', () => {
    // svargai.com did not resolve earlier in this project's life; a link in a
    // first message that goes nowhere is worse than no link.
    // The message now ends in a tracked {{link}}, filled per lead. With nobody
    // chosen it falls back to the plain address, and that fallback is where a
    // dead domain could get back in, so it is what this guards now.
    expect(sent).toContain('Learn more: {{link}}');
    expect(js).toContain("const link = lead?.inviteLink || 'https://www.svargai.com/';");
  });

  it('describes only what the product does today', () => {
    /*
     * Reads the records, picks the problem up, tells the person who can act.
     * Detect and explain are built; nothing here promises it acts by itself,
     * which the ICP tab lists as not built.
     */
    expect(sent).toMatch(/runs multiple AI agents on top of the data and systems you already use/);
    expect(sent).toMatch(/bring them to the person who can act on them/);
    expect(sent).not.toMatch(/fixes|automatically|on its own|without you/i);
  });

  it('asks for the fifteen minutes the interview tab is built around', () => {
    expect(sent).toMatch(/15-minute call/);
  });

  it('carries no unverified number', () => {
    /*
     * ₹20,000 a month is the centre's own estimate with no arithmetic behind
     * it. The first number out of your mouth should be one you can defend.
     */
    /*
     * The whole message now, rather than the part before the avoid list.
     * That list has been removed, so indexOf returned -1 and this was
     * checking all but the last character of the file by accident.
     */
    expect(text).not.toMatch(/20,000|2\.4L/);
  });
});

describe('the engineering pitch claims nothing it has not got', () => {
  const eng = js.slice(js.indexOf("'engineering': {"), js.indexOf('const ENGINEERING_FIRST'));

  it('opens on the question, not on "AI for engineering"', () => {
    expect(eng).toMatch(/When a project starts slipping, how early do you/);
    expect(eng).not.toMatch(/AI platform for engineering|AI for engineering/i);
  });

  it('attributes no example to anybody, because nobody in engineering has been interviewed', () => {
    expect(eng).not.toMatch(/told us|shared|we found|found that|customers? (?:said|saw)/i);
  });

  it('marks the Orion lines that are not built, the progress gap among them', () => {
    const orion = js.slice(js.indexOf('const ORION = {'), js.indexOf('function renderOrion'));
    const cannot = orion.slice(orion.indexOf('cannot:'));
    expect(cannot).toMatch(/86% planned/);
    expect(cannot).toMatch(/hours over plan/);
    expect(cannot).toMatch(/date never moved/);
    // And the can-list holds nothing from the cannot-list.
    expect(orion.slice(0, orion.indexOf('cannot:'))).not.toMatch(/planned|hours|never moved/);
  });

  it('keeps the clinic deck and proposal off the engineering tab', () => {
    expect(js).toMatch(/\$\{seg === 'clinics' \? `\s*<article class="sg-fm__msg sg-fm__msg--deck">\s*<p class="sg-fm__kind">Presentation/);
    expect(js).toContain("if (pitchSegment === 'clinics') loadDeckFacts();");
  });
});
