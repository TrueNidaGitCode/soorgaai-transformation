const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1200);

const flat = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const shown = el => !!el && el.offsetParent !== null;

const out = {
  paused:        shown(document.getElementById('opp-paused')),
  ordinaryBar:   shown(document.getElementById('opp-progress')),
  guestBanner:   shown(document.getElementById('domain-guest-banner')),
  loginBtn:      shown(document.getElementById('opp-paused-login')),
  restartBtn:    shown(document.getElementById('opp-paused-restart')),
  restartText:   flat(document.getElementById('opp-paused-restart')),
  // Not clicked on purpose: the handler navigates, and this probe reports
  // through document.title — clicking destroyed the page before the result
  // could be read, and every state came back "probe never ran".
  count:         flat(document.getElementById('opp-paused-count')),
  next:          flat(document.getElementById('opp-paused-next')),
  barLabel:      flat(document.getElementById('opp-progress-label')),
  winner:        flat(document.getElementById('opp-winner-name')),
  winnerWhy:     flat(document.getElementById('opp-winner-why')),
  winnerLabel:   flat(document.getElementById('opp-winner-label')),
  others:        [...document.querySelectorAll('#opp-others .rp-others-item__name')].map(e => flat(e)),
  contentShown:  shown(document.getElementById('opp-content')),
  loadingShown:  shown(document.getElementById('opp-loading')),
  errorText:     flat(document.getElementById('opp-error')),
  navUsername:   flat(document.getElementById('domain-username')),
  logoutText:    flat(document.getElementById('domain-logout')),
  approveOn:     !document.getElementById('opp-approve-btn')?.disabled,
  // The value has to come before the ask. Document order, not pixels — a
  // screenshot cannot tell a deliberate order from a lucky one.
  // The pause now leads: it sits directly under the heading, above the
  // recommendation. 4 = DOCUMENT_POSITION_FOLLOWING.
  pauseAboveValue: (() => {
    const value = document.querySelector('.rp-winner-card');
    const pause = document.getElementById('opp-paused');
    if (!value || !pause) return null;
    return !!(pause.compareDocumentPosition(value) & 4);
  })(),
  pauseAboveOthers: (() => {
    const pause = document.getElementById('opp-paused');
    const others = document.getElementById('opp-others-wrap');
    if (!pause || !others) return null;
    return !!(pause.compareDocumentPosition(others) & 4);
  })(),
  // Height, because "make the box thin" is a requirement and an unmeasured
  // one drifts back the first time someone adds a line to it.
  pauseHeight: (() => {
    const p = document.getElementById('opp-paused');
    return p ? Math.round(p.getBoundingClientRect().height) : null;
  })(),
  // What a 1366x768 laptop actually shows without scrolling.
  pauseTop: (() => {
    const p = document.getElementById('opp-paused');
    return p ? Math.round(p.getBoundingClientRect().top) : null;
  })(),
  othersShown: shown(document.getElementById('opp-others-wrap')),
  cssRules:      [...document.styleSheets].reduce((n, s) => {
                   try { return n + s.cssRules.length; } catch { return n; } }, 0),
  errors:        window.__errs || [],
};
document.title = 'CHECK ' + JSON.stringify(out);
