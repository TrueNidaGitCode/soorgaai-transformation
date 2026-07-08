/**
 * SoorgaAI — Try (guest preview) page
 *
 * Try-before-login flow:
 *   1. Landing page saves the objective to sessionStorage and sends the
 *      visitor here — no account needed.
 *   2. We start a guest generation (AI Use Cases domain only) and stream
 *      progress, then render the preview with the other domains locked.
 *   3. "Sign in to unlock" routes through the normal login (email or OAuth)
 *      with redirectAfterLogin pointing back here; on return we claim the
 *      blueprint into the new account and forward to the real workspace.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

const GUEST_ID_KEY   = 'soorgaai_guest_id';
const OBJECTIVE_KEY  = 'soorgaai_pending_objective';
const PREVIEW_DOMAIN = 'ai-use-cases';

// ── Small helpers ─────────────────────────────────────────────────────────────

function getGuestId()  { return localStorage.getItem(GUEST_ID_KEY); }
function getToken()    { return localStorage.getItem('token'); }

function showState(id) {
  ['try-loading', 'try-progress', 'try-error'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? '' : 'none';
  });
}

function showError(msg) {
  const el = document.getElementById('try-error-msg');
  if (el && msg) el.textContent = msg;
  showState('try-error');
}

function goToLogin() {
  localStorage.setItem('redirectAfterLogin', '/try/try.html');
  window.location.href = '/login/login.html';
}

// ── Claim (post-login return path) ────────────────────────────────────────────

async function claimAndEnterWorkspace(guestId) {
  try {
    await fetch(`${API_BASE}/strategy-canvas/claim-guest-blueprint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ guestId }),
    });
  } catch { /* claim is best-effort — workspace still works without it */ }

  localStorage.removeItem(GUEST_ID_KEY);
  sessionStorage.removeItem(OBJECTIVE_KEY);
  window.location.href = '/workspace/workspace.html';
}

// ── Guest generation ──────────────────────────────────────────────────────────

async function startGeneration(objective) {
  const resp = await fetch(`${API_BASE}/guest/generate-blueprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessObjective: objective }),
  });

  if (resp.status === 429) {
    const { error } = await resp.json().catch(() => ({}));
    throw new Error(error || 'Preview limit reached for today. Sign in to keep generating.');
  }
  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({}));
    throw new Error(error || 'Failed to start preview generation.');
  }

  const { guestId } = await resp.json();
  localStorage.setItem(GUEST_ID_KEY, guestId);
  sessionStorage.removeItem(OBJECTIVE_KEY);
  return guestId;
}

async function fetchBlueprint(guestId) {
  const resp = await fetch(`${API_BASE}/guest/blueprint/${encodeURIComponent(guestId)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('Failed to load your preview.');
  return resp.json();
}

// ── Progress rendering (SSE) ──────────────────────────────────────────────────

function renderProgressCaps(domains) {
  const wrap = document.getElementById('try-progress-caps');
  if (!wrap) return;
  const preview = (domains || []).find(d => d.domainId === PREVIEW_DOMAIN);
  if (!preview) return;

  wrap.innerHTML = '';
  (preview.capabilities || []).forEach(cap => {
    const el = document.createElement('div');
    el.className = `try-cap try-cap--${cap.status || 'pending'}`;
    el.innerHTML = `<span class="try-cap__dot"></span><span>${cap.name}</span>`;
    wrap.appendChild(el);
  });
}

function watchProgress(guestId, objective) {
  const objEl = document.getElementById('try-objective');
  if (objEl && objective) objEl.textContent = `"${objective}"`;
  showState('try-progress');

  const es = new EventSource(`${API_BASE}/guest/blueprint/${encodeURIComponent(guestId)}/stream`);

  es.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }

    if (msg.error) { es.close(); showError(msg.error); return; }
    if (msg.domains) renderProgressCaps(msg.domains);

    if (msg.done || msg.overallStatus === 'completed' || msg.overallStatus === 'error') {
      es.close();
      // The workspace renders the completed blueprint (guest mode)
      window.location.href = '/workspace/workspace.html';
    }
  };

  es.onerror = () => {
    // SSE can drop on flaky networks — fall back to polling the blueprint
    es.close();
    const poll = setInterval(async () => {
      const bp = await fetchBlueprint(guestId).catch(() => null);
      if (!bp) { clearInterval(poll); showError(); return; }
      renderProgressCaps(bp.domains?.map(d => ({
        domainId: d.domainId,
        capabilities: (d.capabilities || []).map(c => ({ name: c.capabilityName, status: c.status })),
      })));
      if (bp.status !== 'generating') {
        clearInterval(poll);
        window.location.href = '/workspace/workspace.html';
      }
    }, 3000);
  };
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('try-nav-signin')?.addEventListener('click', goToLogin);

  const guestId   = getGuestId();
  const token     = getToken();
  const objective = sessionStorage.getItem(OBJECTIVE_KEY);

  // Post-login return: attach the preview to the account and enter the product
  if (token && guestId) { await claimAndEnterWorkspace(guestId); return; }

  // Signed in with no guest preview — nothing to do here
  if (token) { window.location.href = '/workspace/workspace.html'; return; }

  try {
    // A fresh objective from the landing prompt wins over any existing
    // preview — "New Blueprint" sends guests back home to type a new one
    if (objective) {
      const newGuestId = await startGeneration(objective);
      watchProgress(newGuestId, objective);
      return;
    }

    if (guestId) {
      const bp = await fetchBlueprint(guestId);
      if (bp) {
        if (bp.status === 'generating') watchProgress(guestId, bp.businessObjective);
        else window.location.href = '/workspace/workspace.html'; // completed/error → workspace renders it
        return;
      }
      // Stale guestId (doc gone/claimed elsewhere) — fall through
      localStorage.removeItem(GUEST_ID_KEY);
    }

    // Nothing to show — back to the landing page prompt
    window.location.href = '/';

  } catch (err) {
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
