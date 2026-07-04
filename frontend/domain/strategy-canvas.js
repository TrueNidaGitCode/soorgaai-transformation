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
  initStorage,
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
let _capabilityList     = [];

// ── Capability visual metadata (icon + gradient per capability) ───────────────

const CAP_META = {
  'ai-initiative-leadership': {
    grad:  'linear-gradient(135deg, #0a2d4a, #1a5276)',
    color: '#5CC5A7',
    svg:   `<path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`,
  },
  'business-strategy-alignment': {
    grad:  'linear-gradient(135deg, #0a1f3d, #1a3a6e)',
    color: '#3D9BE9',
    svg:   `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="2"/>`,
  },
  'ai-operating-model': {
    grad:  'linear-gradient(135deg, #150e2e, #2d1b69)',
    color: '#9B7FDB',
    svg:   `<path stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 2L21.39 7v10L12 22 2.61 17V7L12 2z"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>`,
  },
  'ai-roi': {
    grad:  'linear-gradient(135deg, #3a0000, #7a1818)',
    color: '#E07A5F',
    svg:   `<rect x="2" y="10" width="4" height="12" rx="1" stroke="currentColor" stroke-width="2"/><rect x="9" y="6" width="4" height="16" rx="1" stroke="currentColor" stroke-width="2"/><rect x="16" y="2" width="4" height="20" rx="1" stroke="currentColor" stroke-width="2"/>`,
  },
  'ai-governance-ethics': {
    grad:  'linear-gradient(135deg, #2d1a00, #6b4400)',
    color: '#D4A017',
    svg:   `<path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6L12 2z"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4"/>`,
  },
  _default: {
    grad:  'linear-gradient(135deg, #1a1a2e, #16213e)',
    color: '#5CC5A7',
    svg:   `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 8v4l3 3"/>`,
  },
};

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

  // Automotive Blueprint sub-section: always visible unless card is collapsed
  const autoEl = card.querySelector('.blueprint-section__automotive');
  if (autoEl) autoEl.style.display = collapsed ? 'none' : 'block';

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

let _totalCapabilities = 5; // updated from the API capability list when loaded

function getCapabilityProgress(capabilityId) {
  const state = loadCapabilityState(capabilityId);
  if (!state || !state.sections) return { status: 'Not Started', pct: 0 };

  const sections = Object.values(state.sections);
  const total = sections.length;
  if (total === 0) return { status: 'Not Started', pct: 0 };

  const approved      = sections.filter(s => s.status === 'Approved').length;
  const withContent   = sections.filter(s => s.content).length;
  const partialCount  = Math.max(0, withContent - approved);

  if (approved === total) return { status: 'Complete', pct: 100 };

  const pct = Math.round(((approved + partialCount * 0.5) / total) * 100);
  if (withContent > 0) return { status: 'In Progress', pct };
  return { status: 'Not Started', pct: 0 };
}

function refreshSidebar() {
  const snap      = getCompanySnapshot();
  const total     = Math.max(_totalCapabilities, snap.totalCapabilities);
  const pct       = snap.overallPct || 0;
  const started   = snap.capabilitiesStarted   || 0;
  const completed = snap.capabilitiesCompleted || 0;
  const inProg    = Math.max(0, started - completed);
  const notStarted = Math.max(0, total - started);

  const countEl = document.getElementById('dsb-caps-count');
  if (countEl) countEl.textContent = `${started} of ${total} Capabilities Started`;

  // Donut arc — r=48, circumference≈301.59; CSS rotates SVG -90° to start at 12 o'clock
  const arc = document.getElementById('dsb-donut-arc');
  if (arc) arc.style.strokeDasharray = `${(pct / 100) * 301.59} 301.59`;

  const pctText = document.getElementById('dsb-pct-text');
  if (pctText) pctText.textContent = `${Math.round(pct)}%`;

  const progPct = document.getElementById('dsb-progress-pct');
  if (progPct) progPct.textContent = `${Math.round(pct)}%`;

  const bar = document.getElementById('dsb-progress-bar');
  if (bar) bar.style.width = `${pct}%`;

  const statsList = document.getElementById('dsb-stats-list');
  if (statsList) {
    statsList.innerHTML = '';
    const rows = [
      { count: completed,  label: 'Completed',  color: '#5CC5A7' },
      { count: inProg,     label: 'In Progress', color: '#3DAFD3' },
      { count: notStarted, label: 'Not Started', color: 'rgba(255,255,255,0.2)' },
    ];
    for (const r of rows) {
      const li = document.createElement('li');
      li.className = 'dsb-stat-item';
      li.innerHTML = `
        <span class="dsb-stat-item__dot" style="background:${r.color}"></span>
        <span class="dsb-stat-item__count">${r.count}</span>
        <span class="dsb-stat-item__label">${r.label}</span>
      `;
      statsList.appendChild(li);
    }
  }
}

