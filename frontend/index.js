/**
 * SoorgaAI — Landing Page Module (ChatGPT-style layout)
 *
 * Wires: sidebar collapse/expand, auth-aware topbar, and the hero
 * prompt composer (try-before-login entry point).
 *
 * Loaded as <script type="module"> — runs after DOM is parsed.
 */

import { MATURITY_STAGES } from './data/maturityStages.js';

const SIDE_COLLAPSED_KEY = 'soorgaai_side_collapsed';

/* v8 ignore next 7 */
document.addEventListener('DOMContentLoaded', () => {
    renderStages(MATURITY_STAGES, document.querySelector('.stages'));
    wirePrimaryCta();
    wireSidebar();
    wireTopbarAuth();
    wireHeroPrompt();
});

/**
 * Sidebar: collapsible on desktop (state persisted), off-canvas on mobile.
 */
export function wireSidebar() {
    const body = document.body;

    if (localStorage.getItem(SIDE_COLLAPSED_KEY) === '1') {
        body.classList.add('side-collapsed');
    }

    document.getElementById('side-toggle')?.addEventListener('click', () => {
        const collapsed = body.classList.toggle('side-collapsed');
        localStorage.setItem(SIDE_COLLAPSED_KEY, collapsed ? '1' : '0');
    });

    document.getElementById('side-toggle-mobile')?.addEventListener('click', () => {
        body.classList.toggle('side-open');
    });

    // Tap outside closes the mobile drawer
    document.addEventListener('click', (e) => {
        if (!body.classList.contains('side-open')) return;
        const side = document.getElementById('side');
        if (side && !side.contains(e.target) && !e.target.closest('#side-toggle-mobile')) {
            body.classList.remove('side-open');
        }
    });
}

/**
 * Topbar: signed-in visitors see "Open Workspace" instead of Log in / Sign up.
 */
export function wireTopbarAuth() {
    const wrap = document.getElementById('topbar-auth');
    if (!wrap) return;
    if (localStorage.getItem('token')) {
        wrap.innerHTML = '<a href="/workspace/workspace.html" class="auth-btn auth-btn--workspace">Open Workspace &rarr;</a>';
    }
}

/**
 * Wire the hero prompt composer (try-before-login entry point).
 * Anonymous  → objective saved to sessionStorage, off to /try/try.html
 * Signed in  → same save, off to the workspace (its form prefills from it)
 */
export function wireHeroPrompt() {
    const form  = document.getElementById('hero-prompt-form');
    const input = document.getElementById('hero-objective');
    const errEl = document.getElementById('hero-prompt-error');
    if (!form || !input) return;

    document.querySelectorAll('.hero-prompt__chip').forEach(chip => {
        chip.addEventListener('click', () => {
            input.value = chip.dataset.text || '';
            autogrow(input);
            input.focus();
        });
    });

    // ChatGPT-style input: grow with content, Enter submits, Shift+Enter = newline
    input.addEventListener('input', () => autogrow(input));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const objective = input.value.trim();
        if (!objective) {
            if (errEl) {
                errEl.textContent = 'Tell us about your project first.';
                errEl.style.display = '';
            }
            input.focus();
            return;
        }
        if (errEl) errEl.style.display = 'none';

        sessionStorage.setItem('soorgaai_pending_objective', objective);
        const token = localStorage.getItem('token');
        window.location.href = token ? '/workspace/workspace.html' : '/try/try.html';
    });
}

function autogrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

/**
 * Render maturity stages into the given container.
 * The ChatGPT-style landing no longer shows stages, but the renderer is
 * kept (and still exported) for the framework page and unit tests.
 *
 * @param {Array}       stages    - Array of stage objects (from MATURITY_STAGES)
 * @param {HTMLElement} container - The <ol> element to populate
 */
export function renderStages(stages, container) {
    if (!container) return;

    container.innerHTML = ''; // Idempotent — clear before re-render

    const fragment = document.createDocumentFragment();

    [...stages].reverse().forEach(stage => {
        const li = document.createElement('li');
        li.className = 'stage-item';
        li.style.setProperty('--stage-color', stage.color || '#5CC5A7');
        li.setAttribute('data-stage-id', stage.id ?? '');

        li.innerHTML = `
            <div class="stage-item__num" aria-hidden="true">${stage.id ?? ''}</div>
            <div class="stage-item__body">
                <strong class="stage-item__name">${stage.name ?? ''}</strong>
                <span class="stage-item__desc">${stage.descriptor ?? ''}</span>
            </div>
        `;

        fragment.appendChild(li);
    });

    container.appendChild(fragment);
}

/**
 * Set the primary CTA href from the shared SoorgaAuth helper
 * and attach analytics instrumentation to all [data-cta] elements.
 * Exported for unit testing.
 */
export function wirePrimaryCta() {
    const cta = document.getElementById('primaryCta');
    if (!cta) return;

    if (window.SoorgaAuth) {
        cta.href = window.SoorgaAuth.getRoadmapHref();
    }

    // Instrument clicks for future analytics EPIC
    document.querySelectorAll('[data-cta]').forEach(el => {
        el.addEventListener('click', () => {
            console.log(`[CTA] ${el.dataset.cta} clicked`);
        });
    });
}
