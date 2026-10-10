/**
 * The target audience table: four answers per company, the ten-step
 * playbook filled from them, and the wedge found across them.
 *
 * ── What changed on 6 October 2026 ─────────────────────────────────────────
 *
 * The table was written by hand in this file, a cell at a time. It is now
 * read from the server: each interview is four answers, and the playbook is
 * filled from them with every tick quoting the words it rests on (see the
 * backend's icpInterviewService). Since 7 October 2026 the answers are shared
 * in the Claude chat and recorded with scripts/icp_record.mjs — the tab only
 * displays, and has no write control of its own. The evidence for the three companies interviewed so far moved with the
 * data — its tests are in backend/__tests__/icpInterviews.test.js.
 *
 * What these hold is the screen's restraint: empty columns stay empty, what
 * was written is escaped, nothing on the page writes, and the wedge reads as
 * a draft until two companies share one evidenced problem.
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
  const start = js.search(new RegExp(`^(async )?function ${name}\\([a-zA-Z, =']*\\) \\{`, 'm'));
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = js.indexOf('{', start); i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) return js.slice(start, i + 1);
  }
  throw new Error(`${name} is unbalanced`);
}

function blocks(src) {
  const found = new Set();
  for (const m of src.matchAll(/class="([^"]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      const bare = /^sg-[a-z0-9-]+/.exec(cls.split('__')[0].split('--')[0]);
      if (bare) found.add(bare[0]);
    }
  }
  return found;
}

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

const view = fn('renderAudience');

/**
 * Draw the tab for real, from a given server answer, and return the HTML.
 *
 * The shipped code from VERTICALS to the end of wireAudience is evaluated
 * with the page's own helpers beside it, and the server state injected — so
 * what is asserted is what the operator would see.
 */
function draw({ vertical = 'clinics', interviews = [], wedge = null, counts = {} } = {}) {
  const from = js.indexOf('const SEGMENTS = [');
  const wire = fn('wireAudience');
  const to = js.indexOf(wire) + wire.length;
  const calls = [];
  const el = { innerHTML: '', querySelector: () => ({ addEventListener() {}, querySelector: () => ({ addEventListener() {} }) }) };
  const scope = `
    const PLAYBOOK_STEPS = ${literal(js, 'PLAYBOOK_STEPS')};
    const ACUTE_CONDITIONS = ${literal(js, 'ACUTE_CONDITIONS')};
    ${fn('esc')}
    ${js.slice(from, to)}
    audienceCheck = false;
    audienceVertical = ${JSON.stringify(vertical)};
    icp = { vertical: ${JSON.stringify(vertical)}, interviews: INTERVIEWS, wedge: WEDGE, loading: false, error: '' };
    icpCounts = COUNTS;
    renderAudience();
    return document.getElementById('sg-audience').innerHTML;`;
  // eslint-disable-next-line no-new-func
  const out = new Function('document', 'api', 'banner', 'window', 'INTERVIEWS', 'WEDGE', 'COUNTS', scope)(
    { getElementById: () => el },
    (p) => { calls.push(p); return Promise.resolve({ interviews: [], counts: {} }); },
    () => {}, {}, interviews, wedge, counts,
  );
  return { html: out, calls };
}

const iv = (letter, over = {}) => ({
  id: `id${letter}`, letter, company: `Company ${letter}`, met: 'Owner', when: 'Oct 2026',
  answers: { problem: 'p', example: 'e', detection: 'd', value: 'v' },
  cells: {}, legacy: false, filledAt: '2026-10-06', fillError: '', stale: false, unfilled: false, ...over,
});

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
    expect(css).toMatch(/\.sg-ta__wrap \{\s*overflow-x: auto;/);
    expect(css).toMatch(/^\.sg-ta__iv \{/m);
  });
});

