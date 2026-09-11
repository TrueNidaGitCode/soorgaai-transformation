/**
 * Svarg — the workspace frame
 *
 * The redesign is mostly CSS over markup that already exists. This adds the
 * three things the markup does not have, once, for all five screens:
 *
 *   the icon rail          there was no persistent navigation at all
 *   the role under each    "Arth" tells a first-time user nothing; "Your
 *   stage                  Preparer" tells them what happens next
 *   the character's glyph  replacing the step number, because five products
 *                          people are meant to learn by name are not "step 3"
 *
 * Done here rather than in domain.html because the journey markup is repeated
 * once per screen — five copies, each with a different active step. Editing all
 * of them by hand to add a subtitle is five chances to get one wrong.
 */

/**
 * Who each character is.
 *
 * ── The roles Arth and Aria are given here ────────────────────────────────
 *
 * The design that prompted this labelled Arth "Your Provisioner" and Aria
 * "Your Preparer", which is the wrong way round. Arth is Data Readiness — she
 * prepares data. Aria is Technology & Infrastructure — it provisions compute
 * and models. The marketing site already publishes the sequence as
 * Define → Prepare → Provision → Build → Adopt, and the product pages say so
 * too, so the labels follow the product rather than the mock.
 */
const CHARACTERS = {
  cob:  { role: 'Your Planner',     glyph: 'M12 3a6 6 0 0 0-3.6 10.8V17h7.2v-3.2A6 6 0 0 0 12 3z M9.6 20h4.8' },
  aria: { role: 'Your Preparer',    glyph: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6' },
  arth: { role: 'Your Provisioner', glyph: 'M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z M12 3.2v17.6 M4 7.6l8 4.4 8-4.4' },
  eame: { role: 'Your Builder',     glyph: 'M4 20h16 M6 20V9l6-4 6 4v11 M10 20v-5h4v5' },
  yusu: { role: 'Your Adopter',     glyph: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2.5 20a6.5 6.5 0 0 1 13 0 M17 11.5a2.5 2.5 0 1 0 0-5 M17.5 20a6 6 0 0 0-2-4.5' },
};

const RAIL = [
  { href: '/cob.html',                                     label: 'Start',
    d: 'M3 10.5 12 3l9 7.5 M5 9.6V21h14V9.6' },
  { href: '/domain/domain.html',                           label: 'Blueprint', current: true,
    d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6' },
  { href: '/knowledge-sources/knowledge-sources.html',     label: 'Knowledge sources',
    d: 'M3 3v18h18 M7 15l4-5 3 3 5-7' },
  { href: '/privacy/privacy.html',                         label: 'Privacy',
    d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
];

const FOOT = [
  { href: '/company/contact-us.html', label: 'Help',
    d: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.7-2.6 2.7 M12 17h.01' },
  { href: '/profile-setup/profile.html', label: 'Settings',
    d: 'M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z' },
];

function icon(d, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/** The rail. Built once and shared by every screen, because it is fixed. */
function buildRail() {
  if (document.querySelector('.ws-rail')) return;
  const rail = document.createElement('nav');
  rail.className = 'ws-rail';
  rail.setAttribute('aria-label', 'Workspace');

  rail.innerHTML =
    RAIL.map(r => `<a href="${r.href}" class="ws-rail__btn${r.current ? ' ws-rail__btn--on' : ''}"
        aria-label="${r.label}" title="${r.label}"${r.current ? ' aria-current="page"' : ''}>${icon(r.d)}</a>`).join('')
    + '<span class="ws-rail__spacer"></span>'
    + FOOT.map(f => `<a href="${f.href}" class="ws-rail__foot" title="${f.label}">${icon(f.d, 18)}<span>${f.label}</span></a>`).join('');

  document.body.appendChild(rail);
}

/**
 * The role line and the glyph, on every copy of the journey.
 *
 * Idempotent: the screens are shown and hidden rather than rebuilt, but a
 * future render that recreates one would otherwise get two subtitles.
 */
function labelJourney() {
  document.querySelectorAll('.pw-step[data-goto]').forEach(step => {
    const who = CHARACTERS[step.dataset.goto];
    if (!who) return;

    if (!step.querySelector('.pw-step__role')) {
      const role = document.createElement('span');
      role.className = 'pw-step__role';
      role.textContent = who.role;
      step.appendChild(role);
    }

    const node = step.querySelector('.pw-step__node');
    if (node && !node.querySelector('svg')) node.insertAdjacentHTML('beforeend', icon(who.glyph, 19));

    // The label is the product's name, so it is set in the product's case.
    const label = step.querySelector('.pw-step__label');
    if (label) label.textContent = label.textContent.trim().toUpperCase();
  });
}

/**
 * The character's role in its own chat header, and a live dot.
 *
 * The panel said only "Cob". Someone who opened it to ask a question needs to
 * know what this one is for before they know what to ask it.
 */
function labelChatPanels() {
  document.querySelectorAll('.sc-lane[data-screen]').forEach(lane => {
    const who = CHARACTERS[lane.dataset.screen];
    const name = lane.querySelector('.sc-panel__name');
    if (!who || !name || name.querySelector('.sc-panel__role')) return;

    name.insertAdjacentHTML('afterbegin', '');
    const dot = document.createElement('span');
    dot.className = 'sc-panel__dot';
    name.after(dot);

    const role = document.createElement('span');
    role.className = 'sc-panel__role';
    role.textContent = who.role;
    name.appendChild(role);
  });
}

/**
 * The account chip needs one letter for its avatar, and the username element
 * is filled by another module after this runs.
 */
function watchAccountInitial() {
  const el = document.getElementById('domain-username');
  if (!el) return;

  const set = () => {
    const name = (el.textContent || '').trim();
    el.dataset.initial = name ? name[0].toUpperCase() : 'A';
  };
  set();
  new MutationObserver(set).observe(el, { childList: true, characterData: true, subtree: true });
}

/**
 * "Other AI Opportunities" — the alternative to the recommendation.
 *
 * The list it reveals already exists and is populated by the opportunity
 * renderer; it was simply below the fold with a heading nobody scrolled to.
 * The link is hidden until there is actually something in it, because an
 * action that reveals an empty box is worse than no action.
 */
function wireOtherOpportunities() {
  const actions = document.querySelector('.rp-winner-card__actions');
  const wrap = document.getElementById('opp-others-wrap');
  if (!actions || !wrap || document.querySelector('.ws-others-link')) return;

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'ws-others-link';
  link.hidden = true;
  link.innerHTML = 'Other AI Opportunities '
    + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/>'
    + '<polyline points="12 5 19 12 12 19"/></svg>';
  actions.appendChild(link);

  link.addEventListener('click', () => {
    wrap.classList.add('ws-others--shown');
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Shown only once the renderer has put something in the list.
  const sync = () => { link.hidden = !wrap.querySelector('#opp-others')?.children.length; };
  sync();
  new MutationObserver(sync).observe(wrap, { childList: true, subtree: true });
}

/**
 * Continue to Provision, on its own line at the foot of the screen.
 *
 * The same button, moved. Approving IS how the journey advances to Aria, so it
 * is not a property of the opportunity card — it is what you do once you accept
 * what the card says, and it belongs where the eye lands last.
 */
/**
 * The recommendation is approved on arrival.
 *
 * Approve was a button whose only correct answer was yes: the screen has
 * already chosen an opportunity, explained why, and offers nothing to compare
 * it against until you ask. Standing between the reader and the next stage to
 * collect that answer is a step, not a decision.
 *
 * Done by pressing the real button rather than by enabling the one after it,
 * because approval is recorded on the blueprint — Aria and everything past it
 * read opportunityApproval.approved. Flipping the nav button on its own would
 * move somebody forward into a stage that still believed nothing was chosen.
 *
 * Fires once, only when the blueprint is finished and not already approved.
 * The button is hidden either way.
 */
function approveOnArrival() {
  const btn = document.getElementById('opp-approve-btn');
  if (!btn) return;

  const tryOnce = () => {
    // disabled covers both "still generating" and "already approved" — the
    // gate in blueprintGenerate.js sets it for both, which is exactly the
    // condition under which this must not fire.
    if (btn.disabled) return false;
    btn.click();
    return true;
  };

  if (tryOnce()) return;
  // Generation finishes after this runs, so wait for the gate to open.
  const stop = new MutationObserver(() => { if (tryOnce()) stop.disconnect(); });
  stop.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
}

function relabelViewButton() {
  const view = document.getElementById('opp-view-blueprint-btn');
  if (view) {
    view.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
      + ' View Full Blueprint '
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/>'
      + '<polyline points="12 5 19 12 12 19"/></svg>';
  }
}

/**
 * The character panel starts open.
 *
 * Through the launcher, because opening is more than clearing [hidden]:
 * ScreenChat's open() also adds sc-lane--open, which the layout depends on, and
 * appends the character's greeting. Removing the attribute by hand produced a
 * panel that was technically not hidden and visibly not there.
 *
 * On window load rather than DOMContentLoaded. Both modules bootstrap on
 * DOMContentLoaded and this one is registered first, so a deferred task from
 * here still landed before ScreenChat had constructed anything to click.
 */
function openPanelsOnLoad() {
  const open = () => {
    document.querySelectorAll('.sc-lane').forEach(lane => {
      const panel = lane.querySelector('.sc-panel');
      const launcher = lane.querySelector('[data-sc-open]');
      if (panel?.hidden && launcher) launcher.click();
    });
  };
  if (document.readyState === 'complete') open();
  else window.addEventListener('load', open, { once: true });
}

/**
 * The picture beside every hero.
 *
 * One drawing, placed by the shell, rather than the same twenty lines of SVG
 * pasted into five screens — which is how two screens had it, one had it
 * beside the wrong element, and two had none. Decorative and hidden from
 * assistive tech: it says nothing the heading does not.
 */
const HERO_ART = `
  <div class="ae-art" aria-hidden="true">
    <div class="ae-art__glow"></div>
    <svg class="ae-art__svg" viewBox="0 0 320 300" fill="none">
      <g class="ae-art__chips" stroke="currentColor" stroke-width="1.4" opacity=".55">
        <rect x="22"  y="62"  width="58" height="58" rx="12"/>
        <rect x="150" y="18"  width="54" height="54" rx="12"/>
        <rect x="246" y="92"  width="54" height="54" rx="12"/>
      </g>
      <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".8">
        <path d="M40 91l-8 7 8 7 M62 91l8 7-8 7"/>
        <path d="M166 34c6-4 16-4 22 0 M166 44h22 M166 54h22"/>
        <path d="M273 108v22 M262 112c0 6 22 6 22 0 M262 126c0 6 22 6 22 0"/>
      </g>
      <g class="ae-art__stack">
        <path d="M160 232 58 178l102-54 102 54z" opacity=".30"/>
        <path d="M160 204 58 150l102-54 102 54z" opacity=".55"/>
        <path d="M160 176 58 122l102-54 102 54z" opacity=".95"/>
      </g>
    </svg>
  </div>`;

function placeHeroArt() {
  document.querySelectorAll('.ae-stage--hero').forEach(stage => {
    if (!stage.querySelector('.ae-art')) stage.insertAdjacentHTML('beforeend', HERO_ART);
  });
}

function init() {
  buildRail();
  openPanelsOnLoad();
  placeHeroArt();
  labelJourney();
  labelChatPanels();
  watchAccountInitial();
  wireOtherOpportunities();
  relabelViewButton();
  approveOnArrival();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
