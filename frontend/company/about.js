/**
 * SoorgaAI — About Us page
 * Shared nav wiring + the "what we believe" list reveal animation.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireBeliefsReveal();
});

// Plays once, the first time the beliefs list scrolls into view — each
// item fades/rises in with a stagger (driven by the --i custom property
// already set on each <li>).
function wireBeliefsReveal() {
  const list = document.getElementById('beliefs-list');
  if (!list) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    list.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        list.classList.add('is-visible');
        observer.unobserve(list);
      }
    });
  }, { threshold: 0.3 });
  observer.observe(list);
}
