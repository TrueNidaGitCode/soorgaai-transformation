/**
 * SoorgaAI — Shared top nav wiring for marketing pages
 * (homepage, industry pages, and any future ".mkt-nav" page).
 * Dropdown open/close, mobile panel toggle, and the shrink-on-scroll
 * pill effect. Page-specific behavior (hero animations, CTA routing,
 * etc.) stays in each page's own script.
 */

export function initMarketingNav() {
  wireDropdowns();
  wireMobileToggle();
  wireNavShrink();
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
