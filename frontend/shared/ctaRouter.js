/**
 * SoorgaAI — CTA Router
 * Auth-aware routing for the "Generate My AI Roadmap" entry point.
 *
 * Anonymous user  → /login/login.html?redirect=/workspace/workspace.html
 * Authenticated   → /workspace/workspace.html
 *
 * The workspace page handles the profile-setup redirect internally.
 * No API call on this path — fast redirect.
 */

window.CTARouter = {
  routeToWorkspace() {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login/login.html?redirect=/workspace/workspace.html';
    } else {
      window.location.href = '/workspace/workspace.html';
    }
  }
};
