/**
 * Svarg — Industry KB (platform admin only)
 *
 * Review/approve/discard auto-generated Industry-overlay KB documents,
 * created automatically by industryCapabilityKnowledgeService.js's
 * ensureIndustryCoverage() the first time a company in a new industry is
 * added to the Company Research Library (see company-library.js's
 * renderIndustryKbIndicator). No manual "create" here — entries only ever
 * come from that automatic flow.
 *
 * Unlike company-library.js/industry-verticals.js, each capability here
 * holds ONE whole generated markdown document (draft or published), not a
 * sections[] array — so the detail view is one document per capability,
 * grouped by domain, with Approve / Edit-then-approve / Discard on the
 * whole thing. Reuses the same eb-sidebar/eb-panel/eb-draft CSS classes.
 *
 * Client-side role guard only — the backend independently enforces
 * adminOnly on every /api/admin/industry-kb/* route.
 */

const API_BASE = window.CONFIG.API_BASE;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}/admin/industry-kb${path}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showBanner(message, kind = 'error') {
  const el = document.getElementById('ik-banner');
  el.textContent = message;
  el.className = `cl-banner cl-banner--${kind}`;
  el.style.display = 'block';
}

function hideBanner() {
  document.getElementById('ik-banner').style.display = 'none';
}

function domainLabel(kbPath) {
  return String(kbPath || '').replace(/_/g, ' ');
}

// ── State ──────────────────────────────────────────────────────────────────

let currentEntry     = null; // full industry entry when in detail view
let selectedCapId    = null;
let _sseReader        = null;

// ── List view ──────────────────────────────────────────────────────────────

