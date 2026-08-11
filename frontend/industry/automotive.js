/**
 * SoorgaAI — Automotive industry page
 * Shared nav wiring + this page's single CTA.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();

  document.getElementById('mkt-cta-automotive')?.addEventListener('click', () => {
    window.CTARouter?.routeToWorkspace();
  });
});
