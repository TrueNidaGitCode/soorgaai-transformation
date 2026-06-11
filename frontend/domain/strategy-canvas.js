/**
 * SoorgaAI — Strategy Canvas Module (Sprint 14.1 / 15)
 *
 * Dynamically builds the AI Strategy Canvas from the Intelligence Specification.
 *
 * States:
 *   list      — capability cards derived from the spec's Knowledge Architecture
 *   blueprint — sections of a selected capability (Core + Industry merged)
 *
 * Dispatches:
 *   'canvas:ready'       — after initial capability list loads (coordinates layout reveal)
 *   'blueprint:loaded'   — after a capability blueprint loads (detail: { capabilityId, blueprint })
 *   'blueprint:cleared'  — when the user returns to the capability list
 *
 * Exposes:
 *   window.StrategyCanvas.getCurrentContext() — current { capabilityId, blueprint } or null
 *   window.Canvas                             — legacy no-op for backward compat
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken()   { return localStorage.getItem('token'); }
function getDomainId() { return new URLSearchParams(window.location.search).get('domain') || 'ai-strategy'; }

// ── Session context (shared with advisor.js via window.StrategyCanvas) ────────

let _currentContext = null; // { capabilityId, blueprint }

// ── Render helpers ────────────────────────────────────────────────────────────

function renderCapabilityList(capabilities, container) {
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'capability-list';

  for (const cap of capabilities) {
    const card = document.createElement('button');
    card.className = 'capability-card';
    card.dataset.capabilityId = cap.id;
    card.setAttribute('aria-label', `Open ${cap.name} blueprint`);

    card.innerHTML = `
      <span class="capability-card__name">${cap.name}</span>
      <span class="capability-card__objective">${cap.objective}</span>
      <span class="capability-card__arrow" aria-hidden="true">→</span>
    `;

    card.addEventListener('click', () => loadBlueprint(cap.id, container));
    list.appendChild(card);
  }

  container.appendChild(list);
}

function renderBlueprint(blueprint, container) {
  container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'blueprint-view';

  // Back button
  const back = document.createElement('button');
  back.className = 'blueprint-back-btn';
  back.textContent = '← All Capabilities';
  back.setAttribute('aria-label', 'Back to capability list');
  back.addEventListener('click', () => loadCapabilities(container));
  view.appendChild(back);

  // Capability header
  const header = document.createElement('div');
  header.className = 'blueprint-header';
  header.innerHTML = `
    <h3 class="blueprint-capability-name">${blueprint.capabilityName}</h3>
    <span class="blueprint-industry-badge">${blueprint.industry}</span>
  `;
  view.appendChild(header);

  // Sections
  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'blueprint-sections';

  for (const section of blueprint.sections) {
    const card = document.createElement('div');
    card.className = 'blueprint-section';
    if (section.source === 'both') card.classList.add('blueprint-section--enriched');

    let html = `<h4 class="blueprint-section__title">${section.title}</h4>`;

    if (section.definition) {
      html += `<p class="blueprint-section__definition">${escapeHtml(section.definition)}</p>`;
    }

    if (section.keyPrinciples.length > 0) {
      html += `<ul class="blueprint-section__principles">
        ${section.keyPrinciples.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
      </ul>`;
    }

    if (section.leadershipQuestion) {
      html += `<p class="blueprint-section__question">${escapeHtml(section.leadershipQuestion)}</p>`;
    }

    if (section.industryContext) {
      html += `<div class="blueprint-section__industry">
        <span class="blueprint-section__industry-label">${blueprint.industry} Context</span>
        <p>${escapeHtml(extractFirstParagraph(section.industryContext))}</p>
      </div>`;
    }

    card.innerHTML = html;
    sectionsEl.appendChild(card);
  }

  view.appendChild(sectionsEl);
  container.appendChild(view);

  // Scroll the panel to top when blueprint loads
  container.closest('.canvas-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderError(message, container) {
  container.innerHTML = `<p class="canvas-error">${message}</p>`;
}

function renderLoading(container) {
  container.innerHTML = `
    <div class="canvas-loading">
      <div class="ws-spinner"></div>
    </div>
  `;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function loadCapabilities(container) {
  renderLoading(container);

  // Clear session context when returning to list
  _currentContext = null;
  document.dispatchEvent(new CustomEvent('blueprint:cleared'));

  const token = getToken();
  if (!token) {
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${getDomainId()}`;
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/capabilities`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
    if (resp.status === 404) { window.location.href = '/profile-setup/profile.html'; return; }
    if (!resp.ok) throw new Error('Failed to load capabilities.');

    const { capabilities } = await resp.json();

    const sub = document.getElementById('canvas-subheading');
    if (sub) sub.textContent = 'Select a capability to explore its blueprint.';

    renderCapabilityList(capabilities, container);

  } catch (err) {
    console.error('loadCapabilities error:', err);
    renderError('Failed to load capabilities. Refresh to retry.', container);
  }
}

async function loadBlueprint(capabilityId, container) {
  renderLoading(container);

  const token = getToken();

  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/blueprint/${capabilityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) throw new Error('Failed to load blueprint.');

    const blueprint = await resp.json();

    // Store session context — advisor.js reads this via window.StrategyCanvas
    _currentContext = { capabilityId, blueprint };
    document.dispatchEvent(new CustomEvent('blueprint:loaded', { detail: _currentContext }));

    const sub = document.getElementById('canvas-subheading');
    if (sub) sub.textContent = 'Core and industry frameworks merged into your capability blueprint.';

    renderBlueprint(blueprint, container);

  } catch (err) {
    console.error('loadBlueprint error:', err);
    renderError('Failed to load blueprint. Please try again.', container);
    setTimeout(() => loadCapabilities(container), 2000);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractFirstParagraph(text) {
  // Return first non-empty, non-heading, non-list, non-separator paragraph
  const lines = text.split('\n');
  const paragraphLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed === '---') {
      if (paragraphLines.length > 0) break; // end of first paragraph
      continue;
    }
    if (trimmed.startsWith('*') || trimmed.startsWith('-') || trimmed.startsWith('>')) {
      if (paragraphLines.length > 0) break;
      continue;
    }
    paragraphLines.push(trimmed);
  }

  return paragraphLines.join(' ').replace(/\*\*/g, '').trim();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  const domainId = getDomainId();
  const token    = getToken();

  if (!token) {
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${domainId}`;
    return;
  }

  const container = document.getElementById('canvas-content');
  if (!container) return;

  await loadCapabilities(container);

  // Signal chat.js that the left panel is ready
  document.dispatchEvent(new CustomEvent('canvas:ready'));
}

document.addEventListener('DOMContentLoaded', init);

// ── Global context API ────────────────────────────────────────────────────────

// advisor.js reads this to know which capability + blueprint is active.
window.StrategyCanvas = {
  getCurrentContext: () => _currentContext,
};

// Backward-compat: legacy canvas.js contract kept for any references in chat.js.
window.Canvas = { updateFocusArea: () => {} };
