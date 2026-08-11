/**
 * SoorgaAI — Automotive case study page
 * Shared nav wiring, the before/after reveal animation, and the
 * closing CTA into Cob.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireCaseReveal();

  document.getElementById('mkt-cta-case')?.addEventListener('click', () => {
    window.CTARouter?.routeToWorkspace();
  });
});

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
