/**
 * Svarg — Navbar Component
 * Handles dynamic loading, auth state, navigation, and mobile toggle.
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
/* v8 ignore next 28 */
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
            setupNavbarHandlers();
            setupNavLinks();
            setupMobileToggle();
        })
        .catch(err => console.error('❌ Navbar load failed:', err));
});

// ── Auth state ────────────────────────────────────────────
function setupNavbarHandlers() {
    const loginBtn         = document.getElementById('loginSignupBtn');
    const logoutBtn        = document.getElementById('logoutBtn');
    const userDisplay      = document.getElementById('username-display');
    const adminBtn         = document.getElementById('adminDashboardBtn');
    const myAssessmentsBtn = document.getElementById('myAssessmentsBtn');
    const roadmapCta       = document.getElementById('navRoadmapCta');

    // ── Anonymous mode: homepage opts in via data-nav-mode="anonymous" ──
    // Renders only the nav links + Generate Roadmap CTA. No auth chrome.
    if (document.body.dataset.navMode === 'anonymous') {
        [loginBtn, logoutBtn, userDisplay, adminBtn, myAssessmentsBtn].forEach(el => {
            if (el) el.style.display = 'none';
        });
        if (roadmapCta) {
            roadmapCta.removeAttribute('href');
            roadmapCta.onclick = (e) => {
                e.preventDefault();
                const token = localStorage.getItem('token');
                window.location.href = token
                    ? '/domain/domain.html'
                    : '/login/login.html?redirect=/domain/domain.html';
            };
        }
        return;
    }

    // ── Login mode: login page opts in via data-nav-mode="login" ──
    // Renders only the nav links. No auth chrome, no roadmap CTA.
    if (document.body.dataset.navMode === 'login') {
        [loginBtn, logoutBtn, userDisplay, adminBtn, myAssessmentsBtn, roadmapCta].forEach(el => {
            if (el) el.style.display = 'none';
        });
        return;
    }

    // ── Authenticated mode (default for all other pages) ─────────────────
    if (!loginBtn || !logoutBtn) return;

    const token    = localStorage.getItem('token');
    const username = localStorage.getItem('username') || 'User';
    const role     = localStorage.getItem('role') || 'user';

    const knowledgeNavItem = document.getElementById('nav-knowledge-link');

    if (token) {
        if (userDisplay) { userDisplay.textContent = `Hi, ${username}`; userDisplay.style.display = 'inline'; }
        loginBtn.style.display  = 'none';
        logoutBtn.style.display = 'inline';
        if (myAssessmentsBtn) myAssessmentsBtn.style.display = 'inline';
        if (adminBtn) adminBtn.style.display = role === 'admin' ? 'inline' : 'none';
        if (knowledgeNavItem) knowledgeNavItem.style.display = 'list-item';
        logoutBtn.onclick = logoutUser;
    } else {
        if (userDisplay) userDisplay.style.display = 'none';
        loginBtn.style.display  = 'inline';
        logoutBtn.style.display = 'none';
        if (myAssessmentsBtn) myAssessmentsBtn.style.display = 'none';
        if (adminBtn) adminBtn.style.display = 'none';
        if (knowledgeNavItem) knowledgeNavItem.style.display = 'none';
        loginBtn.onclick = () => { window.location.href = '/login/login.html'; };
    }

    // Wire the Generate Roadmap CTA using the shared authState helper
    if (roadmapCta && window.SoorgaAuth) {
        roadmapCta.href = window.SoorgaAuth.getRoadmapHref();
    }
}

// ── Navigation links ──────────────────────────────────────
function setupNavLinks() {
    bindBtn('myAssessmentsBtn', () => {
        window.location.href = localStorage.getItem('da_score')
            ? '/dynamic-assessment/scorecard.html'
            : '/dynamic-assessment/start.html';
    });

    bindBtn('adminDashboardBtn', () => {
        window.location.href = localStorage.getItem('role') === 'admin'
            ? '/admin/dashboard.html'
            : '/admin/login.html';
    });
}

// ── Mobile hamburger toggle ───────────────────────────────
function setupMobileToggle() {
    const toggle = document.getElementById('navToggle');
    const navbar = toggle && toggle.closest('.navbar');
    if (!toggle || !navbar) return;

    toggle.addEventListener('click', () => {
        const open = navbar.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // Close menu when a nav link is clicked
    navbar.querySelectorAll('.nav-links a, .nav-right a').forEach(link => {
        link.addEventListener('click', () => {
            navbar.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        });
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
  [
    // Auth
    'token', 'username', 'userId', 'role', 'redirectAfterLogin',
    // User-scoped local data — must clear so the next user starts clean
    'soorgaai_blueprint_v1', 'soorgaai_blueprint_activity_v1',
    'soorgaai_executive_memory_v1', 'soorgaai_company_context_v1',
    'da_score', 'soorga_assessment_progress',
  ].forEach(k => localStorage.removeItem(k));

  // Clear all persisted AI chat histories (keys are dynamic: soorgaai_chat_v1_<blueprintId>_<capabilityId>)
  Object.keys(localStorage)
    .filter(k => k.startsWith('soorgaai_chat_v1_'))
    .forEach(k => localStorage.removeItem(k));

  setupNavbarHandlers();
  window.location.href = '/index.html';
}

console.log('✅ Svarg Navbar loaded');

// Named exports for unit testing (Vitest ESM).
// The <script type="module"> tag in HTML loads these transparently.
export { getNavbarPath, setupNavbarHandlers, setupNavLinks, setupMobileToggle, bindBtn, logoutUser };
