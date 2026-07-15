/**
 * SoorgaAI — Knowledge Sources page
 *
 * Manages the Confluence connected-knowledge feature: connect (CTO/Admin
 * only, redirect-based OAuth), select spaces, extract, monitor sync status,
 * re-sync, disconnect. Non-CTO/Admin org members see a read-only status view
 * — the backend enforces the same gating independently of this UI.
 */

const API_BASE = window.CONFIG.API_BASE;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  if (res.status === 401) {
    window.handleSessionExpired?.();
    throw new Error('Session expired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatWhen(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (isNaN(d)) return 'Never';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showOnly(id) {
  document.querySelectorAll('.ks-state').forEach(el => { el.style.display = 'none'; });
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function showBanner(message, kind = 'error') {
  const el = document.getElementById('ks-banner');
  el.textContent = message;
  el.className = `ks-banner ks-banner--${kind}`;
  el.style.display = 'block';
}

// ── State ──────────────────────────────────────────────────────────────────

let canManage = false;
let pollTimer = null;

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

// ── Renderers ──────────────────────────────────────────────────────────────

function renderNotConnected() {
  if (canManage) {
    document.getElementById('ks-disconnected-noaccess').style.display = 'none';
    showOnly('ks-state-disconnected');
    wireConnectButton();
  } else {
    showOnly('ks-state-readonly-empty');
  }
}

// /confluence/connect requires the Authorization header (protect middleware),
// which a plain <a href> navigation cannot send. Fetch the Atlassian URL
// authenticated, then navigate the browser to it — the app JWT never
// appears in a URL, browser history, or server access log.
function wireConnectButton() {
  const btn = document.getElementById('ks-connect-btn');
  btn.onclick = async (e) => {
    e.preventDefault();
    btn.textContent = 'Connecting…';
    try {
      const { url } = await api('/confluence/connect');
      window.location.href = url;
    } catch (err) {
      showBanner(err.message, 'error');
      btn.textContent = 'Connect Confluence';
    }
  };
}

function renderSelectSpaces(status, spaces) {
  document.getElementById('ks-site-name').textContent = status.siteName || 'Confluence';
  const list = document.getElementById('ks-space-list');
  list.innerHTML = spaces.map(s => `
    <label class="ks-space-item">
      <input type="checkbox" class="ks-space-checkbox" value="${esc(s.key)}">
      <span>${esc(s.name)} <span class="ks-space-key">(${esc(s.key)})</span></span>
    </label>
  `).join('') || '<p class="ks-card-body">No spaces found in this Confluence site.</p>';

  const extractBtn = document.getElementById('ks-extract-btn');
  extractBtn.disabled = true;
  list.querySelectorAll('.ks-space-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      extractBtn.disabled = !list.querySelectorAll('.ks-space-checkbox:checked').length;
    });
  });

  showOnly('ks-state-select-spaces');
}

function renderExtracting(status) {
  document.getElementById('ks-extracting-site').textContent = status.siteName || 'Confluence';
  showOnly('ks-state-extracting');
}

function renderActive(status) {
  if (!canManage) {
    document.getElementById('ks-readonly-site').textContent = status.siteName || 'Confluence';
    showOnly('ks-state-readonly-active');
    return;
  }

  document.getElementById('ks-active-site').textContent = status.siteName || '—';
  document.getElementById('ks-active-spaces').textContent = (status.selectedSpaceKeys || []).join(', ') || '—';
  document.getElementById('ks-active-synced').textContent = formatWhen(status.lastSyncedAt);
  const counts = status.documentCounts || {};
  const extracted = counts.extracted || 0;
  const errored = counts.error || 0;
  document.getElementById('ks-active-docs').textContent = errored
    ? `${extracted} extracted, ${errored} failed`
    : `${extracted} extracted`;

  if (status.lastSyncStatus === 'partial_error') {
    showBanner('The last sync completed with some errors — a few pages could not be extracted. Check server logs for details.', 'warning');
  } else if (status.lastSyncStatus === 'error') {
    showBanner(status.lastSyncError || 'The last sync failed.', 'error');
  }

  showOnly('ks-state-active');
}

