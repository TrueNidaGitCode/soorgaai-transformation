/**
 * SoorgaAI — Company Research Library (platform admin only)
 *
 * List + create companies, run web-search research, review and
 * approve/discard/edit drafted sections before they become available to be
 * copied into any matching org's EnterpriseBlueprint at signup (see
 * ensureBlueprint in backend/trunida-backend/services/enterpriseBlueprintService.js).
 *
 * Client-side role guard only — the backend independently enforces
 * adminOnly on every /api/admin/company-library/* route.
 */

const API_BASE = window.CONFIG.API_BASE;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}/admin/company-library${path}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showBanner(message, kind = 'error') {
  const el = document.getElementById('cl-banner');
  el.textContent = message;
  el.className = `cl-banner cl-banner--${kind}`;
  el.style.display = 'block';
}

function hideBanner() {
  document.getElementById('cl-banner').style.display = 'none';
}

// ── State ──────────────────────────────────────────────────────────────────

let currentEntry = null;   // full library entry when in detail view
let selected     = null;   // { capabilityId, sectionTitle }

// ── List view ──────────────────────────────────────────────────────────────

async function loadList() {
  document.getElementById('cl-list-loading').style.display = 'flex';
  document.getElementById('cl-table').style.display = 'none';
  document.getElementById('cl-list-empty').style.display = 'none';

  try {
    const { entries } = await api('/');
    document.getElementById('cl-list-loading').style.display = 'none';

    if (!entries.length) {
      document.getElementById('cl-list-empty').style.display = 'block';
      return;
    }

    const tbody = document.getElementById('cl-table-body');
    tbody.innerHTML = entries.map(e => `
      <tr class="cl-table__row" data-id="${esc(e._id)}">
        <td>${esc(e.companyName)}</td>
        <td>${esc(e.industry)}</td>
        <td>${e.subVertical ? esc(e.subVertical) : '—'}</td>
        <td><span class="signal-badge active">${esc(e.status)}</span></td>
        <td>${e.filled} / ${e.total}</td>
        <td>${e.hasDraft > 0 ? `<span class="signal-badge signal-type-trending">${e.hasDraft} pending</span>` : '—'}</td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.cl-table__row').forEach(row => {
      row.addEventListener('click', () => openDetail(row.dataset.id));
    });
    document.getElementById('cl-table').style.display = 'table';
  } catch (err) {
    document.getElementById('cl-list-loading').style.display = 'none';
    showBanner(err.message || 'Failed to load companies.');
  }
}

async function handleCreate(evt) {
  evt.preventDefault();
  hideBanner();
  const companyName = document.getElementById('cl-company-name').value.trim();
  const industry     = document.getElementById('cl-industry').value;
  const subVertical  = document.getElementById('cl-sub-vertical').value.trim();
  if (!companyName) return;

  const btn = document.getElementById('cl-create-btn');
  btn.disabled = true;
  try {
    const { entry } = await api('/', { method: 'POST', body: JSON.stringify({ companyName, industry, subVertical }) });
    document.getElementById('cl-company-name').value = '';
    document.getElementById('cl-sub-vertical').value = '';
    await loadList();
    openDetail(entry._id);
  } catch (err) {
    showBanner(err.message || 'Failed to create company.');
  } finally {
    btn.disabled = false;
  }
}

// ── Detail view ────────────────────────────────────────────────────────────

function showListView() {
  history.replaceState(null, '', 'company-library.html');
  document.getElementById('cl-detail-view').style.display = 'none';
  document.getElementById('cl-list-view').style.display = 'block';
  currentEntry = null;
  selected = null;
  loadList();
}

async function openDetail(id) {
  hideBanner();
  history.replaceState(null, '', `company-library.html?id=${encodeURIComponent(id)}`);
  document.getElementById('cl-list-view').style.display = 'none';
  document.getElementById('cl-detail-view').style.display = 'block';
  selected = null;

  try {
    const { entry } = await api(`/${encodeURIComponent(id)}`);
    currentEntry = entry;
    renderDetailHeader();
    renderSidebar();
    renderPanel();
  } catch (err) {
    showBanner(err.message || 'Failed to load company.');
  }
}

function renderDetailHeader() {
  document.getElementById('cl-detail-title').textContent = currentEntry.companyName;
  document.getElementById('cl-detail-meta').textContent = `${currentEntry.industry} · Status: ${currentEntry.status}`;

  const indicator = document.getElementById('cl-vertical-indicator');
  if (currentEntry.subVertical) {
    indicator.innerHTML = `Sub-vertical: <strong>${esc(currentEntry.subVertical)}</strong> — <a href="industry-verticals.html">review reference material →</a>`;
    indicator.style.display = 'block';
  } else {
    indicator.style.display = 'none';
  }
}

function findSection(capabilityId, sectionTitle) {
  const cap = currentEntry?.capabilities.find(c => c.capabilityId === capabilityId);
  return cap?.sections.find(s => s.title === sectionTitle) || null;
}

function capabilityFor(sectionTitle) {
  return currentEntry.capabilities.find(c => c.sections.some(s => s.title === sectionTitle));
}

function renderSidebar() {
  const nav = document.getElementById('cl-sidebar');
  nav.innerHTML = '';

  currentEntry.capabilities.forEach(cap => {
    const group = document.createElement('div');
    group.className = 'eb-sidebar__group';

    const heading = document.createElement('p');
    heading.className = 'eb-sidebar__capability';
    heading.textContent = cap.capabilityName;
    group.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'eb-sidebar__sections';

    cap.sections.forEach(section => {
      const item = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'eb-sidebar__section-btn';
      if (selected?.capabilityId === cap.capabilityId && selected?.sectionTitle === section.title) {
        btn.classList.add('eb-sidebar__section-btn--active');
      }

      const label = document.createElement('span');
      label.textContent = section.title;
      btn.appendChild(label);

      if (section.draftContent) {
        const badge = document.createElement('span');
        badge.className = 'eb-sidebar__draft-badge';
        badge.textContent = 'Draft';
        btn.appendChild(badge);
      } else if (section.content) {
        const badge = document.createElement('span');
        badge.className = 'eb-sidebar__filled-dot';
        badge.setAttribute('aria-label', 'Approved');
        btn.appendChild(badge);
      }

      btn.addEventListener('click', () => {
        selected = { capabilityId: cap.capabilityId, sectionTitle: section.title };
        renderSidebar();
        renderPanel();
      });
      item.appendChild(btn);
      list.appendChild(item);
    });

    group.appendChild(list);
    nav.appendChild(group);
  });
}

function renderPanel() {
  const panel = document.getElementById('cl-panel');
  panel.innerHTML = '';

  if (!selected) {
    const empty = document.createElement('p');
    empty.className = 'eb-panel__empty';
    empty.textContent = 'Select a section from the left to review its content.';
    panel.appendChild(empty);
    return;
  }

  const section = findSection(selected.capabilityId, selected.sectionTitle);
  if (!section) return;

  const title = document.createElement('h2');
  title.className = 'eb-panel__title';
  title.textContent = section.title;
  panel.appendChild(title);

  if (section.draftContent) {
    panel.appendChild(buildDraftReview(section));
  } else if (section.content) {
    panel.appendChild(buildApprovedView(section));
  } else {
    panel.appendChild(buildEmptyView(section));
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

function buildDraftReview(section) {
  const wrap = document.createElement('div');
  wrap.className = 'eb-draft';

  const flag = document.createElement('div');
  flag.className = section.draftSource === 'external-research'
    ? 'eb-draft__flag eb-draft__flag--high'
    : 'eb-draft__flag eb-draft__flag--low';
  flag.textContent = section.draftSource === 'external-research'
    ? 'Drafted from external research — review before approving'
    : 'Limited public information found — drafted at an industry-general level. Review carefully.';
  wrap.appendChild(flag);

  const textarea = document.createElement('textarea');
  textarea.className = 'eb-textarea';
  textarea.readOnly = true;
  textarea.value = section.draftContent;
  wrap.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'eb-actions';
  actions.appendChild(makeBtn('Approve', 'eb-btn--primary', () => approveDraft(section)));
  actions.appendChild(makeBtn('Edit before approving', 'eb-btn--secondary', () => {
    textarea.readOnly = false;
    textarea.focus();
    actions.innerHTML = '';
    actions.appendChild(makeBtn('Save & Approve', 'eb-btn--primary', () => approveDraft(section, textarea.value)));
    actions.appendChild(makeBtn('Cancel', 'eb-btn--secondary', renderPanel));
  }));
  actions.appendChild(makeBtn('Discard', 'eb-btn--danger', () => discardDraft(section)));
  wrap.appendChild(actions);

  return wrap;
}

function buildApprovedView(section) {
  const wrap = document.createElement('div');
  wrap.className = 'eb-approved';

  const meta = document.createElement('p');
  meta.className = 'eb-approved__meta';
  meta.textContent = section.updatedAt ? `Approved ${new Date(section.updatedAt).toLocaleDateString()}` : '';
  wrap.appendChild(meta);

  const textarea = document.createElement('textarea');
  textarea.className = 'eb-textarea';
  textarea.readOnly = true;
  textarea.value = section.content;
  wrap.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'eb-actions';
  actions.appendChild(makeBtn('Edit', 'eb-btn--secondary', () => {
    textarea.readOnly = false;
    textarea.focus();
    actions.innerHTML = '';
    actions.appendChild(makeBtn('Save', 'eb-btn--primary', () => saveManualContent(section, textarea.value)));
    actions.appendChild(makeBtn('Cancel', 'eb-btn--secondary', renderPanel));
  }));
  wrap.appendChild(actions);

  return wrap;
}

function buildEmptyView(section) {
  const wrap = document.createElement('div');
  wrap.className = 'eb-empty';

  const note = document.createElement('p');
  note.className = 'eb-empty__note';
  note.textContent = 'No content yet for this section. Run research above, or write it manually.';
  wrap.appendChild(note);

  const textarea = document.createElement('textarea');
  textarea.className = 'eb-textarea';
  textarea.placeholder = 'Write this section’s content…';
  wrap.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'eb-actions';
  actions.appendChild(makeBtn('Save', 'eb-btn--primary', () => saveManualContent(section, textarea.value)));
  wrap.appendChild(actions);

  return wrap;
}

// ── Actions ────────────────────────────────────────────────────────────────

async function saveManualContent(section, newContent) {
  hideBanner();
  const cap = capabilityFor(section.title);
  const sections = cap.sections.map(s => ({ title: s.title, content: s.title === section.title ? newContent : s.content }));

  try {
    const { entry } = await api(`/${currentEntry._id}/capability/${encodeURIComponent(cap.capabilityId)}`, {
      method: 'PATCH', body: JSON.stringify({ sections }),
    });
    currentEntry = entry;
    renderDetailHeader();
    renderSidebar();
    renderPanel();
  } catch (err) {
    showBanner(err.message || 'Failed to save.');
  }
}

async function approveDraft(section, editedContent) {
  hideBanner();
  const cap = capabilityFor(section.title);
  try {
    if (typeof editedContent === 'string' && editedContent.trim() !== section.draftContent.trim()) {
      const sections = cap.sections.map(s => ({ title: s.title, content: s.title === section.title ? editedContent : s.content }));
      await api(`/${currentEntry._id}/capability/${encodeURIComponent(cap.capabilityId)}`, {
        method: 'PATCH', body: JSON.stringify({ sections }),
      });
      const { entry } = await api(`/${currentEntry._id}/capability/${encodeURIComponent(cap.capabilityId)}/section/${encodeURIComponent(section.title)}/discard`, { method: 'POST' });
      currentEntry = entry;
    } else {
      const { entry } = await api(`/${currentEntry._id}/capability/${encodeURIComponent(cap.capabilityId)}/section/${encodeURIComponent(section.title)}/approve`, { method: 'POST' });
      currentEntry = entry;
    }
    renderDetailHeader();
    renderSidebar();
    renderPanel();
  } catch (err) {
    showBanner(err.message || 'Failed to approve draft.');
  }
}

async function discardDraft(section) {
  hideBanner();
  const cap = capabilityFor(section.title);
  try {
    const { entry } = await api(`/${currentEntry._id}/capability/${encodeURIComponent(cap.capabilityId)}/section/${encodeURIComponent(section.title)}/discard`, { method: 'POST' });
    currentEntry = entry;
    renderDetailHeader();
    renderSidebar();
    renderPanel();
  } catch (err) {
    showBanner(err.message || 'Failed to discard draft.');
  }
}

async function runResearch() {
  hideBanner();
  const btn = document.getElementById('cl-research-btn');
  btn.disabled = true;
  btn.textContent = 'Researching…';
  try {
    const { entry } = await api(`/${currentEntry._id}/research`, { method: 'POST' });
    currentEntry = entry;
    renderDetailHeader();
    renderSidebar();
    renderPanel();
  } catch (err) {
    showBanner(err.message || 'Research failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Research';
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    localStorage.setItem('redirectAfterLogin', '/admin/company-library.html');
    window.location.href = '/admin/login.html';
    return;
  }

  document.getElementById('cl-create-form').addEventListener('submit', handleCreate);
  document.getElementById('cl-back-btn').addEventListener('click', showListView);
  document.getElementById('cl-research-btn').addEventListener('click', runResearch);

  const id = new URLSearchParams(window.location.search).get('id');
  if (id) {
    openDetail(id);
  } else {
    loadList();
  }
});
