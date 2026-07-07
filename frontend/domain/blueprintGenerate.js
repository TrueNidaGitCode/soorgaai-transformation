/**
 * SoorgaAI — Blueprint Generate Module
 *
 * Manages Screen 1 (Generate form) and Screen 2 (Generation Progress).
 *
 * Flow:
 *   1. On page load: check for existing TransformationBlueprint.
 *      - If completed  → dispatch 'blueprint:ready' (workspace takes over Screen 3)
 *      - If generating → show Screen 2 and reconnect to SSE stream
 *      - If none       → show Screen 1
 *
 *   2. Screen 1: user enters objective, clicks Generate.
 *      POST /api/strategy-canvas/generate-transformation → { transformationId }
 *      Then show Screen 2 and open SSE stream.
 *
 *   3. Screen 2: SSE updates domain/capability status cards in real time.
 *      When done → dispatch 'blueprint:ready' with full blueprint data.
 *
 * Events dispatched:
 *   'blueprint:ready' — { blueprint } — tells workspace module to take over
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

// ── Screen helpers ────────────────────────────────────────────────────────────

function showScreen(id) {
  ['screen-generate', 'screen-progress', 'screen-workspace', 'domain-loading'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? '' : 'none';
  });
}

// ── Nav / logout ──────────────────────────────────────────────────────────────

function initNav() {
  const usernameEl = document.getElementById('domain-username');
  if (usernameEl) usernameEl.textContent = localStorage.getItem('userEmail') || '';

  const logoutBtn = document.getElementById('domain-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      window.location.href = '/login/login.html';
    });
  }
}

// ── Screen 2: Domain-grouped progress rendering ───────────────────────────────

const STATUS_ICON  = { pending: '○', 'in-progress': '⟳', generating: '⟳', completed: '✓', error: '✕' };
const STATUS_CLASS = {
  pending:       'pending',
  'in-progress': 'progress',
  generating:    'progress',
  completed:     'completed',
  error:         'error',
};

function capStatusLabel(status) {
  if (status === 'in-progress' || status === 'generating') return 'In Progress';
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderProgressDomains(domains) {
  const container = document.getElementById('prog-domains');
  if (!container) return;
  container.innerHTML = '';

  for (const domain of domains) {
    const section = document.createElement('div');
    section.className = 'prog-domain';
    section.dataset.domainId = domain.domainId;

    const header = document.createElement('div');
    header.className = 'prog-domain__header';
    const nameEl = document.createElement('h3');
    nameEl.className = 'prog-domain__name';
    nameEl.textContent = domain.domainName;
    header.appendChild(nameEl);
    section.appendChild(header);

    const capsGrid = document.createElement('div');
    capsGrid.className = 'prog-domain__caps';

    for (const cap of (domain.capabilities || [])) {
      const cls  = STATUS_CLASS[cap.status] || 'pending';
      const icon = STATUS_ICON[cap.status]  || '○';
      const card = document.createElement('div');
      card.className = `prog-cap prog-cap--${cls}`;
      card.dataset.domainId = domain.domainId;
      card.dataset.capId    = cap.id || cap.capabilityId;
      card.innerHTML = `
        <span class="prog-cap__icon prog-cap__icon--${cls}" aria-hidden="true">${icon}</span>
        <span class="prog-cap__name">${cap.name || cap.capabilityName}</span>
        <span class="prog-cap__status-label prog-cap__status-label--${cls}">${capStatusLabel(cap.status)}</span>
      `;
      capsGrid.appendChild(card);
    }

    section.appendChild(capsGrid);
    container.appendChild(section);
  }
}

function updateProgressCard(domainId, capId, status) {
  const selector = `.prog-cap[data-domain-id="${CSS.escape(domainId)}"][data-cap-id="${CSS.escape(capId)}"]`;
  const card = document.querySelector(selector);
  if (!card) return;

  const cls   = STATUS_CLASS[status] || 'pending';
  const icon  = STATUS_ICON[status]  || '○';
  const label = capStatusLabel(status);

  card.className = `prog-cap prog-cap--${cls}`;
  const iconEl  = card.querySelector('.prog-cap__icon');
  const labelEl = card.querySelector('.prog-cap__status-label');
  if (iconEl)  { iconEl.textContent  = icon;  iconEl.className  = `prog-cap__icon prog-cap__icon--${cls}`; }
  if (labelEl) { labelEl.textContent = label; labelEl.className = `prog-cap__status-label prog-cap__status-label--${cls}`; }
}

// ── SSE: stream generation progress ──────────────────────────────────────────

let _sseReader = null;

async function connectProgressStream(transformationId) {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch(
      `${API_BASE}/strategy-canvas/generate-transformation/${transformationId}/stream`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok || !response.body) {
      console.error('[blueprintGenerate] SSE connection failed');
      return;
    }

    _sseReader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = '';
    while (true) {
      const { done, value } = await _sseReader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const msg = JSON.parse(line.slice(6));
          handleProgressMessage(msg, transformationId);
          if (msg.done) return;
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    console.error('[blueprintGenerate] SSE error:', err);
  }
}

function handleProgressMessage(msg, transformationId) {
  if (msg.error) {
    console.error('[blueprintGenerate] Server error:', msg.error);
    return;
  }

  // Update individual capability cards within their domains
  if (msg.domains) {
    for (const domain of msg.domains) {
      for (const cap of (domain.capabilities || [])) {
        updateProgressCard(domain.domainId, cap.id || cap.capabilityId, cap.status);
      }
    }
  }

  if (msg.done) {
    loadBlueprintAndTransition(transformationId);
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchTransformationBlueprint() {
  // Honor a specific blueprint picked from the landing-page sidebar
  const openId = sessionStorage.getItem('soorgaai_open_blueprint_id');
  const url = openId
    ? `${API_BASE}/strategy-canvas/transformation-blueprint?id=${encodeURIComponent(openId)}`
    : `${API_BASE}/strategy-canvas/transformation-blueprint`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  // Must be checked before the generic !resp.ok fallthrough — otherwise an
  // expired session gets silently treated as "no blueprint yet" and the user
  // is dropped into the generate-a-new-blueprint screen instead of being
  // told they've been logged out.
  if (resp.status === 401) { window.handleSessionExpired(); throw new Error('SESSION_EXPIRED'); }
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('Failed to load blueprint');
  return resp.json();
}

async function loadBlueprintAndTransition(transformationId) {
  try {
    const bp = await fetchTransformationBlueprint();
    if (bp) {
      document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    }
  } catch (err) {
    console.error('[blueprintGenerate] Failed to load blueprint after generation:', err);
  }
}

// ── Screen 1: form logic ──────────────────────────────────────────────────────

function initGenerateForm() {
  const form         = document.getElementById('generate-form');
  const input        = document.getElementById('gen-objective');
  const errEl        = document.getElementById('gen-error');
  const submitBtn    = document.getElementById('gen-submit');
  const submitText   = document.getElementById('gen-submit-text');
  const submitLoader = document.getElementById('gen-submit-loader');

  // Example chips fill the textarea
  document.querySelectorAll('.gen-example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (input) input.value = chip.dataset.text;
      input?.focus();
    });
  });

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const objective = input?.value?.trim();

    if (!objective) {
      showError(errEl, 'Please enter your business objective.');
      return;
    }

    if (errEl) errEl.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.style.display = 'none';
    if (submitLoader) submitLoader.style.display = '';

    try {
      const resp = await fetch(`${API_BASE}/strategy-canvas/generate-transformation`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ businessObjective: objective }),
      });

      if (resp.status === 401) { window.handleSessionExpired(); return; }
      if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({}));
        throw new Error(error || 'Failed to start blueprint generation.');
      }

      const { transformationId } = await resp.json();

      const objEl = document.getElementById('prog-objective');
      if (objEl) objEl.textContent = `"${objective}"`;

      // Fetch the shell blueprint (domains + capabilities pre-seeded as pending) for initial render
      await initProgressFromBlueprint();

      showScreen('screen-progress');
      connectProgressStream(transformationId);

    } catch (err) {
      showError(errEl, err.message || 'Something went wrong. Please try again.');
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.style.display = '';
      if (submitLoader) submitLoader.style.display = 'none';
    }
  });
}

async function initProgressFromBlueprint() {
  try {
    const bp = await fetchTransformationBlueprint();
    if (bp?.domains) renderProgressDomains(bp.domains);
  } catch { /* non-critical */ }
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  const token = getToken();
  if (!token) {
    window.location.href = `/login/login.html?redirect=/domain/domain.html`;
    return;
  }

  initNav();

  try {
    const bp = await fetchTransformationBlueprint();

    if (!bp) {
      showScreen('screen-generate');
      initGenerateForm();
      return;
    }

    if (bp.status === 'generating') {
      // Reconnect to in-progress stream
      const objEl = document.getElementById('prog-objective');
      if (objEl) objEl.textContent = `"${bp.businessObjective || ''}"`;
      renderProgressDomains(bp.domains || []);
      showScreen('screen-progress');
      connectProgressStream(bp._id);
      return;
    }

    // Blueprint completed — workspace takes over
    document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    initGenerateForm(); // keep form initialised in case user clicks New Blueprint

  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') return; // already redirecting home
    console.error('[blueprintGenerate] init error:', err);
    showScreen('screen-generate');
    initGenerateForm();
  }
}

document.addEventListener('DOMContentLoaded', init);
