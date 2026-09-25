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
     * Five pitch patterns cost real meetings to learn. One industry being the
     * focus is not a reason to lose the other four — an academy walking in
     * next month should not find an empty screen.
     */
    const view = fn('renderPitches');
    expect(view).toContain("PITCH_SEGMENT_OF[p.id] || 'other'");
    expect(js.match(/id: '[a-z-]+',\n\s*industry:/g) || []).toHaveLength(5);
  });

  it('files the wellness pattern under the wellness industry', () => {
    // Vesoma's own pattern. It belongs beside the message being sent to its
    // neighbours, not one click away under "other".
    expect(js).toContain("const PITCH_SEGMENT_OF = { 'multi-service-wellness': 'clinics' };");
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
    expect(sent).toContain('https://www.svargai.com/');
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
    const spoken = text.slice(0, text.indexOf('avoid:'));
    expect(spoken).not.toMatch(/20,000|2\.4L/);
  });

  it('says out loud which two sentences not to use', () => {
    const avoid = text.slice(text.indexOf('avoid:'));
    expect(avoid).toMatch(/20,000/);
    expect(avoid).toMatch(/We detected these problems/);
  });
});
