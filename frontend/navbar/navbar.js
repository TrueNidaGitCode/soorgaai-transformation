/**
 * SoorgaAI — Navbar Component
 * Handles dynamic loading, auth state, and navigation.
 */

window.loadNavbar = () => setupNavbarHandlers();

// ── Resolve navbar HTML path ──────────────────────────────
function getNavbarPath() {
    const p = window.location.pathname;
    if (p.endsWith('/') || p.includes('/index.html')) return 'navbar/navbar.html';
    if (p.split('/').filter(Boolean).length >= 2)      return '../navbar/navbar.html';
    return 'navbar/navbar.html';
}

// ── Load + inject navbar ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    let container = document.getElementById('navbar-container');
    if (!container) {
        document.body.insertAdjacentHTML('afterbegin', '<div id="navbar-container"></div>');
        container = document.getElementById('navbar-container');
    }

    fetch(getNavbarPath())
        .then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); })
        .then(html => {
            container.innerHTML = html;
            const observer = new MutationObserver((_, obs) => {
                if (document.getElementById('loginSignupBtn')) {
                    setupNavbarHandlers();
                    setupNavLinks();
                    obs.disconnect();
                }
            });
            observer.observe(container, { childList: true, subtree: true });
            setTimeout(() => { setupNavbarHandlers(); setupNavLinks(); }, 400);
        })
        .catch(err => console.error('❌ Navbar load failed:', err));
});

// ── Auth state ────────────────────────────────────────────
function setupNavbarHandlers() {
    const token    = localStorage.getItem('token');
    const username = localStorage.getItem('username') || 'User';
    const role     = localStorage.getItem('role') || 'user';

    const loginBtn        = document.getElementById('loginSignupBtn');
    const logoutBtn       = document.getElementById('logoutBtn');
    const userDisplay     = document.getElementById('username-display');
    const adminBtn        = document.getElementById('adminDashboardBtn');
    const myAssessmentsBtn= document.getElementById('myAssessmentsBtn');

    if (!loginBtn || !logoutBtn) return;

    if (token) {
        if (userDisplay) { userDisplay.textContent = `Hi, ${username}`; userDisplay.style.display = 'inline'; }
        loginBtn.style.display  = 'none';
        logoutBtn.style.display = 'inline';
        if (myAssessmentsBtn) myAssessmentsBtn.style.display = 'inline';
        if (adminBtn) adminBtn.style.display = role === 'admin' ? 'inline' : 'none';

        logoutBtn.onclick = logoutUser;
    } else {
        if (userDisplay) userDisplay.style.display = 'none';
        loginBtn.style.display  = 'inline';
        logoutBtn.style.display = 'none';
        if (myAssessmentsBtn) myAssessmentsBtn.style.display = 'none';
        if (adminBtn) adminBtn.style.display = 'none';

        loginBtn.onclick = () => { window.location.href = '/login/login.html'; };
    }
}

// ── Navigation links ──────────────────────────────────────
function setupNavLinks() {
    bindBtn('takeAssessmentBtn', () => {
        if (localStorage.getItem('token')) {
            window.location.href = '/assessment/assessment.html';
        } else {
            localStorage.setItem('redirectAfterLogin', '/assessment/assessment.html');
            window.location.href = '/login/login.html';
        }
    });

    bindBtn('myAssessmentsBtn', () => {
        if (localStorage.getItem('token')) {
            window.location.href = '/results/results.html';
        } else {
            window.location.href = '/login/login.html';
        }
    });

    bindBtn('adminDashboardBtn', () => {
        window.location.href = localStorage.getItem('role') === 'admin'
            ? '/admin/dashboard.html'
            : '/admin/login.html';
    });
}

function bindBtn(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    const fresh = el.cloneNode(true);
    el.replaceWith(fresh);
    fresh.addEventListener('click', e => { e.preventDefault(); handler(); });
}

// ── Logout ────────────────────────────────────────────────
function logoutUser() {
    ['token', 'username', 'userId', 'role', 'redirectAfterLogin'].forEach(k => localStorage.removeItem(k));
    setupNavbarHandlers();
    window.location.href = '/index.html';
}

console.log('✅ SoorgaAI Navbar loaded');