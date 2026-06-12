/**
 * SoorgaAI — Strategy Canvas Module (Sprint 14.1 / 15 / 16 / 17)
 *
 * Left-panel AI Strategy Canvas: capability list → blueprint sections.
 *
 * Sprint 17 additions (build on Sprint 16 — no existing behaviour changed):
 *   Feature 1  Section Status    Template → Working Draft → Approved
 *   Feature 2  Source Attribution Core / Industry / User Modified badges
 *   Feature 3  Progress Tracking  Per-capability progress bar
 *   Feature 4  Company Snapshot   Aggregate card across all capabilities
 *   Feature 5  Persistence        LocalStorage — auto-save + auto-restore
 *
 * Dispatches:
 *   'canvas:ready'          — after initial capability list or blueprint loads
 *   'blueprint:loaded'      — after a capability blueprint loads   { capabilityId, blueprint }
 *   'blueprint:cleared'     — when the user returns to the capability list
 *   'section:selected'      — user clicks a section               { sectionTitle, currentContent, capabilityId, blueprint }
 *   'section:deselected'    — section cleared
 *   'section:draft-updated' — accepted/reset content changed      { sectionTitle, content }
 *
 * Exposes (window.StrategyCanvas):
 *   getCurrentContext()              — { capabilityId, blueprint, companyDraft } | null
 *   acceptSection(title, content)    — Sprint 16: persist AI suggestion, set Working Draft
 *   approveSection(title)            — Sprint 17: promote Working Draft → Approved
 *   resetSection(title)              — Sprint 17: restore section to Template
 *   deselectSection()                — clear active section
 *   getSectionState(title)           — { status, sources, content }
 */

import {
  loadCurrentCapability,
  saveCurrentCapability,
  clearCurrentCapability,
  loadCapabilityState,
  saveCapabilityState,
  getCompanySnapshot,
  logActivity,
} from './blueprintStorage.js';

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken()    { return localStorage.getItem('token'); }
function getDomainId() { return new URLSearchParams(window.location.search).get('domain') || 'ai-strategy'; }

// ── Session state ─────────────────────────────────────────────────────────────

let _currentContext     = null; // { capabilityId, blueprint, companyDraft: {} }
let _activeSectionEl    = null;
let _activeSectionTitle = null;
let _sectionStates      = {};   // { [title]: { status, sources, content } }

// ── Section state management (Sprint 17) ─────────────────────────────────────

function initSectionStates(blueprint) {
  const stored = loadCapabilityState(blueprint.capabilityId);
  _sectionStates = {};

  for (const section of blueprint.sections) {
    if (stored?.sections?.[section.title]) {
      _sectionStates[section.title] = { ...stored.sections[section.title] };
    } else {
      const sources = ['Core'];
      if (section.source === 'both') sources.push(blueprint.industry);
      _sectionStates[section.title] = { status: 'Template', sources, content: '' };
    }
  }
}

function getProgress() {
  const values   = Object.values(_sectionStates);
  const total    = values.length;
  const approved = values.filter(s => s.status === 'Approved').length;
  const draft    = values.filter(s => s.status === 'Working Draft').length;
  const pct      = total > 0 ? Math.round((approved / total) * 100) : 0;
  return { total, approved, draft, template: total - approved - draft, pct };
}

function persistState() {
  if (!_currentContext) return;
  const { blueprint } = _currentContext;
  saveCapabilityState(blueprint.capabilityId, {
    capabilityName: blueprint.capabilityName,
    industry:       blueprint.industry,
    sections:       { ..._sectionStates },
  });
}

// ── Badge helpers (Sprint 17) ─────────────────────────────────────────────────

const STATUS_CLASS = {
  'Template':     'status-badge--template',
  'Working Draft':'status-badge--working-draft',
  'Approved':     'status-badge--approved',
};

function buildBadgesHTML(state) {
  const sClass = STATUS_CLASS[state.status] || 'status-badge--template';
  let html = `<span class="status-badge ${sClass}">${escapeHtml(state.status)}</span>`;

  for (const src of state.sources) {
    const srcClass = src === 'User Modified' ? 'source-badge--user-modified'
                   : src === 'Core'          ? 'source-badge--core'
                   :                           'source-badge--industry';
    html += ` <span class="source-badge ${srcClass}">${escapeHtml(src)}</span>`;
  }
  return html;
}

function createApproveBtn(sectionTitle) {
  const btn = document.createElement('button');
  btn.className = 'section-action-btn section-action-btn--approve';
  btn.textContent = 'Approve';
  btn.addEventListener('click', e => { e.stopPropagation(); approveSection(sectionTitle); });
  return btn;
}

