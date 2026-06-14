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
 *   selectSectionByTitle(title)      — Sprint 20: select a section programmatically
 *   getSectionState(title)           — { status, sources, content, collapsed? }
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

function persistState() {
  if (!_currentContext) return;
  const { blueprint } = _currentContext;
  saveCapabilityState(blueprint.capabilityId, {
    capabilityName: blueprint.capabilityName,
    industry:       blueprint.industry,
    sections:       { ..._sectionStates },
  });
}

// ── Apply state to a section card ─────────────────────────────────────────────
// Sprint 19: minimal presentation — a status dot, the section title, the
// company draft (or a start hint), and one Edit/Start action. All Sprint 17
// state, sources, and lifecycle logic still run underneath, unpresented.

function applyStateToCard(card, sectionTitle) {
  const state = _sectionStates[sectionTitle];
  if (!state) return;

  const hasContent = !!state.content;
  // Sprint 20: sections with a grown draft can be minimised to one row
  const collapsed  = hasContent && !!state.collapsed;

  card.classList.toggle('blueprint-section--approved',      state.status === 'Approved');
  card.classList.toggle('blueprint-section--working-draft', state.status === 'Working Draft');
  card.classList.toggle('blueprint-section--has-draft',     hasContent);
  card.classList.toggle('blueprint-section--collapsed',     collapsed);

  // Status dot: ✓ once the section has company content, ○ before
  const dotEl = card.querySelector('.blueprint-section__dot');
  if (dotEl) {
    dotEl.textContent = hasContent ? '✓' : '○';
    dotEl.classList.toggle('blueprint-section__dot--done',  hasContent);
  }

  // Body: company draft text or start hint (hidden while minimised)
  const draftTxt = card.querySelector('.blueprint-section__draft-text');
  const hintEl   = card.querySelector('.blueprint-section__start-hint');
  if (draftTxt && hintEl) {
    draftTxt.textContent  = state.content;
    draftTxt.style.display = hasContent && !collapsed ? 'block' : 'none';
    hintEl.style.display   = hasContent ? 'none'  : 'block';
  }

  // Actions: one primary Edit/Start button, plus a quiet Approve link
  // while a draft is awaiting sign-off (keeps the Sprint 17 lifecycle usable)
  const actionsEl = card.querySelector('.blueprint-section__actions');
  if (actionsEl) {
    actionsEl.innerHTML = '';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'blueprint-section__action-btn';
    mainBtn.textContent = hasContent ? 'Edit' : 'Start';
    mainBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (_activeSectionTitle !== sectionTitle) handleSectionClick(sectionTitle, card);
    });
    actionsEl.appendChild(mainBtn);

    if (state.status === 'Working Draft') {
      const approveLink = document.createElement('button');
      approveLink.className = 'blueprint-section__approve-link';
      approveLink.textContent = 'Approve';
      approveLink.addEventListener('click', e => { e.stopPropagation(); approveSection(sectionTitle); });
      actionsEl.appendChild(approveLink);
    }

    // Sprint 20: any section with company content can be reset to its
    // original template — including Approved sections.
    if (hasContent) {
      const resetLink = document.createElement('button');
      resetLink.className = 'blueprint-section__approve-link blueprint-section__reset-link';
      resetLink.textContent = 'Reset';
      resetLink.setAttribute('aria-label', `Reset the ${sectionTitle} section to its original template`);
      resetLink.addEventListener('click', e => {
        e.stopPropagation();
        const ok = window.confirm(
          `Reset "${sectionTitle}" to its original template?\n\nYour current draft will be removed.`
        );
        if (ok) resetSection(sectionTitle);
      });
      actionsEl.appendChild(resetLink);

      // Sprint 20: minimise/expand toggle for grown sections
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'blueprint-section__collapse-btn';
      collapseBtn.textContent = collapsed ? '▸' : '▾';
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
      collapseBtn.setAttribute(
        'aria-label',
        collapsed ? `Expand the ${sectionTitle} section` : `Minimise the ${sectionTitle} section`
      );
      collapseBtn.addEventListener('click', e => {
        e.stopPropagation();
        const st = _sectionStates[sectionTitle];
        if (!st) return;
        st.collapsed = !st.collapsed;
        persistState();
        updateSectionCardState(sectionTitle);
      });
      actionsEl.appendChild(collapseBtn);
    }
  }
}

function updateSectionCardState(sectionTitle) {
  const card = document.querySelector(
    `.blueprint-section[data-section-title="${CSS.escape(sectionTitle)}"]`
  );
  if (card) applyStateToCard(card, sectionTitle);
}

// ── Company progress refresh ──────────────────────────────────────────────────
// Sprint 19: one small indicator — "X of N Capabilities Started · Y% Complete".
// getCompanySnapshot() still computes the full aggregate (preserved for the
// dashboard and workspace widget); only the presentation is reduced.

let _totalCapabilities = 5; // updated from the API capability list when loaded

