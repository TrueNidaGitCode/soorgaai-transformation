const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1200);

const flat = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const shown = el => !!el && el.offsetParent !== null;

const out = {
  paused:        shown(document.getElementById('opp-paused')),
  ordinaryBar:   shown(document.getElementById('opp-progress')),
  guestBanner:   shown(document.getElementById('domain-guest-banner')),
  loginBtn:      shown(document.getElementById('opp-paused-login')),
  count:         flat(document.getElementById('opp-paused-count')),
  next:          flat(document.getElementById('opp-paused-next')),
  barLabel:      flat(document.getElementById('opp-progress-label')),
  winner:        flat(document.getElementById('opp-winner-name')),
  navUsername:   flat(document.getElementById('domain-username')),
  logoutText:    flat(document.getElementById('domain-logout')),
  approveOn:     !document.getElementById('opp-approve-btn')?.disabled,
  cssRules:      [...document.styleSheets].reduce((n, s) => {
                   try { return n + s.cssRules.length; } catch { return n; } }, 0),
  errors:        window.__errs || [],
};
document.title = 'CHECK ' + JSON.stringify(out);
