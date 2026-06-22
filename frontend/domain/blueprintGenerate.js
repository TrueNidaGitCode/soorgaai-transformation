/**
 * SoorgaAI — Blueprint Generate Module (PI 26.3 Sprint 1)
 *
 * Manages Screen 1 (Generate Blueprint form) and Screen 2 (Generation Progress).
 *
 * Flow:
 *   1. On page load: check API for existing blueprint.
 *      - If completed  → dispatch 'blueprint:ready' (blueprintWorkspace takes over Screen 3)
 *      - If generating → show Screen 2 and reconnect to SSE stream
 *      - If none       → show Screen 1
 *
 *   2. Screen 1: user enters business objective, clicks Generate.
 *      POST /api/strategy-canvas/generate-blueprint → { blueprintId }
 *      Then show Screen 2 and open SSE stream.
 *
 *   3. Screen 2: SSE stream updates capability status cards in real time.
 *      When all done → dispatch 'blueprint:ready' with full blueprint data.
 *
 * Events dispatched:
 *   'blueprint:ready'   — { blueprint }  — tells workspace module to take over
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken()  { return localStorage.getItem('token'); }
function getUserId() { return localStorage.getItem('userId') || ''; }

// ── Screen helpers ────────────────────────────────────────────────────────────

function showScreen(id) {
  ['screen-generate', 'screen-progress', 'screen-workspace', 'domain-loading'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? '' : 'none';
  });
}

// ── Logout ────────────────────────────────────────────────────────────────────

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

// ── Screen 2: Progress rendering ─────────────────────────────────────────────

const STATUS_ICON  = { pending: '○', 'in-progress': '⟳', completed: '✓', error: '✕' };
const STATUS_CLASS = {
  pending:      'pending',
  'in-progress':'progress',
  completed:    'completed',
  error:        'error',
};

function renderProgressCapabilities(capabilities) {
  const container = document.getElementById('prog-capabilities');
  if (!container) return;
  container.innerHTML = '';

  for (const cap of capabilities) {
    const cls  = STATUS_CLASS[cap.status] || 'pending';
    const icon = STATUS_ICON[cap.status]  || '○';
    const card = document.createElement('div');
    card.className = `prog-cap prog-cap--${cls}`;
    card.dataset.capId = cap.id;
    card.innerHTML = `
      <span class="prog-cap__icon prog-cap__icon--${cls}" aria-hidden="true">${icon}</span>
      <span class="prog-cap__name">${cap.name}</span>
      <span class="prog-cap__status-label prog-cap__status-label--${cls}">${cap.status === 'in-progress' ? 'In Progress' : cap.status.charAt(0).toUpperCase() + cap.status.slice(1)}</span>
    `;
    container.appendChild(card);
  }
}

function updateProgressCard(capId, status) {
  const card = document.querySelector(`.prog-cap[data-cap-id="${CSS.escape(capId)}"]`);
  if (!card) return;

  const cls  = STATUS_CLASS[status] || 'pending';
  const icon = STATUS_ICON[status]  || '○';
  const label = status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);

  card.className = `prog-cap prog-cap--${cls}`;
  const iconEl  = card.querySelector('.prog-cap__icon');
  const labelEl = card.querySelector('.prog-cap__status-label');
  if (iconEl) {
    iconEl.textContent = icon;
    iconEl.className   = `prog-cap__icon prog-cap__icon--${cls}`;
  }
  if (labelEl) {
    labelEl.textContent = label;
    labelEl.className   = `prog-cap__status-label prog-cap__status-label--${cls}`;
  }
}

// ── SSE: stream generation progress ──────────────────────────────────────────

let _sseReader = null;

async function connectProgressStream(blueprintId) {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch(
      `${API_BASE}/strategy-canvas/generate-blueprint/${blueprintId}/stream`,
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
          handleProgressMessage(msg, blueprintId);
          if (msg.done) return;
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    console.error('[blueprintGenerate] SSE error:', err);
  }
}

function handleProgressMessage(msg, blueprintId) {
  if (msg.error) {
    console.error('[blueprintGenerate] Server error:', msg.error);
    return;
  }

  if (msg.capabilities) {
    for (const cap of msg.capabilities) {
      updateProgressCard(cap.id, cap.status);
    }
  }

  if (msg.done) {
    // Fetch completed blueprint then hand off to workspace
    loadBlueprintAndTransition(blueprintId);
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchCompanyBlueprint() {
  const resp = await fetch(`${API_BASE}/strategy-canvas/company-blueprint`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('Failed to load blueprint');
  return resp.json();
}

async function loadBlueprintAndTransition(blueprintId) {
  try {
    const bp = await fetchCompanyBlueprint();
    if (bp) {
      document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    }
  } catch (err) {
    console.error('[blueprintGenerate] Failed to load blueprint after generation:', err);
  }
}

// ── Screen 1: form logic ──────────────────────────────────────────────────────

function initGenerateForm() {
  const form    = document.getElementById('generate-form');
  const input   = document.getElementById('gen-objective');
  const errEl   = document.getElementById('gen-error');
  const submitBtn  = document.getElementById('gen-submit');
  const submitText = document.getElementById('gen-submit-text');
  const submitLoader = document.getElementById('gen-submit-loader');

  // Example chips fill the text area
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

    // Loading state
    if (errEl) errEl.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.style.display = 'none';
    if (submitLoader) submitLoader.style.display = '';

    try {
      const resp = await fetch(`${API_BASE}/strategy-canvas/generate-blueprint`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ businessObjective: objective }),
      });

      if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
      if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({}));
        throw new Error(error || 'Failed to start blueprint generation.');
      }

      const { blueprintId } = await resp.json();

      // Show progress screen
      const objEl = document.getElementById('prog-objective');
      if (objEl) objEl.textContent = `"${objective}"`;

      // Init all caps as pending from API capability list
      await initProgressFromCapabilities(objective);

      showScreen('screen-progress');
      connectProgressStream(blueprintId);

    } catch (err) {
      showError(errEl, err.message || 'Something went wrong. Please try again.');
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.style.display = '';
      if (submitLoader) submitLoader.style.display = 'none';
    }
  });
}

async function initProgressFromCapabilities(objective) {
  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/capabilities`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!resp.ok) return;
    const { capabilities } = await resp.json();

    const objEl = document.getElementById('prog-objective');
    if (objEl) objEl.textContent = `"${objective}"`;

    renderProgressCapabilities(capabilities.map(c => ({ id: c.id, name: c.name, status: 'pending' })));
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
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=ai-strategy`;
    return;
  }

  initNav();

  try {
    const bp = await fetchCompanyBlueprint();

    if (!bp) {
      showScreen('screen-generate');
      initGenerateForm();
      return;
    }

    if (bp.status === 'generating') {
      // Reconnect to in-progress stream
      const objective = bp.businessObjective || '';
      const objEl = document.getElementById('prog-objective');
      if (objEl) objEl.textContent = `"${objective}"`;
      renderProgressCapabilities(
        (bp.capabilities || []).map(c => ({ id: c.capabilityId, name: c.capabilityName, status: c.status }))
      );
      showScreen('screen-progress');
      connectProgressStream(bp._id);
      return;
    }

    // Blueprint is completed — workspace module takes over
    document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    initGenerateForm(); // keep form initialised in case user wants to regenerate later

  } catch (err) {
    console.error('[blueprintGenerate] init error:', err);
    showScreen('screen-generate');
    initGenerateForm();
  }
}

document.addEventListener('DOMContentLoaded', init);