// ── Orchestration ────────────────────────────────────────────────────────────

async function loadStatus({ poll = false } = {}) {
  const status = await api('/confluence/status');

  if (status.status === 'not_connected') {
    renderNotConnected();
    return;
  }

  if (status.lastSyncStatus === 'syncing') {
    renderExtracting(status);
    stopPolling();
    pollTimer = setTimeout(() => loadStatus({ poll: true }), 4000);
    return;
  }

  if (status.status === 'discovering' && !(status.selectedSpaceKeys || []).length) {
    if (!canManage) { showOnly('ks-state-readonly-empty'); return; }
    const { spaces } = await api('/confluence/spaces');
    renderSelectSpaces(status, spaces);
    return;
  }

  renderActive(status);
}

function wireSpaceSelection() {
  document.getElementById('ks-extract-btn').addEventListener('click', async () => {
    const keys = Array.from(document.querySelectorAll('.ks-space-checkbox:checked')).map(cb => cb.value);
    if (!keys.length) return;

    const btn = document.getElementById('ks-extract-btn');
    btn.disabled = true;
    btn.textContent = 'Starting…';
    try {
      await api('/confluence/extract', { method: 'POST', body: JSON.stringify({ spaceKeys: keys }) });
      await loadStatus();
    } catch (err) {
      showBanner(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Extract selected spaces';
    }
  });
}

function wireActiveActions() {
  document.getElementById('ks-resync-btn').addEventListener('click', async () => {
    try {
      const status = await api('/confluence/status');
      await api('/confluence/extract', { method: 'POST', body: JSON.stringify({ spaceKeys: status.selectedSpaceKeys }) });
      await loadStatus();
    } catch (err) {
      showBanner(err.message, 'error');
    }
  });

  document.getElementById('ks-disconnect-btn').addEventListener('click', () => {
    document.getElementById('ks-disconnect-dialog').style.display = 'flex';
  });
}

function wireDisconnectDialog() {
  const dialog = document.getElementById('ks-disconnect-dialog');
  const close = () => { dialog.style.display = 'none'; };

  document.getElementById('ks-dialog-cancel').addEventListener('click', close);
  document.getElementById('ks-dialog-backdrop').addEventListener('click', close);

  document.getElementById('ks-dialog-confirm').addEventListener('click', async () => {
    const btn = document.getElementById('ks-dialog-confirm');
    btn.disabled = true;
    btn.textContent = 'Disconnecting…';
    try {
      await api('/confluence/disconnect', { method: 'POST' });
      close();
      btn.disabled = false;
      btn.textContent = 'Disconnect';
      await loadStatus();
    } catch (err) {
      showBanner(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Disconnect';
      close();
    }
  });
}

function handleQueryParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) showBanner(params.get('error'), 'error');
  if (params.get('connected')) showBanner('Confluence connected. Choose spaces to extract below.', 'success');
  if (params.get('error') || params.get('connected')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
}

async function determineCanManage() {
  try {
    const profile = await api('/profile/me');
    const jwtRole = localStorage.getItem('role') || 'user';
    return jwtRole === 'admin' || profile?.role === 'CTO';
  } catch {
    return false;
  }
}

function logout() {
  ['token', 'username', 'userId', 'role'].forEach(k => localStorage.removeItem(k));
  window.location.href = '/index.html';
}

async function init() {
  if (!localStorage.getItem('token')) {
    window.location.href = '/login/login.html?redirect=/knowledge-sources/knowledge-sources.html';
    return;
  }

  document.getElementById('ks-logout').addEventListener('click', logout);
  const usernameEl = document.getElementById('ks-username');
  if (usernameEl) usernameEl.textContent = localStorage.getItem('username') || '';

  wireSpaceSelection();
  wireActiveActions();
  wireDisconnectDialog();
  handleQueryParams();

  canManage = await determineCanManage();

  try {
    await loadStatus();
  } catch (err) {
    showBanner(err.message, 'error');
  } finally {
    document.getElementById('ks-loading').style.display = 'none';
    document.getElementById('ks-content').style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('beforeunload', stopPolling);
