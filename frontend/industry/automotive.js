/**
 * SoorgaAI — Automotive industry page
 * Shared nav wiring, this page's CTA, and the layered-knowledge-base
 * reveal animation.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireLayersReveal();

  document.getElementById('mkt-cta-automotive')?.addEventListener('click', () => {
    window.CTARouter?.routeToWorkspace();
  });
});

// Plays once, the first time the layer stack scrolls into view — each
// layer and the final "Your Blueprint" card fade/rise in with a stagger
// (driven by the --i custom property already set on each element).
function wireLayersReveal() {
  const stack = document.getElementById('layers-stack');
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
  }, { threshold: 0.25 });
  observer.observe(stack);
}
