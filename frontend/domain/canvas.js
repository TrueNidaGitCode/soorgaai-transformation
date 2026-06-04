/**
 * SoorgaAI — Canvas Module
 *
 * Loads and renders the 5 AI Strategy focus area cards.
 * Exposes window.Canvas.updateFocusArea(focusAreaId, newDescription) so chat.js
 * can animate live canvas updates without a page refresh.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

function getDomainId() {
  return new URLSearchParams(window.location.search).get('domain') || 'ai-strategy';
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderFocusAreas(focusAreas) {
  const container = document.getElementById('canvas-focus-areas');
  container.innerHTML = '';

  for (const fa of focusAreas) {
    const card = document.createElement('div');
    card.className = 'focus-area-card';
    card.dataset.focusAreaId = fa.id;

    card.innerHTML = `
      <h3 class="focus-area-title">${fa.title}</h3>
      <p class="focus-area-desc">${fa.description}</p>
    `;

    container.appendChild(card);
  }
}

// ── Live update (called by chat.js after agent response) ──────────────────────

function updateFocusArea(focusAreaId, newDescription) {
  const card = document.querySelector(`[data-focus-area-id="${focusAreaId}"]`);
  if (!card) return;

  const descEl = card.querySelector('.focus-area-desc');
  if (!descEl) return;

  // Animate the update
  descEl.textContent = newDescription;
  card.classList.remove('updated');
  // Force reflow to restart animation
  void card.offsetWidth;
  card.classList.add('updated');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function loadCanvas() {
  const domainId = getDomainId();
  const token    = getToken();

  if (!token) {
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${domainId}`;
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/chat/${domainId}/canvas`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 401) {
      window.location.href = '/login/login.html';
      return;
    }
    if (resp.status === 404) {
      window.location.href = '/profile-setup/profile.html';
      return;
    }
    if (!resp.ok) throw new Error('Failed to load canvas.');

    const { focusAreas } = await resp.json();
    renderFocusAreas(focusAreas);

    // Hide loading, show main — coordinated with chat.js via custom event
    document.dispatchEvent(new CustomEvent('canvas:ready'));

  } catch (err) {
    console.error('Canvas load error:', err);
    document.getElementById('canvas-focus-areas').innerHTML =
      '<p style="color:#ff6b6b;font-size:.85rem">Failed to load canvas. Refresh to retry.</p>';
    document.dispatchEvent(new CustomEvent('canvas:ready'));
  }
}

document.addEventListener('DOMContentLoaded', loadCanvas);

// Expose to chat.js
window.Canvas = { updateFocusArea };
