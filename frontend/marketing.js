/**
 * SoorgaAI — Marketing homepage
 * Top-nav dropdown menus, mobile panel toggle, CTA routing into Cob,
 * and the AI maturity journey visualization.
 */

import { MATURITY_STAGES } from './data/maturityStages.js';

document.addEventListener('DOMContentLoaded', () => {
  wireDropdowns();
  wireMobileToggle();
  wireCtaButtons();
  wireNavShrink();
  wireJourneyAnimation();
  wireJourneyClimax();
  wirePricingToggle();
  wirePricingCtas();
});

// ── AI Maturity Journey ──────────────────────────────────────────────
//
// A fixed node/edge graph laid out in four loose "business function"
// zones (top-left, top-right, bottom-left, bottom-right) plus a central
// hub. Each element carries the stage at which it should appear —
// stages 1-3 reveal is deliberately slower (stage-slow) than 4-5
// (stage-fast), which is what makes the AI Alignment -> AI-Fueled
// Enterprise stretch of the sequence feel like it accelerates.
const JOURNEY_NODES = [
  { id: 'n1',  x: 120, y: 140, r: 7, stage: 1 },
  { id: 'n2',  x: 480, y: 120, r: 7, stage: 1 },
  { id: 'n3',  x: 140, y: 460, r: 7, stage: 1 },
  { id: 'n4',  x: 470, y: 480, r: 7, stage: 1 },

  { id: 'n5',  x: 200, y: 90,  r: 6, stage: 2 },
  { id: 'n6',  x: 420, y: 180, r: 6, stage: 2 },
  { id: 'n7',  x: 90,  y: 380, r: 6, stage: 2 },
  { id: 'n8',  x: 380, y: 420, r: 6, stage: 2 },

  { id: 'n9',  x: 300, y: 260, r: 9, stage: 3, hub: true },
  { id: 'n10', x: 230, y: 340, r: 6, stage: 3 },
  { id: 'n11', x: 350, y: 150, r: 6, stage: 3 },

  { id: 'n12', x: 170, y: 220, r: 6, stage: 4 },
  { id: 'n13', x: 420, y: 300, r: 6, stage: 4 },
  { id: 'n14', x: 300, y: 420, r: 6, stage: 4 },

  { id: 'n15', x: 300, y: 60,  r: 6, stage: 5 },
  { id: 'n16', x: 300, y: 540, r: 6, stage: 5 },
];

const JOURNEY_EDGES = [
  // Stage 2 — small local pairs, still fragmented
  { a: 'n1', b: 'n5', stage: 2 },
  { a: 'n2', b: 'n6', stage: 2 },
  { a: 'n3', b: 'n7', stage: 2 },
  { a: 'n4', b: 'n8', stage: 2 },

  // Stage 3 — cross-functional alignment through a shared center
  { a: 'n1', b: 'n9',  stage: 3 },
  { a: 'n2', b: 'n9',  stage: 3 },
  { a: 'n3', b: 'n9',  stage: 3 },
  { a: 'n4', b: 'n9',  stage: 3 },
  { a: 'n9', b: 'n10', stage: 3 },
  { a: 'n9', b: 'n11', stage: 3 },

  // Stage 4 — direct peer mesh, not just routed through the hub
  { a: 'n5',  b: 'n6',  stage: 4 },
  { a: 'n7',  b: 'n8',  stage: 4 },
  { a: 'n1',  b: 'n12', stage: 4 },
  { a: 'n12', b: 'n10', stage: 4 },
  { a: 'n13', b: 'n9',  stage: 4 },
  { a: 'n13', b: 'n4',  stage: 4 },
  { a: 'n14', b: 'n10', stage: 4 },
  { a: 'n14', b: 'n8',  stage: 4 },
  { a: 'n11', b: 'n6',  stage: 4 },
  { a: 'n11', b: 'n2',  stage: 4 },

  // Stage 5 — the ecosystem closes the loop
  { a: 'n15', b: 'n11', stage: 5 },
  { a: 'n15', b: 'n2',  stage: 5 },
  { a: 'n15', b: 'n9',  stage: 5 },
  { a: 'n16', b: 'n14', stage: 5 },
  { a: 'n16', b: 'n10', stage: 5 },
  { a: 'n16', b: 'n9',  stage: 5 },
];

function buildJourneyNetwork(svg) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const byId = {};
  JOURNEY_NODES.forEach((n) => { byId[n.id] = n; });

  // Edges first so node circles render on top of the lines.
  JOURNEY_EDGES.forEach((e) => {
    const a = byId[e.a];
    const b = byId[e.b];
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('class', `mkt-journey__edge ${e.stage <= 3 ? 'stage-slow' : 'stage-fast'}`);
    line.dataset.stage = String(e.stage);
    svg.appendChild(line);
  });

  JOURNEY_NODES.forEach((n) => {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', n.x);
    circle.setAttribute('cy', n.y);
    circle.setAttribute('r', n.r);
    circle.setAttribute('class', `mkt-journey__node ${n.stage <= 3 ? 'stage-slow' : 'stage-fast'}${n.hub ? ' is-hub' : ''}`);
    circle.dataset.stage = String(n.stage);
    svg.appendChild(circle);
  });
}

