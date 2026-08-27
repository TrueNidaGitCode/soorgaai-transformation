/**
 * Svarg — Pipeline Wizard: Window 1's real Confluence connector
 *
 * Adapted from frontend/knowledge-sources/knowledge-sources.js's personal
 * connect/space/page picker. Deliberately stops before POST /personal/link
 * — there's no real TransformationBlueprint for this wizard to attach
 * documents to, and nothing downstream reads LinkedProjectDocument for the
 * defect-matching pipeline anyway. Selected page titles are stored in
 * wizard sessionStorage state and rendered as "linked" client-side only.
 */

const API_BASE = window.CONFIG?.API_BASE || 'http://localhost:3000/api';
const getToken = () => localStorage.getItem('token');
const STATE_KEY = 'svarg.pipelineWizard.v1';

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadWizardState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return {};
}

function saveLinkedTitles(titles) {
  const state = loadWizardState();
  state.confluenceLinkedTitles = titles;
  sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function showOnly(id) {
  ['pw-conf-spaces', 'pw-conf-pages'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = sid === id ? 'block' : 'none';
  });
}

function showConnectedBadge(siteName) {
  document.getElementById('pw-conf-connected-badge').style.display = 'flex';
  document.getElementById('pw-conf-connected-site').textContent = siteName || 'Confluence';
  document.getElementById('pw-conf-disconnected').style.display = 'none';
}

function renderLinkedList() {
  const titles = loadWizardState().confluenceLinkedTitles || [];
  const el = document.getElementById('pw-conf-linked-list');
  if (!titles.length) { el.style.display = 'none'; return; }
  el.innerHTML = `<p class="ks-card-body"><strong>Linked for this session:</strong> ${titles.map(esc).join(', ')}</p>`;
  el.style.display = 'block';
}

function showError(message) {
  const el = document.getElementById('pw-conf-error');
  el.textContent = message;
  el.style.display = 'block';
}

function renderSpaces(siteName, spaces) {
  showConnectedBadge(siteName);
  const list = document.getElementById('pw-conf-space-list');
  list.innerHTML = spaces.map(s => `
    <div class="ks-space-item ks-space-item--row">
      <div class="ks-space-item__info">
        <span class="ks-space-item__name">${esc(s.name)}</span>
        <span class="ks-space-key">${esc(s.key)}</span>
      </div>
      <div class="ks-space-item__actions">
        <button type="button" class="ks-space-item__action ks-space-item__choose" data-space-key="${esc(s.key)}">Choose pages &rarr;</button>
      </div>
    </div>
  `).join('') || '<p class="ks-card-body">No spaces found in this Confluence site.</p>';

  list.querySelectorAll('.ks-space-item__choose').forEach(el => {
    el.addEventListener('click', () => loadPages(el.dataset.spaceKey));
  });

  showOnly('pw-conf-spaces');
}

async function loadPages(spaceKey) {
  try {
    const { pages } = await api(`/confluence/personal/spaces/${encodeURIComponent(spaceKey)}/pages`);
    const list = document.getElementById('pw-conf-page-list');
    list.innerHTML = pages.map(p => `
      <label class="ks-space-item">
        <input type="checkbox" class="pw-conf-page-checkbox" value="${esc(p.title)}">
        <span>${esc(p.title)}</span>
      </label>
    `).join('') || '<p class="ks-card-body">No pages found in this space.</p>';

    const selectBtn = document.getElementById('pw-conf-select-btn');
    selectBtn.disabled = true;

    list.querySelectorAll('.pw-conf-page-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        selectBtn.disabled = !list.querySelectorAll('.pw-conf-page-checkbox:checked').length;
      });
    });

    selectBtn.onclick = () => {
      const titles = Array.from(list.querySelectorAll('.pw-conf-page-checkbox:checked')).map(cb => cb.value);
      const existing = loadWizardState().confluenceLinkedTitles || [];
      saveLinkedTitles([...new Set([...existing, ...titles])]);
      renderLinkedList();
      showOnly('pw-conf-spaces');
    };

    showOnly('pw-conf-pages');
  } catch (err) {
    showError(err.message);
  }
}

async function loadSpaces(status) {
  try {
    const { spaces } = await api('/confluence/personal/spaces');
    renderSpaces(status.siteName, spaces);
  } catch (err) {
    showError(err.message);
  }
}

function wireConnectButton() {
  const btn = document.getElementById('pw-conf-connect-btn');
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    btn.textContent = 'Connecting…';
    try {
      const { url } = await api('/confluence/personal/connect?returnTo=pipeline-wizard');
      window.location.href = url;
    } catch (err) {
      showError(err.message);
      btn.textContent = 'Connect your Confluence';
    }
  });
}

export async function initConfluenceConnector() {
  wireConnectButton();
  renderLinkedList();

  document.getElementById('pw-conf-back-to-spaces').addEventListener('click', () => showOnly('pw-conf-spaces'));

  const params = new URLSearchParams(window.location.search);
  if (params.get('personalConnected')) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  try {
    const status = await api('/confluence/personal/status');
    if (!status.connected) return;
    await loadSpaces(status);
  } catch (err) {
    showError(err.message);
  }
}
