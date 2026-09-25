/**
 * The Capital page: the investor deck, with the proof slide reading live.
 *
 * ── The two failures this guards ───────────────────────────────────────────
 *
 * A number that was true once. Every figure on the old version was typed in
 * from a query run on one afternoon, which is honest for a day and decoration
 * by the end of the month — the watchers keep running and the counts keep
 * moving. So the page asks the server, and no figure may be hard-coded in it.
 *
 * And a slide that is ahead of the product. The deck claims five verbs; three
 * run today. It names a beachhead the sales pages are not interviewing. Both
 * are marked on this admin copy, because the alternative is finding out in
 * the room. The marks are the thing being protected here: they are easy to
 * delete in a tidy-up and expensive to be without.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../admin/capital.js');
const css = read('../admin/capital.css');
const html = read('../admin/capital.html');

/** One `const NAME = … ;` value from the page, evaluated. */
function data(name) {
  const at = js.search(new RegExp(`^const ${name} = `, 'm'));
  expect(at, name).toBeGreaterThan(-1);
  const from = js.indexOf('=', at) + 1;
  let depth = 0;
  for (let i = from; i < js.length; i++) {
    const c = js[i];
    if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) depth--;
    else if (c === ';' && depth === 0) {
      // eslint-disable-next-line no-new-func
      return new Function(`return ${js.slice(from, i)};`)();
    }
  }
  throw new Error(`${name} is unbalanced`);
}

describe('the deck', () => {
  it('renders all eleven slides, in the deck’s order', () => {
    const order = [...js.matchAll(/return slide\('([^']+)', '([^']*)/g)].map((m) => m[1]);
    expect(order).toEqual(['SVARGAI &middot; PRE-SEED', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
    const composed = js.slice(js.indexOf('el.innerHTML = [cover()'));
    for (const fn of ['cover', 'problem', 'solution', 'practice', 'tools', 'icp',
      'validation', 'gtm', 'model', 'ask', 'founder']) {
      expect(composed, fn).toContain(`${fn}()`);
    }
  });

  it('is guarded like the rest of the admin', () => {
    expect(js).toMatch(/role !== 'admin'/);
    expect(js).toContain("localStorage.setItem('redirectAfterLogin', '/admin/capital.html')");
  });

  it('owns its own stylesheet and does not borrow the dashboard’s', () => {
    // The deck is not a dashboard and should not inherit one.
    expect(html).toContain('capital.css');
    expect(html).not.toContain('admin.css');
    expect(css).toMatch(/^\.ck-body \{/m);
  });
});

describe('the proof slide is measured, never remembered', () => {
  it('asks the server for its numbers', () => {
    expect(js).toMatch(/\/admin\/capital\/proof/);
    expect(js).toMatch(/Authorization: `Bearer \$\{localStorage\.getItem\('token'\)\}`/);
  });

  it('hard-codes no figure of its own', () => {
    /*
     * The whole point. Every number on the proof slide comes out of `proof`,
     * so a stale one cannot survive in the source. Checked against the
     * figures that were hard-coded in the previous version of this page.
     */
    const v = js.slice(js.indexOf('function validation()'), js.indexOf('function gtm()'));
    for (const stale of ['285', '118', '569', '$0.60', '0.5972', '65 watchers']) {
      expect(v, `hard-coded ${stale}`).not.toContain(stale);
    }
    expect(v).toMatch(/p\.product\.findings/);
    expect(v).toMatch(/p\.customers\.findingsOpened/);
    expect(v).toMatch(/p\.cost\.spendUsd/);
  });

  it('says it could not measure rather than showing the last known numbers', () => {
    /*
     * A figure whose age is unknown is the thing this page was rebuilt to
     * remove, so there is no fallback to fall back to.
     */
    expect(js).toMatch(/proofError/);
    expect(js).not.toMatch(/proof = \{[^}]*findings/);
  });

  it('prints when it was measured, beside the numbers', () => {
    expect(js).toMatch(/Measured <b>\$\{esc\(new Date\(p\.measuredAt\)/);
  });

  it('projects nothing', () => {
    /*
     * Minus the sentence that promises not to — the page says "nothing
     * annualised, projected or rounded up" out loud, and a check that cannot
     * tell a promise from a breach would force that promise off the page.
     */
    const without = js.replace(/Nothing annualised[^<]*/g, '');
    for (const word of [/ARR/, /annualis/i, /run rate/i, /forecast/i, /\bTAM\b/]) {
      expect(without, String(word)).not.toMatch(word);
    }
  });
});

describe('where the deck is ahead of the product, the admin copy says so', () => {
  it('marks every one of the five verbs with what is behind it', () => {
    const steps = data('STEPS');
    expect(steps).toHaveLength(5);
    for (const [, name, , state] of steps) expect(['yes', 'part', 'no'], name).toContain(state);
  });

  it('admits that Learn is not built and Act only drafts', () => {
    /*
     * The application holds no mail credentials by design. "It acts" and "it
     * drafts and a person sends" are different products; the slide says the
     * first and only the second exists.
     */
    const steps = data('STEPS');
    expect(steps.find(([, n]) => n === 'Learn')[3]).toBe('no');
    expect(steps.find(([, n]) => n === 'Act')[3]).toBe('part');
    expect(js).toMatch(/holds no mail credentials by design/);
  });

  it('flags that the beachhead is not the industry being interviewed', () => {
    /*
     * Slide 05 says engineering teams. The interviews, the target audience
     * table and the outreach all address Clinics & Wellness. An investor who
     * reads both learns that the ICP is unsettled, so the page says it first.
     */
    const v = js.slice(js.indexOf('function icp()'), js.indexOf('function validation()'));
    expect(v).toMatch(/Clinics &amp; Wellness/);
    expect(v).toMatch(/Both cannot be the beachhead/);
  });

  it('flags that the pricing on the business model slide was rejected in code', () => {
    // Plans sell coverage; per-agent pricing was decided against deliberately.
    const v = js.slice(js.indexOf('function model()'), js.indexOf('function ask()'));
    expect(v).toMatch(/business coverage/);
    expect(v).toMatch(/is the model that was rejected/);
  });

  it('keeps those marks visually impossible to mistake for a slide', () => {
    expect(js).toMatch(/Not on the investor copy/);
    expect(css).toMatch(/\.ck-flag \{/);
    expect(css).toMatch(/border: 1px dashed/);
  });
});
