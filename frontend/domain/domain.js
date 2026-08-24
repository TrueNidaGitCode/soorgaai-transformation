/**
 * Svarg — Domain Page Bootstrap
 *
 * Lightweight coordinator: validates auth and sets the page title.
 * Heavy lifting is split between canvas.js and chat.js.
 */

// Auth guard runs immediately (before DOMContentLoaded) to prevent flash
(function guardAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    const domainId = new URLSearchParams(window.location.search).get('domain') || 'ai-strategy';
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${encodeURIComponent(domainId)}`;
  }
})();
