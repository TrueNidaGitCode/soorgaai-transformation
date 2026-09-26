/**
 * Svarg — the admin home.
 *
 * ── What this replaced ─────────────────────────────────────────────────────
 *
 * Five hundred and sixty lines that created, listed, edited and deleted
 * "signals" — city-level AI infrastructure notes for an assessment product
 * that no longer exists. Every request went to CONFIG.ADMIN.CREATE_SIGNAL,
 * GET_ALL_SIGNALS or DELETE_SIGNAL, none of which are defined in config.js,
 * against routes the server does not mount. The page had been dead long
 * enough that nobody noticed it was dead.
 *
 * ── What is left ───────────────────────────────────────────────────────────
 *
 * A way in and a way out. The guard is the same one every admin page uses,
 * and the log out is the same four keys: leaving role and username behind on
 * a shared machine shows the next person an admin shell that then fails every
 * request, which looks like a broken product rather than a finished logout.
 */

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    localStorage.setItem('redirectAfterLogin', '/admin/dashboard.html');
    window.location.href = '/admin/login.html';
    return;
  }

  const who = document.getElementById('ad-user');
  if (who) who.textContent = localStorage.getItem('username') || 'admin';

  document.getElementById('ad-logout')?.addEventListener('click', () => {
    ['token', 'role', 'username', 'redirectAfterLogin'].forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* private mode */ }
    });
    window.location.href = '/admin/login.html';
  });
});
