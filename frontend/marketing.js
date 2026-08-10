/**
 * SoorgaAI — Marketing homepage
 * Top-nav dropdown menus, mobile panel toggle, CTA routing into Cob,
 * and the AI maturity stages strip.
 */

import { MATURITY_STAGES } from './data/maturityStages.js';

document.addEventListener('DOMContentLoaded', () => {
  wireDropdowns();
  wireMobileToggle();
  wireCtaButtons();
  wireNavShrink();
  renderMaturityStages();
  wirePricingToggle();
  wirePricingCtas();
});

function renderMaturityStages() {
  const container = document.getElementById('maturity-stages');
  if (!container) return;

  container.innerHTML = MATURITY_STAGES.map((stage) => `
    <li class="mkt-maturity__stage" style="--stage-color: ${stage.color}">
      <span class="mkt-maturity__num">${String(stage.id).padStart(2, '0')}</span>
      <span class="mkt-maturity__name">${stage.name}</span>
      <span class="mkt-maturity__desc">${stage.descriptor}</span>
    </li>
  `).join('');
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
