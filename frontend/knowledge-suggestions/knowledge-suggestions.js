/**
 * SoorgaAI — Knowledge Suggestions Review Page
 *
 * Lists all knowledge suggestions for the logged-in user.
 * Supports status filtering and approve/reject actions.
 */

const API_BASE  = window.CONFIG?.API_BASE || 'http://localhost:3000/api';
const getToken  = () => localStorage.getItem('token');

// ── State ─────────────────────────────────────────────────────────────────────

let _currentStatus = '';
let _items         = [];

// ── DOM refs (set after DOMContentLoaded) ─────────────────────────────────────

let loadingEl, emptyEl, tableWrapEl, tbodyEl, totalEl, filterBtns, drawerOverlayEl, drawerBodyEl;

// ── Auth guard ────────────────────────────────────────────────────────────────

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login/login.html?redirect=/knowledge-suggestions/knowledge-suggestions.html';
    return false;
  }
  return true;
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function fetchSuggestions(status) {
  const params = new URLSearchParams({ limit: 100 });
  if (status) params.set('status', status);

  const resp = await fetch(`${API_BASE}/knowledge-suggestions?${params}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (resp.status === 401) {
    window.location.href = '/login/login.html?redirect=/knowledge-suggestions/knowledge-suggestions.html';
    throw new Error('session expired');
  }

  if (!resp.ok) throw new Error('Failed to fetch suggestions');
  return resp.json();
}

async function actionSuggestion(id, action) {
  const resp = await fetch(`${API_BASE}/knowledge-suggestions/${id}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Failed to ${action} suggestion`);
  return resp.json();
}

// ── Render ────────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function confidenceBar(confidence) {
  if (confidence == null) return '<span style="color:rgba(255,255,255,0.3)">—</span>';
  const pct = Math.round(confidence * 100);
  return `
    <div class="ks-confidence">
      <div class="ks-conf-bar">
        <div class="ks-conf-fill" style="width:${pct}%"></div>
      </div>
      <span class="ks-conf-pct">${pct}%</span>
    </div>
  `;
}

function actionButtons(item) {
  const isPending = item.status === 'PENDING';
  if (!isPending) return '<span style="color:rgba(255,255,255,0.25);font-size:12px">—</span>';

  return `
    <div class="ks-actions">
      <button class="ks-action-btn ks-action-btn--approve" data-id="${item._id}" data-action="approve">Approve</button>
      <button class="ks-action-btn ks-action-btn--reject"  data-id="${item._id}" data-action="reject">Reject</button>
      <button class="ks-action-btn ks-action-btn--detail"  data-id="${item._id}" data-action="detail">Detail</button>
    </div>
  `;
}

function renderRow(item) {
  return `
    <tr data-id="${item._id}">
      <td class="ks-table__title">${escapeHtml(item.title)}</td>
      <td><span class="ks-type ks-type--${item.knowledgeType}">${item.knowledgeType}</span></td>
      <td>${item.suggestedCapability ? escapeHtml(item.suggestedCapability) : '<span style="color:rgba(255,255,255,0.25)">—</span>'}</td>
      <td>${item.suggestedSection    ? escapeHtml(item.suggestedSection)    : '<span style="color:rgba(255,255,255,0.25)">—</span>'}</td>
      <td>${confidenceBar(item.confidence)}</td>
      <td><span class="ks-status ks-status--${item.status}">${item.status}</span></td>
      <td style="white-space:nowrap;font-size:13px;color:rgba(255,255,255,0.45)">${formatDate(item.createdAt)}</td>
      <td>${actionButtons(item)}</td>
    </tr>
  `;
}

function renderTable(items) {
  loadingEl.hidden    = true;
  emptyEl.hidden      = true;
  tableWrapEl.hidden  = true;

  totalEl.textContent = items.length ? `${items.length} suggestion${items.length !== 1 ? 's' : ''}` : '';

  if (items.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  tbodyEl.innerHTML = items.map(renderRow).join('');
  tableWrapEl.hidden = false;
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load(status) {
  loadingEl.hidden   = false;
  emptyEl.hidden     = true;
  tableWrapEl.hidden = true;

  try {
    const result = await fetchSuggestions(status);
    _items = result.items || [];
    renderTable(_items);
  } catch (err) {
    if (err.message === 'session expired') return;
    loadingEl.hidden = true;
    emptyEl.hidden   = false;
    console.error('[KS] load error:', err);
  }
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function openDetail(id) {
  const item = _items.find(i => i._id === id);
  if (!item) return;

  const fields = [
    ['Title',       item.title],
    ['Description', item.description],
    ['Type',        item.knowledgeType],
    ['Capability',  item.suggestedCapability || '—'],
    ['Section',     item.suggestedSection    || '—'],
    ['Confidence',  item.confidence != null ? `${Math.round(item.confidence * 100)}%` : '—'],
    ['Reasoning',   item.reasoning           || '—'],
    ['Status',      item.status],
    ['Created',     formatDate(item.createdAt)],
    ['Source',      item.sourceConversation  || '—'],
  ];

  drawerBodyEl.innerHTML = fields.map(([label, value]) => `
    <div class="ks-detail-section">
      <p class="ks-detail-label">${label}</p>
      <p class="ks-detail-value">${escapeHtml(String(value))}</p>
    </div>
  `).join('');

  drawerOverlayEl.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  drawerOverlayEl.hidden = true;
  document.body.style.overflow = '';
}

// ── Event delegation ──────────────────────────────────────────────────────────

async function handleTableClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const { id, action } = btn.dataset;
  if (!id || !action) return;

  if (action === 'detail') {
    openDetail(id);
    return;
  }

  btn.disabled = true;
  const row    = btn.closest('tr');

  try {
    const updated = await actionSuggestion(id, action);

    // Update local state
    const idx = _items.findIndex(i => i._id === id);
    if (idx !== -1) _items[idx] = updated;

    // Re-render the row
    if (row) row.outerHTML = renderRow(updated);
  } catch (err) {
    console.error(`[KS] ${action} error:`, err);
    btn.disabled = false;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  loadingEl       = document.getElementById('ks-loading');
  emptyEl         = document.getElementById('ks-empty');
  tableWrapEl     = document.getElementById('ks-table-wrap');
  tbodyEl         = document.getElementById('ks-tbody');
  totalEl         = document.getElementById('ks-total');
  filterBtns      = document.querySelectorAll('.ks-filter-btn');
  drawerOverlayEl = document.getElementById('ks-drawer-overlay');
  drawerBodyEl    = document.getElementById('ks-drawer-body');

  // Filter buttons
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('ks-filter-btn--active'));
      btn.classList.add('ks-filter-btn--active');
      _currentStatus = btn.dataset.status || '';
      load(_currentStatus);
    });
  });

  // Table action delegation
  document.getElementById('ks-tbody').addEventListener('click', handleTableClick);

  // Drawer close
  document.getElementById('ks-drawer-close').addEventListener('click', closeDetail);
  drawerOverlayEl.addEventListener('click', e => { if (e.target === drawerOverlayEl) closeDetail(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

  // Initial load — show PENDING by default
  const pendingBtn = document.querySelector('[data-status="PENDING"]');
  if (pendingBtn) pendingBtn.click();
});
