/**
 * The chat pane belongs to one screen, and leaves when that screen does.
 *
 * ── What was reported ──────────────────────────────────────────────────────
 *
 * Refresh the delivered application and it lands on Home, correctly — with
 * "Try asking", three example questions and "Built with Svarg" still sitting
 * at the bottom of the findings board, signing a screen they are not part of.
 *
 * ── Why it survived the last fix ───────────────────────────────────────────
 *
 * Two separate causes, one symptom.
 *
 * The byline was never in the set of things the chat hides. chatParts() took
 * the log, the composer, its hint and the try-asking strip; .ch-foot reads as
 * the page's footer and is really the bottom of the chat pane, so it stayed.
 *
 * The examples came back on their own. app.js fills #ch-examples after the
 * page has already settled on Home, and a MutationObserver re-ran a sync that
 * decided visibility from "is there a welcome message and are there examples"
 * — two questions that are both true on Home. Whichever screen was open never
 * entered into it, so the strip unhid itself after the fact.
 *
 * Both halves are run here rather than read: the real chatParts and the real
 * sync are lifted out of the shell and executed against a stub document, so
 * the test exercises the code that ships.
 */
import fs from 'fs';
import { describe, it, expect } from 'vitest';

const HTML = fs.readFileSync(new URL('../eame-template/frontend/index.html', import.meta.url), 'utf8');

/** A balanced block of source starting at `from`, lifted whole. */
function balanced(from) {
  let depth = 0;
  for (let i = HTML.indexOf('{', from); i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) return HTML.slice(from, i + 1);
  }
  throw new Error('unbalanced block at ' + from);
}

function liftFunction(decl) {
  const at = HTML.indexOf(decl);
  if (at < 0) throw new Error('not found in index.html: ' + decl);
  return balanced(at);
}

/** An element as much as these two functions ever ask of one. */
const node = (extra = {}) => ({
  hidden: false,
  classList: { toggle() {} },
  querySelector: () => null,
  children: [],
  ...extra,
});

describe('leaving the chat takes the whole chat with it', () => {
  const src = liftFunction('function chatParts(visible) {');

  /** The shipped chatParts, wired to a stub document. */
  function harness() {
    const ids = {
      'ch-log': node(),
      'ch-form': node(),
      'ch-tryask': node(),
    };
    const hint = node();
    const foot = node();
    const doc = {
      getElementById: (id) => ids[id] || null,
      querySelector: (sel) => (sel === '.ch-compose__hint' ? hint
        : sel === '.ch-main .ch-foot' ? foot : null),
    };
    const win = {};
    // eslint-disable-next-line no-new-func
    const make = new Function('document', 'window', `
      var chatVisible = false;
      ${src}
      window.svargChatShowing = function () { return chatVisible; };
      return chatParts;`);
    return { chatParts: make(doc, win), win, parts: { ...ids, hint, foot } };
  }

  it('hides the byline along with the log, the composer and its hint', () => {
    const { chatParts, parts } = harness();
    chatParts(false);
    for (const [name, el] of Object.entries(parts)) {
      expect(el.hidden, name + ' should be hidden off the chat').toBe(true);
    }
  });

  it('brings all of them back together', () => {
    const { chatParts, parts } = harness();
    chatParts(false);
    chatParts(true);
    for (const [name, el] of Object.entries(parts)) {
      expect(el.hidden, name + ' should be visible on the chat').toBe(false);
    }
  });

  it('remembers which screen is open, for whatever asks later', () => {
    const { chatParts, win } = harness();
    expect(win.svargChatShowing()).toBe(false);
    chatParts(true);
    expect(win.svargChatShowing()).toBe(true);
    chatParts(false);
    expect(win.svargChatShowing()).toBe(false);
  });

  it('reaches the chat pane’s byline, not the front door’s', () => {
    // The door has a byline of its own. An unscoped '.ch-foot' would take
    // whichever comes first in the markup, which is not this one.
    expect(src).toContain(".querySelector('.ch-main .ch-foot')");
  });
});

describe('the try-asking strip cannot unhide itself on another screen', () => {
  const at = HTML.indexOf('sync = function () {');
  expect(at, 'sync not found in index.html').toBeGreaterThan(-1);
  const src = balanced(at);

  /** The shipped sync, with the chat showing or not. */
  function run({ showing, welcome = true, examples = 1 }) {
    const tryask = node({ hidden: true });
    const log = node({ querySelector: (s) => (s === '.ch-welcome' && welcome ? node() : null) });
    const main = node();
    const ex = node({ children: new Array(examples).fill(node()) });
    const win = { svargChatShowing: () => showing };
    // eslint-disable-next-line no-new-func
    new Function('log', 'main', 'tryask', 'examples', 'window', `var ${src}; sync();`)
      (log, main, tryask, ex, win);
    return tryask;
  }

  it('stays hidden when app.js fills the examples while Home is open', () => {
    // The reported bug, exactly: a welcome message and three examples, and
    // the customer is looking at the findings board.
    expect(run({ showing: false, welcome: true, examples: 3 }).hidden).toBe(true);
  });

  it('shows on the chat, which is the whole point of it', () => {
    expect(run({ showing: true, welcome: true, examples: 3 }).hidden).toBe(false);
  });

  it('still goes once the conversation has begun', () => {
    // app.js removes .ch-welcome on the first turn.
    expect(run({ showing: true, welcome: false, examples: 3 }).hidden).toBe(true);
  });

  it('does not show an empty strip', () => {
    expect(run({ showing: true, welcome: true, examples: 0 }).hidden).toBe(true);
  });
});

describe('the screen that opens on a refresh', () => {
  it('puts the chat away before showing the board', () => {
    /*
     * A reload inside the same tab session goes straight to the application
     * rather than back through the front door, and lands on the board. The
     * chat parts have to be put away on that path specifically — it does not
     * go through showPanel.
     */
    const at = HTML.indexOf("if (which === 'app') {");
    expect(at).toBeGreaterThan(-1);
    const block = balanced(at);
    expect(block).toContain('chatParts(false)');
    expect(block).toContain("new CustomEvent('svarg:findings-open')");
  });

  it('is the only screen that shows the chat', () => {
    // Every panel change goes through one call, so a panel added later
    // cannot forget to put the chat away.
    expect(HTML).toContain("window.svargChatParts(which === 'ask');");
  });
});