function updateJourneyStage(stage) {
  const svg = document.getElementById('journey-network');
  if (!svg) return;

  svg.querySelectorAll('[data-stage]').forEach((el) => {
    el.classList.toggle('is-visible', Number(el.dataset.stage) <= stage);
  });
  svg.classList.toggle('is-stage-5', stage === 5);

  const info = MATURITY_STAGES[stage - 1];
  const numEl  = document.getElementById('journey-stage-num');
  const nameEl = document.getElementById('journey-stage-name');
  const descEl = document.getElementById('journey-stage-desc');
  if (info && numEl && nameEl && descEl) {
    numEl.textContent  = String(info.id).padStart(2, '0');
    nameEl.textContent = info.name;
    descEl.textContent = info.descriptor;
  }
  document.querySelector('.mkt-journey__stage-label')?.classList.toggle('is-final', stage === 5);

  document.querySelectorAll('.mkt-journey__progress-dot').forEach((dot) => {
    dot.classList.toggle('is-active', Number(dot.dataset.stage) === stage);
  });
}

// Plays once, the first time the section scrolls into view. Holds are
// longer for the early, fragmented stages and shorter for 4-5, so the
// Alignment -> AI-Fueled Enterprise stretch visibly speeds up — the
// same "compress the journey" idea, now expressed as a timed sequence
// instead of scroll distance.
const JOURNEY_STAGE_HOLD_MS = { 1: 1500, 2: 1500, 3: 1700, 4: 650 };

function playJourneySequence() {
  let stage = 1;
  updateJourneyStage(stage);

  function advance() {
    const hold = JOURNEY_STAGE_HOLD_MS[stage];
    if (!hold) return; // reached stage 5 — hold there, sequence ends
    setTimeout(() => {
      stage += 1;
      updateJourneyStage(stage);
      advance();
    }, hold);
  }
  advance();
}

function wireJourneyAnimation() {
  const section = document.getElementById('maturity');
  const svg = document.getElementById('journey-network');
  if (!section || !svg) return;

  buildJourneyNetwork(svg);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    updateJourneyStage(5); // fully-formed network, no animation
    return;
  }

  let played = false;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !played) {
        played = true;
        playJourneySequence();
        observer.unobserve(section);
      }
    });
  }, { threshold: 0.35 });
  observer.observe(section);
}

function wireJourneyClimax() {
  const climax = document.getElementById('journey-climax');
  if (!climax) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    climax.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        climax.classList.add('is-visible');
        observer.unobserve(climax);
      }
    });
  }, { threshold: 0.3 });
  observer.observe(climax);
}

function wireNavShrink() {
  const nav = document.querySelector('.mkt-nav');
  if (!nav) return;

  const SCROLL_THRESHOLD = 24;
  let ticking = false;

  function update() {
    nav.classList.toggle('is-scrolled', window.scrollY > SCROLL_THRESHOLD);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });

  update();
}

function wireDropdowns() {
  const items = document.querySelectorAll('.mkt-menu__item');

  function closeAll() {
    items.forEach((item) => {
      item.classList.remove('is-open');
      item.querySelector('.mkt-menu__trigger')?.setAttribute('aria-expanded', 'false');
    });
  }

  items.forEach((item) => {
    const trigger = item.querySelector('.mkt-menu__trigger');
    if (!trigger) return;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = item.classList.contains('is-open');
      closeAll();
      if (!wasOpen) {
        item.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });

  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}

function wireMobileToggle() {
  const btn = document.getElementById('mkt-mobile-toggle');
  const panel = document.getElementById('mkt-mobile-panel');
  if (!btn || !panel) return;

  btn.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });
}

function wireCtaButtons() {
  const ids = ['mkt-cta-hero', 'mkt-cta-automotive'];
  ids.forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      window.CTARouter?.routeToWorkspace();
    });
  });
}

function wirePricingToggle() {
  const toggleBtns = document.querySelectorAll('.mkt-pricing__toggle-btn');
  const monthlyEls = document.querySelectorAll('.mkt-pricing-card__price--monthly');
  const yearlyEls  = document.querySelectorAll('.mkt-pricing-card__price--yearly');
  if (!toggleBtns.length) return;

  function setPeriod(period) {
    toggleBtns.forEach((btn) => {
      const active = btn.dataset.period === period;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    monthlyEls.forEach((el) => { el.hidden = period !== 'monthly'; });
    yearlyEls.forEach((el)  => { el.hidden = period !== 'yearly';  });
  }

  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => setPeriod(btn.dataset.period));
  });
}

function wirePricingCtas() {
  // Free plan — straight into Cob, same as every other CTA on the page.
  document.getElementById('mkt-cta-pricing-free')?.addEventListener('click', () => {
    window.CTARouter?.routeToWorkspace();
  });

  // Professional — not live yet, explain that instead of pretending it's active.
  const dialog = document.getElementById('mkt-dialog-coming-soon');
  document.getElementById('mkt-cta-pricing-pro')?.addEventListener('click', () => {
    if (dialog) dialog.hidden = false;
  });
  document.getElementById('mkt-dialog-close')?.addEventListener('click', () => {
    if (dialog) dialog.hidden = true;
  });
  document.getElementById('mkt-cta-pricing-dialog')?.addEventListener('click', () => {
    if (dialog) dialog.hidden = true;
    window.CTARouter?.routeToWorkspace();
  });
  dialog?.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog && !dialog.hidden) dialog.hidden = true;
  });
}
