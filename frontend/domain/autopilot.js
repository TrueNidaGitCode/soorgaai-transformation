/**
 * Svarg — the journey drives itself
 *
 * Asked for: once an objective is entered, the whole build should run without
 * being clicked through. Cob generates and approves, Aria chooses a model and
 * prepares the environment, Eame builds, Yusu ships. The one decision left to
 * a person is on Arth -- whether to work from their own data or from generated
 * samples -- and once that is made, the rest runs on.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * A stage moves on when its work FINISHED HERE, IN THIS VISIT -- never merely
 * because the work is done. A blueprint approved last week and opened again
 * to be read stays on Cob; a customer who clicks back to Aria in the journey
 * to look at the environment is not dragged forward again. So each stage
 * calls this from the end of its own action -- the approval, the prepare, the
 * batch, the build, the checks -- and never from a render.
 *
 * ── How it moves ────────────────────────────────────────────────────────────
 *
 * By pressing the stage's own button. The navigation buttons carry data-goto,
 * and the delegated handler in blueprintGenerate.js turns that into
 * revealStage(), so an automatic move and a click are the same path: the next
 * stage loads, reports ready, and only then appears. Pressing the button also
 * means the move obeys every gate the button does -- a disabled button is not
 * pressed, and a hidden one is not either.
 *
 * Two more things stop it. The button's screen must be the one on screen: a
 * sample batch takes a minute, and someone who went back to Cob to read while
 * it ran must not be yanked to Eame when it finishes. And a beat is left
 * before the press, so the finished state is seen before the next one
 * replaces it.
 */

const BEAT_MS = 900;

/**
 * Press `buttonId` after a beat, if it is still on screen and still enabled.
 * Returns whether a press was scheduled.
 */
export function press(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return false;
  setTimeout(() => {
    const screen = btn.closest('.screen');
    const onScreen = !!screen && screen.style.display !== 'none';
    if (!onScreen || btn.disabled || btn.style.display === 'none') return;
    btn.click();
  }, BEAT_MS);
  return true;
}
