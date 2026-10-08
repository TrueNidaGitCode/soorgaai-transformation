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
  it('renders all twelve slides, in the deck’s order', () => {
    const order = [...js.matchAll(/return slide\('([^']+)', '([^']*)/g)].map((m) => m[1]);
    expect(order).toEqual(['SVARGAI &middot; PRE-SEED', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
    const composed = js.slice(js.indexOf('el.innerHTML = [cover()'));
    for (const fn of ['cover', 'problem', 'solution', 'practice', 'tools', 'competition', 'icp',
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
  it('marks every one of the six steps with what is behind it', () => {
    // The home page's loop: Detect, Explain, Recommend, Act, Measure, Learn.
    const steps = data('STEPS');
    expect(steps.map(([, n]) => n)).toEqual(['Detect', 'Explain', 'Recommend', 'Act', 'Measure', 'Learn']);
    for (const [, name, , state] of steps) expect(['yes', 'part', 'no'], name).toContain(state);
  });

  it('says what Learn learns, and that Act only drafts', () => {
    /*
     * The application holds no mail credentials by design. "It acts" and "it
     * drafts and a person sends" are different products; the slide says the
     * first and only the second exists.
     */
    const steps = data('STEPS');
    expect(steps.find(([, n]) => n === 'Learn')[3]).toBe('part');
    expect(steps.find(([, n]) => n === 'Recommend')[3]).toBe('part');
    expect(js).toContain('proven on a real customer&rsquo;s history');
    expect(steps.find(([, n]) => n === 'Act')[3]).toBe('part');
    expect(js).toMatch(/holds no mail credentials by design/);
  });

  it('pitches the beachhead the sales pages are interviewing', () => {
    /*
     * Until 2026-10-08 the ICP slide said engineering teams while every interview
     * was in clinics and wellness. The deck now sells retention, starting with
     * Recurring Services; the admin copy keeps saying how thin that evidence is.
     */
    const v = js.slice(js.indexOf('function icp()'), js.indexOf('function validation()'));
    expect(v).toMatch(/Recurring Services/);
    expect(v).toMatch(/3 of 5/);
    expect(js).not.toMatch(/Engineering schedule|schedule risk is expensive/);
    expect(data('SEGMENTS').map(([n]) => n)).toEqual(['Recurring Services', 'Education & Memberships',
      'Subscription & Repeat Purchase', 'High-Value Repeat Services', 'Hospitality & Leisure']);
  });

  it('shows the plans the code sells, and says nobody pays yet', () => {
    // Coverage pricing, as in backend services/entitlements.js; never per agent.
    const plans = Object.fromEntries(data('PLANS').map(([n, price]) => [n, price]));
    expect(plans).toEqual({ Hobby: 'Free', Pro: '₹16,999 / month', Ultra: '₹49,999 / month', Enterprise: 'Custom' });
    const v = js.slice(js.indexOf('function model()'), js.indexOf('function ask()'));
    expect(v).toMatch(/business coverage/);
    expect(v).toMatch(/Nobody is paying yet/);
    expect(v).not.toContain('number of monitored workflows / agents');
  });

  it('does not let the example say what the customer did not', () => {
    const v = js.slice(js.indexOf('function practice()'), js.indexOf('function tools()'));
    expect(v).toMatch(/our framing, not theirs/);
  });

  it('keeps those marks visually impossible to mistake for a slide', () => {
    expect(js).toMatch(/Not on the investor copy/);
    expect(css).toMatch(/\.ck-flag \{/);
    expect(css).toMatch(/border: 1px dashed/);
  });
});

describe('the competition slide', () => {
  it('ranks the founder’s seven, Velaris first, in the founder’s words', () => {
    const c = data('COMPETITORS');
    expect(c.map(([n]) => n)).toEqual(['Velaris', 'Totango', 'Planhat', 'Vitally', 'SmartKarrot', 'ClientSuccess', 'Pylon']);
    expect(c[0][3]).toBe('AI + customer signals + churn + agents');
    // The founder's colour markers, and a meter that follows the threat label.
    expect(c.map(([, , tone]) => tone)).toEqual(['red', 'red', 'red', 'orange', 'orange', 'orange', 'yellow']);
    const bars = data('THREAT_BARS');
    for (const [, threat] of c) expect(bars[threat], threat).toBeGreaterThan(0);
  });

  it('flags that the edge statement is ahead of the product', () => {
    const v = js.slice(js.indexOf('function competition()'), js.indexOf('const SEGMENTS'));
    expect(v).toMatch(/Don&rsquo;t wait for churn/);
    expect(v).toContain('learns the behavioural patterns&rdquo;</b> is built (8 October) but not yet proven');
    expect(v).toMatch(/not checked/);
  });
});

describe('the PDF is the investor copy', () => {
  it('leaves every admin flag out of the printed pages', () => {
    // The flags are the one thing that must never reach an investor.
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(/\.ck-flag \{ display: none !important; \}|\.ck-flag\s*\{\s*display: none/);
    expect(css).toMatch(/body\.is-printing \.ck-flag/);
  });

  it('prints one 16:9 page per slide', () => {
    expect(css).toMatch(/@page \{ size: 1280px 720px; margin: 0; \}/);
    expect(css).toMatch(/break-after: page/);
  });

  it('waits for the live numbers before offering the download', () => {
    const load = js.slice(js.indexOf('async function load()'));
    expect(load.indexOf('render();')).toBeLessThan(load.indexOf('wireDownload();'));
    expect(html).toMatch(/id="ck-download"[^>]*disabled/);
  });
});