describe('the verticals', () => {
  // eslint-disable-next-line no-new-func
  const SEG_SRC = `const SEGMENTS = ${literal(js, 'SEGMENTS')}; const segmentById = (id) => SEGMENTS.find((x) => x.id === id);`;
  const segments = new Function(`${SEG_SRC} return SEGMENTS;`)();
  const verticals = new Function(`${SEG_SRC} return ${literal(js, 'VERTICALS')};`)();

  it('is one segment per business type: B2B SaaS and B2C', () => {
    // 11 October 2026: not separated by industry. B2C keeps the id 'clinics',
    // where the three interviews were filed, so they stay with it.
    expect(verticals.map((v) => [v.id, v.group, v.name])).toEqual([
      ['saas', 'B2B', 'B2B SaaS'],
      ['clinics', 'B2C', 'B2C'],
    ]);
    expect(verticals[1].examples).toMatch(/clinics, wellness, gyms, salons, academies/);
  });

  it('keeps every segment for the Pitches tab, which has content for them', () => {
    expect(segments.map((v) => v.id)).toEqual(['saas', 'clinics', 'education', 'subscription', 'highvalue', 'hospitality', 'engineering']);
    expect(js).toContain('...SEGMENTS.map((v) => ({');
  });

  it('opens on the ICP check, first of three tabs, with no row of segments to choose', () => {
    expect(js).toContain('let audienceCheck = true;');
    const tabs = view.slice(view.indexOf('const AUDIENCE_TABS = ['), view.indexOf('];', view.indexOf('const AUDIENCE_TABS = [')));
    expect(tabs.indexOf("['CHECK',")).toBeLessThan(tabs.indexOf("['B2B',"));
    expect(tabs.indexOf("['B2B',")).toBeLessThan(tabs.indexOf("['B2C',"));
    expect(view).not.toContain('segButtons');
    expect(view).not.toContain('sg-seg__b');
    const wire = fn('wireAudience');
    expect(wire).toContain("e.target.closest('[data-group]')");
    expect(wire).toContain('VERTICALS.find((v) => v.group === t.dataset.group)');
  });

  it('sizes the SaaS segment exactly as the ICP tab does', () => {
    const saas = verticals.find((v) => v.id === 'saas');
    for (const c of ['10&ndash;50 people', 'recurring subscriptions', '100+ paying accounts']) expect(saas.examples + saas.note).toContain(c);
    expect(saas.hypothesis).toMatch(/dollars/);
  });

  it('names a knowledge base overlay only where one exists, and says so where none does', () => {
    for (const v of verticals) {
      if (v.overlay === null) continue;
      const overlay = join(dirname(fileURLToPath(import.meta.url)),
        '../../knowledge_base/automotive/enterprise_ai/AI_Use_Cases', v.overlay.replace('&amp;', '&'));
      expect(existsSync(overlay), `no overlay for ${v.name}`).toBe(true);
    }
    expect(view).toContain("'no knowledge base overlay yet'");
  });

  it('marks every new category untested, because nobody in it has been interviewed', () => {
    for (const v of segments.filter((x) => !['clinics'].includes(x.id))) {
      expect(v.hypothesis, v.name).toMatch(/^Untested\./);
    }
  });

  it('keeps the clinics hypothesis on customers at stake, with a cost', () => {
    const clinics = verticals.find((v) => v.id === 'clinics');
    expect(clinics.hypothesis).toMatch(/lose clients/i);
    // Retention only since 7 October 2026; the note says growth is outside.
    expect(clinics.hypothesis).not.toMatch(/growth/i);
    expect(clinics.note).toMatch(/retention only/i);
    expect(clinics.hypothesis).toMatch(/cost|revenue/i);
    expect(clinics.note).toMatch(/Vesoma/);
    expect(clinics.note).toMatch(/inference|inferred/i);
  });
});

