/**
 * SoorgaAI — /try (legacy redirect stub)
 *
 * Generation now starts directly from the landing-page prompt and renders
 * live in /domain/domain.html for both guests and signed-in users. This page
 * only remains so old links and post-login redirectAfterLogin values keep
 * working.
 */

document.addEventListener('DOMContentLoaded', () => {
  const token   = localStorage.getItem('token');
  const guestId = localStorage.getItem('soorgaai_guest_id');

  if (token || guestId) {
    // domain.html handles claim-on-login, guest mode, and live rendering
    window.location.replace('/domain/domain.html');
  } else {
    window.location.replace('/');
  }
});
