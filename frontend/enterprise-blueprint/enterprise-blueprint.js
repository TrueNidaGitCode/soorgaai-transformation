/**
 * Svarg — Enterprise Blueprint page (org's own CTO/Admin)
 *
 * Shows the org's proprietary AI strategy document as a capability sidebar +
 * section detail panel. Sections may already be filled in from a matching
 * CompanyResearchLibrary entry (admin-approved public research, copied in at
 * signup — see ensureBlueprint) or from this org's own CTO typing directly;
 * both look identical here, no review/approve UI at this level — that
 * happens centrally, by Svarg platform admins, in
 * frontend/admin/company-library.js before any org ever sees it. Empty
 * sections can be filled in manually.
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

// ── State ──────────────────────────────────────────────────────────────────

let blueprint = null;          // full { orgName, industry, status, capabilities } doc
let selected  = null;          // { capabilityId, sectionTitle }

// ── Helpers ────────────────────────────────────────────────────────────────

function findSection(capabilityId, sectionTitle) {
  const cap = blueprint?.capabilities.find(c => c.capabilityId === capabilityId);
  return cap?.sections.find(s => s.title === sectionTitle) || null;
}

function showBanner(message) {
  const el = document.getElementById('eb-error');
  el.textContent = message;
  el.style.display = 'block';
}

function hideBanner() {
  document.getElementById('eb-error').style.display = 'none';
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function renderSidebar() {
  const nav = document.getElementById('eb-sidebar');
  nav.innerHTML = '';

  blueprint.capabilities.forEach(cap => {
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

      if (section.content) {
        const badge = document.createElement('span');
        badge.className = 'eb-sidebar__filled-dot';
        badge.setAttribute('aria-label', 'Filled');
        btn.appendChild(badge);
      }

      btn.addEventListener('click', () => selectSection(cap.capabilityId, section.title));
      item.appendChild(btn);
      list.appendChild(item);
    });

    group.appendChild(list);
    nav.appendChild(group);
  });
}

function selectSection(capabilityId, sectionTitle) {
  selected = { capabilityId, sectionTitle };
  renderSidebar();
  renderPanel();
}

// ── Detail panel ───────────────────────────────────────────────────────────

function renderPanel() {
  const panel = document.getElementById('eb-panel');
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

  if (section.content) {
    panel.appendChild(buildApprovedView(section));
  } else {
    panel.appendChild(buildEmptyView(section));
  }
}

function buildApprovedView(section) {
  const wrap = document.createElement('div');
  wrap.className = 'eb-approved';

  const sourceLabel = section.contentSource === 'company-library'
    ? 'Sourced from Svarg company research'
    : section.contentSource === 'cto-manual'
      ? 'Entered manually'
      : '';
  const meta = document.createElement('p');
  meta.className = 'eb-approved__meta';
  meta.textContent = [
    sourceLabel,
    section.updatedAt ? `Last updated ${new Date(section.updatedAt).toLocaleDateString()}` : '',
  ].filter(Boolean).join(' · ');
  wrap.appendChild(meta);

  const textarea = document.createElement('textarea');
  textarea.className = 'eb-textarea';
  textarea.readOnly = true;
  textarea.value = section.content;
  wrap.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'eb-actions';
  actions.appendChild(makeBtn('Edit', 'eb-btn--secondary', () => editApproved(section, textarea, actions)));
  wrap.appendChild(actions);

  return wrap;
}

function editApproved(section, textarea, actions) {
  textarea.readOnly = false;
  textarea.focus();
  actions.innerHTML = '';
  actions.appendChild(makeBtn('Save', 'eb-btn--primary', () => saveManualContent(section, textarea.value)));
  actions.appendChild(makeBtn('Cancel', 'eb-btn--secondary', renderPanel));
}

function buildEmptyView(section) {
  const wrap = document.createElement('div');
  wrap.className = 'eb-empty';

  const note = document.createElement('p');
  note.className = 'eb-empty__note';
  note.textContent = 'No content yet for this section.';
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

function makeBtn(text, cls, handler) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `eb-btn ${cls}`;
  btn.textContent = text;
  btn.addEventListener('click', handler);
  return btn;
}

// ── Actions ────────────────────────────────────────────────────────────────

function capabilityFor(sectionTitle) {
  return blueprint.capabilities.find(c => c.sections.some(s => s.title === sectionTitle));
}

async function saveManualContent(section, newContent) {
  hideBanner();
  const cap = capabilityFor(section.title);
  const sections = cap.sections.map(s => ({
    title:   s.title,
    content: s.title === section.title ? newContent : s.content,
  }));

  try {
    await api(`/enterprise-blueprint/capability/${encodeURIComponent(cap.capabilityId)}`, {
      method: 'PATCH',
      body:   JSON.stringify({ sections }),
    });
    await reload();
  } catch (err) {
    showBanner(err.message || 'Failed to save.');
  }
}

// ── Load ───────────────────────────────────────────────────────────────────

async function reload() {
  blueprint = (await api('/enterprise-blueprint')).blueprint;
  renderSidebar();
  renderPanel();
}

async function determineCanAccess() {
  try {
    const data = await api('/profile/me');
    const jwtRole = localStorage.getItem('role') || 'user';
    return jwtRole === 'admin' || data?.profile?.role === 'CTO';
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
    window.location.href = '/login/login.html?redirect=/enterprise-blueprint/enterprise-blueprint.html';
    return;
  }

  document.getElementById('eb-logout').addEventListener('click', logout);
  const usernameEl = document.getElementById('eb-username');
  if (usernameEl) usernameEl.textContent = localStorage.getItem('username') || '';

  const canAccess = await determineCanAccess();
  document.getElementById('eb-loading').style.display = 'none';

  if (!canAccess) {
    document.getElementById('eb-noaccess').style.display = 'block';
    return;
  }

  try {
    await reload();
    document.getElementById('eb-content').style.display = 'flex';
  } catch (err) {
    showBanner(err.message || 'Failed to load enterprise blueprint.');
  }
}

document.addEventListener('DOMContentLoaded', init);
