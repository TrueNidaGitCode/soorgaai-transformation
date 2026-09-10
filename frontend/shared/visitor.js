/**
 * Svarg — who arrived, and which link brought them
 *
 * Shared by the marketing homepage (index.html) and the product landing page
 * (cob.html), because a prospect passes through both and the interesting facts
 * are established on the first one.
 *
 * ── Why this had to be shared ───────────────────────────────────────────────
 *
 * Every tracked link points at https://www.svargai.com/?ref=CODE, which serves
 * index.html and marketing.js. The ref capture lived in index.js, which only
 * cob.html loads — and the hero CTA navigates with a bare
 * `location.href = '/cob.html'`, dropping the query string on the way.
 *
 * So the ref was read on a page that never saw it, from a URL that no longer
 * had it. Every tracked link ever sent attributed nothing, and the funnel
 * reported zero clicks for a reason that had nothing to do with the prospects.
 *
 * Storing it in localStorage on arrival is what makes it survive that
 * navigation, which is why capture has to happen on the page people land on.
 */

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';

const OUTREACH_REF_KEY = 'svarg_outreach_ref';
const VISITOR_KEY      = 'svarg_visitor';
const VISIT_SENT_KEY   = 'svarg_visit_sent';

/**
 * The ref from a tracked link, remembered across the visit.
 *
 * Captured on arrival rather than read at submit time, because the prompt box
 * is rarely used on the first pageview — people read, wander, come back — and
 * by then the query string is long gone.
 */
export function captureOutreachRef() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) localStorage.setItem(OUTREACH_REF_KEY, ref.slice(0, 64));
  } catch { /* private mode — attribution is not worth an exception */ }
}

export function outreachRef() {
  try { return localStorage.getItem(OUTREACH_REF_KEY) || ''; } catch { return ''; }
}

/**
 * Called once the ref has been spent on a generation.
 *
 * A ref belongs to one prospect. Leaving it behind would quietly credit the
 * next person on this browser to somebody else's message.
 */
export function clearOutreachRef() {
  try { localStorage.removeItem(OUTREACH_REF_KEY); } catch { /* nothing to do */ }
}

/**
 * A random id for this browser, so someone who returns reads as the same person
 * rather than as a new one.
 *
 * Not a login and not a fingerprint — a random string in localStorage, gone the
 * moment they clear their site data. That is the correct behaviour: a visitor
 * who wants to be anonymous stays anonymous, and they are simply counted again.
 */
export function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = (window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).slice(0, 64);
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch { return ''; }
}

/**
 * Tell the server a person arrived — once per session, not per page view.
 *
 * Without this, a visit that ends without a generated blueprint leaves no trace
 * at all, so "nobody opened the link" and "everybody opened it and bounced"
 * produce an identical empty column. Those two call for opposite fixes.
 *
 * Silent by design, and never awaited. `keepalive` lets it survive the
 * navigation into cob.html, and every failure is swallowed: recording a visit
 * is worth nothing next to the visit itself, and a prospect's first look at the
 * product must not produce a console error.
 */
export function recordVisit() {
  try {
    if (sessionStorage.getItem(VISIT_SENT_KEY)) return;
    sessionStorage.setItem(VISIT_SENT_KEY, '1');
    fetch(`${API_BASE()}/guest/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        visitorId: visitorId(),
        ref: outreachRef(),
        path: window.location.pathname,
      }),
    }).catch(() => { /* deliberately silent */ });
  } catch { /* storage disabled — not worth an exception */ }
}

/** Everything that must happen the moment somebody lands. Safe to call twice. */
export function onArrival() {
  captureOutreachRef();
  recordVisit();
}
