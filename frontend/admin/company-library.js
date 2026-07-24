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

// While validating a single capability end-to-end, hide the rest of the
// sidebar so review isn't split across unrelated capabilities. Add more
// names here to bring the next capability into focus; clear the array to
// show everything again.
const FOCUS_CAPABILITIES = ['AI Opportunity Discovery'];

function visibleCapabilities(capabilities) {
  if (!FOCUS_CAPABILITIES.length) return capabilities;
  const focused = capabilities.filter(c => FOCUS_CAPABILITIES.includes(c.capabilityName));
  return focused.length ? focused : capabilities;
}

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

    const focused = visibleCapabilities(currentEntry.capabilities)[0];
    if (focused) selected = { capabilityId: focused.capabilityId, sectionTitle: null };

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

  renderCapabilityMap();
}

function renderCapabilityMap() {
  const panel = document.getElementById('cl-capmap-panel');
  const body  = document.getElementById('cl-capmap-body');
  const map   = currentEntry.capabilityMap || {};
  const approved = map.content || [];
  const draft    = map.draftContent || [];

  if (approved.length === 0 && draft.length === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  body.innerHTML = '';

  if (draft.length > 0) {
    const flag = document.createElement('div');
    flag.className = map.draftSource === 'external-research'
      ? 'eb-draft__flag eb-draft__flag--high'
      : 'eb-draft__flag eb-draft__flag--low';
    flag.textContent = map.draftSource === 'external-research'
      ? 'Drafted from external research — review before approving'
      : 'Limited public information found. Review carefully.';
    body.appendChild(flag);

    body.appendChild(buildCapabilityMapTable(draft));

    const actions = document.createElement('div');
    actions.className = 'eb-actions';
    actions.appendChild(makeBtn('Approve All', 'eb-btn--primary', approveCapabilityMap));
    actions.appendChild(makeBtn('Discard', 'eb-btn--danger', discardCapabilityMap));
    body.appendChild(actions);
    return;
  }

  const meta = document.createElement('p');
  meta.className = 'eb-approved__meta';
  meta.textContent = map.updatedAt ? `Approved ${new Date(map.updatedAt).toLocaleDateString()}` : '';
  body.appendChild(meta);
  body.appendChild(buildCapabilityMapTable(approved));
}

function buildCapabilityMapTable(rows) {
  const table = document.createElement('table');
  table.className = 'cl-table cl-capmap-table';
  table.innerHTML = `
    <thead>
      <tr><th>Industry Challenge</th><th>Company Capability</th><th>Mechanism</th></tr>
    </thead>
    <tbody>
      ${rows.map(r => `
        <tr>
          <td>${esc(r.industryChallenge)}</td>
          <td>${esc(r.companyCapability)}</td>
          <td>${esc(r.mechanism)}</td>
        </tr>
      `).join('')}
    </tbody>`;
  return table;
}

function capabilityFor(sectionTitle) {
  return currentEntry.capabilities.find(c => c.sections.some(s => s.title === sectionTitle));
}

function renderSidebar() {
  const nav = document.getElementById('cl-sidebar');
  nav.innerHTML = '';

  const note = document.getElementById('cl-capabilities-focus-note');
  note.textContent = FOCUS_CAPABILITIES.length
    ? `Focused on ${FOCUS_CAPABILITIES.join(', ')} — other capabilities are hidden while this one is under review.`
    : '';

  visibleCapabilities(currentEntry.capabilities).forEach(cap => {
    const group = document.createElement('div');
    group.className = 'eb-sidebar__group';

    // Capability heading is now the primary click target — selects the whole
    // capability and shows every one of its sections stacked together, like
    // reading a KB markdown file, instead of one section at a time.
    const heading = document.createElement('button');
    heading.type = 'button';
    heading.className = 'eb-sidebar__capability eb-sidebar__capability-btn';
    if (selected?.capabilityId === cap.capabilityId) {
      heading.classList.add('eb-sidebar__capability-btn--active');
    }
    heading.textContent = cap.capabilityName;
    heading.addEventListener('click', () => {
      selected = { capabilityId: cap.capabilityId, sectionTitle: null };
      renderSidebar();
      renderPanel();
    });
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

      // Selects the parent capability's full document view, then scrolls
      // straight to this section within it — a shortcut into the document,
      // not a separate single-section view anymore.
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
    empty.textContent = 'Select a capability from the left to review all of its sections together.';
    panel.appendChild(empty);
    return;
  }

  const cap = currentEntry.capabilities.find(c => c.capabilityId === selected.capabilityId);
  if (!cap) return;

  const title = document.createElement('h2');
  title.className = 'eb-panel__title';
  title.textContent = cap.capabilityName;
  panel.appendChild(title);

  // Automotive/Industry KB is written once per capability (not per section —
  // the KB layers aren't structured symmetrically), so it's shown once here,
  // above every section, rather than repeated under each one.
  if (cap.kbAutomotiveContext) {
    panel.appendChild(buildKbReferenceBlock('AUTOMOTIVE INDUSTRY CONTEXT', cap.kbAutomotiveContext));
  }

  // Capability Map only feeds generation for AI Opportunity Discovery — shown
  // here, stacked with Core/Automotive, only for that capability so it reads
  // as one reference set rather than a generic block on every capability.
  if (cap.capabilityName === 'AI Opportunity Discovery') {
    const approvedMap = currentEntry.capabilityMap?.content || [];
    if (approvedMap.length > 0) {
      panel.appendChild(buildCapabilityMapReferenceBlock(approvedMap));
    }
  }

  cap.sections.forEach((section, i) => {
    const block = document.createElement('div');
    block.className = 'cl-doc-section';
    block.dataset.sectionTitle = section.title;

    const heading = document.createElement('h3');
    heading.className = 'cl-doc-section__title';
    heading.textContent = section.title;
    block.appendChild(heading);

    if (section.kbCoreDefinition) {
      block.appendChild(buildKbReferenceBlock('CORE DEFINITION', section.kbCoreDefinition));
    }

    const companyLabel = document.createElement('p');
    companyLabel.className = 'cl-kb-ref__label';
    companyLabel.textContent = 'COMPANY PROFILE';
    block.appendChild(companyLabel);

    if (section.draftContent) {
      block.appendChild(buildDraftReview(section));
    } else if (section.content) {
      block.appendChild(buildApprovedView(section));
    } else {
      block.appendChild(buildEmptyView(section));
    }

    if (i < cap.sections.length - 1) {
      const divider = document.createElement('hr');
      divider.className = 'cl-doc-divider';
      block.appendChild(divider);
    }

    panel.appendChild(block);
  });

  if (selected.sectionTitle) {
    const target = panel.querySelector(`[data-section-title="${CSS.escape(selected.sectionTitle)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Read-only reference block — Core/Automotive KB text shown for comparison
// only, never editable and never sent back to the server.
function buildKbReferenceBlock(label, text) {
  const wrap = document.createElement('div');
  wrap.className = 'cl-kb-ref';

  const labelEl = document.createElement('p');
  labelEl.className = 'cl-kb-ref__label';
  labelEl.textContent = label;
  wrap.appendChild(labelEl);

  const body = document.createElement('p');
  body.className = 'cl-kb-ref__body';
  body.textContent = text;
  wrap.appendChild(body);

  return wrap;
}

// Read-only reference block for the approved Company Capability Map — same
// visual language as buildKbReferenceBlock, but renders the table instead of
// plain text since the map is structured rows, not prose.
function buildCapabilityMapReferenceBlock(rows) {
  const wrap = document.createElement('div');
  wrap.className = 'cl-kb-ref';

  const labelEl = document.createElement('p');
  labelEl.className = 'cl-kb-ref__label';
  labelEl.textContent = 'COMPANY CAPABILITY MAP';
  wrap.appendChild(labelEl);

  wrap.appendChild(buildCapabilityMapTable(rows));

  return wrap;
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

async function approveCapabilityMap() {
  hideBanner();
  try {
    const { entry } = await api(`/${currentEntry._id}/capability-map/approve`, { method: 'POST' });
    currentEntry = entry;
    renderDetailHeader();
  } catch (err) {
    showBanner(err.message || 'Failed to approve capability map.');
  }
}

async function discardCapabilityMap() {
  hideBanner();
  try {
    const { entry } = await api(`/${currentEntry._id}/capability-map/discard`, { method: 'POST' });
    currentEntry = entry;
    renderDetailHeader();
  } catch (err) {
    showBanner(err.message || 'Failed to discard capability map.');
  }
}

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
