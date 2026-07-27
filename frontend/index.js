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

// New users have no UserProfile yet — detour through profile setup once,
// then on to the original destination. A failed check fails open (never
// let a broken profile lookup block someone who just authenticated).
async function redirectRespectingProfile(destination) {
    try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE()}/profile/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.status === 404) {
            window.location.href = `/profile-setup/profile.html?redirect=${encodeURIComponent(destination)}`;
            return;
        }
    } catch { /* fall through to destination */ }
    window.location.href = destination;
}

// Must match backend/trunida-backend/config/objectiveLimits.js — a soft guide
// here (never blocks typing/pasting) backed by a hard, clearly-messaged
// rejection server-side. No silent truncation either way.
const MAX_OBJECTIVE_LENGTH = 8000;
const OBJECTIVE_COUNTER_THRESHOLD = 0.85; // start showing the counter at 85% of the limit

/* v8 ignore next 10 */
document.addEventListener('DOMContentLoaded', () => {
    renderStages(MATURITY_STAGES, document.querySelector('.stages'));
    wirePrimaryCta();
    wireSidebar();
    wireSidebarBlueprints();
    wireTopbarAuth();
    wireHeroPrompt();
    wireAuthModal();
    wireKnowledgeSourcesIndicator();
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

    // Step 1 — send the code (or hand Gmail addresses straight to Google)
    document.getElementById('auth-email-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        const email = document.getElementById('auth-email')?.value?.trim() || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        // Gmail accounts sign in with Google — same account, one less code
        const domain = email.split('@')[1].toLowerCase();
        if (domain === 'gmail.com' || domain === 'googlemail.com') {
            const base = window.CONFIG?.AUTH?.OAUTH?.GOOGLE || `${API_BASE()}/auth/oauth/google`;
            window.location.href = `${base}?login_hint=${encodeURIComponent(email)}`;
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

            // A fresh login lands back on the landing page — unless there's a
            // guest preview waiting to be claimed onto this account, in which
            // case domain.html needs to load first (its init() does the claim).
            const hasGuestPreview = !!localStorage.getItem('soorgaai_guest_id');
            await redirectRespectingProfile(hasGuestPreview ? '/domain/domain.html' : '/');
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
 * Adds a small connected-state dot to the "Knowledge Sources" sidebar link
 * once the user has a personal Confluence connection. Silent no-op for
 * guests (no token) or anyone who hasn't connected — never blocks the link.
 */
export async function wireKnowledgeSourcesIndicator() {
    const link = document.querySelector('.side__link[href="/knowledge-sources/knowledge-sources.html"]');
    if (!link) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const resp = await fetch(`${API_BASE()}/confluence/personal/status`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const { connected } = await resp.json();
        if (connected && !link.querySelector('.side__link-dot')) {
            const dot = document.createElement('span');
            dot.className = 'side__link-dot';
            dot.setAttribute('aria-label', 'Connected');
            link.appendChild(dot);
        }
    } catch { /* non-critical */ }
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
                    window.location.href = '/domain/domain.html';
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
            btn.addEventListener('click', () => { window.location.href = '/domain/domain.html'; });
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
 * Topbar: signed-in visitors see their profile name with a dropdown
 * (workspace + log out) instead of the Log in button.
 */
export function wireTopbarAuth() {
    const wrap = document.getElementById('topbar-auth');
    if (!wrap) return;
    if (!localStorage.getItem('token')) return;

    const username = (localStorage.getItem('username') || 'Account').trim() || 'Account';
    const initial  = username.charAt(0).toUpperCase();

    wrap.innerHTML = `
        <div class="profile-menu">
            <button id="profile-btn" class="profile-btn" aria-haspopup="menu" aria-expanded="false">
                <span class="profile-avatar" aria-hidden="true"></span>
                <span class="profile-name"></span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="profile-dropdown" class="profile-dropdown" style="display:none" role="menu">
                <a href="/domain/domain.html" class="profile-dropdown__item" role="menuitem">My Blueprint</a>
                <button id="profile-logout" class="profile-dropdown__item profile-dropdown__item--danger" role="menuitem">Log out</button>
            </div>
        </div>`;

    // textContent keeps any odd characters in the stored name inert
    wrap.querySelector('.profile-avatar').textContent = initial;
    wrap.querySelector('.profile-name').textContent   = username;

    const btn      = document.getElementById('profile-btn');
    const dropdown = document.getElementById('profile-dropdown');
    const setOpen  = (open) => {
        if (dropdown) dropdown.style.display = open ? '' : 'none';
        btn?.setAttribute('aria-expanded', String(open));
    };

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(dropdown?.style.display === 'none');
    });
    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });

    document.getElementById('profile-logout')?.addEventListener('click', () => {
        [
            'token', 'username', 'userId', 'role', 'redirectAfterLogin',
            'soorgaai_blueprint_v1', 'soorgaai_blueprint_activity_v1',
            'soorgaai_executive_memory_v1', 'soorgaai_company_context_v1',
            'da_score', 'soorga_assessment_progress',
        ].forEach(k => localStorage.removeItem(k));
        window.location.reload();
    });
}

/**
 * Wire the hero prompt composer (try-before-login entry point).
 * Anonymous  → objective saved to sessionStorage, off to /try/try.html
 * Signed in  → same save, off to the workspace (its form prefills from it)
 */
export function wireHeroPrompt() {
    const form     = document.getElementById('hero-prompt-form');
    const input    = document.getElementById('hero-objective');
    const errEl    = document.getElementById('hero-prompt-error');
    const counter  = document.getElementById('hero-objective-counter');
    if (!form || !input) return;

    // Example prompt card fills the input
    const example = document.getElementById('example-card');
    example?.addEventListener('click', () => {
        input.value = example.textContent.replace(/\s+/g, ' ').trim();
        autogrow(input);
        updateObjectiveCounter(input, counter);
        input.focus();
    });

    // ChatGPT-style input: grow with content, Enter submits, Shift+Enter = newline
    input.addEventListener('input', () => {
        autogrow(input);
        updateObjectiveCounter(input, counter);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    form.addEventListener('submit', async (e) => {
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
        if (objective.length > MAX_OBJECTIVE_LENGTH) {
            if (errEl) {
                errEl.textContent = `Your objective is ${objective.length.toLocaleString()} characters — please trim it to ${MAX_OBJECTIVE_LENGTH.toLocaleString()} or fewer. Nothing you typed has been lost; edit and resubmit.`;
                errEl.style.display = '';
            }
            input.focus();
            return;
        }
        if (errEl) errEl.style.display = 'none';

        const sendBtn = form.querySelector('.prompt__send');
        if (sendBtn) sendBtn.disabled = true;

        try {
            const token = localStorage.getItem('token');
            if (token) {
                sessionStorage.removeItem(OPEN_BLUEPRINT_KEY);
                const resp = await fetch(`${API_BASE()}/strategy-canvas/generate-transformation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ businessObjective: objective }),
                });
                if (resp.status === 401) {
                    // Stale session — restart as anonymous
                    localStorage.removeItem('token');
                    window.location.reload();
                    return;
                }
                if (!resp.ok) {
                    const { error } = await resp.json().catch(() => ({}));
                    throw new Error(error || 'Failed to start generation. Please try again.');
                }
            } else {
                const resp = await fetch(`${API_BASE()}/guest/generate-blueprint`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ businessObjective: objective }),
                });
                if (!resp.ok) {
                    const { error } = await resp.json().catch(() => ({}));
                    throw new Error(error || 'Failed to start generation. Please try again.');
                }
                const { guestId } = await resp.json();
                localStorage.setItem('soorgaai_guest_id', guestId);
            }

            // Straight into the blueprint view — it renders live, filling in
            // capabilities as they complete. Guests have no profile to check
            // (no token at all); logged-in users get the same profile-setup
            // safety net as the other auth entry points.
            if (token) {
                await redirectRespectingProfile('/domain/domain.html');
            } else {
                window.location.href = '/domain/domain.html';
            }

        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message;
                errEl.style.display = '';
            }
            if (sendBtn) sendBtn.disabled = false;
        }
    });
}

function autogrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

// Soft guidance only — never blocks typing/pasting. Stays hidden until the
// user is actually approaching the limit, so it doesn't nag short objectives.
function updateObjectiveCounter(input, counterEl) {
    if (!counterEl) return;
    const len = input.value.length;
    if (len < MAX_OBJECTIVE_LENGTH * OBJECTIVE_COUNTER_THRESHOLD) {
        counterEl.style.display = 'none';
        return;
    }
    counterEl.style.display = '';
    counterEl.textContent = `${len.toLocaleString()} / ${MAX_OBJECTIVE_LENGTH.toLocaleString()} characters`;
    counterEl.classList.toggle('prompt__counter--over', len > MAX_OBJECTIVE_LENGTH);
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
