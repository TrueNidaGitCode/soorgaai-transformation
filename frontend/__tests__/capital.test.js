/**
 * The Capital page: what to say to somebody deciding whether to back this.
 *
 * ── Why this page gets the strictest version of the rule ───────────────────
 *
 * It is the second admin screen read aloud during a live conversation, and
 * the one where an overstatement is most expensive — the person listening is
 * deciding whether to believe everything else. The ICP tab's discipline
 * therefore applies harder here:
 *
 *   - Every verb carries whether it is built, and at least one says no.
 *   - Every figure was measured on a printed date. Nothing is annualised or
 *     projected, and no figure may appear that was not taken from the live
 *     databases.
 *   - The numbers that look bad are on the page. One finding opened against
 *     285 raised; no revenue. An investor who finds those out later finds out
 *     that they were hidden, which costs more than the facts.
 *
 * The third state on the questions tab is the one worth protecting: a
 * question with no honest answer is marked as having none, rather than being
 * quietly given a plausible one.
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

describe('the page exists and is guarded like the rest of the admin', () => {
  it('has the three views, wired both ways', () => {
    for (const v of ['story', 'proof', 'asks']) {
      expect(html, v).toContain(`id="cp-${v}"`);
      expect(html, v).toContain(`id="cp-view-${v}"`);
    }
    expect(js).toContain("document.getElementById('cp-view-' + v).addEventListener");
  });

  it('refuses anybody who is not an admin, and comes back after login', () => {
    expect(js).toMatch(/role !== 'admin'/);
    expect(js).toContain("localStorage.setItem('redirectAfterLogin', '/admin/capital.html')");
  });

  it('owns its own stylesheet and prefix, sharing no name with the sales page', () => {
    /*
     * A different page loading a different sheet, so a collision is not even
     * possible — which is the cheapest version of the rule that the sg-flow
     * bug taught this codebase.
     */
    expect(html).toContain('capital.css');
    expect(html).not.toContain('sales.css');
    const classes = [...js.matchAll(/class="([a-z0-9_ -]+)"/g)].flatMap((m) => m[1].split(/\s+/));
    for (const c of classes) {
      if (c === 'cp' || c.startsWith('cp-') || c.startsWith('is-') || c === 'header-subtitle') continue;
      expect(c, `unexpected class ${c}`).toBe('');
    }
    expect(css).toMatch(/^\.cp \{/m);
  });
});

describe('what the story claims is what is built', () => {
  const spine = data('SPINE');

  it('marks every verb with its build state', () => {
    expect(spine).toHaveLength(5);
    for (const [verb, state] of spine) {
      expect(['yes', 'part', 'no'], verb).toContain(state);
    }
  });

  it('admits at least one verb is not built', () => {
    /*
     * The page is worthless the moment everything on it says "built". If a
     * fifth verb ships, this test fails and somebody has to check that the
     * claim is now true before changing it.
     */
    expect(spine.filter(([, s]) => s === 'no').length).toBeGreaterThanOrEqual(1);
    expect(js).toMatch(/One of the five is not built/);
  });

  it('describes Act as drafting, never as sending', () => {
    /*
     * The application holds no mail credentials by design. "It acts" and "it
     * drafts and a person sends" are different products, and only one of them
     * exists.
     */
    const act = spine.find(([v]) => v === 'Act');
    expect(act[1]).toBe('yes');
    expect(act[2]).toMatch(/drafted and never sent/);
    expect(js).not.toMatch(/sends the message|sends it for you|automatically sends/i);
  });

  it('keeps the two deciding steps in code', () => {
    // The answer to "isn't this a chatbot?" is only checkable because these
    // two are code rather than model.
    const pipe = data('PIPELINE');
    expect(pipe.find(([s]) => s === 'Execute')[1]).toBe('code');
    expect(pipe.find(([s]) => s === 'Validate')[1]).toBe('code');
  });
});

describe('the proof is measured, and dated', () => {
  it('prints the date it was measured, on the page', () => {
    expect(js).toMatch(/^const MEASURED = '/m);
    expect(js).toMatch(/Every figure measured <b>\$\{MEASURED\}<\/b>/);
  });

  it('carries the numbers that look bad', () => {
    /*
     * One finding opened against 285 raised, and no revenue. Both are on the
     * page by name. A proof tab that only holds flattering figures is a
     * liability in the second meeting, not an asset in the first.
     */
    const flat = JSON.stringify(data('PROOF'));
    expect(flat).toMatch(/finding opened/);
    expect(flat).toMatch(/285/);
    expect(JSON.stringify(data('CAVEATS'))).toMatch(/Nobody is paying yet/);
  });

  it('says what the numbers do not support', () => {
    const caveats = data('CAVEATS');
    expect(caveats.length).toBeGreaterThanOrEqual(3);
    // The build cost is genuinely not known: nine ledger rows for thirty-six
    // blueprints. Claiming it as measured would be the page's worst error.
    expect(JSON.stringify(caveats)).toMatch(/build cost is not measured/);
  });

  it('projects nothing', () => {
    /*
     * No annualised figure, no run rate, no multiple. Everything on Proof is
     * a count of something that has already happened.
     */
    const flat = JSON.stringify(data('PROOF'));
    for (const word of [/ARR/, /annual/i, /projected/i, /run rate/i, /forecast/i, /TAM/]) {
      expect(flat, String(word)).not.toMatch(word);
    }
  });
});

describe('the questions each audience asks', () => {
  const asks = data('ASKS');

  it('covers all three audiences named on the page', () => {
    expect(Object.keys(asks).sort()).toEqual(['accelerator', 'incubator', 'investor']);
    expect(data('AUDIENCES').map((a) => a.id).sort()).toEqual(['accelerator', 'incubator', 'investor']);
  });

  it('marks every answer with whether it can be evidenced', () => {
    for (const [who, rows] of Object.entries(asks)) {
      expect(rows.length, who).toBeGreaterThanOrEqual(4);
      for (const [state, q] of rows) expect(['have', 'partly', 'not'], `${who}: ${q}`).toContain(state);
    }
  });

  it('admits, for every audience, at least one question it cannot answer', () => {
    /*
     * The state that keeps this page honest. Traction, market size and paying
     * customers have no answer today; writing a plausible one in the room is
     * how a second meeting is lost.
     */
    for (const [who, rows] of Object.entries(asks)) {
      expect(rows.some(([s]) => s === 'not'), `${who} answers everything`).toBe(true);
    }
  });

  it('does not describe a delivered application as a sale', () => {
    const flat = JSON.stringify(asks);
    expect(flat).toMatch(/Users, not customers/);
    expect(flat).toMatch(/nobody paying/i);
  });
});