function refreshSnapshot() {
  const el = document.getElementById('snapshot-card');
  if (!el) return;

  const snap    = getCompanySnapshot();
  const started = snap.capabilitiesStarted;
  const total   = Math.max(_totalCapabilities, snap.totalCapabilities);
  const pct     = total > 0 ? Math.round((started / total) * 100) : 0;

  if (started === 0) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  el.innerHTML = `
    <span class="snapshot-simple__title">Company AI Strategy</span>
    <span class="snapshot-simple__line">${started} of ${total} Capabilities Started</span>
    <div class="snapshot-simple__track"><div class="snapshot-simple__bar" style="width:${pct}%"></div></div>
    <span class="snapshot-simple__pct">${pct}% Complete</span>
  `;
}

function refreshProgressAndSnapshot() {
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
    state.status    = 'Working Draft';
    state.content   = content;
    state.collapsed = false; // Sprint 20: never hide freshly accepted content
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

  // Capability header (Sprint 19: just the name — no technical metadata)
  const header = document.createElement('div');
  header.className = 'blueprint-header';
  header.innerHTML = `
    <h3 class="blueprint-capability-name">${blueprint.capabilityName}</h3>
  `;
  view.appendChild(header);

  // ── Automotive Blueprint (non-editable industry reference) ──────────────────
  if (blueprint.automotiveBlueprint) {
    const autoEl = document.createElement('div');
    autoEl.className = 'automotive-blueprint';

    const autoLabel = document.createElement('div');
    autoLabel.className = 'automotive-blueprint__label';
    autoLabel.textContent = 'AUTOMOTIVE BLUEPRINT';
    autoEl.appendChild(autoLabel);

    const autoText = document.createElement('p');
    autoText.className = 'automotive-blueprint__text';
    autoText.textContent = blueprint.automotiveBlueprint;
    autoEl.appendChild(autoText);

    view.appendChild(autoEl);
  }

  // ── Company Blueprint label ───────────────────────────────────────────────
  const companyLabelEl = document.createElement('div');
  companyLabelEl.className = 'company-blueprint-label';
  companyLabelEl.textContent = 'COMPANY BLUEPRINT';
  view.appendChild(companyLabelEl);

  // ── Sections ──────────────────────────────────────────────────────────────
  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'blueprint-sections';

  for (const section of blueprint.sections) {
    const card = buildSectionCard(section);
    sectionsEl.appendChild(card);
  }

  view.appendChild(sectionsEl);
  container.appendChild(view);

  // Sprint 18.2: the page scrolls as one document — panels have no inner scroll
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Sprint 19: minimal card — dot · title · Edit/Start, with the company draft
// (or a start hint) underneath. The knowledge-base template content still
// powers the AI server-side; it's just no longer printed on the card.
function buildSectionCard(section) {
  const card = document.createElement('div');
  card.className = 'blueprint-section blueprint-section--selectable';
  card.dataset.sectionTitle = section.title;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-pressed', 'false');
  card.setAttribute('aria-label', `Work on the ${section.title} section`);

  // ── Header row: dot · title · actions ─────────────────────────────────────
  const rowEl = document.createElement('div');
  rowEl.className = 'blueprint-section__row';

  const dotEl = document.createElement('span');
  dotEl.className = 'blueprint-section__dot';
  dotEl.setAttribute('aria-hidden', 'true');

  const titleEl = document.createElement('h4');
  titleEl.className = 'blueprint-section__title';
  titleEl.textContent = section.title;

  const actionsEl = document.createElement('span');
  actionsEl.className = 'blueprint-section__actions';

  rowEl.appendChild(dotEl);
  rowEl.appendChild(titleEl);
  rowEl.appendChild(actionsEl);
  card.appendChild(rowEl);

  // ── Body: company draft text or start hint ────────────────────────────────
  const draftTxt = document.createElement('p');
  draftTxt.className = 'blueprint-section__draft-text';
  draftTxt.style.display = 'none';
  card.appendChild(draftTxt);

  const hintEl = document.createElement('p');
  hintEl.className = 'blueprint-section__start-hint';
  hintEl.textContent = 'No company blueprint yet. Use the AI Advisor to adapt the automotive blueprint for your organization.';
  card.appendChild(hintEl);

  // Apply current state (dot, body, actions)
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

  // Sprint 20: working on a minimised section expands it
  const state = _sectionStates[sectionTitle];
  if (state?.collapsed) {
    state.collapsed = false;
    persistState();
    updateSectionCardState(sectionTitle);
  }

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
    _totalCapabilities = capabilities.length || _totalCapabilities;

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

    if (resp.status === 401) {
      // Session expired — sign in again and come straight back here
      window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${getDomainId()}`;
      return;
    }
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
    if (sub) sub.textContent = 'Pick a section and chat with the AI Advisor to build it.';

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

// Sprint 20: lets the advisor's section chips select a section on the canvas
function selectSectionByTitle(sectionTitle) {
  const card = document.querySelector(
    `.blueprint-section[data-section-title="${CSS.escape(sectionTitle)}"]`
  );
  if (!card) return;
  if (_activeSectionTitle !== sectionTitle) selectSection(sectionTitle, card);
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.StrategyCanvas = {
  getCurrentContext:  () => _currentContext,
  acceptSection,
  approveSection,
  resetSection,
  deselectSection,
  selectSectionByTitle,
  getSectionState:    (title) => _sectionStates[title] || null,
};

window.Canvas = { updateFocusArea: () => {} };
