/**
 * The one answer the Home page gives before any detail.
 *
 * ── Why the order of the checks is the whole thing ─────────────────────────
 *
 * "Everything looks good" is only true when watchers ran and found nothing.
 * There are two states that also have zero findings and are not good at all:
 * an application whose first check has not happened yet, and one whose
 * watchers failed repeatedly and switched themselves off. Both would render
 * as all-clear under a naive `findings.length === 0`, and somebody would read
 * it and stop looking — which is the one lie this screen must never tell.
 *
 * So the states are checked worst-first, and that order is tested here by
 * running the real function rather than reading it. It lives inside the
 * page's IIFE, so it is lifted out by name and evaluated: no jsdom, no
 * test-only export dangling off the production file, and the thing under
 * test is the code that ships.
 */
import fs from 'fs';
import { describe, it, expect } from 'vitest';

const SRC = fs.readFileSync(new URL('../eame-template/frontend/findings.js', import.meta.url), 'utf8');

/** One named function and its balanced body, lifted out of the page. */
function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('no function ' + name + ' in findings.js');
  let depth = 0;
  for (let i = SRC.indexOf('{', at); i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) return SRC.slice(at, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

/** One `var NAME = '…';` declaration, lifted whole. */
function liftVar(name) {
  const m = SRC.match(new RegExp('^\\s*var ' + name + ' = .*;$', 'm'));
  if (!m) throw new Error('no var ' + name + ' in findings.js');
  return m[0];
}

// eslint-disable-next-line no-new-func
const health = new Function([
  liftVar('SHIELD'), liftVar('ALERT'), liftVar('CLOCK'),
  lift('clockTime'), lift('health'), 'return health;',
].join('\n'))();

const OK = { open: [], counts: { high: 0, medium: 0, low: 0 }, watching: 13, degraded: 0, everRan: true };

describe('the Home banner states the truth about what it knows', () => {
  it('says all clear only when watchers ran and found nothing', () => {
    const h = health(OK);
    expect(h.verdict).toBe('Healthy');
    expect(h.cls).toBe('is-good');
    expect(h.line).toMatch(/Everything looks good/);
  });

  it('never says all clear when a watcher has stopped itself', () => {
    /*
     * Zero findings and two dead watchers. The findings are zero BECAUSE
     * nothing is looking, and a green banner here is how somebody stops
     * checking a business that is no longer being watched.
     */
    const h = health({ ...OK, degraded: 2 });
    expect(h.verdict).not.toBe('Healthy');
    expect(h.cls).toBe('is-bad');
    expect(h.line).toMatch(/stopped/i);
    expect(h.note).toMatch(/2 watchers/);
  });

  it('never says all clear before the first check has run', () => {
    const h = health({ ...OK, everRan: false });
    expect(h.verdict).not.toBe('Healthy');
    expect(h.line).not.toMatch(/looks good/i);
    expect(h.sub).toMatch(/Nothing has been checked yet/);
  });

  it('names the time of the first check when it knows it', () => {
    const at = new Date(Date.now() + 36e5).toISOString();
    expect(health({ ...OK, everRan: false, nextDueAt: at }).sub).toMatch(/first check is at /);
    // And does not invent one when it does not.
    expect(health({ ...OK, everRan: false }).sub).toMatch(/runs shortly/);
  });

  it('says nothing is watched when nothing is', () => {
    const h = health({ ...OK, watching: 0, everRan: false });
    expect(h.verdict).toBe('Not watching yet');
    expect(h.sub).toMatch(/Open Watchers/);
  });

  it('leads with the worst thing when findings are open', () => {
    const high = health({ ...OK, open: [1, 2, 3], counts: { high: 1, medium: 2, low: 0 } });
    expect(high.verdict).toBe('Needs attention');
    expect(high.cls).toBe('is-bad');
    expect(high.line).toMatch(/3 things need you today/);
    expect(high.note).toMatch(/1 high priority item/);

    const mild = health({ ...OK, open: [1], counts: { high: 0, medium: 1, low: 0 } });
    expect(mild.verdict).toBe('Worth a look');
    expect(mild.cls).toBe('is-watch');
  });

  it('puts a stopped watcher above open findings', () => {
    /*
     * Both are true at once on a bad morning. The stopped watcher wins,
     * because open findings are a list somebody can work through and a
     * stopped watcher is a hole they cannot see.
     */
    const h = health({ ...OK, degraded: 1, open: [1], counts: { high: 1, medium: 0, low: 0 } });
    expect(h.line).toMatch(/stopped/i);
  });

  it('counts one thing as one, in every state that counts', () => {
    expect(health({ ...OK, degraded: 1 }).note).toBe('1 watcher has stopped itself');
    expect(health({ ...OK, open: [1], counts: { high: 1, medium: 0, low: 0 } }).line).toMatch(/^1 thing needs you today/);
    expect(health({ ...OK, open: [1], counts: { high: 0, medium: 1, low: 0 } }).note).toBe('1 thing is open');
  });

  it('gives every state a verdict, a note, a line and a colour', () => {
    // The card renders all four unconditionally; a state missing one would
    // render the previous state's text beside the new state's colour.
    const states = [
      OK,
      { ...OK, degraded: 1 },
      { ...OK, watching: 0 },
      { ...OK, everRan: false },
      { ...OK, open: [1], counts: { high: 1, medium: 0, low: 0 } },
      { ...OK, open: [1], counts: { high: 0, medium: 1, low: 0 } },
    ];
    for (const s of states) {
      const h = health(s);
      for (const k of ['cls', 'icon', 'verdict', 'note', 'line', 'sub']) {
        expect(h[k], k + ' for ' + JSON.stringify(s)).toBeTruthy();
      }
    }
  });
});

describe('the banner is drawn from what the page was actually told', () => {
  it('hides itself when the findings could not be read', () => {
    // A verdict over a failed request is the worst possible combination:
    // "everything looks good" is then a statement about nothing.
    expect(SRC).toContain('if (el.hero) el.hero.hidden = true;');
  });

  it('greets with a name the shell already resolved, or with none', () => {
    // No second lookup, and an empty greeting rather than a wrong one.
    expect(SRC).toContain("document.getElementById('ch-who-name')");
    expect(SRC).toContain("partOfDay() + (name ? ', ' + name : '')");
  });

  it('says what is watched in business areas, not only in watchers', () => {
    expect(SRC).toMatch(/business area/);
    expect(SRC).toContain("(body.categories || []).length");
  });

  it('does not repeat the verdict as the list heading', () => {
    // Two headlines saying the same thing in different words is how a screen
    // stops being read.
    expect(SRC).toContain("el.title.textContent = 'What needs your attention';");
  });

  it('leads somewhere from the health card, in every state', () => {
    expect(SRC).toContain("window.svargShowPanel('agents')");
  });
});