function createResetBtn(sectionTitle) {
  const btn = document.createElement('button');
  btn.className = 'section-action-btn section-action-btn--reset';
  btn.textContent = 'Reset';
  btn.addEventListener('click', e => { e.stopPropagation(); resetSection(sectionTitle); });
  return btn;
}

// ── Apply state to a section card (Sprint 17) ─────────────────────────────────

function applyStateToCard(card, sectionTitle) {
  const state = _sectionStates[sectionTitle];
  if (!state) return;

  // Status classes
  card.classList.toggle('blueprint-section--approved',     state.status === 'Approved');
  card.classList.toggle('blueprint-section--working-draft', state.status === 'Working Draft');
  card.classList.toggle('blueprint-section--has-draft',    !!state.content);

  // Badges
  const badgesEl = card.querySelector('.blueprint-section__badges');
  if (badgesEl) badgesEl.innerHTML = buildBadgesHTML(state);

  // Draft area
  const draftEl  = card.querySelector('.blueprint-section__draft');
  const draftTxt = card.querySelector('.blueprint-section__draft-text');
  if (draftEl && draftTxt) {
    if (state.content) {
      draftTxt.textContent  = state.content;
      draftEl.style.display = 'block';
    } else {
      draftEl.style.display = 'none';
    }
  }

  // Action buttons (Approve / Reset)
  const actionsEl = card.querySelector('.blueprint-section__section-actions');
  if (actionsEl) {
    actionsEl.innerHTML = '';
    if (state.status === 'Working Draft') {
      actionsEl.appendChild(createApproveBtn(sectionTitle));
      actionsEl.appendChild(createResetBtn(sectionTitle));
    } else if (state.status === 'Approved') {
      actionsEl.appendChild(createResetBtn(sectionTitle));
    }
  }
}

function updateSectionCardState(sectionTitle) {
  const card = document.querySelector(
    `.blueprint-section[data-section-title="${CSS.escape(sectionTitle)}"]`
  );
  if (card) applyStateToCard(card, sectionTitle);
}

// ── Progress bar refresh ──────────────────────────────────────────────────────

function refreshProgress() {
  const existing = document.getElementById('blueprint-progress');
  if (!existing || !_currentContext) return;
  const newEl = renderProgressBar(_currentContext.blueprint.sections);
  existing.replaceWith(newEl);
}

// ── Company Snapshot refresh ──────────────────────────────────────────────────

function refreshSnapshot() {
  const el = document.getElementById('snapshot-card');
  if (!el) return;

  const snap = getCompanySnapshot();

  if (snap.totalCapabilities === 0) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  el.innerHTML = `
    <div class="snapshot-header">
      <span class="snapshot-title">COMPANY SNAPSHOT</span>
    </div>
    <div class="snapshot-stats">
      <div class="snapshot-stat">
        <span class="snapshot-stat__value">${snap.capabilitiesStarted}</span>
        <span class="snapshot-stat__label">Started</span>
      </div>
      <div class="snapshot-stat">
        <span class="snapshot-stat__value">${snap.capabilitiesCompleted}</span>
        <span class="snapshot-stat__label">Completed</span>
      </div>
      <div class="snapshot-stat">
        <span class="snapshot-stat__value">${snap.approvedSections}</span>
        <span class="snapshot-stat__label">Approved</span>
      </div>
      <div class="snapshot-stat">
        <span class="snapshot-stat__value">${snap.draftSections}</span>
        <span class="snapshot-stat__label">In Draft</span>
      </div>
    </div>
    <div class="snapshot-bar-wrapper">
      <div class="snapshot-bar" style="width:${snap.overallPct}%"></div>
    </div>
    <span class="snapshot-pct">${snap.overallPct}% Overall Progress</span>
  `;
}

function refreshProgressAndSnapshot() {
  refreshProgress();
  persistState();
  refreshSnapshot();
}

// ── Actions (Sprint 16 acceptSection + Sprint 17 approveSection / resetSection) ─

export function acceptSection(sectionTitle, content) {
  if (!_currentContext) return;

  // Update session draft (Sprint 16)
  _currentContext.companyDraft[sectionTitle] = content;

  // Update section state (Sprint 17)
  const state = _sectionStates[sectionTitle];
  if (state) {
    state.status  = 'Working Draft';
    state.content = content;
    if (!state.sources.includes('User Modified')) {
      state.sources.push('User Modified');
    }
  }

  // Update DOM
  updateSectionCardState(sectionTitle);

  // Flash animation
  const card = document.querySelector(
    `.blueprint-section[data-section-title="${CSS.escape(sectionTitle)}"]`
  );
  if (card) {
    card.classList.remove('blueprint-section--flash');
    void card.offsetWidth;
    card.classList.add('blueprint-section--flash');
  }

  refreshProgressAndSnapshot();
  logActivity('Accepted', _currentContext.blueprint.capabilityName, sectionTitle);
  dispatchStatusChanged(sectionTitle);

  document.dispatchEvent(new CustomEvent('section:draft-updated', {
    detail: { sectionTitle, content },
  }));
}

