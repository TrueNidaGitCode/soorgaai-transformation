/**
 * Stopping a vague objective before it is typed, not after it is submitted.
 *
 * Five of nineteen objectives in a month were junk — "hi", "surprise me",
 * "Porn videos" — and two of them bought a full generation run. There is a
 * server guard that refuses them, but a refusal after the button is a wall,
 * and the people who hit it leave.
 *
 * The box was producing the behaviour. One row, and a placeholder reading
 * "Tell us what you'd like to improve…", asks for a few words and gets them.
 * A comment in cob.html even said the example objective had been removed
 * because "the example is taught by the placeholder now" — and the
 * placeholder never taught it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, '..', p), 'utf8');

describe('the box asks for what it needs', () => {
  const html = read('cob.html');

  it('is sized for sentences, not for a few words', () => {
    const box = html.slice(html.indexOf('id="hero-objective"'));
    const open = box.slice(0, box.indexOf('>'));
    expect(open).toMatch(/rows="3"/);
    expect(open).not.toMatch(/rows="1"/);
  });

  it('shows a real objective as its placeholder, not an instruction', () => {
    const box = html.slice(html.indexOf('id="hero-objective"'));
    const ph = box.match(/placeholder="([^"]+)"/)[1];
    // Long enough to be an example rather than a prompt, and written in the
    // customer's voice — which is the only thing that teaches the shape.
    expect(ph.length).toBeGreaterThan(80);
    expect(ph).toMatch(/\bwe\b/i);
    expect(ph).not.toMatch(/tell us what you'd like to improve/i);
  });

  it('asks the two questions a real objective answers', () => {
    // "Describe the outcome you want to achieve" is abstract and produced
    // abstract answers. What the business does, and what goes wrong.
    expect(html).toMatch(/what does your business do, and what goes wrong today/i);
  });
});

describe('guidance while there is still an empty box to fill', () => {
  const js = read('index.js');

  it('says when there is too little, not only when there is too much', () => {
    // The counter only ever warned near the maximum, so "hi" looked complete
    // right up until the server refused it.
    expect(js).toMatch(/const ENOUGH_CHARS = 60;/);
    expect(js).toMatch(/len > 0 && len < ENOUGH_CHARS/);
  });

  it('encourages rather than scolds — nobody has done anything wrong yet', () => {
    expect(js).toContain('Keep going — say what the work is today and what goes wrong.');
    // It must not be dressed as an error while they are still typing.
    const block = js.slice(js.indexOf('len > 0 && len < ENOUGH_CHARS'), js.indexOf('len > 0 && len < ENOUGH_CHARS') + 400);
    expect(block).toContain("counterEl.classList.remove('prompt__counter--over')");
  });
});

describe('a thin objective is asked about, not refused', () => {
  const js = read('index.js');
  const handler = js.slice(js.indexOf("form.addEventListener('submit'"));

  it('asks one follow-up question instead of rejecting', () => {
    expect(handler).toContain('Almost — tell me a little more.');
    expect(handler).toMatch(/what does your business do/i);
  });

  it('keeps what they typed and puts the cursor at the end', () => {
    // Clearing the box, or focusing at position zero, is how a person decides
    // not to bother a second time.
    expect(handler).toContain('input.setSelectionRange(input.value.length, input.value.length)');
    expect(handler).not.toMatch(/input\.value\s*=\s*''/);
  });

  it('checks before anything is sent, so nothing is spent on it', () => {
    const ask = handler.indexOf('objective.length < ENOUGH_CHARS');
    const send = handler.indexOf('fetch(');
    expect(ask).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(send);
  });
});
