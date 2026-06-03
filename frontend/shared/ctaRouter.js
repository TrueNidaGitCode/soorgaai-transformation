/**
 * SoorgaAI — CTA Router
 * Auth-aware routing for the "Generate My AI Roadmap" entry point.
 *
 * Anonymous user  → /login/login.html?redirect=/platform/platform.html
 * Authenticated   → /platform/platform.html
 *
 * Trusts the platform page's own auth guard to handle expired tokens.
 * No API call on this path — fast redirect.
 */

window.CTARouter = {
  routeToWorkspace() {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login/login.html?redirect=/platform/platform.html';
    } else {
      window.location.href = '/platform/platform.html';
    }
  }
};
