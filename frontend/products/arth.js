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
  wireSlmCompareReveal();
});

// Plays once per grid, the first time each capability grid scrolls into
// view — each card fades/rises in with a stagger (driven by the --i
// custom property set on each card). The page now has more than one of
// these grids (the sovereignty explanation and the model explanation),
// so every grid gets its own independent observer.
function wireCapabilitiesReveal() {
  const grids = document.querySelectorAll('.mkt-product-capabilities__grid');
  if (!grids.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  grids.forEach((grid) => {
    if (reduceMotion) {
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
  });
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

// Plays once, the first time the model size/precision comparison scrolls
// into view — the general ring settles first, the specialized ring
// settles in on top of it 0.3s later (via CSS transition-delay).
function wireSlmCompareReveal() {
  const compare = document.getElementById('arth-slm-compare');
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
  }, { threshold: 0.3 });
  observer.observe(compare);
}
