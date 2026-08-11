/**
 * SoorgaAI — Automotive industry page
 * Shared nav wiring, both reveal animations (layered knowledge base,
 * then the before/after case study), and both CTAs into Cob.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireLayersReveal();
  wireCaseReveal();

  document.getElementById('mkt-cta-automotive')?.addEventListener('click', () => {
    window.CTARouter?.routeToWorkspace();
  });
  document.getElementById('mkt-cta-case')?.addEventListener('click', () => {
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

// Plays once, the first time the comparison scrolls into view. "After"
// items are delayed further than "Before" items (see the transition-delay
// values in marketing.css), so the two columns visibly reveal in sequence
// rather than all at once.
function wireCaseReveal() {
  const compare = document.getElementById('case-compare');
  if (!compare) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    compare.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        compare.classList.add('is-visible');
        observer.unobserve(compare);
      }
    });
  }, { threshold: 0.2 });
  observer.observe(compare);
}