function refreshProgressAndSnapshot() {
  persistState();
  refreshSidebar();
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

const LIVE_CAPABILITIES = new Set([
  'ai-initiative-leadership',
  'ai-operating-model',
  'ai-roi',
  'ai-governance-ethics',
]);

function renderCapabilityList(capabilities, container) {
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'capability-list';

  for (const cap of capabilities) {
    const meta    = CAP_META[cap.id] || CAP_META._default;
    const isLive  = LIVE_CAPABILITIES.has(cap.id);
    const { status, pct } = isLive ? getCapabilityProgress(cap.id) : { status: '', pct: 0 };

    const statusClass = status === 'Complete'    ? 'cap-status--complete'
                      : status === 'In Progress' ? 'cap-status--in-progress'
                      : 'cap-status--not-started';

    const card = document.createElement('button');
    card.className = `capability-card${isLive ? '' : ' capability-card--coming-soon'}`;
    card.dataset.capabilityId = cap.id;
    card.setAttribute('aria-label', isLive ? `Open ${cap.name} blueprint` : `${cap.name} — coming soon`);
    if (!isLive) card.setAttribute('disabled', '');

    card.innerHTML = `
      <div class="cap-icon" style="background:${meta.grad}">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:${meta.color}" aria-hidden="true">${meta.svg}</svg>
      </div>
      <div class="cap-body">
        <span class="cap-name">${cap.name}</span>
        <span class="cap-objective">${cap.objective}</span>
      </div>
      <div class="cap-meta">
        ${isLive ? `
          <div class="cap-status-row">
            <span class="cap-status ${statusClass}">${status}</span>
            <span class="cap-pct">${pct}%</span>
          </div>
          <div class="cap-track">
            <div class="cap-bar${pct > 0 ? ' cap-bar--active' : ''}" style="width:${pct}%"></div>
          </div>
        ` : `
          <span class="cap-coming-soon">Coming Soon</span>
        `}
      </div>
      <span class="cap-arrow" aria-hidden="true">${isLive ? '›' : ''}</span>
    `;

    if (isLive) card.addEventListener('click', () => loadBlueprint(cap.id, container));
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

  // ── Automotive Blueprint sub-section (non-editable industry reference) ──────
  if (section.automotiveText) {
    const autoEl = document.createElement('div');
    autoEl.className = 'blueprint-section__automotive';

    const autoLabel = document.createElement('span');
    autoLabel.className = 'blueprint-section__automotive-label';
    autoLabel.textContent = 'AUTOMOTIVE BLUEPRINT';
    autoEl.appendChild(autoLabel);

    const autoText = document.createElement('p');
    autoText.className = 'blueprint-section__automotive-text';
    autoText.textContent = section.automotiveText;
    autoEl.appendChild(autoText);

    card.appendChild(autoEl);
  }

  // ── Company Blueprint body: draft text or start hint ─────────────────────
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
    _capabilityList    = capabilities;
    _totalCapabilities = capabilities.length || _totalCapabilities;

    const sub = document.getElementById('canvas-subheading');
    if (sub) sub.textContent = 'Select a capability to explore its blueprint.';

    renderCapabilityList(capabilities, container);
    refreshSidebar();

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
    refreshSidebar();

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

  // Scope blueprint storage to this user so data survives logout/login
  initStorage(localStorage.getItem('userId') || '');

  const container = document.getElementById('canvas-content');
  if (!container) return;

  // Sprint 17: auto-restore last viewed capability
  const lastCapabilityId = loadCurrentCapability();
  if (lastCapabilityId) {
    await loadBlueprint(lastCapabilityId, container);
  } else {
    await loadCapabilities(container);
  }

  // Sidebar may have data from previous sessions even if no capability is loaded
  refreshSidebar();

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