async function loadList() {
  document.getElementById('ik-list-loading').style.display = 'flex';
  document.getElementById('ik-table').style.display = 'none';
  document.getElementById('ik-list-empty').style.display = 'none';

  try {
    const { entries } = await api('/');
    document.getElementById('ik-list-loading').style.display = 'none';

    if (!entries.length) {
      document.getElementById('ik-list-empty').style.display = 'block';
      return;
    }

    const tbody = document.getElementById('ik-table-body');
    tbody.innerHTML = entries.map(e => `
      <tr class="cl-table__row" data-id="${esc(e._id)}">
        <td>${esc(e.industry)}</td>
        <td><span class="signal-badge active">${esc(e.status)}</span></td>
        <td>${e.progress?.completed ?? 0} / ${e.progress?.total ?? 0}</td>
        <td>${e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.cl-table__row').forEach(row => {
      row.addEventListener('click', () => openDetail(row.dataset.id));
    });
    document.getElementById('ik-table').style.display = 'table';
  } catch (err) {
    document.getElementById('ik-list-loading').style.display = 'none';
    showBanner(err.message || 'Failed to load industries.');
  }
}

// ── Detail view ────────────────────────────────────────────────────────────

function showListView() {
  history.replaceState(null, '', 'industry-kb.html');
  stopProgressStream();
  document.getElementById('ik-detail-view').style.display = 'none';
  document.getElementById('ik-list-view').style.display = 'block';
  currentEntry  = null;
  selectedCapId = null;
  loadList();
}

async function openDetail(id) {
  hideBanner();
  history.replaceState(null, '', `industry-kb.html?id=${encodeURIComponent(id)}`);
  document.getElementById('ik-list-view').style.display = 'none';
  document.getElementById('ik-detail-view').style.display = 'block';
  selectedCapId = null;

  try {
    const { entry } = await api(`/${encodeURIComponent(id)}`);
    currentEntry = entry;
    renderDetailHeader();
    renderSidebar();
    renderPanel();

    if (entry.status === 'generating') connectProgressStream(entry._id);
  } catch (err) {
    showBanner(err.message || 'Failed to load industry.');
  }
}

function renderDetailHeader() {
  document.getElementById('ik-detail-title').textContent = currentEntry.industry;
  document.getElementById('ik-detail-meta').textContent = `Status: ${currentEntry.status}`;

  const pendingPanel  = document.getElementById('ik-pending-panel');
  const progressPanel = document.getElementById('ik-progress-panel');

  if (currentEntry.status === 'pending') {
    const { total = 0 } = currentEntry.progress || {};
    document.getElementById('ik-pending-label').textContent =
      `Not yet generated — ${total} capabilities pending. This will make ~${total} AI calls (real cost, a few minutes).`;
    pendingPanel.style.display = 'flex';
    pendingPanel.style.alignItems = 'center';
    progressPanel.style.display = 'none';
  } else if (currentEntry.status === 'generating') {
    const { completed = 0, total = 0, currentCapability = '' } = currentEntry.progress || {};
    const pct = total ? Math.round((completed / total) * 100) : 0;
    document.getElementById('ik-progress-fill').style.width = `${pct}%`;
    document.getElementById('ik-progress-label').textContent =
      `Generating capability ${completed + 1} of ${total}${currentCapability ? `: ${currentCapability}` : ''}…`;
    pendingPanel.style.display = 'none';
    progressPanel.style.display = 'block';
  } else {
    pendingPanel.style.display = 'none';
    progressPanel.style.display = 'none';
  }
}

async function handleGenerate() {
  hideBanner();
  const btn = document.getElementById('ik-generate-btn');
  btn.disabled = true;
  btn.textContent = 'Starting…';
  try {
    const { entry } = await api(`/${currentEntry._id}/generate`, { method: 'POST' });
    currentEntry = entry;
    renderDetailHeader();
    renderSidebar();
    renderPanel();
    if (entry.status === 'generating') connectProgressStream(entry._id);
  } catch (err) {
    showBanner(err.message || 'Failed to start generation.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Industry KB';
  }
}

function capabilityById(capabilityId) {
  return currentEntry?.capabilities.find(c => c.capabilityId === capabilityId) || null;
}

function renderSidebar() {
  const nav = document.getElementById('ik-sidebar');
  nav.innerHTML = '';

  const domains = new Map(); // kbPath -> capabilities[]
  for (const cap of currentEntry.capabilities) {
    if (!domains.has(cap.domainKbPath)) domains.set(cap.domainKbPath, []);
    domains.get(cap.domainKbPath).push(cap);
  }

  for (const [kbPath, caps] of domains) {
    const group = document.createElement('div');
    group.className = 'eb-sidebar__group';

    const heading = document.createElement('p');
    heading.className = 'eb-sidebar__capability';
    heading.textContent = domainLabel(kbPath);
    group.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'eb-sidebar__sections';

    caps.forEach(cap => {
      const item = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'eb-sidebar__section-btn';
      if (selectedCapId === cap.capabilityId) btn.classList.add('eb-sidebar__section-btn--active');

      const label = document.createElement('span');
      label.textContent = cap.capabilityName;
      btn.appendChild(label);

      if (cap.status === 'draft') {
        const badge = document.createElement('span');
        badge.className = 'eb-sidebar__draft-badge';
        badge.textContent = 'Draft';
        btn.appendChild(badge);
      } else if (cap.status === 'published') {
        const badge = document.createElement('span');
        badge.className = 'eb-sidebar__filled-dot';
        badge.setAttribute('aria-label', 'Published');
        btn.appendChild(badge);
      } else if (cap.status === 'failed') {
        const badge = document.createElement('span');
        badge.className = 'eb-sidebar__draft-badge';
        badge.style.background = 'rgba(255,107,107,0.15)';
        badge.style.borderColor = 'rgba(255,107,107,0.35)';
        badge.style.color = '#ff6b6b';
        badge.textContent = 'Failed';
        btn.appendChild(badge);
      }

      btn.addEventListener('click', () => {
        selectedCapId = cap.capabilityId;
        renderSidebar();
        renderPanel();
      });
      item.appendChild(btn);
      list.appendChild(item);
    });

    group.appendChild(list);
    nav.appendChild(group);
  }
}

function renderPanel() {
  const panel = document.getElementById('ik-panel');
  panel.innerHTML = '';

  if (!selectedCapId) {
    const empty = document.createElement('p');
    empty.className = 'eb-panel__empty';
    empty.textContent = 'Select a capability from the left to review its generated content.';
    panel.appendChild(empty);
    return;
  }

  const cap = capabilityById(selectedCapId);
  if (!cap) return;

  const title = document.createElement('h2');
  title.className = 'eb-panel__title';
  title.textContent = cap.capabilityName;
  panel.appendChild(title);

  if (cap.status === 'draft') {
    panel.appendChild(buildDraftReview(cap));
  } else if (cap.status === 'published') {
    panel.appendChild(buildPublishedView(cap));
  } else if (cap.status === 'failed') {
    panel.appendChild(buildFailedView(cap));
  } else {
    const note = document.createElement('p');
    note.className = 'eb-empty__note';
    note.textContent = 'Queued for generation.';
    panel.appendChild(note);
  }
}

function makeBtn(text, cls, handler) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `eb-btn ${cls}`;
  btn.textContent = text;
  btn.addEventListener('click', handler);
  return btn;
}

function buildDraftReview(cap) {
  const wrap = document.createElement('div');
  wrap.className = 'eb-draft';

  const flag = document.createElement('div');
  flag.className = cap.draftSource === 'external-research'
    ? 'eb-draft__flag eb-draft__flag--high'
    : 'eb-draft__flag eb-draft__flag--low';
  flag.textContent = cap.draftSource === 'external-research'
    ? 'Generated from external research — review before approving'
    : 'Limited public information found — generated at an industry-general level. Review carefully.';
  wrap.appendChild(flag);

  const textarea = document.createElement('textarea');
  textarea.className = 'eb-textarea';
  textarea.readOnly = true;
  textarea.value = cap.draftContent;
  textarea.style.minHeight = '420px';
  wrap.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'eb-actions';
  actions.appendChild(makeBtn('Approve', 'eb-btn--primary', () => approveCapability(cap)));
  actions.appendChild(makeBtn('Edit before approving', 'eb-btn--secondary', () => {
    textarea.readOnly = false;
    textarea.focus();
    actions.innerHTML = '';
    actions.appendChild(makeBtn('Save & Approve', 'eb-btn--primary', () => approveCapability(cap, textarea.value)));
    actions.appendChild(makeBtn('Cancel', 'eb-btn--secondary', renderPanel));
  }));
  actions.appendChild(makeBtn('Discard', 'eb-btn--danger', () => discardCapability(cap)));
  wrap.appendChild(actions);

  return wrap;
}

function buildPublishedView(cap) {
  const wrap = document.createElement('div');
  wrap.className = 'eb-approved';

  const meta = document.createElement('p');
  meta.className = 'eb-approved__meta';
  meta.textContent = cap.publishedAt ? `Published ${new Date(cap.publishedAt).toLocaleDateString()}` : '';
  wrap.appendChild(meta);

  const textarea = document.createElement('textarea');
  textarea.className = 'eb-textarea';
  textarea.readOnly = true;
  textarea.value = cap.content;
  textarea.style.minHeight = '420px';
  wrap.appendChild(textarea);

  return wrap;
}

function buildFailedView(cap) {
  const wrap = document.createElement('div');
  const note = document.createElement('p');
  note.className = 'eb-empty__note';
  note.textContent = cap.error || 'Generation failed for this capability.';
  wrap.appendChild(note);
  return wrap;
}

// ── Actions ────────────────────────────────────────────────────────────────

async function approveCapability(cap, editedContent) {
  hideBanner();
  try {
    const { entry } = await api(`/${currentEntry._id}/capability/${encodeURIComponent(cap.capabilityId)}/approve`, {
      method: 'POST',
      body: JSON.stringify(typeof editedContent === 'string' ? { editedContent } : {}),
    });
    currentEntry = entry;
    renderDetailHeader();
    renderSidebar();
    renderPanel();
  } catch (err) {
    showBanner(err.message || 'Failed to approve.');
  }
}

async function discardCapability(cap) {
  hideBanner();
  try {
    const { entry } = await api(`/${currentEntry._id}/capability/${encodeURIComponent(cap.capabilityId)}/discard`, { method: 'POST' });
    currentEntry = entry;
    renderDetailHeader();
    renderSidebar();
    renderPanel();
  } catch (err) {
    showBanner(err.message || 'Failed to discard.');
  }
}

// ── SSE: stream generation progress ──────────────────────────────────────────

function stopProgressStream() {
  if (_sseReader) {
    _sseReader.cancel().catch(() => {});
    _sseReader = null;
  }
}

async function connectProgressStream(industryKnowledgeId) {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE}/admin/industry-kb/${industryKnowledgeId}/stream`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok || !response.body) return;

    _sseReader = response.body.pipeThrough(new TextDecoderStream()).getReader();

    let buffer = '';
    while (true) {
      const { done, value } = await _sseReader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const msg = JSON.parse(line.slice(6));
          if (msg.error) continue;
          if (msg.status) {
            currentEntry.status = msg.status;
            currentEntry.progress = msg.progress;
            renderDetailHeader();
          }
          if (msg.done) {
            // Generation finished — refetch to pick up the final drafts.
            openDetail(industryKnowledgeId);
            return;
          }
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    console.error('[industry-kb] SSE error:', err);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    localStorage.setItem('redirectAfterLogin', '/admin/industry-kb.html');
    window.location.href = '/admin/login.html';
    return;
  }

  document.getElementById('ik-back-btn').addEventListener('click', showListView);
  document.getElementById('ik-generate-btn').addEventListener('click', handleGenerate);

  const id = new URLSearchParams(window.location.search).get('id');
  if (id) {
    openDetail(id);
  } else {
    loadList();
  }
});