describe('read from the server, not written here', () => {
  it('holds no interview evidence in the page source any more', () => {
    for (const name of ['INTERVIEWED', 'FOUR_BY_VERTICAL', 'ASKS_BY_VERTICAL', 'FIVE']) {
      expect(js, name).not.toMatch(new RegExp(`const ${name} = `));
    }
    expect(fn('loadIcp')).toContain('/icp?vertical=');
  });

  it('asks the server for the vertical it is about to draw', () => {
    expect(view).toContain('if (icp.vertical !== audienceVertical && !icp.loading) { loadIcp(audienceVertical); }');
    // Already loaded for the vertical on screen: nothing more is asked.
    expect(draw({ vertical: 'engineering' }).calls).toEqual([]);
  });

  it('starts a vertical nobody has been to with five empty columns', () => {
    const { html: out } = draw({ vertical: 'engineering' });
    expect((out.match(/class="sg-ta__co"/g) || []).length).toBeGreaterThanOrEqual(5);
    expect(out).not.toMatch(/sg-ta__co is-done/);
    expect(out).toContain('0 of 5 interviewed');
  });
});

describe('four answers, filed and filled', () => {
  it('files every interview under the same four questions, and points to the chat', () => {
    const { html: out } = draw();
    // eslint-disable-next-line no-new-func
    const qs = new Function(`return ${literal(js, 'ICP_QUESTIONS')};`)();
    expect(qs).toHaveLength(4);
    for (const [, q] of qs) expect(out).toContain(q);
    expect(out.replace(/\s+/g, ' ')).toContain('Share the questions and answers in the Claude chat');
    expect(out).toContain('No interviews in this vertical yet.');
  });

  it('has no control that writes — the playbook is filled in the chat', () => {
    const src = js.slice(js.indexOf('let audienceVertical'), js.indexOf(fn('wireAudience')) + fn('wireAudience').length);
    expect(src).not.toMatch(/data-act=|method: 'POST'|method: 'PATCH'|method: 'DELETE'|<textarea|<input/);
    expect(src).not.toMatch(/Fill the playbook with AI|Find the wedge|Add an interview/);
  });

  it('draws what was written escaped, with the words it rests on', () => {
    const { html: out } = draw({ interviews: [iv('A', { cells: {
      q1: { state: 'yes', text: '<b>15 a month</b>', quote: 'about 15 a month', edited: false },
    } })] });
    expect(out).toContain('&lt;b&gt;15 a month&lt;/b&gt;');
    expect(out).not.toContain('<b>15 a month</b>');
    expect(out).toContain('title="From the answers: &ldquo;about 15 a month&rdquo;"');
  });

  it('says where each playbook came from', () => {
    const { html: out } = draw({ interviews: [iv('A'), iv('C', { filledAt: null, legacy: true }), iv('D', { filledAt: null })] });
    expect(out).toContain('Playbook filled from the four answers');
    expect(out).toContain('Re-filed from the earlier hand-written table');
    expect(out).toContain('Not filled yet');
  });

  it('carries all ten steps, numbered and named as the playbook names them', () => {
    // eslint-disable-next-line no-new-func
    const titles = new Function(`return ${literal(js, 'PLAYBOOK_STEPS')};`)();
    const { html: out } = draw({ interviews: [iv('A')] });
    titles.forEach((t) => expect(out, t).toContain(t));
    // Step 1 leads with the problem type, then the playbook's own conditions.
    expect(view).toContain("rows: [['kind', 'Problem type'], ...ACUTE_CONDITIONS]");
    // Step 7's two rows are a person's to fill: nothing in four answers says a pilot was agreed.
    expect(view).toContain("rows: [['pilot', 'Pilot agreed'], ['earlier', 'Svarg caught it before they did']]");
  });

  it('lists what is still open from the cells, so it cannot disagree with them', () => {
    const { html: out } = draw({ interviews: [iv('B', { cells: { signals: { state: 'open', text: 'Whether calls are logged was not asked' } } })] });
    expect(out).toContain('Still open from the interviews so far');
    expect(out).toContain('B &middot; Company B &mdash; Warning signals already exist: Whether calls are logged was not asked');
  });
});

