/**
 * SoorgaAI — Arth (Technology & Infrastructure) product page
 * Shared nav wiring + the capability cards and sovereign-stack reveal animations.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireCapabilitiesReveal();
  wireStackReveal();
  wireGpuPicker();
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

// Click-to-select GPU tier cards — only one active at a time, updating the
// "Selected — X" summary line so the picker feels like real self-serve
// inventory rather than a static spec sheet. All card/spec text is
// authored in the page's own markup (data-spec attributes), never derived
// from user input, so building the summary via innerHTML here is safe.
function wireGpuPicker() {
  const picker = document.getElementById('arth-gpu-picker');
  if (!picker) return;

  const selectedLine = document.getElementById('arth-gpu-selected');
  const cards = picker.querySelectorAll('.mkt-gpu-card');

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      cards.forEach((c) => c.classList.remove('is-active'));
      card.classList.add('is-active');
      if (selectedLine) {
        const name = card.querySelector('.mkt-gpu-card__name')?.textContent || '';
        const spec = card.dataset.spec || '';
        selectedLine.innerHTML = `Selected — <strong>${name}</strong>: ${spec}`;
      }
    });
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    picker.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        picker.classList.add('is-visible');
        observer.unobserve(picker);
      }
    });
  }, { threshold: 0.25 });
  observer.observe(picker);
}
