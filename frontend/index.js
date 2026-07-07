/**
 * SoorgaAI — Landing Page Module (ChatGPT-style layout)
 *
 * Wires: sidebar collapse/expand, auth-aware topbar, and the hero
 * prompt composer (try-before-login entry point).
 *
 * Loaded as <script type="module"> — runs after DOM is parsed.
 */

import { MATURITY_STAGES } from './data/maturityStages.js';

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';
const OPEN_BLUEPRINT_KEY = 'soorgaai_open_blueprint_id';
const NEW_BLUEPRINT_KEY  = 'soorgaai_new_blueprint';

/* v8 ignore next 8 */
document.addEventListener('DOMContentLoaded', () => {
    renderStages(MATURITY_STAGES, document.querySelector('.stages'));
    wirePrimaryCta();
    wireSidebar();
    wireSidebarBlueprints();
    wireTopbarAuth();
    wireHeroPrompt();
});

/**
 * Sidebar: fixed on desktop, off-canvas drawer on mobile.
 */
export function wireSidebar() {
    const body = document.body;

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

    // Create blueprint: signed-in → workspace in new-blueprint mode;
    // anonymous → focus the prompt box (that IS the create flow here)
    document.getElementById('side-create')?.addEventListener('click', () => {
        if (localStorage.getItem('token')) {
            sessionStorage.setItem(NEW_BLUEPRINT_KEY, '1');
            sessionStorage.removeItem(OPEN_BLUEPRINT_KEY);
            window.location.href = '/workspace/workspace.html';
        } else {
            document.getElementById('hero-objective')?.focus();
            document.body.classList.remove('side-open');
        }
    });
}

/**
 * Sidebar blueprint history.
 * Signed-in  → list the user's blueprints; clicking one opens it in the workspace.
 * Anonymous  → show the guest preview blueprint if one exists.
 */
export async function wireSidebarBlueprints() {
    const wrap = document.getElementById('side-blueprints');
    if (!wrap) return;

    const token   = localStorage.getItem('token');
    const guestId = localStorage.getItem('soorgaai_guest_id');

    const empty = (msg) => { wrap.innerHTML = `<p class="side__bps-empty">${msg}</p>`; };

    try {
        if (token) {
            const resp = await fetch(`${API_BASE()}/strategy-canvas/transformation-blueprints`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!resp.ok) { empty('No blueprints yet.'); return; }
            const { blueprints } = await resp.json();
            if (!blueprints?.length) { empty('No blueprints yet.'); return; }

            wrap.innerHTML = '';
            blueprints.forEach(bp => {
                const btn = document.createElement('button');
                btn.className = 'side__bp' + (bp.status === 'generating' ? ' side__bp--generating' : '');
                btn.title = bp.businessObjective || '';
                btn.textContent = (bp.status === 'generating' ? '⋯ ' : '') + truncate(bp.businessObjective, 46);
                btn.addEventListener('click', () => {
                    sessionStorage.setItem(OPEN_BLUEPRINT_KEY, bp._id);
                    sessionStorage.removeItem(NEW_BLUEPRINT_KEY);
                    window.location.href = '/workspace/workspace.html';
                });
                wrap.appendChild(btn);
            });
        } else if (guestId) {
            const resp = await fetch(`${API_BASE()}/guest/blueprint/${encodeURIComponent(guestId)}`);
            if (!resp.ok) { empty('No blueprints yet — describe your project to start.'); return; }
            const bp = await resp.json();
            const btn = document.createElement('button');
            btn.className = 'side__bp';
            btn.title = bp.businessObjective || '';
            btn.textContent = 'Preview — ' + truncate(bp.businessObjective, 38);
            btn.addEventListener('click', () => { window.location.href = '/try/try.html'; });
            wrap.innerHTML = '';
            wrap.appendChild(btn);
        } else {
            empty('No blueprints yet — describe your project to start.');
        }
    } catch {
        empty('No blueprints yet.');
    }
}

function truncate(s, n) {
    const str = (s || '').trim();
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
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
