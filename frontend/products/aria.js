/**
 * Svarg — Aria (Data Readiness) product page
 * Shared nav wiring + the capability cards reveal animation.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireCapabilitiesReveal();
});

// Plays once, the first time the capability grid scrolls into view —
// each card fades/rises in with a stagger (driven by the --i custom
// property set on each card).
function wireCapabilitiesReveal() {
  const grid = document.querySelector('.mkt-product-capabilities__grid');
  if (!grid) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    grid.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        grid.classList.add('is-visible');
        observer.unobserve(grid);
      }
    });
  }, { threshold: 0.25 });
  observer.observe(grid);
}
