/**
 * Svarg — CTA Router
 * Auth-aware routing for the "Generate My AI Roadmap" entry point.
 *
 * Anonymous user  → /cob.html (landing prompt box — generation starts there)
 * Authenticated   → /domain/domain.html (their blueprint)
 */

window.CTARouter = {
  routeToWorkspace() {
    const token = localStorage.getItem('token');
    window.location.href = token ? '/domain/domain.html' : '/cob.html';
  }
};
