/**
 * Svarg — the rail
 *
 * One navigation, the same on every page a signed-in person sees:
 *
 *   Home               /cob.html
 *   Blueprints         a list of yours, each opening on the Cob stage
 *   Knowledge sources  /knowledge-sources/
 *   Privacy            /privacy/
 *
 * Four pages used to draw four different things in this space. The home page
 * had a rail with a hamburger that did nothing, the workspace built its own
 * rail with Help and Settings under a spacer, the privacy page kept a 252px
 * text sidebar with Pricing in it, and Knowledge Sources had no rail at all —
 * only a "← Home" in its top bar. Clicking between them changed how many
 * icons there were, and the same icon did different things: "Blueprints" was
 * a list on the home page and a link to the current page in the workspace.
 *
 * Now the rail is one element built by one function. Every page loads this
 * module and rail.css and gets the same four controls, in the same order, at
 * the same width, with the page it is on lit — and the page's own layout
 * starts at --rail, which rail.css defines and sets to 0 when the rail hides.
 */

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';

/** The workspace reads this to know which blueprint to open. */
const OPEN_BLUEPRINT_KEY = 'soorgaai_open_blueprint_id';

const ITEMS = [
  { key: 'home',       label: 'Home',              href: '/cob.html',
    d: 'M3 10.5 12 3l9 7.5 M5 9.6V21h14V9.6' },
  { key: 'blueprints', label: 'Blueprints',        flyout: true,
    d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6' },
  { key: 'knowledge',  label: 'Knowledge sources', href: '/knowledge-sources/knowledge-sources.html',
    d: 'M3 3v18h18 M7 15l4-5 3 3 5-7' },
  { key: 'privacy',    label: 'Privacy',           href: '/privacy/privacy.html',
    d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
];

/** Which item is the page we are on. The workspace is where blueprints live. */
function currentKey(pathname = window.location.pathname) {
  if (pathname.startsWith('/domain/'))            return 'blueprints';
  if (pathname.startsWith('/knowledge-sources/')) return 'knowledge';
  if (pathname.startsWith('/privacy/'))           return 'privacy';
  return 'home';
}

function icon(d) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, n) {
  const str = (s || '').trim();
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/**
 * Builds the rail and the Blueprints flyout, once. Safe to call again.
 */
export function mountRail() {
  if (document.querySelector('.sv-rail')) return;

  const on = currentKey();

  const rail = document.createElement('nav');
  rail.className = 'sv-rail';
  rail.setAttribute('aria-label', 'Main');
  rail.innerHTML = ITEMS.map(it => {
    const lit = it.key === on ? ' sv-rail__btn--on' : '';
    const current = it.key === on ? ' aria-current="page"' : '';
    return it.flyout
      ? `<button type="button" id="sv-bps-btn" class="sv-rail__btn${lit}" aria-label="${it.label}" title="${it.label}"
           aria-expanded="false" aria-controls="sv-bps"${current}>${icon(it.d)}</button>`
      : `<a href="${it.href}" class="sv-rail__btn${lit}" aria-label="${it.label}" title="${it.label}"${current}>${icon(it.d)}</a>`;
  }).join('');

  // The objectives already written, listed from the rail rather than taking
  // a permanent column. Each one opens its blueprint on the Cob stage.
  const panel = document.createElement('div');
  panel.className = 'sv-bps';
  panel.id = 'sv-bps';
  panel.hidden = true;
  panel.innerHTML = '<p class="sv-bps__head">Your blueprints</p><div class="sv-bps__list" id="side-blueprints"></div>';

  document.body.append(rail, panel);
  wireFlyout(rail.querySelector('#sv-bps-btn'), panel);
  loadBlueprints(panel.querySelector('#side-blueprints'));
}

/**
 * The flyout opens beside its button, closes on a click anywhere else and on
 * Escape. A panel that only closes by pressing the same icon again is a panel
 * people leave open and then work around.
 *
 * Open is its own class, separate from "this is the page you are on": in the
 * workspace the Blueprints button is both, and closing the list must not
 * unlight the page.
 */
function wireFlyout(btn, panel) {
  const setOpen = (open) => {
    if (open) panel.style.top = Math.round(btn.getBoundingClientRect().top) + 'px';
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('sv-rail__btn--open', open);
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  });
}

/**
 * Signed in  → your blueprints; clicking one opens it in the workspace.
 * Guest      → the guest preview blueprint if one exists.
 */
async function loadBlueprints(wrap) {
  const token   = localStorage.getItem('token');
  const guestId = localStorage.getItem('soorgaai_guest_id');

  const empty = (msg) => { wrap.innerHTML = `<p class="sv-bps__empty">${esc(msg)}</p>`; };

  // A failure is not an absence. Reporting a dead backend or an expired
  // session as "No blueprints yet" reads as data loss — it sent someone
  // hunting for a blueprint that was in the database the whole time, while
  // the only real problem was that nothing was listening on the API port.
  // Same slot in the list, deliberately different voice.
  const problem = (msg) => { wrap.innerHTML = `<p class="sv-bps__error">${esc(msg)}</p>`; };

  const entry = (bp, label, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sv-bps__bp' + (bp.status === 'generating' ? ' sv-bps__bp--generating' : '');
    btn.title = bp.businessObjective || '';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  };

  try {
    if (token) {
      const resp = await fetch(`${API_BASE()}/strategy-canvas/transformation-blueprints`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        problem(resp.status === 401
          ? 'Your session has expired — sign in again to see your blueprints.'
          : 'Could not load your blueprints. Please try again.');
        return;
      }
      const { blueprints } = await resp.json();
      if (!blueprints?.length) { empty('No blueprints yet.'); return; }

      wrap.innerHTML = '';
      blueprints.forEach(bp => {
        wrap.appendChild(entry(bp, (bp.status === 'generating' ? '⋯ ' : '') + truncate(bp.businessObjective, 46), () => {
          sessionStorage.setItem(OPEN_BLUEPRINT_KEY, bp._id);
          // ?view=cob so a picked blueprint opens on the Cob stage. Without
          // it, an already-approved blueprint jumps straight to the
          // workspace, skipping the journey the user picked it to look at.
          window.location.href = '/domain/domain.html?view=cob';
        }));
      });
    } else if (guestId) {
      const resp = await fetch(`${API_BASE()}/guest/blueprint/${encodeURIComponent(guestId)}`);
      // 404 is the honest empty case here: a guestId in localStorage whose
      // preview has since been claimed or never existed. Any other status is
      // a fault and should say so.
      if (resp.status === 404) { empty('No blueprints yet — describe your project to start.'); return; }
      if (!resp.ok) { problem('Could not load your preview blueprint. Please try again.'); return; }
      const bp = await resp.json();
      wrap.innerHTML = '';
      wrap.appendChild(entry(bp, 'Preview — ' + truncate(bp.businessObjective, 38), () => {
        window.location.href = '/domain/domain.html';
      }));
    } else {
      empty('No blueprints yet — describe your project to start.');
    }
  } catch {
    // fetch() rejects only when the request never completed at all — the
    // API is down, or the browser refused it. Never an empty account.
    problem('Could not reach the server — check that the backend is running.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountRail);
} else {
  mountRail();
}
