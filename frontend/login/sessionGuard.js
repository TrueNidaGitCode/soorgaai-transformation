/**
 * SoorgaAI — Session Guard
 *
 * Shared session-expiry handler for pages that don't load the full auth.js
 * dashboard module (domain.html, workspace.html). Loaded as a plain script
 * so it's available as a global to both classic and ES module scripts on
 * the page.
 *
 * Call this wherever a fetch comes back 401/403 so an expired session is
 * never silently confused with "no data yet" — the user is told what
 * happened and sent home instead of left in a partial/confusing screen.
 */
function handleSessionExpired() {
  // Guest preview: there is no session to expire — a 401 just means the
  // action needs an account. Nudge to log in without kicking them out.
  if (!localStorage.getItem('token') && localStorage.getItem('soorgaai_guest_id')) {
    alert('Log in to use this feature and save your work.');
    return;
  }

  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('userId');
  alert('Your session has expired. Please log in again.');
  window.location.href = '/index.html';
}
window.handleSessionExpired = handleSessionExpired;
