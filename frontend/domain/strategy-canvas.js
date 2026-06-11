/**
 * SoorgaAI — Strategy Canvas Module (Sprint 14.1 / 15 / 16)
 *
 * Dynamically builds the AI Strategy Canvas from the Intelligence Specification.
 *
 * States:
 *   list      — capability cards (from the spec's Knowledge Architecture table)
 *   blueprint — sections of a selected capability (Core + Industry merged)
 *
 * Sprint 16 additions:
 *   - Blueprint sections are clickable (select a section to collaborate on it)
 *   - Per-section company drafts tracked in session (_companyDraft)
 *   - Accepted AI suggestions update the left-panel draft area in real time
 *
 * Dispatches:
 *   'canvas:ready'          — after initial capability list loads
 *   'blueprint:loaded'      — after a capability blueprint loads   { capabilityId, blueprint }
 *   'blueprint:cleared'     — when the user returns to the list
 *   'section:selected'      — user clicks a section               { sectionTitle, currentContent, capabilityId, blueprint }
 *   'section:deselected'    — section cleared                     (no detail)
 *   'section:draft-updated' — accepted suggestion updated draft   { sectionTitle, content }
 *
 * Exposes:
 *   window.StrategyCanvas.getCurrentContext()       — { capabilityId, blueprint, companyDraft } | null
 *   window.StrategyCanvas.acceptSection(title, txt) — persist accepted AI text into company draft
 *   window.StrategyCanvas.deselectSection()         — clear active section programmatically
 *   window.Canvas                                   — legacy no-op
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken()    { return localStorage.getItem('token'); }
function getDomainId() { return new URLSearchParams(window.location.search).get('domain') || 'ai-strategy'; }

// ── Session context ───────────────────────────────────────────────────────────

let _currentContext    = null; // { capabilityId, blueprint, companyDraft: {} }
let _activeSectionEl   = null; // currently highlighted section card DOM element
let _activeSectionTitle = null;

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

  // Sections
  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'blueprint-sections';

  for (const section of blueprint.sections) {
    const card = buildSectionCard(section, blueprint);
    sectionsEl.appendChild(card);
  }

  view.appendChild(sectionsEl);
  container.appendChild(view);

  container.closest('.canvas-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
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

  // ── Static knowledge content ──────────────────────────────────────────────
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

  // ── Company draft area (Sprint 16 — initially hidden) ─────────────────────
  const draftEl = document.createElement('div');
  draftEl.className = 'blueprint-section__draft';
  draftEl.style.display = 'none';
  draftEl.innerHTML = `
    <span class="blueprint-section__draft-label">COMPANY DRAFT</span>
    <p class="blueprint-section__draft-text"></p>
  `;
  card.appendChild(draftEl);

  // ── Select hint ───────────────────────────────────────────────────────────
  const hint = document.createElement('span');
  hint.className = 'blueprint-section__select-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = 'Click to collaborate →';
  card.appendChild(hint);

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

// ── Section selection ─────────────────────────────────────────────────────────

function handleSectionClick(sectionTitle, cardEl) {
  if (!_currentContext) return;

  // Toggle off if same section clicked twice
  if (_activeSectionTitle === sectionTitle) {
    deselectSection();
    return;
  }

  selectSection(sectionTitle, cardEl);
}

function selectSection(sectionTitle, cardEl) {
  // Deselect any previously active section
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
    detail: {
      sectionTitle,
      currentContent,
      capabilityId: _currentContext.capabilityId,
      blueprint:    _currentContext.blueprint,
    },
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

// ── Accept workflow (Sprint 16) ───────────────────────────────────────────────

function acceptSection(sectionTitle, content) {
  if (!_currentContext) return;

  // Persist in session draft
  _currentContext.companyDraft[sectionTitle] = content;

  // Update DOM — find the section card by data attribute
  const card = document.querySelector(
    `.blueprint-section[data-section-title="${CSS.escape(sectionTitle)}"]`
  );
  if (card) {
    const draftEl    = card.querySelector('.blueprint-section__draft');
    const draftTextEl = card.querySelector('.blueprint-section__draft-text');

    if (draftEl && draftTextEl) {
      draftTextEl.textContent = content;
      draftEl.style.display   = 'block';
    }

    card.classList.add('blueprint-section--has-draft');

    // Flash animation
    card.classList.remove('blueprint-section--flash');
    void card.offsetWidth; // trigger reflow
    card.classList.add('blueprint-section--flash');
  }

  // Notify the right panel so it can update the section context preview
  document.dispatchEvent(new CustomEvent('section:draft-updated', {
    detail: { sectionTitle, content },
  }));
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function loadCapabilities(container) {
  renderLoading(container);

  // Clear session state when returning to list
  _currentContext     = null;
  _activeSectionEl    = null;
  _activeSectionTitle = null;
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

  } catch (err) {
    console.error('loadCapabilities error:', err);
    renderError('Failed to load capabilities. Refresh to retry.', container);
  }
}

async function loadBlueprint(capabilityId, container) {
  renderLoading(container);

  // Reset section state when loading a new blueprint
  _activeSectionEl    = null;
  _activeSectionTitle = null;

  const token = getToken();

  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/blueprint/${capabilityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) throw new Error('Failed to load blueprint.');

    const blueprint = await resp.json();

    // Initialise session context with empty company draft store
    _currentContext = { capabilityId, blueprint, companyDraft: {} };
    document.dispatchEvent(new CustomEvent('blueprint:loaded', { detail: _currentContext }));

    const sub = document.getElementById('canvas-subheading');
    if (sub) sub.textContent = 'Click any section to collaborate with the AI Advisor.';

    renderBlueprint(blueprint, container);

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
  container.innerHTML = `
    <div class="canvas-loading">
      <div class="ws-spinner"></div>
    </div>
  `;
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
  const paragraphLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed === '---') {
      if (paragraphLines.length > 0) break;
      continue;
    }
    if (trimmed.startsWith('*') || trimmed.startsWith('-') || trimmed.startsWith('>')) {
      if (paragraphLines.length > 0) break;
      continue;
    }
    paragraphLines.push(trimmed);
  }

  return paragraphLines.join(' ').replace(/\*\*/g, '').trim();
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

  await loadCapabilities(container);

  document.dispatchEvent(new CustomEvent('canvas:ready'));
}

document.addEventListener('DOMContentLoaded', init);

// ── Global API (read by advisor.js) ───────────────────────────────────────────

window.StrategyCanvas = {
  getCurrentContext:  () => _currentContext,
  acceptSection,
  deselectSection,
};

window.Canvas = { updateFocusArea: () => {} };
