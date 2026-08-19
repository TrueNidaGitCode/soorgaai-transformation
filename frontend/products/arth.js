/**
 * SoorgaAI — Arth (Technology & Infrastructure) product page
 * Shared nav wiring + the capability cards and sovereign-stack reveal animations.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireCapabilitiesReveal();
  wireStackReveal();
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

// Plays once, the first time the sovereign-stack diagram scrolls into
// view — layers rise in bottom-to-top (Compute, then Model, then
// Application) via the --i delay set on each layer, regardless of their
// top-to-bottom order in the markup, so the reveal reads as "sovereignty
// is built up from the ground."
function wireStackReveal() {
  const stack = document.getElementById('arth-stack3');
  if (!stack) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stack.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        stack.classList.add('is-visible');
        observer.unobserve(stack);
      }
    });
  }, { threshold: 0.3 });
  observer.observe(stack);
}