// Sprint 18.2: lets the advisor's sticky editing header track status/sources
function dispatchStatusChanged(sectionTitle) {
  document.dispatchEvent(new CustomEvent('section:status-changed', {
    detail: { sectionTitle, state: _sectionStates[sectionTitle] || null },
  }));
}

export function approveSection(sectionTitle) {
  const state = _sectionStates[sectionTitle];
  if (!state || state.status !== 'Working Draft') return;

  state.status = 'Approved';
  updateSectionCardState(sectionTitle);
  refreshProgressAndSnapshot();
  logActivity('Approved', _currentContext?.blueprint?.capabilityName, sectionTitle);
  dispatchStatusChanged(sectionTitle);
}

export function resetSection(sectionTitle) {
  const state = _sectionStates[sectionTitle];
  if (!state) return;

  // Rebuild original sources (remove User Modified, re-derive Core/Industry)
  const blueprint = _currentContext?.blueprint;
  const section   = blueprint?.sections?.find(s => s.title === sectionTitle);
  const sources   = ['Core'];
  if (section?.source === 'both' && blueprint?.industry) sources.push(blueprint.industry);

  state.status  = 'Template';
  state.sources = sources;
  state.content = '';

  if (_currentContext?.companyDraft) {
    _currentContext.companyDraft[sectionTitle] = '';
  }

  updateSectionCardState(sectionTitle);
  refreshProgressAndSnapshot();
  logActivity('Reset', blueprint?.capabilityName, sectionTitle);
  dispatchStatusChanged(sectionTitle);

  document.dispatchEvent(new CustomEvent('section:draft-updated', {
    detail: { sectionTitle, content: '' },
  }));
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderCapabilityList(capabilities, container) {
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'capability-list';

  for (const cap of capabilities) {
    const card = document.createElement('button');
    card.className = 'capability-card';
    card.dataset.capabilityId = cap.id;
    card.setAttribute('aria-label', `Open ${cap.name} blueprint`);

    card.innerHTML = `
      <span class="capability-card__name">${cap.name}</span>
      <span class="capability-card__objective">${cap.objective}</span>
      <span class="capability-card__arrow" aria-hidden="true">→</span>
    `;

    card.addEventListener('click', () => loadBlueprint(cap.id, container));
    list.appendChild(card);
  }

  container.appendChild(list);
}

function renderBlueprint(blueprint, container) {
  container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'blueprint-view';

  // Back button
  const back = document.createElement('button');
  back.className = 'blueprint-back-btn';
  back.textContent = '← All Capabilities';
  back.setAttribute('aria-label', 'Back to capability list');
  back.addEventListener('click', () => loadCapabilities(container));
  view.appendChild(back);

  // Capability header
  const header = document.createElement('div');
  header.className = 'blueprint-header';
  header.innerHTML = `
    <h3 class="blueprint-capability-name">${blueprint.capabilityName}</h3>
    <span class="blueprint-industry-badge">${blueprint.industry}</span>
  `;
  view.appendChild(header);

  // Progress bar (Sprint 17)
  view.appendChild(renderProgressBar(blueprint.sections));

  // Sections
  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'blueprint-sections';

  for (const section of blueprint.sections) {
    const card = buildSectionCard(section, blueprint);
    sectionsEl.appendChild(card);
  }

  view.appendChild(sectionsEl);
  container.appendChild(view);

  // Sprint 18.2: the page scrolls as one document — panels have no inner scroll
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildSectionCard(section, blueprint) {
  const card = document.createElement('div');
  card.className = 'blueprint-section blueprint-section--selectable';
  if (section.source === 'both') card.classList.add('blueprint-section--enriched');
  card.dataset.sectionTitle = section.title;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-pressed', 'false');
  card.setAttribute('aria-label', `Select ${section.title} section to collaborate`);

  // ── Badges row (Sprint 17) ────────────────────────────────────────────────
  const badgesEl = document.createElement('div');
  badgesEl.className = 'blueprint-section__badges';
  card.appendChild(badgesEl);

  // ── Knowledge content ─────────────────────────────────────────────────────
  const contentEl = document.createElement('div');
  contentEl.className = 'blueprint-section__content';

  let html = `<h4 class="blueprint-section__title">${section.title}</h4>`;

  if (section.definition) {
    html += `<p class="blueprint-section__definition">${escapeHtml(section.definition)}</p>`;
  }
  if (section.keyPrinciples.length > 0) {
    html += `<ul class="blueprint-section__principles">
      ${section.keyPrinciples.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
    </ul>`;
  }
  if (section.leadershipQuestion) {
    html += `<p class="blueprint-section__question">${escapeHtml(section.leadershipQuestion)}</p>`;
  }
  if (section.industryContext) {
    html += `<div class="blueprint-section__industry">
      <span class="blueprint-section__industry-label">${blueprint.industry} Context</span>
      <p>${escapeHtml(extractFirstParagraph(section.industryContext))}</p>
    </div>`;
  }

  contentEl.innerHTML = html;
  card.appendChild(contentEl);

  // ── Company draft area (Sprint 16) ────────────────────────────────────────
  const draftEl = document.createElement('div');
  draftEl.className = 'blueprint-section__draft';
  draftEl.style.display = 'none';
  draftEl.innerHTML = `
    <span class="blueprint-section__draft-label">COMPANY DRAFT</span>
    <p class="blueprint-section__draft-text"></p>
  `;
  card.appendChild(draftEl);

  // ── Section actions (Sprint 17: Approve / Reset buttons) ─────────────────
  const actionsEl = document.createElement('div');
  actionsEl.className = 'blueprint-section__section-actions';
  card.appendChild(actionsEl);

  // ── Select hint (Sprint 16) ───────────────────────────────────────────────
  const hint = document.createElement('span');
  hint.className = 'blueprint-section__select-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = 'Click to collaborate →';
  card.appendChild(hint);

  // Apply current state (badges + buttons)
  applyStateToCard(card, section.title);

  // ── Interaction ───────────────────────────────────────────────────────────
  card.addEventListener('click', () => handleSectionClick(section.title, card));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSectionClick(section.title, card);
    }
  });

  return card;
}