describe('the wedge reads as a draft until it is real', () => {
  const groups = [{ problem: 'Patients stop mid-course', kind: 'retention', companies: ['A', 'B'], evidenced: ['A'], why: '' }];

  it('says not ready while a problem is evidenced at one company', () => {
    const { html: out } = draw({ interviews: [iv('A'), iv('B')], wedge: { groups, draft: { sentence: 'Svarg helps clinics…' }, ready: false } });
    expect(out).toContain('<b>Not ready.</b>');
    expect(out).toContain('Svarg helps clinics…');
    expect(out).toContain('<i class="is-yes">A</i><i class="">B</i>');
  });

  it('says ready once two companies share it', () => {
    const { html: out } = draw({ interviews: [iv('A'), iv('B')], wedge: { groups: [{ ...groups[0], evidenced: ['A', 'B'] }], draft: { sentence: 'Svarg helps clinics…' }, ready: true } });
    expect(out).toContain('<b>Ready to lock.</b>');
  });

  it('shows a locked wedge as locked', () => {
    const { html: out } = draw({ interviews: [iv('A')], wedge: { locked: 'Svarg helps clinics find…', ready: true } });
    expect(out).toContain('Wedge &mdash; locked');
    expect(out).toContain('Svarg helps clinics find…');
  });
});

describe('the ICP check, before an interview', () => {
  it('is a tab of its own, beside B2B and B2C', () => {
    expect(view).toContain("['CHECK', 'ICP check', 'before the interview'],");
    const wire = fn('wireAudience');
    expect(wire).toContain("if (t.dataset.group === 'CHECK') { audienceCheck = true; renderAudience(); return; }");
  });

  it('shows the same five rows as the ICP tab, read from one list', () => {
    // One list (ICP_START), two places it is read: the ICP tab and this check.
    expect(js.match(/^const ICP_START = \[/m)).toBeTruthy();
    expect(view).toContain("['B2B', 'small B2B SaaS', ICP_START, '']");
    const at = js.indexOf('const ICP_START = [');
    const rows = js.slice(at, js.indexOf('];', at));
    for (const c of ['Company size', 'Business model', 'Customer base', 'Customer retention problem', 'Data availability']) {
      expect(rows).toContain(`['${c}',`);
    }
  });

  it('wires its tabs, so B2B and B2C can be reached again from it', () => {
    // Found by clicking through: the check returned before the wiring, and its
    // tabs were dead.
    const check = view.slice(view.indexOf('if (audienceCheck) {'), view.indexOf('return;', view.indexOf('if (audienceCheck) {')));
    expect(check).toContain("wireAudience(el.querySelector('.sg-ta'));");
  });

  it('records nothing: answers go under the four questions after the call', () => {
    const check = view.slice(view.indexOf('if (audienceCheck) {'), view.indexOf('return;', view.indexOf('if (audienceCheck) {')));
    expect(check).not.toMatch(/<input|<textarea|<select|api\(/);
  });
});

describe('the ICP check, for both business types', () => {
  it('has a table for B2B and one for B2C, under the same five criteria', () => {
    expect(view).toContain("['B2B', 'small B2B SaaS', ICP_START, '']");
    expect(view).toContain("['B2C', 'consumer businesses with recurring customers', ICP_START_B2C,");
    const at = js.indexOf('const ICP_START_B2C = [');
    const rows = js.slice(at, js.indexOf('];', at));
    for (const c of ['Company size', 'Business model', 'Customer base', 'Customer retention problem', 'Data availability']) {
      expect(rows).toContain(`['${c}',`);
    }
  });

  it('says the B2C table is a draft, and sets no number no interview has given', () => {
    expect(view).toContain('Not yet agreed: change it before relying on it.');
    const at = js.indexOf('const ICP_START_B2C = [');
    const rows = js.slice(at, js.indexOf('];', at));
    expect(rows).toContain('No number yet');
    expect(rows).not.toMatch(/\d+\+? (paying|active) (accounts|customers)/);
  });
});
