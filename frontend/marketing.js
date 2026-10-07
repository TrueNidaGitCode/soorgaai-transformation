/**
 * Svarg — Marketing homepage
 * CTA routing into Cob and the retention hero. The sections below the
 * hero live in homeSections.js. Shared nav wiring (dropdowns, mobile
 * panel, scroll shrink) lives in shared/marketingNav.js, reused by
 * every ".mkt-nav" page.
 */

import { initMarketingNav } from './shared/marketingNav.js';
import { onArrival, outreachRef } from './shared/visitor.js';
import { initHomeSections } from './homeSections.js?v=1';

// Before anything renders. This is the page tracked links point at, so it is
// the only place the ref can be captured — and it was not being captured
// anywhere, which is why every tracked link ever sent attributed nothing.
onArrival();

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireCtaButtons();
  wireRetentionHero();
  initHomeSections();
});

function wireCtaButtons() {
  // Deliberately NOT CTARouter: this button is the marketing entry point to
  // Cob, so it always lands on the objective box. CTARouter sends signed-in
  // users to their existing blueprint instead, which is right for the
  // pricing CTAs but skips the step this button is advertising.
  const ids = ['mkt-cta-hero'];
  ids.forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      // Carry the ref across. localStorage already holds it, so this is
      // belt-and-braces — but a visitor with storage blocked would otherwise
      // lose the attribution entirely at exactly this line.
      const ref = outreachRef();
      window.location.href = ref ? `/cob.html?ref=${encodeURIComponent(ref)}` : '/cob.html';
    });
  });
}

// ── Retention hero ───────────────────────────────────────────────────
//
// The diagram is drawn on a fixed 740 × 600 canvas so the connector
// curves land exactly on the source pills; it is scaled down to fit its
// column rather than reflowed. Below 768px the CSS drops the sources and
// shows the steps panel as a normal block, so the scale is cleared.
//
// The step highlight walks Detect → Learn every 1.6s and loops. Reduced
// motion keeps Detect lit and never starts the timer.
const LH_CANVAS_W = 740;
const LH_STEP_MS = 1600;

function wireRetentionHero() {
  const fit = document.getElementById('lh-diagram-fit');
  const steps = document.querySelectorAll('#lh-steps .lh-step');

  if (fit) {
    const column = fit.parentElement;
    const mobile = window.matchMedia('(max-width: 767px)');
    const rescale = () => {
      if (mobile.matches) { fit.style.removeProperty('--lh-scale'); return; }
      const scale = Math.min(1, column.clientWidth / LH_CANVAS_W);
      fit.style.setProperty('--lh-scale', scale.toFixed(4));
    };
    rescale();
    if ('ResizeObserver' in window) new ResizeObserver(rescale).observe(column);
    else window.addEventListener('resize', rescale);
  }

  if (!steps.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let active = 0;
  setInterval(() => {
    steps[active].classList.remove('is-active');
    active = (active + 1) % steps.length;
    steps[active].classList.add('is-active');
  }, LH_STEP_MS);
}