// ── Progress bar (Sprint 17) ──────────────────────────────────────────────────

function renderProgressBar(sections) {
  const progress = getProgress();

  const el = document.createElement('div');
  el.className = 'blueprint-progress';
  el.id        = 'blueprint-progress';

  // Section status list
  const listEl = document.createElement('div');
  listEl.className = 'blueprint-progress__list';

  for (const section of sections) {
    const state = _sectionStates[section.title] || { status: 'Template' };
    const item  = document.createElement('div');
    item.className = 'blueprint-progress__item';

    const dot  = document.createElement('span');
    const isApproved = state.status === 'Approved';
    const isDraft    = state.status === 'Working Draft';
    dot.className = `blueprint-progress__dot${isApproved ? ' blueprint-progress__dot--approved' : isDraft ? ' blueprint-progress__dot--draft' : ''}`;
    dot.textContent = isApproved ? '✓' : isDraft ? '◑' : '○';

    const nameEl = document.createElement('span');
    nameEl.className = 'blueprint-progress__name';
    nameEl.textContent = section.title;

    const statusEl = document.createElement('span');
    statusEl.className = 'blueprint-progress__status';
    statusEl.textContent = state.status;

    item.appendChild(dot);
    item.appendChild(nameEl);
    item.appendChild(statusEl);
    listEl.appendChild(item);
  }

  el.appendChild(listEl);

  // Bar track
  const trackEl = document.createElement('div');
  trackEl.className = 'blueprint-progress__track';

  const barEl = document.createElement('div');
  barEl.className = 'blueprint-progress__bar';
  barEl.style.width = `${progress.pct}%`;
  trackEl.appendChild(barEl);
  el.appendChild(trackEl);

  // Label
  const pctEl = document.createElement('span');
  pctEl.className = 'blueprint-progress__label';
  pctEl.textContent = `${progress.approved}/${progress.total} Approved · ${progress.pct}% Complete`;
  el.appendChild(pctEl);

  return el;
}

// ── Section interaction (Sprint 16) ──────────────────────────────────────────

function handleSectionClick(sectionTitle, cardEl) {
  if (!_currentContext) return;

  // Clicking an active action button stops propagation, so this only fires for the card body
  if (_activeSectionTitle === sectionTitle) {
    deselectSection();
    return;
  }
  selectSection(sectionTitle, cardEl);
}

