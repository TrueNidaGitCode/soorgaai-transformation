/**
 * SoorgaAI — Workspace Shell
 *
 * On load:
 *   1. Guard: if no JWT → redirect to login.
 *   2. GET /api/profile/me → if 404 → redirect to profile setup.
 *   3. GET /api/workspace/state → render domain cards.
 *   4. Logout: clear localStorage, redirect to landing.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

function logout() {
  ['token', 'username', 'userId', 'role', 'redirectAfterLogin'].forEach(k =>
    localStorage.removeItem(k)
  );
  window.location.href = '/index.html';
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

function showMain(state) {
  document.getElementById('ws-loading').style.display = 'none';
  document.getElementById('ws-main').style.display    = 'block';

  const username = state.profile?.orgName || localStorage.getItem('username') || '';
  document.getElementById('ws-username').textContent  = username;

  renderDomainGrid(state.domains || []);
}

// ── Domain card rendering ─────────────────────────────────────────────────────

function formatActivity(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const diffH = Math.round((Date.now() - d) / 3600000);
  if (diffH < 1)   return 'Active just now';
  if (diffH < 24)  return `Active ${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `Active ${diffD}d ago`;
}

function renderDomainGrid(domains) {
  const grid = document.querySelector('.domain-grid');
  grid.innerHTML = '';

  for (const domain of domains) {
    const card = document.createElement('article');
    card.className = `domain-card domain-card--${domain.enabled ? 'enabled' : 'disabled'}`;
    card.setAttribute('role', domain.enabled ? 'button' : 'article');
    if (domain.enabled) card.setAttribute('tabindex', '0');

    const activity = formatActivity(domain.lastActivityAt);

    card.innerHTML = `
      <span class="domain-card__icon" aria-hidden="true">${domain.icon || '📋'}</span>
      <h2 class="domain-card__title">${domain.title}</h2>
      <p class="domain-card__description">${domain.description}</p>
      ${activity ? `<span class="domain-card__activity">${activity}</span>` : ''}
      ${!domain.enabled ? '<span class="domain-card__badge">Coming Soon</span>' : ''}
    `;

    if (domain.enabled) {
      const navigate = () => {
        window.location.href = `/domain/domain.html?domain=${encodeURIComponent(domain.domainId)}`;
      };
      card.addEventListener('click', navigate);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') navigate(); });
    }

    grid.appendChild(card);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) {
    window.location.href = '/login/login.html?redirect=/workspace/workspace.html';
    return;
  }

  document.getElementById('ws-logout').addEventListener('click', logout);

  try {
    // Check profile — redirect to setup if not found
    const profileResp = await fetch(`${API_BASE}/profile/me`, { headers: authHeaders() });
    if (profileResp.status === 404) {
      window.location.href = '/profile-setup/profile.html';
      return;
    }
    if (profileResp.status === 401) {
      logout();
      return;
    }

    // Load full workspace state
    const stateResp = await fetch(`${API_BASE}/workspace/state`, { headers: authHeaders() });
    if (!stateResp.ok) throw new Error('Failed to load workspace state.');

    const state = await stateResp.json();
    showMain(state);

  } catch (err) {
    console.error('Workspace load error:', err);
    document.getElementById('ws-loading').innerHTML =
      '<p style="color:#ff6b6b">Failed to load workspace. Please refresh.</p>';
  }
});
