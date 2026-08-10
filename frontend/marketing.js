/**
 * SoorgaAI — Marketing homepage
 * Top-nav dropdown menus, mobile panel toggle, and CTA routing into Cob.
 */

document.addEventListener('DOMContentLoaded', () => {
  wireDropdowns();
  wireMobileToggle();
  wireCtaButtons();
  wireNavShrink();
});

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