function selectSection(sectionTitle, cardEl) {
  if (_activeSectionEl) {
    _activeSectionEl.classList.remove('blueprint-section--active');
    _activeSectionEl.setAttribute('aria-pressed', 'false');
  }

  _activeSectionEl    = cardEl;
  _activeSectionTitle = sectionTitle;
  cardEl.classList.add('blueprint-section--active');
  cardEl.setAttribute('aria-pressed', 'true');

  const currentContent = _currentContext?.companyDraft?.[sectionTitle] || '';

  document.dispatchEvent(new CustomEvent('section:selected', {
    detail: { sectionTitle, currentContent, capabilityId: _currentContext.capabilityId, blueprint: _currentContext.blueprint },
  }));
}

function deselectSection() {
  if (_activeSectionEl) {
    _activeSectionEl.classList.remove('blueprint-section--active');
    _activeSectionEl.setAttribute('aria-pressed', 'false');
  }
  _activeSectionEl    = null;
  _activeSectionTitle = null;

  document.dispatchEvent(new CustomEvent('section:deselected'));
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function loadCapabilities(container) {
  renderLoading(container);

  _currentContext     = null;
  _activeSectionEl    = null;
  _activeSectionTitle = null;
  _sectionStates      = {};

  clearCurrentCapability();
  document.dispatchEvent(new CustomEvent('blueprint:cleared'));

  const token = getToken();
  if (!token) {
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${getDomainId()}`;
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/capabilities`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
    if (resp.status === 404) { window.location.href = '/profile-setup/profile.html'; return; }
    if (!resp.ok) throw new Error('Failed to load capabilities.');

    const { capabilities } = await resp.json();

    const sub = document.getElementById('canvas-subheading');
    if (sub) sub.textContent = 'Select a capability to explore its blueprint.';

    renderCapabilityList(capabilities, container);
    refreshSnapshot(); // Snapshot persists through list view

  } catch (err) {
    console.error('loadCapabilities error:', err);
    renderError('Failed to load capabilities. Refresh to retry.', container);
  }
}

async function loadBlueprint(capabilityId, container) {
  renderLoading(container);

  _activeSectionEl    = null;
  _activeSectionTitle = null;

  const token = getToken();

  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/blueprint/${capabilityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) throw new Error('Failed to load blueprint.');

    const blueprint = await resp.json();

    // ── Sprint 17: initialise section states from LocalStorage or fresh ──
    initSectionStates(blueprint);

    // Rebuild companyDraft from stored content
    const companyDraft = {};
    for (const [title, state] of Object.entries(_sectionStates)) {
      if (state.content) companyDraft[title] = state.content;
    }

    _currentContext = { capabilityId, blueprint, companyDraft };
    saveCurrentCapability(capabilityId);

    document.dispatchEvent(new CustomEvent('blueprint:loaded', { detail: _currentContext }));

    const sub = document.getElementById('canvas-subheading');
    if (sub) sub.textContent = 'Click any section to collaborate with the AI Advisor.';

    renderBlueprint(blueprint, container);
    refreshSnapshot();

  } catch (err) {
    console.error('loadBlueprint error:', err);
    renderError('Failed to load blueprint. Please try again.', container);
    setTimeout(() => loadCapabilities(container), 2000);
  }
}

// ── Render states ─────────────────────────────────────────────────────────────

function renderError(message, container) {
  container.innerHTML = `<p class="canvas-error">${message}</p>`;
}

function renderLoading(container) {
  container.innerHTML = `<div class="canvas-loading"><div class="ws-spinner"></div></div>`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractFirstParagraph(text) {
  const lines = text.split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('|') || t === '---') {
      if (out.length > 0) break;
      continue;
    }
    if (t.startsWith('*') || t.startsWith('-') || t.startsWith('>')) {
      if (out.length > 0) break;
      continue;
    }
    out.push(t);
  }
  return out.join(' ').replace(/\*\*/g, '').trim();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  const domainId = getDomainId();
  const token    = getToken();

  if (!token) {
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${domainId}`;
    return;
  }

  const container = document.getElementById('canvas-content');
  if (!container) return;

  // Sprint 17: auto-restore last viewed capability
  const lastCapabilityId = loadCurrentCapability();
  if (lastCapabilityId) {
    await loadBlueprint(lastCapabilityId, container);
  } else {
    await loadCapabilities(container);
  }

  // Snapshot may have data from previous sessions even if no capability is loaded
  refreshSnapshot();

  document.dispatchEvent(new CustomEvent('canvas:ready'));
}

document.addEventListener('DOMContentLoaded', init);

// ── Global API ────────────────────────────────────────────────────────────────

window.StrategyCanvas = {
  getCurrentContext:  () => _currentContext,
  acceptSection,
  approveSection,
  resetSection,
  deselectSection,
  getSectionState:    (title) => _sectionStates[title] || null,
};

window.Canvas = { updateFocusArea: () => {} };
