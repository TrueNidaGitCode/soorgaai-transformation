/**
 * Svarg — the rail
 *
 * One navigation, the same on every page a signed-in person sees:
 *
 *   Home               /cob.html
 *   Blueprints         /blueprints/ -- every objective and what became of it
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
 *
 * Blueprints was a flyout listing objectives, and it could only ever be a
 * list of objectives: 280px of rail has no room for what became of one. It
 * is a page now (/blueprints/), which is where the opportunity being built,
 * the address the application runs at, the capabilities added since and the
 * ones still locked can sit together. The rail's job here is the same as for
 * every other item — go there, and light up when you are.
 */

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';

/** The workspace reads this to know which blueprint to open. */
const OPEN_BLUEPRINT_KEY = 'soorgaai_open_blueprint_id';

const ITEMS = [
  { key: 'home',       label: 'Home',              href: '/cob.html',
    d: 'M3 10.5 12 3l9 7.5 M5 9.6V21h14V9.6' },
  { key: 'blueprints', label: 'Blueprints',        href: '/blueprints/blueprints.html',
    d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6' },
  { key: 'knowledge',  label: 'Knowledge sources', href: '/knowledge-sources/knowledge-sources.html',
    d: 'M3 3v18h18 M7 15l4-5 3 3 5-7' },
  { key: 'privacy',    label: 'Privacy',           href: '/privacy/privacy.html',
    d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
];

/** Which item is the page we are on. A blueprint opened in the workspace is
 *  still a blueprint, so /domain/ lights the same control as the list. */
function currentKey(pathname = window.location.pathname) {
  if (pathname.startsWith('/blueprints/'))        return 'blueprints';
  if (pathname.startsWith('/domain/'))            return 'blueprints';
  if (pathname.startsWith('/knowledge-sources/')) return 'knowledge';
  if (pathname.startsWith('/privacy/'))           return 'privacy';
  return 'home';
}

function icon(d) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

/**
 * Builds the rail, once. Safe to call again.
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
    return `<a href="${it.href}" class="sv-rail__btn${lit}" aria-label="${it.label}" title="${it.label}"${current}>${icon(it.d)}</a>`;
  }).join('');

  document.body.append(rail);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountRail);
} else {
  mountRail();
}
