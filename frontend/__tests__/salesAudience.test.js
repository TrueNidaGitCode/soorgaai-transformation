/**
 * The target audience table: one segment, five companies, and four of them empty.
 *
 * ── What this screen is for ────────────────────────────────────────────────
 *
 * The playbook calls step 9 the gate: the same problem at company after
 * company, or there is no ICP. This is that gate as a table, and the thing it
 * exists to prevent is one enthusiastic interview being read as a market.
 *
 * So the assertions are mostly about restraint rather than content:
 *
 *   - Four of five columns stay empty until somebody has actually been
 *     interviewed. An empty column is evidence, not an unfinished page.
 *   - A claim is never recorded as evidence. The ₹20,000 a month came from
 *     the HOD, the arithmetic behind it has not been shown, and a cell that
 *     said ✓ would launder an estimate into a fact three interviews later.
 *   - Every pointer that is not evidenced has a question attached, because a
 *     gap nobody wrote a question for is a gap that stays open.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../admin/sales.js');
const css = read('../admin/sales.css');
const html = read('../admin/sales.html');

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

const view = fn('renderAudience');

/**
 * One `const NAME = … ;` declaration's value, from the view or module scope.
 *
 * To the semicolon at depth zero rather than to a matching bracket, because
 * one of these is an object that is immediately indexed — `{…}[vertical] || {}`
 * — and stopping at its closing brace would lose the half that chooses.
 */
function literal(src, name) {
  const at = src.search(new RegExp(`^\\s*const ${name} = `, 'm'));
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  const from = src.indexOf('=', at) + 1;
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return src.slice(from, i).trim();
  }
  throw new Error(`${name} is unbalanced`);
}

/**
 * The view's own data, evaluated.
 *
 * ROWS spreads the shared ACUTE_CONDITIONS, so that comes along — which is
 * the point of the change these tests cover: the table's first seven rows
 * are the playbook's seven conditions, not a second wording of them.
 */
const SHARED = literal(js, 'ACUTE_CONDITIONS');
const TITLES = literal(js, 'PLAYBOOK_STEPS');

/**
 * One of the view's own declarations, evaluated for a chosen vertical.
 *
 * The vertical is injected rather than read, so the same shipped code can be
 * run twice — once for the industry with an interview behind it and once for
 * the one nobody has visited — and the difference asserted rather than
 * assumed.
 */
function dataFor(vertical, name) {
  const scope = `const audienceVertical = ${JSON.stringify(vertical)};
    const ACUTE_CONDITIONS = ${SHARED};
    const PLAYBOOK_STEPS = ${TITLES};
    const VERTICALS = ${literal(js, 'VERTICALS')};
    const REPEATABILITY = ${literal(view, 'REPEATABILITY')};
    const OURS = ${literal(view, 'OURS')};
    const INTERVIEWED = ${literal(view, 'INTERVIEWED')};
    const blank = ${literal(view, 'blank')};
    const ASKS_BY_VERTICAL = ${literal(view, 'ASKS_BY_VERTICAL')};`;
  // eslint-disable-next-line no-new-func
  return new Function(`${scope} return ${literal(view, name)};`)();
}

const data = (name) => dataFor('clinics', name);

/** Every key a company is scored on: the sub-rows, plus the one-row steps. */
function pointerKeys(steps) {
  return steps.flatMap((s) => (s.rows ? s.rows.map(([k]) => k) : s.key ? [s.key] : []));
}

