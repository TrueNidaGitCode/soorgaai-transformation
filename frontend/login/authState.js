/**
 * Svarg — Auth State Helper
 * Shared by navbar CTA and hero CTA.
 *
 * Loaded as <script type="module"> — sets window.SoorgaAuth so classic-script
 * consumers (legacy pages) can still call window.SoorgaAuth.getRoadmapHref().
 */

export function isAuthenticated() {
  try {
    return !!localStorage.getItem('token');
  } catch {
    // localStorage unavailable (e.g. private-browsing restrictions)
    return false;
  }
}

/**
 * Returns the href for the primary "Generate My AI Roadmap" CTA.
 * Dynamic assessment is open to all users — no auth gate currently.
 * Structured for easy upgrade if a premium gate is introduced later.
 */
export function getRoadmapHref() {
  return '/dynamic-assessment/start.html';
}

// Set window global so classic-script consumers (e.g. navbar.js) can reach it
/* v8 ignore next 3 */
if (typeof window !== 'undefined') {
  window.SoorgaAuth = { isAuthenticated, getRoadmapHref };
}
