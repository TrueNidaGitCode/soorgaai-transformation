/**
 * SoorgaAI — Auth State Helper
 * Shared by navbar CTA and hero CTA.
 * Exposes window.SoorgaAuth so classic scripts and ES modules both reach it.
 */

(function () {
  function isAuthenticated() {
    return !!localStorage.getItem('token');
  }

  /**
   * Returns the href for the primary "Generate My AI Roadmap" CTA.
   * Dynamic assessment is open to all users — no auth gate.
   * Structured for easy upgrade if a premium gate is introduced later.
   */
  function getRoadmapHref() {
    return '/dynamic-assessment/start.html';
  }

  window.SoorgaAuth = { isAuthenticated, getRoadmapHref };
})();