describe('the tab is reachable', () => {
  it('sits after the interview, which is where its rows come from', () => {
    const at = html.indexOf('<div class="sg-views"');
    const bar = html.slice(at, html.indexOf('</div>', at));
    expect(bar).toContain('Target Audience');
    expect(bar.indexOf('sg-view-audience')).toBeGreaterThan(bar.indexOf('sg-view-interview'));
  });

  it('has a panel, and setView shows, hides and renders it', () => {
    expect(html).toContain('id="sg-audience"');
    const set = fn('setView');
    expect(set).toContain("document.getElementById('sg-audience').hidden = !aud;");
    expect(set).toContain('if (aud) renderAudience();');
  });

  it('is wired to a click', () => {
    expect(fn('wireAccountControls')).toContain("setView('audience')");
  });

  it('shares no block name with the other four tabs, bar the switcher', () => {
    /*
     * The rule that caught the sg-flow collision, with the exception its own
     * comment always allowed: a shared LAYOUT PRIMITIVE is fine, an
     * accidentally shared component is not.
     *
     * sg-seg is the industry switcher. Pitches and this tab both choose an
     * industry, they should look identical doing it, and one set of rules for
     * one control is the opposite of the bug — two tabs each styling their own
     * copy is how they drift.
     */
    const SHARED_PRIMITIVES = new Set(['sg-seg']);
    const mine = blocks(view);
    expect(mine.size).toBeGreaterThan(0);
    const theirs = new Set([
      ...blocks(fn('renderIcpView')), ...blocks(fn('renderPlaybook')),
      ...blocks(fn('renderInterview')), ...blocks(fn('renderPitches')),
    ]);
    expect([...mine].filter((b) => theirs.has(b) && !SHARED_PRIMITIVES.has(b))).toEqual([]);
  });

  it('is styled, and its table scrolls in its own container', () => {
    expect(css).toMatch(/^\.sg-ta \{/m);
    // Six columns of prose are wider than a phone. Only the table may scroll
    // sideways — never the page.
    expect(css).toMatch(/\.sg-ta__wrap \{\s*overflow-x: auto;/);
  });
});

describe('five companies, one of them interviewed', () => {
  const companies = data('COMPANIES');
  const steps = data('STEPS');
  const pointers = pointerKeys(steps);

  it('has five columns and holds the segment they belong to', () => {
    expect(companies).toHaveLength(5);
    expect(companies.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('names the segment as the knowledge base names it', () => {
    /*
     * It said "Physiotherapy", which described the trade in front of us and
     * matched nothing. The knowledge base has an overlay per industry — the
     * attention areas, the opportunity discovery, the use case classification
     * — and an application delivered to anybody in this column is built on
     * the one called Clinics & Wellness. A segment whose name exists only on
     * this page cannot be joined to the thing that decides their screens.
     */
    // eslint-disable-next-line no-new-func
    const verticals = new Function(`return ${literal(js, 'VERTICALS')};`)();
    expect(verticals.map((v) => v.name)).toEqual(['Clinics &amp; Wellness', 'Automotive']);

    /*
     * Every vertical must name a knowledge base overlay that exists. The
     * overlay decides the categories a delivered application groups its
     * findings under, so a vertical named only here produces a column that
     * cannot become software. Joined rather than URL-resolved: one folder
     * name has a space and an ampersand in it, which is the name being
     * checked.
     */
    for (const v of verticals) {
      const overlay = join(
        dirname(fileURLToPath(import.meta.url)),
        '../../knowledge_base/automotive/enterprise_ai/AI_Use_Cases',
        v.name.replace('&amp;', '&'),
      );
      expect(existsSync(overlay), `no overlay for ${v.name}`).toBe(true);
    }
    expect(view).toContain('knowledge base overlay');
  });

  it('starts a new vertical with five empty columns and no invented evidence', () => {
    /*
     * The whole risk of adding a second industry before visiting it: a
     * plausible example typed in advance is indistinguishable from evidence
     * by the third conversation. So the shipped code is run for Automotive
     * and every cell checked, rather than the emptiness being assumed.
     */
    const auto = dataFor('automotive', 'COMPANIES');
    const steps = dataFor('automotive', 'STEPS');
    expect(auto).toHaveLength(5);
    const keys = steps.flatMap((s) => (s.rows ? s.rows.map(([k]) => k) : s.key ? [s.key] : []));
    for (const c of auto) {
      expect(c.name, c.id).toBe('');
      for (const k of keys) expect(c[k], `${c.id}.${k}`).toBeUndefined();
    }
    // And the three steps that are our work say plainly that they have not
    // begun, rather than borrowing the first vertical's answers.
    for (const s of steps.filter((x) => x.segment)) {
      expect(s.segment[0], `step ${s.n} state`).toBe('');
      expect(s.segment[1].length, `step ${s.n} text`).toBeGreaterThan(20);
    }
    // No follow-up questions, because nothing has been answered yet.
    expect(dataFor('automotive', 'ASKS')).toEqual([]);
  });

  it('leaves four of them genuinely empty', () => {
    /*
     * Not placeholder answers, not "TBD" — nothing. A cell invented to make
     * the table look finished is indistinguishable from evidence by the time
     * anyone reads it back.
     */
    const filled = companies.filter((c) => pointers.some((k) => c[k]));
    expect(filled).toHaveLength(1);
    expect(filled[0].name).toBe('Vesoma');
    for (const c of companies.slice(1)) {
      expect(c.name, c.id).toBe('');
      for (const k of pointers) expect(c[k], `${c.id}.${k}`).toBeUndefined();
    }
  });

  it('carries all ten steps, numbered and named as the playbook names them', () => {
    /*
     * It showed two of the ten, which reads as eight steps done rather than
     * eight outstanding — the opposite of what the table is for. And the
     * titles are the playbook's own: this was already got wrong once, when
     * "Signals are spread across multiple systems" became "Signals in more
     * than one place" here, and a step called something slightly different on
     * the second screen is a second step.
     */
    // eslint-disable-next-line no-new-func
    const titles = new Function(`return ${TITLES};`)();
    expect(titles).toHaveLength(10);
    expect(steps).toHaveLength(10);
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(steps.map((s) => s.title)).toEqual(titles);
  });

  it('breaks step 1 into the playbook’s seven conditions, not a rewording', () => {
    // eslint-disable-next-line no-new-func
    const acute = new Function(`return ${SHARED};`)();
    expect(steps[0].rows).toEqual(acute);
    expect(acute.map(([, label]) => label)).toContain('Signals are spread across multiple systems');
    // Step 9 is the other one that breaks up: the six comparisons.
    expect(steps[8].rows.map(([, l]) => l)).toContain('Same problem');
  });

  it('spans the columns for the steps no single company can answer', () => {
    /*
     * Embedding yourself in a market, choosing what to build and locking a
     * wedge are our work, not a customer's answer. Five cells against them
     * would invite somebody to fill in five things that do not exist.
     */
    const ours = steps.filter((s) => s.segment).map((s) => s.n);
    expect(ours).toEqual([4, 6, 10]);
    for (const s of steps) {
      expect(Boolean(s.rows) + Boolean(s.key) + Boolean(s.segment), `step ${s.n}`).toBe(1);
    }
  });

  it('records what Vesoma actually said', () => {
    const v = data('COMPANIES')[0];
    expect(v.met).toBe('HOD');
    expect(v.frequency[0]).toBe('yes');
    expect(v.frequency[1]).toMatch(/no-show/);
    expect(v.late[0]).toBe('yes');
    expect(v.same[1]).toMatch(/does not match the record/);
    // Answered after the first interview: the three places a signal lives.
    expect(v.spread[0]).toBe('yes');
    expect(v.spread[1]).toMatch(/WhatsApp/);
    expect(v.spread[1]).toMatch(/phone calls/);
    expect(v.spread[1]).toMatch(/CRM/);
    // And the catch that came with the answer: one of the three is not readable.
    expect(v.spread[1]).toMatch(/nothing to read unless/);
    /*
     * The sharpest answer of the three, and the one most easily flattened
     * into a plain yes: the HOD notices SOMETIMES, and nobody does it
     * consistently. “A person joins the dots by hand” and “nobody reliably
     * joins them at all” are different findings, and the second is the
     * stronger one — there is no process to displace, only an absence.
     */
    expect(v.manual[0]).toBe('yes');
    expect(v.manual[1]).toMatch(/HOD notices, sometimes/);
    expect(v.manual[1]).toMatch(/Nobody does it consistently/);
    /*
     * The action is a correction, not a collection. Recording it as “they fix
     * it” would quietly make the ₹20,000 look recoverable, and nobody has
     * said that it is.
     */
    expect(v.action[0]).toBe('yes');
    expect(v.action[1]).toMatch(/corrected by hand/);
    expect(v.action[1]).toMatch(/not a collection/);
  });
});

describe('a claim is not evidence', () => {
  const v = data('COMPANIES')[0];

  it('keeps the ₹20,000 as a ceiling, now that the arithmetic is known', () => {
    /*
     * The working came back: ₹1,000 a booking, about twenty a month left
     * marked no-show. That settles MEASURABILITY — there is a unit price and
     * a count — so the qualifying condition is evidenced.
     *
     * It does not settle the amount. Twenty is every no-show mark, and only
     * some of those patients actually attended; twenty thousand is therefore
     * the most it can be, not what it is. Recording the ceiling as the figure
     * is the same laundering as before with an extra step in front of it, so
     * the size stays a claim until somebody counts.
     */
    expect(v.cost[0]).toBe('yes');
    expect(v.cost[1]).toMatch(/&#8377;1,000 a booking/);
    expect(v.cost[1]).toMatch(/up to/);

    expect(v.roi[0]).toBe('claim');
    expect(v.roi[1]).toMatch(/Up to/);
    expect(v.roi[1]).toMatch(/however many of the 20 actually attended/);
    expect(v.roi[1]).toMatch(/Nobody has counted/);
    expect(v.economics[0]).toBe('claim');
    expect(v.economics[1]).toMatch(/ceiling/);
  });

  it('separates a claim from evidence in the key, so the glyph means something', () => {
    expect(view).toContain('stated, not yet arithmetic');
    expect(view).toContain('asked, not established');
    expect(css).toMatch(/\.sg-ta__cell\.is-claim \{/);
  });

  it('qualifies the problem on all seven, and still asks only about the size', () => {
    /*
     * All seven conditions are now evidenced: this is an acute problem at
     * this company, and the interview has converged on one unknown — how big.
     * Every remaining question is about that, which is the state a first
     * interview should end in.
     */
    const v2 = data('COMPANIES')[0];
    // eslint-disable-next-line no-new-func
    const qualify = new Function(`return ${SHARED};`)().map(([k]) => k);
    expect(qualify.filter((k) => v2[k][0] !== 'yes')).toEqual([]);
    for (const [key] of data('ASKS')) expect(['cost', 'roi', 'economics']).toContain(key);
  });

  it('keeps the wedge a draft while only one column is full', () => {
    expect(view).toMatch(/Draft wedge/);
    expect(view).toMatch(/stays a draft until the table has more than one full column/);
  });
});

describe('every gap carries the question that closes it', () => {
  const v = data('COMPANIES')[0];
  const asks = data('ASKS');

  it('asks about something unproven, never about something already evidenced', () => {
    for (const [key] of asks) {
      expect(v[key], `ASKS names ${key}`).toBeTruthy();
      expect(v[key][0], `${key} is already evidenced`).not.toBe('yes');
    }
  });

  it('covers every acute-problem condition that is still unproven', () => {
    /*
     * Scoped to step 1 deliberately. Those seven are things the CUSTOMER
     * answers, so a gap in them is a question for the next conversation. The
     * later steps are our own work — nobody closes "choose what to build" by
     * asking a clinic about it.
     */
    // eslint-disable-next-line no-new-func
    const acute = new Function(`return ${SHARED};`)().map(([k]) => k);
    const asked = new Set(asks.map(([k]) => k));
    for (const k of acute) {
      if (v[k][0] === 'yes') continue;
      expect(asked.has(k), `no question closes ${k}`).toBe(true);
    }
  });

  it('keeps the list short enough to actually ask', () => {
    expect(asks.length).toBeLessThanOrEqual(5);
  });
});
