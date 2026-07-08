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

/* v8 ignore next 9 */
document.addEventListener('DOMContentLoaded', () => {
    renderStages(MATURITY_STAGES, document.querySelector('.stages'));
    wirePrimaryCta();
    wireSidebar();
    wireSidebarBlueprints();
    wireTopbarAuth();
    wireHeroPrompt();
    wireAuthModal();
});

/**
 * "Log in or sign up" modal — opens from the topbar Log in button.
 * Google goes straight to OAuth. Email is passwordless: a 6-digit code is
 * sent to the address, and verifying it signs the user in (creating the
 * account on first use).
 */
export function wireAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    const stepEmail = document.getElementById('auth-step-email');
    const stepCode  = document.getElementById('auth-step-code');
    const errEl     = document.getElementById('auth-modal-error');
    let currentEmail = '';
    let resendTimer  = null;

    const showError = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };
    const hideError = () => { if (errEl) errEl.style.display = 'none'; };

    const showStep = (step) => {
        hideError();
        if (stepEmail) stepEmail.style.display = (step === 'email') ? '' : 'none';
        if (stepCode)  stepCode.style.display  = (step === 'code')  ? '' : 'none';
        (step === 'email'
            ? document.getElementById('auth-email')
            : document.getElementById('auth-code'))?.focus();
    };

    const open  = () => { modal.style.display = ''; showStep('email'); };
    const close = () => { modal.style.display = 'none'; clearInterval(resendTimer); };

    document.getElementById('topbar-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        open();
    });

    document.getElementById('auth-modal-close')?.addEventListener('click', close);
    document.getElementById('auth-modal-backdrop')?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') close();
    });

    document.getElementById('auth-google')?.addEventListener('click', () => {
        window.location.href = window.CONFIG?.AUTH?.OAUTH?.GOOGLE
            || `${API_BASE()}/auth/oauth/google`;
    });

    // 60s resend cooldown, mirroring the backend's per-email limit
    const startResendCooldown = () => {
        const btn = document.getElementById('auth-code-resend');
        if (!btn) return;
        let left = 60;
        btn.disabled = true;
        btn.textContent = `Resend code (${left}s)`;
        clearInterval(resendTimer);
        resendTimer = setInterval(() => {
            left -= 1;
            if (left <= 0) {
                clearInterval(resendTimer);
                btn.disabled = false;
                btn.textContent = 'Resend code';
            } else {
                btn.textContent = `Resend code (${left}s)`;
            }
        }, 1000);
    };

    const requestCode = async (email) => {
        const resp = await fetch(`${API_BASE()}/users/email-otp/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        if (!resp.ok) {
            const { msg } = await resp.json().catch(() => ({}));
            throw new Error(msg || 'Failed to send the code. Please try again.');
        }
    };

    // Step 1 — send the code
    document.getElementById('auth-email-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        const email = document.getElementById('auth-email')?.value?.trim() || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        const btn = document.getElementById('auth-email-continue');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending code…'; }

        try {
            await requestCode(email);
            currentEmail = email;
            const emailEl = document.getElementById('auth-code-email');
            if (emailEl) emailEl.textContent = email;
            const codeInput = document.getElementById('auth-code');
            if (codeInput) codeInput.value = '';
            showStep('code');
            startResendCooldown();
        } catch (err) {
            showError(err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
        }
    });

    // Step 2 — verify the code, sign in, and continue
    document.getElementById('auth-code-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        const code = document.getElementById('auth-code')?.value?.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            showError('Enter the 6-digit code from the email.');
            return;
        }

        const btn = document.getElementById('auth-code-verify');
        if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }

        try {
            const resp = await fetch(`${API_BASE()}/users/email-otp/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail, code }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.msg || 'Verification failed. Please try again.');

            localStorage.setItem('token',    data.token);
            localStorage.setItem('userId',   data.userId);
            localStorage.setItem('username', data.username);
            localStorage.setItem('role',     data.role || 'user');

            // Guest preview waiting? /try claims it into the account and forwards.
            window.location.href = localStorage.getItem('soorgaai_guest_id')
                ? '/try/try.html'
                : '/workspace/workspace.html';
        } catch (err) {
            showError(err.message);
            if (btn) { btn.disabled = false; btn.textContent = 'Verify & continue'; }
        }
    });

    document.getElementById('auth-code-resend')?.addEventListener('click', async () => {
        hideError();
        try {
            await requestCode(currentEmail);
            startResendCooldown();
        } catch (err) {
            showError(err.message);
        }
    });

    document.getElementById('auth-code-back')?.addEventListener('click', () => {
        clearInterval(resendTimer);
        showStep('email');
    });
}

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
            btn.addEventListener('click', () => { window.location.href = '/workspace/workspace.html'; });
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
 * Topbar: signed-in visitors see "Open Workspace" plus a Log out option
 * instead of the Log in button.
 */
export function wireTopbarAuth() {
    const wrap = document.getElementById('topbar-auth');
    if (!wrap) return;
    if (localStorage.getItem('token')) {
        wrap.innerHTML =
            '<a href="/workspace/workspace.html" class="auth-btn auth-btn--workspace">Open Workspace &rarr;</a>' +
            '<button id="topbar-logout" class="auth-btn auth-btn--outline">Log out</button>';
        document.getElementById('topbar-logout')?.addEventListener('click', () => {
            [
                'token', 'username', 'userId', 'role', 'redirectAfterLogin',
                'soorgaai_blueprint_v1', 'soorgaai_blueprint_activity_v1',
                'soorgaai_executive_memory_v1', 'soorgaai_company_context_v1',
                'da_score', 'soorga_assessment_progress',
            ].forEach(k => localStorage.removeItem(k));
            window.location.reload();
        });
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

    // Example prompt card fills the input
    const example = document.getElementById('example-card');
    example?.addEventListener('click', () => {
        input.value = example.textContent.replace(/\s+/g, ' ').trim();
        autogrow(input);
        input.focus();
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
        if (token) {
            // Workspace picks up the pending objective and starts generating
            sessionStorage.removeItem(OPEN_BLUEPRINT_KEY);
            window.location.href = '/workspace/workspace.html';
        } else {
            window.location.href = '/try/try.html';
        }
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
