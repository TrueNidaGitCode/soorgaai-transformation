/**
 * Svarg — Blueprint Workspace Module (PI 26.3 Sprint 1)
 *
 * Manages Screen 3: Company Blueprint Workspace
 *
 * Activated when blueprintGenerate.js dispatches 'blueprint:ready'.
 *
 * Responsibilities:
 *   - Render workspace header (objective, company, dates, completion)
 *   - Render capability navigation tabs (dynamically from blueprint data)
 *   - Render full-width blueprint content for the selected capability
 *   - Manage AI Assistant panel (hidden by default, opens on button click)
 *   - Send AI assistant requests and handle suggestions
 *   - Persist section content changes to backend
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

// ── Capability name aliases ───────────────────────────────────────────────────
// Maps old DB-stored names to current display names so existing blueprints
// show the correct name without requiring regeneration.
const CAPABILITY_NAME_ALIASES = {
  'AI Use Case Prioritization': 'AI Implementation Prioritization',
};
function resolveCapName(name) { return CAPABILITY_NAME_ALIASES[name] || name; }

// ── Capability accent colours ─────────────────────────────────────────────────
// Each capability step in the journey gets its own accent colour. The colour is
// set as --cap-accent on .ws-right-panel so it flows into the tab underline,
// step badge, brief-labels, and the cap-header left bar.
const CAP_ACCENT_COLORS = ['#5CC5A7', '#818CF8', '#F59E0B', '#60A5FA', '#F472B6', '#34D399'];

function applyCapAccent(capIdx) {
  const color = CAP_ACCENT_COLORS[capIdx % CAP_ACCENT_COLORS.length];
  document.querySelector('.ws-right-panel')?.style.setProperty('--cap-accent', color);
}

// ── View mode ─────────────────────────────────────────────────────────────────
// Controls which renderer the product ships. Match this to BLUEPRINT_CONFIG.activeView
// in backend/config/blueprintConfig.js when toggling between views.
//   'essay' — Long-form prose per section  (section.content)
//   'pm'    — Uniform 4-cell Strategy Brief cards  (section.brief)
//   'cto'   — Presentation-style with section-specific templates  (section.brief + extras)

const BLUEPRINT_VIEW_MODE = 'cto';

// ── Domain sidebar maps ───────────────────────────────────────────────────────

const DOMAIN_ICONS_MAP = {
  'ai-strategy':               `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#5CC5A7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  'ai-use-cases':              `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  'skills-workforce':          `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'data-readiness':            `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  'technology-infrastructure': `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M9 2v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/></svg>`,
  'governance-security':       `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
};

// ── Retired capabilities (filtered from all render paths) ─────────────────────
const RETIRED_CAPABILITY_IDS = new Set(['business-strategy-alignment']);

// ── State ─────────────────────────────────────────────────────────────────────

let _blueprint           = null;
let _selectedDomainIdx   = 0;
let _selectedCapIndex    = 0;
let _assistantOpen       = false;
let _chatHistory         = [];   // [{ role: 'user'|'assistant', content: string }]
let _pendingSuggestion   = null; // { sectionTitle, text, rationale }
let _refineTargetSection = null; // section title currently being refined via "Refine with AI Assistant"
let _isSending           = false;
let _feedbackShown       = false; // guard: show at most once per session
let _showingActionTracker = false; // Action Tracker is blueprint-wide, not domain-scoped

// ── Screen helpers ────────────────────────────────────────────────────────────

// .pw-screen--enter comes from pipeline-demo.css (already linked in
// domain.html) — same fade+rise transition used between windows in the
// pipeline demo, reused here for the same effect between real screens.
function showScreen(id) {
  ['screen-generate', 'screen-progress', 'screen-opportunities', 'screen-workspace', 'domain-loading'].forEach(sid => {
    const el = document.getElementById(sid);
    if (!el) return;
    if (sid === id) {
      el.style.display = '';
      el.classList.remove('pw-screen--enter');
      void el.offsetWidth; // force reflow so the animation restarts
      el.classList.add('pw-screen--enter');
    } else {
      el.style.display = 'none';
    }
  });
}

// ── Date formatting ───────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Completion calculation ────────────────────────────────────────────────────

function calcCompletion(blueprint) {
  const caps = (blueprint.domains || []).flatMap(d => d.capabilities || []);
  if (!caps.length) return 0;
  const done = caps.filter(c => c.status === 'completed').length;
  return Math.round((done / caps.length) * 100);
}

// ── Workspace header ──────────────────────────────────────────────────────────

function renderHeader(blueprint) {
  const statusEl = document.getElementById('ws-header-status');
  if (statusEl) {
    const pct = calcCompletion(blueprint);
    statusEl.innerHTML = `<span class="ws-completion-pill">⚡ ${pct}% Generated</span>`;
  }
}

// ── Domain state helpers ──────────────────────────────────────────────────────

function currentDomain() {
  return (_blueprint?.domains || [])[_selectedDomainIdx] || null;
}

function currentCap() {
  const dom = currentDomain();
  return (dom?.capabilities || [])[_selectedCapIndex] || null;
}

// ── Domain Navigation Tabs ────────────────────────────────────────────────────

function isDomainNotStarted(domain) {
  const caps = domain.capabilities || [];
  if (!caps.length) return true;
  return caps.every(c => !c.status || c.status === 'pending');
}

async function regenerateDomains(blueprintId, domainIds) {
  try {
    const resp = await fetch(
      `${API_BASE}/strategy-canvas/transformation-blueprint/${blueprintId}/regenerate-domains`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ domainIds }),
      }
    );
    if (resp.status === 401) { window.handleSessionExpired(); return; }
    if (!resp.ok) throw new Error('Failed to start regeneration');
    // Stay here — on reload the page renders live, filling in capabilities
    // as they complete
    window.location.reload();
  } catch (err) {
    console.error('[blueprintWorkspace] domain regen error:', err);
    alert('Could not start generation. Please try again.');
  }
}

function renderActionTrackerNavItem(nav) {
  const item = document.createElement('button');
  item.className = `ws-domain-item ws-domain-item--action-tracker${_showingActionTracker ? ' is-active' : ''}`;
  item.title = 'Action Tracker — next steps across all capabilities';
  item.innerHTML = `
    <span class="ws-domain-item__icon">
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M14 8h7"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M14 18h7"/></svg>
    </span>
    <span class="ws-domain-item__name">Action Tracker</span>
  `;
  item.addEventListener('click', () => selectActionTracker());
  nav.appendChild(item);

  const divider = document.createElement('div');
  divider.className = 'ws-domain-divider';
  nav.appendChild(divider);
}

function renderDomainTabs(blueprint) {
  const nav = document.getElementById('domain-nav');
  if (!nav) return;
  nav.innerHTML = '';

  renderActionTrackerNavItem(nav);

  const domains   = blueprint.domains || [];
  const generated = [];
  const locked    = [];
  domains.forEach((domain, idx) => {
    // A domain that is actively generating is browsable (shows live progress)
    const isLockedDomain = isDomainNotStarted(domain) && domain.status !== 'generating';
    (isLockedDomain ? locked : generated).push({ domain, idx });
  });

  const addLabel = (text) => {
    const p = document.createElement('p');
    p.className = 'ws-domain-sidebar__label';
    p.textContent = text;
    nav.appendChild(p);
  };

  const isGuest      = !!window.SOORGA_GUEST;
  const isGenerating = blueprint.status === 'generating';

  const addItem = ({ domain, idx }, isLocked) => {
    const icon = DOMAIN_ICONS_MAP[domain.domainId] || '●';
    // While the blueprint is generating, signed-in users may browse queued
    // domains — they show a "generating in progress" placeholder
    const clickable = !isLocked || (isGenerating && !isGuest);

    const item = document.createElement('button');
    item.className = `ws-domain-item${idx === _selectedDomainIdx ? ' is-active' : ''}` +
      (isLocked ? (clickable ? ' ws-domain-item--queued' : ' ws-domain-item--locked') : '');
    item.dataset.idx = idx;
    item.title = isLocked
      ? `${domain.domainName} — ${isGenerating && !isGuest ? 'generating' : 'not generated yet'}`
      : domain.domainName;
    item.innerHTML = `
      <span class="ws-domain-item__icon">${icon}</span>
      <span class="ws-domain-item__name">${domain.domainName}</span>
    `;
    if (clickable) {
      item.addEventListener('click', () => selectDomain(idx));
    } else {
      item.disabled = true;
    }
    nav.appendChild(item);
  };

  if (generated.length) {
    addLabel('Generated');
    generated.forEach(entry => addItem(entry, false));
  }

  if (locked.length) {
    const row = document.createElement('div');
    row.className = 'ws-domain-group-row';
    row.innerHTML = `
      <p class="ws-domain-sidebar__label" style="margin:0">${isGenerating && !isGuest ? 'Generating…' : 'Not generated'}</p>
      ${isGenerating ? '' : `
      <button id="domain-generate-rest" class="ws-domain-generate-all" ${isGuest ? 'disabled' : ''}
        title="${isGuest ? 'Log in to generate the remaining domains' : 'Generate all remaining domains'}">
        Generate
      </button>`}
    `;
    nav.appendChild(row);
    locked.forEach(entry => addItem(entry, true));

    if (!isGuest && !isGenerating) {
      const btn = nav.querySelector('#domain-generate-rest');
      btn?.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = '…';
        regenerateDomains(blueprint._id, locked.map(e => e.domain.domainId));
      });
    }
  }
}

function selectDomain(idx) {
  _selectedDomainIdx = idx;
  _selectedCapIndex  = 0;
  _refineTargetSection = null;
  _showingActionTracker = false;
  clearSuggestionCard();

  // Match by stored index, not DOM order — the sidebar groups items into
  // Generated / Not generated sections
  document.querySelectorAll('.ws-domain-item').forEach((t) => {
    t.classList.toggle('is-active', Number(t.dataset.idx) === idx);
  });
  document.querySelector('.ws-domain-item--action-tracker')?.classList.remove('is-active');

  document.getElementById('cap-nav').style.display = '';
  renderCapabilityTabs(_blueprint);
  renderBlueprintContent(_blueprint, 0);
  updateAssistantContext();
}

// ── Action Tracker (blueprint-wide, not domain-scoped) ──────────────────────────

const ACTION_ITEM_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review',   label: 'In Review' },
  { value: 'agreed',      label: 'Agreed' },
];

function selectActionTracker() {
  _showingActionTracker = true;
  _refineTargetSection = null;
  clearSuggestionCard();

  document.querySelectorAll('.ws-domain-item').forEach(t => t.classList.remove('is-active'));
  document.querySelector('.ws-domain-item--action-tracker')?.classList.add('is-active');

  // No capability sub-navigation applies to a blueprint-wide view
  document.getElementById('cap-nav').style.display = 'none';
  const header = document.getElementById('cap-journey-header');
  if (header) header.innerHTML = '';

  renderActionTracker();
}

async function renderActionTracker() {
  const area = document.getElementById('bp-content');
  if (!area || !_blueprint) return;

  area.innerHTML = `
    <div class="bp-cap-header"><h2 class="bp-cap-title">Action Tracker</h2></div>
    <div class="at-loading">Loading action items…</div>
  `;

  let items;
  try {
    const resp = await fetch(`${API_BASE}/action-items/${_blueprint._id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (resp.status === 401) { window.handleSessionExpired(); return; }
    if (!resp.ok) throw new Error('Failed to load action items');
    ({ items } = await resp.json());
  } catch (err) {
    console.error('[blueprintWorkspace] action tracker load error:', err);
    area.innerHTML = `
      <div class="bp-cap-header"><h2 class="bp-cap-title">Action Tracker</h2></div>
      <p class="at-error">Couldn't load action items. Please try again.</p>
    `;
    return;
  }

  // Guard against a stale response landing after the user navigated away
  if (!_showingActionTracker) return;

  if (!items.length) {
    area.innerHTML = `
      <div class="bp-cap-header"><h2 class="bp-cap-title">Action Tracker</h2></div>
      <p class="at-empty">No action items yet — they're derived automatically as capabilities complete.</p>
    `;
    return;
  }

  // Group by capability, ordered by the blueprint's real domain/capability
  // sequence — NOT by item insertion order. Items come from a parallel
  // backfill (Promise.all across every capability at once), so their
  // createdAt timestamps land in whatever order the LLM calls happened to
  // finish, not domain order — the first domain could easily finish last.
  const itemsByCapability = new Map();
  for (const item of items) {
    if (!itemsByCapability.has(item.capabilityId)) itemsByCapability.set(item.capabilityId, []);
    itemsByCapability.get(item.capabilityId).push(item);
  }

  const byCapability = new Map();
  for (const dom of _blueprint.domains || []) {
    for (const cap of dom.capabilities || []) {
      const capItems = itemsByCapability.get(cap.capabilityId);
      if (!capItems?.length) continue;
      byCapability.set(cap.capabilityId, { capabilityName: cap.capabilityName, domainName: dom.domainName, items: capItems });
    }
  }

  const groups = [...byCapability.values()].map(group => `
    <div class="at-group">
      <p class="at-group__label">${escapeHtml(group.domainName)} · ${escapeHtml(resolveCapName(group.capabilityName))}</p>
      <table class="at-table">
        <thead>
          <tr><th>Action Item</th><th>Assignee</th><th>Reviewer</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${group.items.map(item => `
            <tr data-item-id="${item._id}">
              <td class="at-table__title">
                <p class="at-item-title">${escapeHtml(item.title)}</p>
                ${item.description ? `<p class="at-item-desc">${escapeHtml(item.description)}</p>` : ''}
              </td>
              <td><input type="text" class="at-input at-input--assignee" placeholder="Unassigned"></td>
              <td><input type="text" class="at-input at-input--reviewer" placeholder="—"></td>
              <td>
                <select class="at-status at-status--${item.status}">
                  ${ACTION_ITEM_STATUSES.map(s => `<option value="${s.value}"${s.value === item.status ? ' selected' : ''}>${s.label}</option>`).join('')}
                </select>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  area.innerHTML = `
    <div class="bp-cap-header"><h2 class="bp-cap-title">Action Tracker</h2></div>
    ${groups}
  `;

  // Wire up edits — one PATCH per field change, scoped to that row's item id.
  // Assignee/reviewer values are set via the .value property here, not
  // string-interpolated into the value="..." attribute above — user-typed
  // text (e.g. containing a literal ") would otherwise break out of the
  // attribute when parsed as HTML.
  const itemsById = new Map(items.map(i => [String(i._id), i]));
  area.querySelectorAll('tr[data-item-id]').forEach(row => {
    const itemId = row.dataset.itemId;
    const item   = itemsById.get(itemId);

    const assigneeInput = row.querySelector('.at-input--assignee');
    if (assigneeInput) {
      assigneeInput.value = item?.assignee || '';
      assigneeInput.addEventListener('change', e => patchActionItem(itemId, { assignee: e.target.value }));
    }

    const reviewerInput = row.querySelector('.at-input--reviewer');
    if (reviewerInput) {
      reviewerInput.value = item?.reviewer || '';
      reviewerInput.addEventListener('change', e => patchActionItem(itemId, { reviewer: e.target.value }));
    }

    row.querySelector('.at-status')?.addEventListener('change', e => {
      e.target.className = `at-status at-status--${e.target.value}`;
      patchActionItem(itemId, { status: e.target.value });
    });
  });
}

async function patchActionItem(itemId, updates) {
  try {
    const resp = await fetch(`${API_BASE}/action-items/${_blueprint._id}/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(updates),
    });
    if (resp.status === 401) { window.handleSessionExpired(); return; }
    if (!resp.ok) throw new Error('Failed to update action item');
  } catch (err) {
    console.error('[blueprintWorkspace] action item update error:', err);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Capability tabs ───────────────────────────────────────────────────────────

const DOMAIN_SHORT_LABELS = {
  'ai-use-cases':               'AI Use Cases',
  'ai-strategy':                'AI Strategy',
  'data-readiness':             'Data Readiness',
  'technology-infrastructure':  'Technology',
  'skills-workforce':           'Skills',
  'governance-security':        'Governance',
};

function renderCapabilityTabs(blueprint) {
  const nav    = document.getElementById('cap-nav');
  const header = document.getElementById('cap-journey-header');
  if (!nav) return;
  nav.innerHTML = '';
  if (header) header.innerHTML = '';

  const dom  = (blueprint.domains || [])[_selectedDomainIdx];
  const caps = (dom?.capabilities || []).filter(c => !RETIRED_CAPABILITY_IDS.has(c.capabilityId));

  const track = document.createElement('div');
  track.className = 'cap-step-tabs';
  track.style.setProperty('--cap-step-count', caps.length);

  caps.forEach((cap, idx) => {
    const isActive = idx === _selectedCapIndex;
    const tab = document.createElement('button');
    tab.className = `cap-step-tab${isActive ? ' is-active' : ''}`;
    tab.dataset.idx = idx;
    tab.innerHTML = `
      <span class="cap-step-tab__meta">STEP ${idx + 1} OF ${caps.length}</span>
      <span class="cap-step-tab__name">${resolveCapName(cap.capabilityName)}</span>
      <span class="cap-step-tab__status">${isActive ? '● CURRENTLY VIEWING' : 'VIEW STEP →'}</span>`;
    tab.addEventListener('click', () => selectCapability(idx));
    track.appendChild(tab);
  });

  nav.appendChild(track);
  applyCapAccent(_selectedCapIndex);
}

// ── One-time feedback card ─────────────────────────────────────────────────────

const FB_LS_KEY = 'soorgaai_fb_done';
const FEEDBACK_DELAY_MS = 3.5 * 60 * 1000; // show partway through a strategy-reading session

let _feedbackTimer = null;

async function maybeShowFeedback() {
  if (_feedbackShown) return;
  if (localStorage.getItem(FB_LS_KEY)) return;

  // Backend check (handles new devices where localStorage is empty)
  try {
    const resp = await fetch(`${API_BASE}/feedback`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!resp.ok) return;
    const { submitted } = await resp.json();
    if (submitted) { localStorage.setItem(FB_LS_KEY, '1'); return; }
  } catch { return; }

  _feedbackShown = true;

  // Show after a brief delay so the capability content loads first
  setTimeout(() => {
    const card = document.getElementById('feedback-card');
    if (!card) return;
    card.style.display = 'block';

    card.querySelector('#feedback-dismiss').addEventListener('click', () => {
      localStorage.setItem(FB_LS_KEY, '1');
      card.style.display = 'none';
    }, { once: true });

    card.querySelectorAll('.feedback-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rating = btn.dataset.rating;
        localStorage.setItem(FB_LS_KEY, '1');

        // Optimistic thank-you state
        card.classList.add('feedback-card--thankyou');
        card.querySelector('#feedback-question').textContent = 'Thank you for your feedback!';

        setTimeout(() => { card.style.display = 'none'; }, 2000);

        try {
          await fetch(`${API_BASE}/feedback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getToken()}`,
            },
            body: JSON.stringify({ rating }),
          });
        } catch { /* non-critical — already stored in localStorage */ }
      }, { once: true });
    });
  }, 1500);
}

function selectCapability(idx) {
  _selectedCapIndex    = idx;
  _refineTargetSection = null;
  clearSuggestionCard();

  // Re-render the step-tab bar so the active tab, meta labels, and accent
  // colour all reflect the new selection.
  renderCapabilityTabs(_blueprint);

  renderBlueprintContent(_blueprint, idx);
  // Chat is blueprint-wide — no restoreChat() on tab switch, history stays visible
  updateAssistantContext();
}

// ── Blueprint content ─────────────────────────────────────────────────────────

function renderBlueprintContent(blueprint, capIdx) {
  const area = document.getElementById('bp-content');
  if (!area) return;
  area.innerHTML = '';

  const dom = (blueprint.domains || [])[_selectedDomainIdx];
  const cap = (dom?.capabilities || [])[capIdx];
  if (!cap) return;

  // Regeneration is for signed-in users, and only when nothing is running
  const canRegen = !window.SOORGA_GUEST && blueprint.status !== 'generating';

  // Capability title + action buttons (always available for completed caps)
  const header = document.createElement('div');
  header.className = 'bp-cap-header';
  const capTitle = document.createElement('h2');
  capTitle.className = 'bp-cap-title';
  capTitle.textContent = resolveCapName(cap.capabilityName);
  header.appendChild(capTitle);
  if (cap.status === 'completed' && canRegen) {
    const actions = document.createElement('div');
    actions.className = 'bp-cap-actions';

    const refineBtn = document.createElement('button');
    refineBtn.className = 'bp-cap-refine-btn';
    refineBtn.textContent = 'Refine with AI Assistant';
    refineBtn.addEventListener('click', () => openAssistantForCapability(resolveCapName(cap.capabilityName)));
    actions.appendChild(refineBtn);

    const regenBtn = document.createElement('button');
    regenBtn.className = 'bp-cap-regen-btn';
    regenBtn.textContent = 'Regenerate';
    regenBtn.addEventListener('click', () => triggerCapabilityRegeneration(cap, regenBtn));
    actions.appendChild(regenBtn);

    header.appendChild(actions);
  }
  area.appendChild(header);

  if (cap.status !== 'completed' || !cap.sections?.length) {
    const empty = document.createElement('div');
    empty.className = 'bp-empty';
    const isError      = cap.status === 'error';
    const isGenerating = blueprint.status === 'generating' && !isError;
    empty.innerHTML = `
      <div class="bp-empty__icon">${isError ? '⚠' : '⟳'}</div>
      <p class="bp-empty__title">${isError ? 'Generation failed for this capability' : (isGenerating ? 'Generating in progress…' : 'Not generated yet')}</p>
      <p class="bp-empty__text">${isError ? 'The AI encountered an error generating this section.' : (isGenerating ? 'This capability is being generated — it will appear here automatically in a moment.' : 'This section will appear when generation completes.')}</p>
    `;
    if (canRegen) {
      const regenBtn = document.createElement('button');
      regenBtn.className = 'bp-regen-btn';
      regenBtn.textContent = 'Regenerate';
      regenBtn.addEventListener('click', () => triggerCapabilityRegeneration(cap, regenBtn));
      empty.appendChild(regenBtn);
    }
    area.appendChild(empty);
    return;
  }

  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'bp-sections';

  for (const section of cap.sections) {
    // Skip the preamble section when a capability has sub-sections (Vision/Alignment/Commitment).
    // Pillar #1 shares the capability name and exists to give the LLM context, not as a display card.
    if (cap.sections.length > 1 && resolveCapName(section.title) === resolveCapName(cap.capabilityName)) continue;
    const card = buildSectionCard(blueprint, cap, section);
    sectionsEl.appendChild(card);
  }

  area.appendChild(sectionsEl);
}

// ── Essay renderer (Essay view) ───────────────────────────────────────────────

function buildEssayBlock(section) {
  const block = document.createElement('div');
  block.className = 'essay-block';

  const label = document.createElement('p');
  label.className = 'brief-label';
  label.textContent = 'Strategic Analysis';
  block.appendChild(label);

  if (section.content) {
    const text = document.createElement('p');
    text.className = 'essay-block__text';
    text.textContent = section.content;
    block.appendChild(text);
  } else {
    const empty = document.createElement('p');
    empty.className = 'essay-block__empty';
    empty.textContent = 'Essay not available for this section.';
    block.appendChild(empty);
  }

  return block;
}

// ── Pillars renderer (CTO view — Vision template) ─────────────────────────────

function buildPillarsGrid(pillars) {
  const grid = document.createElement('div');
  grid.className = 'pillars-grid';

  pillars.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pillar-card';

    const title = document.createElement('p');
    title.className = 'pillar-card__title';
    title.textContent = p.title;
    card.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'pillar-card__description';
    desc.textContent = p.description;
    card.appendChild(desc);

    if (p.businessImpactTag) {
      const tag = document.createElement('span');
      tag.className = 'pillar-card__tag';
      tag.textContent = p.businessImpactTag;
      card.appendChild(tag);
    }

    grid.appendChild(card);
  });

  return grid;
}

function buildKpiHighlights(highlights, label = 'Success Metrics') {
  const wrap = document.createElement('div');
  wrap.className = 'kpi-highlights-wrap';

  const heading = document.createElement('p');
  heading.className = 'brief-label';
  heading.textContent = label;
  wrap.appendChild(heading);

  const block = document.createElement('div');
  block.className = 'kpi-highlights';

  highlights.forEach(k => {
    const item = document.createElement('div');
    item.className = 'kpi-item';

    const value = document.createElement('p');
    value.className = 'kpi-item__value';
    value.textContent = k.value;

    const label = document.createElement('p');
    label.className = 'kpi-item__label';
    label.textContent = k.label;

    const desc = document.createElement('p');
    desc.className = 'kpi-item__description';
    desc.textContent = k.description;

    item.appendChild(value);
    item.appendChild(label);
    item.appendChild(desc);
    block.appendChild(item);
  });

  wrap.appendChild(block);
  return wrap;
}

function buildHorizontalTimeline(steps) {
  const block = document.createElement('div');
  block.className = 'h-timeline';

  const label = document.createElement('p');
  label.className = 'brief-label';
  label.textContent = 'Priority Timeline (90 Days)';
  block.appendChild(label);

  const track = document.createElement('div');
  track.className = 'h-timeline__track';

  steps.forEach((step, i) => {
    const item = document.createElement('div');
    item.className = 'h-timeline__step';

    const num = document.createElement('span');
    num.className = 'h-timeline__step-num';
    num.textContent = String(i + 1);

    const stepLabel = document.createElement('span');
    stepLabel.className = 'h-timeline__step-label';
    stepLabel.textContent = step;

    item.appendChild(num);
    item.appendChild(stepLabel);
    track.appendChild(item);
  });

  block.appendChild(track);
  return block;
}

function buildSpokeWheel(nodes, centerLabel) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 300, H = 300, cx = 150, cy = 150;
  const spokeR  = 105;
  const centerR = 44;
  const nodeR   = 36;
  const n       = nodes.length;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width  = '100%';
  svg.style.height = 'auto';
  svg.classList.add('spoke-wheel');

  function wrapWords(text, maxPer) {
    const words = text.split(' ');
    const lines = [];
    for (let i = 0; i < words.length; i += maxPer) {
      lines.push(words.slice(i, i + maxPer).join(' '));
    }
    return lines;
  }

  function addText(parent, lines, x, y, fontSize, fill, lineH) {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('fill', fill);
    el.setAttribute('font-size', fontSize);
    el.setAttribute('font-weight', '600');
    el.setAttribute('font-family', 'inherit');
    const totalH = (lines.length - 1) * lineH;
    lines.forEach((line, i) => {
      const ts = document.createElementNS(NS, 'tspan');
      ts.setAttribute('x', x);
      ts.setAttribute('y', y - totalH / 2 + i * lineH);
      ts.textContent = line;
      el.appendChild(ts);
    });
    parent.appendChild(el);
  }

  // Spokes first (drawn behind circles)
  nodes.forEach((_, i) => {
    const a = (2 * Math.PI / n) * i - Math.PI / 2;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', cx);
    line.setAttribute('y1', cy);
    line.setAttribute('x2', cx + spokeR * Math.cos(a));
    line.setAttribute('y2', cy + spokeR * Math.sin(a));
    line.setAttribute('stroke', 'rgba(99,102,241,0.3)');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);
  });

  // Center circle
  const cc = document.createElementNS(NS, 'circle');
  cc.setAttribute('cx', cx); cc.setAttribute('cy', cy); cc.setAttribute('r', centerR);
  cc.setAttribute('fill', 'rgba(99,102,241,0.18)');
  cc.setAttribute('stroke', 'rgba(99,102,241,0.55)');
  cc.setAttribute('stroke-width', '1.5');
  svg.appendChild(cc);
  addText(svg, wrapWords(centerLabel, 2), cx, cy, 6.5, 'rgba(255,255,255,0.92)', 8.5);

  // Outer node circles
  nodes.forEach((label, i) => {
    const a  = (2 * Math.PI / n) * i - Math.PI / 2;
    const nx = cx + spokeR * Math.cos(a);
    const ny = cy + spokeR * Math.sin(a);

    const oc = document.createElementNS(NS, 'circle');
    oc.setAttribute('cx', nx); oc.setAttribute('cy', ny); oc.setAttribute('r', nodeR);
    oc.setAttribute('fill', 'rgba(255,255,255,0.04)');
    oc.setAttribute('stroke', 'rgba(99,102,241,0.28)');
    oc.setAttribute('stroke-width', '1');
    svg.appendChild(oc);
    addText(svg, wrapWords(label, 2), nx, ny, 6, 'rgba(255,255,255,0.72)', 8);
  });

  return svg;
}

function buildInitiativeCard(init, wide = false) {
  const card = document.createElement('div');
  card.className = `initiative-card${wide ? ' initiative-card--wide' : ''}`;

  const title = document.createElement('p');
  title.className = 'initiative-card__title';
  title.textContent = init.title;

  const desc = document.createElement('p');
  desc.className = 'initiative-card__description';
  desc.textContent = init.description;

  card.appendChild(title);
  card.appendChild(desc);
  return card;
}

function buildAlignmentLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'alignment-layout';

  // 1. Strategic Position — full width
  const stmtBlock = document.createElement('div');
  stmtBlock.className = 'vision-statement';
  const stmtLabel = document.createElement('p');
  stmtLabel.className = 'brief-label';
  stmtLabel.textContent = 'Strategic Position';
  const stmtText = document.createElement('p');
  stmtText.className = 'vision-statement__text';
  stmtText.textContent = b.strategicPosition || '—';
  stmtBlock.appendChild(stmtLabel);
  stmtBlock.appendChild(stmtText);
  wrap.appendChild(stmtBlock);

  // 2. Two-column body
  const body = document.createElement('div');
  body.className = 'alignment-body';

  // Left column: spoke wheel
  const leftCol = document.createElement('div');
  leftCol.className = 'alignment-left';

  if (b.spokeNodes?.length) {
    leftCol.appendChild(buildSpokeWheel(b.spokeNodes, 'AI Transformation Agenda'));
  }

  body.appendChild(leftCol);

  // Right column: 3-card grid + 1 wide card
  if (b.alignmentInitiatives?.length) {
    const col = document.createElement('div');
    col.className = 'alignment-initiatives';

    const gridItems = b.alignmentInitiatives.slice(0, 3);
    if (gridItems.length) {
      const grid = document.createElement('div');
      grid.className = 'initiative-grid';
      gridItems.forEach(init => grid.appendChild(buildInitiativeCard(init)));
      col.appendChild(grid);
    }

    const wideItem = b.alignmentInitiatives[3];
    if (wideItem) col.appendChild(buildInitiativeCard(wideItem, true));

    body.appendChild(col);
  }

  if (body.children.length) wrap.appendChild(body);

  // 3. KPI highlights — full-width horizontal cards at the bottom
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights, 'Alignment Indicators'));
  }

  return wrap;
}

function buildFunnelChart(stages) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 400, stageH = 65, gap = 8;
  const n = stages.length;
  const totalH = n * stageH + (n - 1) * gap;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${totalH}`);
  svg.classList.add('funnel-chart');

  const accentColors = [
    'rgba(129,140,248,0.85)',
    'rgba(129,140,248,0.75)',
    'rgba(167,139,250,0.75)',
    'rgba(244,114,182,0.7)',
  ];

  stages.forEach((stage, i) => {
    const inset = i * 38;
    const nextInset = (i + 1) * 38;
    const topY = i * (stageH + gap);
    const botY = topY + stageH;
    const lxTop = 20 + inset, rxTop = W - 20 - inset;
    const lxBot = i < n - 1 ? 20 + nextInset : lxTop + 18;
    const rxBot = i < n - 1 ? W - 20 - nextInset : rxTop - 18;

    // Main trapezoid
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', `${lxTop},${topY} ${rxTop},${topY} ${rxBot},${botY} ${lxBot},${botY}`);
    poly.setAttribute('fill', `rgba(99,102,241,${0.72 - i * 0.08})`);
    poly.setAttribute('stroke', 'rgba(129,140,248,0.2)');
    poly.setAttribute('stroke-width', '1');
    svg.appendChild(poly);

    // Right accent stripe (~6% of width)
    const aw = Math.max(14, (rxTop - lxTop) * 0.06);
    const accentPoly = document.createElementNS(NS, 'polygon');
    accentPoly.setAttribute('points', `${rxTop - aw},${topY} ${rxTop},${topY} ${rxBot},${botY} ${rxBot - aw},${botY}`);
    accentPoly.setAttribute('fill', accentColors[i] || accentColors[accentColors.length - 1]);
    svg.appendChild(accentPoly);

    // Count (large)
    const midX = (lxTop + rxTop) / 2;
    const midY = topY + stageH * 0.38;
    const countEl = document.createElementNS(NS, 'text');
    countEl.setAttribute('x', midX); countEl.setAttribute('y', midY);
    countEl.setAttribute('text-anchor', 'middle'); countEl.setAttribute('dominant-baseline', 'middle');
    countEl.setAttribute('font-size', '26'); countEl.setAttribute('font-weight', '700');
    countEl.setAttribute('fill', 'rgba(255,255,255,0.95)');
    countEl.textContent = stage.count;
    svg.appendChild(countEl);

    // Label (small)
    const labelEl = document.createElementNS(NS, 'text');
    labelEl.setAttribute('x', midX); labelEl.setAttribute('y', midY + 21);
    labelEl.setAttribute('text-anchor', 'middle'); labelEl.setAttribute('dominant-baseline', 'middle');
    labelEl.setAttribute('font-size', '11.5'); labelEl.setAttribute('fill', 'rgba(255,255,255,0.7)');
    labelEl.textContent = stage.label;
    svg.appendChild(labelEl);

    // Connector circle between stages
    if (i < n - 1) {
      const connY = botY + gap / 2;
      const circ = document.createElementNS(NS, 'circle');
      circ.setAttribute('cx', W / 2); circ.setAttribute('cy', connY);
      circ.setAttribute('r', '3.5');
      circ.setAttribute('fill', 'rgba(129,140,248,0.85)');
      svg.appendChild(circ);
    }
  });

  return svg;
}

function buildPrioritizationMatrix(quadrants) {
  // quadrants order: [0] Quick Wins, [1] Strategic Bets, [2] Fill-ins, [3] Defer
  const wrap = document.createElement('div');
  wrap.className = 'priority-matrix';

  const yAxis = document.createElement('div');
  yAxis.className = 'matrix-y-axis';
  ['High', 'Business Impact', 'Low'].forEach((t, i) => {
    const el = document.createElement('span');
    el.className = i === 1 ? 'matrix-axis-label' : 'matrix-axis-tick';
    el.textContent = t;
    yAxis.appendChild(el);
  });
  wrap.appendChild(yAxis);

  const content = document.createElement('div');
  content.className = 'matrix-content';

  const grid = document.createElement('div');
  grid.className = 'matrix-grid';
  (quadrants.slice(0, 4)).forEach(q => {
    const cell = document.createElement('div');
    cell.className = 'matrix-quadrant';
    const title = document.createElement('p');
    title.className = 'matrix-quadrant__title';
    title.textContent = q.title;
    cell.appendChild(title);
    if (q.initiatives?.length) {
      const items = document.createElement('p');
      items.className = 'matrix-quadrant__items';
      items.textContent = q.initiatives.join(', ');
      cell.appendChild(items);
    }
    grid.appendChild(cell);
  });
  content.appendChild(grid);

  const xAxis = document.createElement('div');
  xAxis.className = 'matrix-x-axis';
  ['Low', 'Readiness', 'High'].forEach((t, i) => {
    const el = document.createElement('span');
    el.className = i === 1 ? 'matrix-axis-label' : 'matrix-axis-tick';
    el.textContent = t;
    xAxis.appendChild(el);
  });
  content.appendChild(xAxis);

  wrap.appendChild(content);
  return wrap;
}

function buildQuarterlyTimeline(plan) {
  const wrap = document.createElement('div');
  wrap.className = 'quarterly-timeline';

  plan.forEach((item, i) => {
    const step = document.createElement('div');
    step.className = 'quarterly-timeline__step';

    const num = document.createElement('div');
    num.className = 'quarterly-timeline__num';
    num.textContent = String(i + 1);

    const quarter = document.createElement('div');
    quarter.className = 'quarterly-timeline__quarter';
    quarter.textContent = item.quarter;

    const inits = document.createElement('div');
    inits.className = 'quarterly-timeline__initiatives';
    (item.initiatives || []).forEach(init => {
      const p = document.createElement('p');
      p.className = 'quarterly-timeline__initiative';
      p.textContent = init;
      inits.appendChild(p);
    });

    step.appendChild(num);
    step.appendChild(quarter);
    step.appendChild(inits);
    wrap.appendChild(step);
  });

  return wrap;
}

function buildBusinessRoadmapLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'business-roadmap-layout';

  // 1. Strategic Position
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text';
  stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  // 2. Business Priorities — pill tags from priorityActions
  if (b.priorityActions?.length) {
    const priSection = document.createElement('div');
    priSection.className = 'roadmap-priorities-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Business Priorities';
    const pills = document.createElement('div');
    pills.className = 'roadmap-priority-pills';
    b.priorityActions.forEach(a => {
      const pill = document.createElement('div');
      pill.className = 'roadmap-priority-pill';
      pill.textContent = a;
      pills.appendChild(pill);
    });
    priSection.appendChild(lbl);
    priSection.appendChild(pills);
    wrap.appendChild(priSection);
  }

  // 3. AI Opportunity Funnel
  if (b.funnelStages?.length) {
    const funnelSection = document.createElement('div');
    funnelSection.className = 'roadmap-funnel-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'AI Opportunity Funnel';
    funnelSection.appendChild(lbl);
    const funnelWrap = document.createElement('div');
    funnelWrap.className = 'funnel-chart-wrap';
    funnelWrap.appendChild(buildFunnelChart(b.funnelStages));
    funnelSection.appendChild(funnelWrap);
    wrap.appendChild(funnelSection);
  }

  // 4. Business Outcomes — KPI highlights
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

function buildStrategicRoadmapLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'strategic-roadmap-layout';

  // 1. Strategic Position
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text';
  stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  // 2. Prioritization Matrix
  if (b.matrixQuadrants?.length) {
    const matSection = document.createElement('div');
    matSection.className = 'roadmap-matrix-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Prioritization Matrix';
    matSection.appendChild(lbl);
    matSection.appendChild(buildPrioritizationMatrix(b.matrixQuadrants));
    wrap.appendChild(matSection);
  }

  // 3. Quarterly Execution Timeline
  if (b.quarterlyPlan?.length) {
    const qtSection = document.createElement('div');
    qtSection.className = 'roadmap-quarterly-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Quarterly Execution Timeline';
    qtSection.appendChild(lbl);
    qtSection.appendChild(buildQuarterlyTimeline(b.quarterlyPlan));
    wrap.appendChild(qtSection);
  }

  // 4. Success Metrics — KPI highlights
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

function buildGovernanceTemple() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 230');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Governance structure pillars');
  svg.classList.add('governance-temple');

  function mkRect(x, y, w, h, fill, rx) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('fill', fill);
    if (rx) r.setAttribute('rx', rx);
    return r;
  }
  function mkPoly(points, fill) {
    const p = document.createElementNS(NS, 'polygon');
    p.setAttribute('points', points); p.setAttribute('fill', fill);
    return p;
  }

  const dark  = 'rgba(67,56,202,0.92)';
  const mid   = 'rgba(99,102,241,0.82)';
  const light = 'rgba(129,140,248,0.45)';

  // Pediment triangle
  svg.appendChild(mkPoly('100,8 15,56 185,56', dark));
  // Entablature beam
  svg.appendChild(mkRect(13, 56, 174, 14, mid, 2));
  // 4 pillars + highlight strip
  [23, 62, 101, 140].forEach((x, i) => {
    const fill = i % 2 === 0 ? 'rgba(99,102,241,0.68)' : 'rgba(99,102,241,0.55)';
    svg.appendChild(mkRect(x, 70, 27, 112, fill, 1));
    svg.appendChild(mkRect(x + 3, 70, 8, 112, light, 1));
  });
  // Step above base
  svg.appendChild(mkRect(13, 182, 174, 11, mid, 2));
  // Base
  svg.appendChild(mkRect(7, 193, 186, 15, dark, 3));

  return svg;
}

function buildGovernanceNode(node) {
  const div = document.createElement('div');
  div.className = 'commitment-governance-node';
  const title = document.createElement('p');
  title.className = 'commitment-governance-node__title';
  title.textContent = node.title;
  const desc = document.createElement('p');
  desc.className = 'commitment-governance-node__desc';
  desc.textContent = node.description;
  div.appendChild(title);
  div.appendChild(desc);
  return div;
}

function buildCommitmentLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'commitment-layout';

  // 1. Strategic Position
  const stmtBlock = document.createElement('div');
  stmtBlock.className = 'vision-statement';
  const stmtLabel = document.createElement('p');
  stmtLabel.className = 'brief-label';
  stmtLabel.textContent = 'Strategic Position';
  const stmtText = document.createElement('p');
  stmtText.className = 'vision-statement__text';
  stmtText.textContent = b.strategicPosition || '—';
  stmtBlock.appendChild(stmtLabel);
  stmtBlock.appendChild(stmtText);
  wrap.appendChild(stmtBlock);

  // 2. Executive Commitment Pillars — 3-col cards with bullet actions
  if (b.commitmentPillars?.length) {
    const pillarsSection = document.createElement('div');
    pillarsSection.className = 'commitment-pillars-section';
    const pillarsHeading = document.createElement('p');
    pillarsHeading.className = 'brief-label';
    pillarsHeading.textContent = 'Executive Commitment Pillars';
    const pillarsGrid = document.createElement('div');
    pillarsGrid.className = 'commitment-pillars';
    b.commitmentPillars.forEach(p => {
      const card = document.createElement('div');
      card.className = 'commitment-pillar-card';
      const title = document.createElement('p');
      title.className = 'commitment-pillar-card__title';
      title.textContent = p.title;
      card.appendChild(title);
      if (p.actions?.length) {
        const ul = document.createElement('ul');
        ul.className = 'commitment-pillar-card__list';
        p.actions.forEach(a => {
          const li = document.createElement('li');
          li.textContent = a;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      pillarsGrid.appendChild(card);
    });
    pillarsSection.appendChild(pillarsHeading);
    pillarsSection.appendChild(pillarsGrid);
    wrap.appendChild(pillarsSection);
  }

  // 3. Governance Structure — temple SVG flanked by node pairs
  if (b.governanceNodes?.length) {
    const govSection = document.createElement('div');
    govSection.className = 'commitment-governance-section';
    const govHeading = document.createElement('p');
    govHeading.className = 'brief-label';
    govHeading.textContent = 'Governance Structure';
    govSection.appendChild(govHeading);

    const templeWrap = document.createElement('div');
    templeWrap.className = 'commitment-governance-temple';

    // Left column: nodes[0] (top) + nodes[2] (bottom)
    const leftCol = document.createElement('div');
    leftCol.className = 'commitment-governance-nodes';
    [0, 2].forEach(i => {
      if (b.governanceNodes[i]) leftCol.appendChild(buildGovernanceNode(b.governanceNodes[i]));
    });

    // Center: simplified temple SVG
    const center = document.createElement('div');
    center.className = 'commitment-governance-center';
    center.appendChild(buildGovernanceTemple());

    // Right column: nodes[1] (top) + nodes[3] (bottom)
    const rightCol = document.createElement('div');
    rightCol.className = 'commitment-governance-nodes';
    [1, 3].forEach(i => {
      if (b.governanceNodes[i]) rightCol.appendChild(buildGovernanceNode(b.governanceNodes[i]));
    });

    templeWrap.appendChild(leftCol);
    templeWrap.appendChild(center);
    templeWrap.appendChild(rightCol);
    govSection.appendChild(templeWrap);
    wrap.appendChild(govSection);
  }

  // 4. Commitment Indicators — KPI highlight cards at the bottom
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights, 'Commitment Indicators'));
  }

  return wrap;
}

// ── AI Operating Model — Solution-Centric Organization ────────────────────────

function buildSolutionCentricLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'solution-centric-layout';

  // 1. Strategic Position
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text';
  stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  // 2. Solution Portfolio — single solution card
  const sol = Array.isArray(b.solutionPortfolio) ? b.solutionPortfolio[0] : null;
  if (sol) {
    const portSection = document.createElement('div');
    portSection.className = 'solution-portfolio-section';
    const portLbl = document.createElement('p');
    portLbl.className = 'brief-label'; portLbl.textContent = 'Solution Portfolio';
    portSection.appendChild(portLbl);

    const card = document.createElement('div');
    card.className = 'sol-main-card';

    const solName = document.createElement('p');
    solName.className = 'sol-main-card__name';
    solName.textContent = sol.name || '—';
    card.appendChild(solName);

    const meta = document.createElement('div');
    meta.className = 'sol-main-card__meta';

    // Owner row
    if (sol.businessOwner) {
      const ownerRow = document.createElement('div');
      ownerRow.className = 'sol-meta-row';
      ownerRow.innerHTML = `<span class="sol-meta-label">Owner</span><span class="sol-meta-value">${sol.businessOwner}</span>`;
      meta.appendChild(ownerRow);
    }

    // Delivery Team chips
    const teams = Array.isArray(sol.deliveryTeam)
      ? sol.deliveryTeam
      : String(sol.deliveryTeam || '').split(',').map(s => s.trim()).filter(Boolean);
    if (teams.length) {
      const teamRow = document.createElement('div');
      teamRow.className = 'sol-meta-row sol-meta-row--chips';
      const teamLabel = document.createElement('span');
      teamLabel.className = 'sol-meta-label'; teamLabel.textContent = 'Delivery Team';
      const chips = document.createElement('div');
      chips.className = 'sol-chips';
      teams.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'sol-team-chip'; chip.textContent = t;
        chips.appendChild(chip);
      });
      teamRow.appendChild(teamLabel); teamRow.appendChild(chips);
      meta.appendChild(teamRow);
    }

    // KPI chips
    const kpis = Array.isArray(sol.kpis) ? sol.kpis : [];
    if (kpis.length) {
      const kpiRow = document.createElement('div');
      kpiRow.className = 'sol-meta-row sol-meta-row--chips';
      const kpiLabel = document.createElement('span');
      kpiLabel.className = 'sol-meta-label'; kpiLabel.textContent = 'KPIs';
      const chips = document.createElement('div');
      chips.className = 'sol-chips';
      kpis.forEach(k => {
        const chip = document.createElement('span');
        chip.className = 'sol-kpi-chip'; chip.textContent = k;
        chips.appendChild(chip);
      });
      kpiRow.appendChild(kpiLabel); kpiRow.appendChild(chips);
      meta.appendChild(kpiRow);
    }

    card.appendChild(meta);
    portSection.appendChild(card);
    wrap.appendChild(portSection);
  }

  // 3. Solution Components — capability cards
  // New blueprints: b.solutionComponents[]. Old blueprints: extra solutionPortfolio items as fallback.
  let components = Array.isArray(b.solutionComponents) ? b.solutionComponents : [];
  if (!components.length && Array.isArray(b.solutionPortfolio) && b.solutionPortfolio.length > 1) {
    components = b.solutionPortfolio.slice(1).map(p => ({ name: p.name || '—', purpose: p.businessOwner ? `Owner: ${p.businessOwner}` : '' }));
  }
  if (components.length) {
    const compSection = document.createElement('div');
    compSection.className = 'solution-portfolio-section';
    const compLbl = document.createElement('p');
    compLbl.className = 'brief-label'; compLbl.textContent = 'Solution Components';
    compSection.appendChild(compLbl);

    const grid = document.createElement('div');
    grid.className = 'sol-components-grid';
    components.forEach(comp => {
      const card = document.createElement('div');
      card.className = 'sol-component-card';
      card.innerHTML = `
        <span class="sol-component-card__type">Capability</span>
        <p class="sol-component-card__name">${comp.name || '—'}</p>
        <span class="sol-component-card__purpose-label">Purpose</span>
        <p class="sol-component-card__purpose">${comp.purpose || '—'}</p>`;
      grid.appendChild(card);
    });
    compSection.appendChild(grid);
    wrap.appendChild(compSection);
  }

  // 4. Success Metrics
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI Operating Model — Cross-Functional Delivery Teams ──────────────────────

function buildTeamHierarchySvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 210');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Team composition hierarchy');
  svg.classList.add('team-hierarchy-svg');

  function mkNode(cx, y, w, h, label) {
    const g = document.createElementNS(NS, 'g');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', cx - w / 2); rect.setAttribute('y', y);
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', 'rgba(99,102,241,0.14)');
    rect.setAttribute('stroke', 'rgba(99,102,241,0.4)');
    rect.setAttribute('stroke-width', '1.5');
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', cx); text.setAttribute('y', y + h / 2 + 1);
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '10'); text.setAttribute('fill', 'rgba(255,255,255,0.85)');
    text.setAttribute('font-weight', '500');
    text.textContent = label;
    g.appendChild(rect); g.appendChild(text);
    return g;
  }

  function mkLine(x1, y1, x2, y2) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', 'rgba(99,102,241,0.45)');
    line.setAttribute('stroke-width', '1.5');
    return line;
  }

  function mkDot(cx, cy) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', '3');
    c.setAttribute('fill', 'rgba(129,140,248,0.8)');
    return c;
  }

  // Row Y positions
  const y1 = 10, h1 = 34, cx1 = 160;
  const y2 = 82, h2 = 30;
  const y3 = 152, h3 = 28;
  const midXs = [65, 160, 255];
  const midLabels = ['Business Lead', 'Data/AI Specialist', 'Engineering Lead'];
  const botLabels = ['Domain Expert', 'Architect', 'QA / Test'];

  const midY = (y1 + h1 + y2) / 2;

  // Product Owner → horizontal bar → 3 leads
  svg.appendChild(mkLine(cx1, y1 + h1, cx1, midY));
  svg.appendChild(mkLine(midXs[0], midY, midXs[2], midY));
  midXs.forEach(x => {
    svg.appendChild(mkLine(x, midY, x, y2));
    svg.appendChild(mkDot(x, midY));
  });

  // 3 leads → 3 specialists
  const leadBot = y2 + h2;
  midXs.forEach(x => {
    svg.appendChild(mkLine(x, leadBot, x, y3));
    svg.appendChild(mkDot(x, leadBot));
  });

  // Draw nodes on top of lines
  svg.appendChild(mkNode(cx1, y1, 115, h1, 'Product Owner'));
  midXs.forEach((x, i) => svg.appendChild(mkNode(x, y2, 96, h2, midLabels[i])));
  midXs.forEach((x, i) => svg.appendChild(mkNode(x, y3, 96, h3, botLabels[i])));

  return svg;
}

function buildCrossFunctionalLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'cross-functional-layout';

  // 1. Strategic Position
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text';
  stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  // 2. Functional Team Groups
  // New blueprints: b.teamGroups[]. Old blueprints: flat b.teamRoles[] — wrap each into a single group per role.
  const groups = Array.isArray(b.teamGroups) && b.teamGroups.length ? b.teamGroups : null;
  const legacyRoles = Array.isArray(b.teamRoles) ? b.teamRoles : [];

  const teamSection = document.createElement('div');
  teamSection.className = 'team-structure-section';
  const teamLbl = document.createElement('p');
  teamLbl.className = 'brief-label'; teamLbl.textContent = 'Delivery Team';
  teamSection.appendChild(teamLbl);

  if (groups) {
    const grid = document.createElement('div');
    grid.className = 'team-groups-grid';
    groups.forEach(g => {
      const card = document.createElement('div');
      card.className = 'team-group-card';
      const label = document.createElement('p');
      label.className = 'team-group-card__label';
      label.textContent = g.group || '—';
      card.appendChild(label);
      const roleList = document.createElement('ul');
      roleList.className = 'team-group-card__roles';
      (g.roles || []).forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        roleList.appendChild(li);
      });
      card.appendChild(roleList);
      grid.appendChild(card);
    });
    teamSection.appendChild(grid);
  } else if (legacyRoles.length) {
    // Legacy flat teamRoles — render each as a single-role group card
    const roleGrid = document.createElement('div');
    roleGrid.className = 'team-groups-grid';
    legacyRoles.forEach(role => {
      const roleObj = typeof role === 'object' ? role : { title: String(role), description: '' };
      const card = document.createElement('div');
      card.className = 'team-group-card';
      const rName = document.createElement('p');
      rName.className = 'team-group-card__label';
      rName.textContent = roleObj.title || roleObj.role || roleObj.name || String(role);
      card.appendChild(rName);
      if (roleObj.description || roleObj.responsibility) {
        const ul = document.createElement('ul');
        ul.className = 'team-group-card__roles';
        const li = document.createElement('li');
        li.textContent = roleObj.description || roleObj.responsibility;
        ul.appendChild(li);
        card.appendChild(ul);
      }
      roleGrid.appendChild(card);
    });
    teamSection.appendChild(roleGrid);
  }
  wrap.appendChild(teamSection);

  // 4. Success Metrics
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI Operating Model — End-to-End Ownership ─────────────────────────────────

function buildLifecycleLoop(stages) {
  const wrap = document.createElement('div');
  wrap.className = 'lifecycle-loop';
  stages.forEach((stage, i) => {
    const node = document.createElement('div');
    node.className = 'lifecycle-loop__node';
    node.textContent = stage.stage;
    wrap.appendChild(node);
    if (i < stages.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'lifecycle-loop__arrow';
      wrap.appendChild(arrow);
    }
  });
  return wrap;
}

function buildEndToEndOwnershipLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'end-to-end-layout';

  // 1. Strategic Position
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text';
  stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  if (b.lifecycleStages?.length) {
    // 2. Lifecycle Ownership Loop — visual pill chain
    const loopSection = document.createElement('div');
    loopSection.className = 'lifecycle-section';
    const loopLbl = document.createElement('p');
    loopLbl.className = 'brief-label'; loopLbl.textContent = 'Lifecycle Ownership Loop';
    loopSection.appendChild(loopLbl);
    loopSection.appendChild(buildLifecycleLoop(b.lifecycleStages));
    wrap.appendChild(loopSection);

    // 3. Ownership Model Details — 6-card grid, separate labeled section
    const detailSection = document.createElement('div');
    detailSection.className = 'lifecycle-details-section';
    const detailLbl = document.createElement('p');
    detailLbl.className = 'brief-label'; detailLbl.textContent = 'Ownership Model Details';
    detailSection.appendChild(detailLbl);
    const details = document.createElement('div');
    details.className = 'lifecycle-details';
    b.lifecycleStages.forEach(stage => {
      const card = document.createElement('div');
      card.className = 'lifecycle-detail-card';

      const stageName = document.createElement('p');
      stageName.className = 'lifecycle-detail-card__stage';
      stageName.textContent = stage.stage;
      card.appendChild(stageName);

      if (stage.teamResponsibility) {
        const resp = document.createElement('p');
        resp.className = 'lifecycle-detail-card__resp';
        resp.textContent = stage.teamResponsibility;
        card.appendChild(resp);
      }

      if (stage.keyActivities) {
        const act = document.createElement('p');
        act.className = 'lifecycle-detail-card__activities';
        act.textContent = stage.keyActivities;
        card.appendChild(act);
      }

      details.appendChild(card);
    });
    detailSection.appendChild(details);
    wrap.appendChild(detailSection);
  }

  // 3. KPI Highlights
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── Shared helpers for the new CTO templates ──────────────────────────────────

// CSS pill chain — reuses lifecycle-loop styles; labelKey selects which property to display.
function buildPillChain(items, labelKey) {
  const wrap = document.createElement('div');
  wrap.className = 'lifecycle-loop';
  items.forEach((item, i) => {
    const node = document.createElement('div');
    node.className = 'lifecycle-loop__node';
    node.textContent = (typeof item === 'string' ? item : item[labelKey]) || '';
    wrap.appendChild(node);
    if (i < items.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'lifecycle-loop__arrow';
      wrap.appendChild(arrow);
    }
  });
  return wrap;
}

// CSS SDLC pipeline — two-line pills (stage name + "with AI Tool").
function buildSdlcPipeline(stages) {
  const wrap = document.createElement('div');
  wrap.className = 'sdlc-pipeline';
  stages.forEach((stage, i) => {
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'sdlc-pipeline__arrow';
      arrow.textContent = '→';
      wrap.appendChild(arrow);
    }
    const pill = document.createElement('div');
    pill.className = 'sdlc-pipeline__stage';
    const name = document.createElement('span');
    name.className = 'sdlc-pipeline__stage-name';
    name.textContent = stage.stage;
    const tool = document.createElement('span');
    tool.className = 'sdlc-pipeline__stage-tool';
    tool.textContent = stage.aiTool ? `with ${stage.aiTool}` : '';
    pill.appendChild(name);
    pill.appendChild(tool);
    wrap.appendChild(pill);
  });
  return wrap;
}

// Pillar/stage detail cards with a bullet list — used by all governance and flywheel templates.
function buildPillarBulletCards(items, labelKey) {
  const list = document.createElement('div');
  list.className = 'detail-bullet-list';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'detail-bullet-card';
    const title = document.createElement('p');
    title.className = 'detail-bullet-card__title';
    title.textContent = item[labelKey] || '';
    card.appendChild(title);
    const points = Array.isArray(item.points) ? item.points : [];
    if (points.length) {
      const ul = document.createElement('ul');
      ul.className = 'detail-bullet-card__list';
      points.forEach(pt => {
        const li = document.createElement('li');
        li.textContent = String(pt);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    list.appendChild(card);
  });
  return list;
}

// SVG waterfall chart for Financial Performance.
function buildWaterfallSvg(items) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 480, H = 240;
  const padL = 14, padR = 14, padT = 20, padB = 58;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const vals = items.map(it => parseFloat(it.value) || 0);

  let running = 0;
  const bars = items.map((it, i) => {
    const v = vals[i];
    let low, high;
    if (it.type === 'total') {
      low = 0;
      high = running + v;
    } else if (it.type === 'negative') {
      high = running;
      low = running + v;
      running += v;
    } else {
      low = running;
      high = running + v;
      running += v;
    }
    return { ...it, low, high };
  });

  const allVals = bars.flatMap(b => [b.low, b.high, 0]);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const toY = v => padT + chartH - ((v - minV) / range) * chartH;

  const n = items.length;
  const slotW = chartW / n;
  const barW = slotW * 0.58;
  const barX = i => padL + i * slotW + (slotW - barW) / 2;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('waterfall-svg');

  // Grid lines
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const gv = minV + t * range;
    const gy = toY(gv);
    const gl = document.createElementNS(NS, 'line');
    gl.setAttribute('x1', padL); gl.setAttribute('y1', gy);
    gl.setAttribute('x2', W - padR); gl.setAttribute('y2', gy);
    gl.setAttribute('stroke', Math.abs(gv) < 0.01 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)');
    gl.setAttribute('stroke-width', '1');
    svg.appendChild(gl);
  });

  // Connector dashed lines between bars
  bars.forEach((b, i) => {
    if (i >= bars.length - 1) return;
    const next = bars[i + 1];
    if (next.type === 'total') return;
    const connY = b.type === 'negative' ? toY(b.low) : toY(b.high);
    const dash = document.createElementNS(NS, 'line');
    dash.setAttribute('x1', barX(i) + barW); dash.setAttribute('y1', connY);
    dash.setAttribute('x2', barX(i + 1));     dash.setAttribute('y2', connY);
    dash.setAttribute('stroke', 'rgba(129,140,248,0.4)');
    dash.setAttribute('stroke-width', '1');
    dash.setAttribute('stroke-dasharray', '4,3');
    svg.appendChild(dash);
  });

  // Bars + value labels
  bars.forEach((b, i) => {
    const x = barX(i);
    const y1 = toY(b.high);
    const y2 = toY(b.low);
    const bH = Math.max(y2 - y1, 3);
    const fill = b.type === 'negative' ? 'rgba(79,70,229,0.82)'
               : b.type === 'total'    ? 'rgba(99,102,241,0.95)'
               :                         'rgba(129,140,248,0.6)';

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y1);
    rect.setAttribute('width', barW); rect.setAttribute('height', bH);
    rect.setAttribute('fill', fill); rect.setAttribute('rx', '3');
    svg.appendChild(rect);

    // Value label above/below bar
    const labelY = b.type === 'negative' ? toY(b.low) + 11 : toY(b.high) - 5;
    const vl = document.createElementNS(NS, 'text');
    vl.setAttribute('x', x + barW / 2); vl.setAttribute('y', labelY);
    vl.setAttribute('text-anchor', 'middle');
    vl.setAttribute('font-size', '9'); vl.setAttribute('fill', 'rgba(255,255,255,0.78)');
    vl.textContent = b.value;
    svg.appendChild(vl);
  });

  // X-axis category labels (two lines if > 2 words)
  bars.forEach((b, i) => {
    const cx = barX(i) + barW / 2;
    const words = (b.category || '').split(' ');
    const line1 = words.slice(0, 2).join(' ');
    const line2 = words.slice(2).join(' ');
    const t1 = document.createElementNS(NS, 'text');
    t1.setAttribute('x', cx); t1.setAttribute('y', H - padB + 14);
    t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('font-size', '8.5'); t1.setAttribute('fill', 'rgba(255,255,255,0.5)');
    t1.textContent = line1;
    svg.appendChild(t1);
    if (line2) {
      const t2 = document.createElementNS(NS, 'text');
      t2.setAttribute('x', cx); t2.setAttribute('y', H - padB + 26);
      t2.setAttribute('text-anchor', 'middle');
      t2.setAttribute('font-size', '8.5'); t2.setAttribute('fill', 'rgba(255,255,255,0.5)');
      t2.textContent = line2;
      svg.appendChild(t2);
    }
  });

  return svg;
}

// ── Shared layout section helpers ─────────────────────────────────────────────

function buildStrategicPositionBlock(position) {
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const lbl = document.createElement('p');
  lbl.className = 'brief-label'; lbl.textContent = 'Strategic Position';
  const txt = document.createElement('p');
  txt.className = 'vision-statement__text'; txt.textContent = position || '—';
  stmt.appendChild(lbl); stmt.appendChild(txt);
  return stmt;
}

function buildDiagramSection(label, panelContent, panelClass) {
  const section = document.createElement('div');
  section.className = 'cto-diagram-section';
  const lbl = document.createElement('p');
  lbl.className = 'brief-label'; lbl.textContent = label;
  section.appendChild(lbl);
  const panel = document.createElement('div');
  panel.className = panelClass || 'cto-diagram-panel';
  panel.appendChild(panelContent);
  section.appendChild(panel);
  return section;
}

function buildDetailSection(label, listEl) {
  const section = document.createElement('div');
  section.className = 'cto-detail-section';
  const lbl = document.createElement('p');
  lbl.className = 'brief-label'; lbl.textContent = label;
  section.appendChild(lbl);
  section.appendChild(listEl);
  return section;
}

// ── AI ROI — Financial Performance ────────────────────────────────────────────

function buildFinancialPerformanceLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'financial-performance-layout';

  // 1. Strategic Position
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // 2. Executive ROI Summary — 4-column stat row
  if (b.roiSummary) {
    const roiSec = document.createElement('div');
    roiSec.className = 'roi-section';
    const roiLbl = document.createElement('p');
    roiLbl.className = 'brief-label'; roiLbl.textContent = 'Executive ROI Summary';
    roiSec.appendChild(roiLbl);

    const roiRow = document.createElement('div');
    roiRow.className = 'roi-summary-row';
    [
      { label: 'Investment',    value: b.roiSummary.investment,    mod: '' },
      { label: 'Annual Value',  value: b.roiSummary.annualValue,   mod: '' },
      { label: 'Payback',       value: b.roiSummary.payback,       mod: '' },
      { label: 'Recommendation',value: b.roiSummary.recommendation,mod: (() => {
          const r = String(b.roiSummary.recommendation || '').toLowerCase();
          return r === 'proceed' ? 'roi-summary-card--proceed' : r.startsWith('pilot') ? 'roi-summary-card--pilot' : r === 'reassess' ? 'roi-summary-card--reassess' : '';
        })() },
    ].forEach(f => {
      const card = document.createElement('div');
      card.className = 'roi-summary-card' + (f.mod ? ' ' + f.mod : '');
      const val = document.createElement('p');
      val.className = 'roi-summary-card__value'; val.textContent = f.value || '—';
      const lbl = document.createElement('p');
      lbl.className = 'roi-summary-card__label'; lbl.textContent = f.label;
      card.appendChild(val); card.appendChild(lbl);
      roiRow.appendChild(card);
    });

    roiSec.appendChild(roiRow);
    wrap.appendChild(roiSec);
  }

  // 3. Where money goes / where value comes from — two-column
  const costItems  = Array.isArray(b.costItems)  ? b.costItems  : [];
  const valueItems = Array.isArray(b.valueItems) ? b.valueItems : [];
  if (costItems.length || valueItems.length) {
    const cvGrid = document.createElement('div');
    cvGrid.className = 'roi-cost-value-grid';

    const buildCol = (cls, header, items) => {
      const col = document.createElement('div');
      col.className = cls;
      const hdr = document.createElement('p');
      hdr.className = 'roi-col-header'; hdr.textContent = header;
      col.appendChild(hdr);
      const ul = document.createElement('ul');
      ul.className = 'roi-col-list';
      items.forEach(item => {
        const li = document.createElement('li'); li.textContent = item;
        ul.appendChild(li);
      });
      col.appendChild(ul);
      return col;
    };

    cvGrid.appendChild(buildCol('roi-cost-col',  'Where the Money Goes',       costItems));
    cvGrid.appendChild(buildCol('roi-value-col', 'Where the Value Comes From', valueItems));
    wrap.appendChild(cvGrid);
  }

  // 4. Financial Impact Timeline — horizontal flow
  const timeline = Array.isArray(b.impactTimeline) ? b.impactTimeline : [];
  if (timeline.length) {
    const tlSec = document.createElement('div');
    tlSec.className = 'roi-section';
    const tlLbl = document.createElement('p');
    tlLbl.className = 'brief-label'; tlLbl.textContent = 'Financial Impact Timeline';
    tlSec.appendChild(tlLbl);

    const tlFlow = document.createElement('div');
    tlFlow.className = 'roi-timeline';
    timeline.forEach((stage, i) => {
      const node = document.createElement('div');
      node.className = 'roi-timeline__stage'; node.textContent = stage;
      tlFlow.appendChild(node);
      if (i < timeline.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'roi-timeline__arrow'; arrow.textContent = '→';
        tlFlow.appendChild(arrow);
      }
    });
    tlSec.appendChild(tlFlow);
    wrap.appendChild(tlSec);
  }

  // Fallback: old waterfall for blueprints generated before redesign
  if (!b.roiSummary && b.waterfallItems?.length) {
    wrap.appendChild(buildDiagramSection('Value Waterfall Visualization', buildWaterfallSvg(b.waterfallItems)));
    const list = document.createElement('div');
    list.className = 'detail-bullet-list';
    b.waterfallItems.filter(it => it.description).forEach(it => {
      const card = document.createElement('div');
      card.className = 'detail-bullet-card';
      const t = document.createElement('p');
      t.className = 'detail-bullet-card__title'; t.textContent = it.category;
      card.appendChild(t);
      const d = document.createElement('p');
      d.className = 'detail-bullet-card__desc'; d.textContent = it.description;
      card.appendChild(d);
      list.appendChild(card);
    });
    wrap.appendChild(buildDetailSection('Financial Breakdown', list));
  }

  // 5. Success Metrics
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI ROI — Operational Excellence ───────────────────────────────────────────

function buildOperationalExcellenceLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'operational-excellence-layout';

  // 1. Strategic Position
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // 2. Improvement Scorecard — Area / Before AI / After AI / Business Benefit
  const scorecard = Array.isArray(b.improvementScorecard) ? b.improvementScorecard : [];
  if (scorecard.length) {
    const sec = document.createElement('div');
    sec.className = 'roi-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Improvement Scorecard';
    sec.appendChild(lbl);

    const table = document.createElement('div');
    table.className = 'oe-scorecard';

    const hdr = document.createElement('div');
    hdr.className = 'oe-scorecard__row oe-scorecard__row--header';
    ['Area', 'Before AI', 'After AI', 'Business Benefit'].forEach(h => {
      const cell = document.createElement('div');
      cell.className = 'oe-scorecard__cell'; cell.textContent = h;
      hdr.appendChild(cell);
    });
    table.appendChild(hdr);

    scorecard.forEach(row => {
      const r = document.createElement('div');
      r.className = 'oe-scorecard__row';
      [
        { text: row.area,            cls: 'oe-scorecard__cell--area' },
        { text: row.beforeAI,        cls: 'oe-scorecard__cell--before' },
        { text: row.afterAI,         cls: 'oe-scorecard__cell--after' },
        { text: row.businessBenefit, cls: 'oe-scorecard__cell--benefit' },
      ].forEach(({ text, cls }) => {
        const cell = document.createElement('div');
        cell.className = `oe-scorecard__cell ${cls}`; cell.textContent = text || '—';
        r.appendChild(cell);
      });
      table.appendChild(r);
    });

    sec.appendChild(table);
    wrap.appendChild(sec);
  }

  // Fallback: old impact areas + PM dashboard for blueprints generated before scorecard redesign
  if (!scorecard.length) {
    const impactAreas = Array.isArray(b.impactAreas) ? b.impactAreas : [];
    if (impactAreas.length) {
      const sec = document.createElement('div');
      sec.className = 'roi-section';
      const lbl2 = document.createElement('p');
      lbl2.className = 'brief-label'; lbl2.textContent = 'Operational Impact Areas';
      sec.appendChild(lbl2);
      const grid = document.createElement('div');
      grid.className = 'oe-impact-grid';
      impactAreas.forEach(area => {
        const card = document.createElement('div');
        card.className = 'oe-impact-card';
        const title = document.createElement('p');
        title.className = 'oe-impact-card__title'; title.textContent = area.name || '—';
        card.appendChild(title);
        const ul = document.createElement('ul');
        ul.className = 'oe-impact-card__list';
        (area.points || []).forEach(pt => { const li = document.createElement('li'); li.textContent = pt; ul.appendChild(li); });
        card.appendChild(ul);
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      wrap.appendChild(sec);
    }
  }

  // Fallback: old SDLC layout for legacy blueprints
  if (!scorecard.length) {
    if (b.sdlcStages?.length) {
      wrap.appendChild(buildDiagramSection('SDLC Performance Dashboard', buildSdlcPipeline(b.sdlcStages)));
      const list = document.createElement('div');
      list.className = 'detail-bullet-list';
      b.sdlcStages.forEach(stage => {
        const card = document.createElement('div');
        card.className = 'detail-bullet-card';
        const t = document.createElement('p');
        t.className = 'detail-bullet-card__title'; t.textContent = stage.stage;
        card.appendChild(t);
        if (stage.description) {
          const d = document.createElement('p');
          d.className = 'detail-bullet-card__desc'; d.textContent = stage.description;
          card.appendChild(d);
        }
        list.appendChild(card);
      });
      wrap.appendChild(buildDetailSection('SDLC Stage Details', list));
    }
    if (b.kpiHighlights?.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI ROI — Customer Value ────────────────────────────────────────────────────

function buildCustomerValueLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'customer-value-layout';

  // 1. Strategic Position
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // 2. Customer Value Journey — vertical progression flow
  const journey = Array.isArray(b.valueJourney) ? b.valueJourney : [];
  if (journey.length) {
    const sec = document.createElement('div');
    sec.className = 'roi-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Customer Value Journey';
    sec.appendChild(lbl);

    const flow = document.createElement('div');
    flow.className = 'cv-journey';
    journey.forEach((stage, i) => {
      const node = document.createElement('div');
      node.className = 'cv-journey__stage'; node.textContent = stage;
      flow.appendChild(node);
      if (i < journey.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'cv-journey__arrow'; arrow.textContent = '↓';
        flow.appendChild(arrow);
      }
    });
    sec.appendChild(flow);
    wrap.appendChild(sec);
  }

  // 3. Customer Value Dimensions — 5 outcome cards
  const dims = Array.isArray(b.valueDimensions) ? b.valueDimensions : [];
  if (dims.length) {
    const sec = document.createElement('div');
    sec.className = 'roi-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Customer Value Dimensions';
    sec.appendChild(lbl);

    const grid = document.createElement('div');
    grid.className = 'cv-value-grid';
    dims.forEach(dim => {
      const card = document.createElement('div');
      card.className = 'cv-value-card';
      const title = document.createElement('p');
      title.className = 'cv-value-card__title'; title.textContent = dim.name || '—';
      card.appendChild(title);
      const ul = document.createElement('ul');
      ul.className = 'cv-value-card__list';
      (dim.points || []).forEach(pt => {
        const li = document.createElement('li'); li.textContent = pt;
        ul.appendChild(li);
      });
      card.appendChild(ul);
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    wrap.appendChild(sec);
  }

  // 4. Customer Success Metrics — up to 6 customer outcome KPIs
  const custKpis = Array.isArray(b.customerKpis) && b.customerKpis.length ? b.customerKpis : (b.kpiHighlights || []);
  if (custKpis.length) {
    const sec = document.createElement('div');
    sec.className = 'roi-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Customer Success Metrics';
    sec.appendChild(lbl);

    const grid = document.createElement('div');
    grid.className = 'cv-kpi-grid';
    custKpis.forEach(k => {
      const card = document.createElement('div');
      card.className = 'kpi-highlight-card';
      const val = document.createElement('p');
      val.className = 'kpi-highlight-card__value'; val.textContent = k.value || '—';
      const label = document.createElement('p');
      label.className = 'kpi-highlight-card__label'; label.textContent = k.label || '';
      const desc = document.createElement('p');
      desc.className = 'kpi-highlight-card__desc'; desc.textContent = k.description || '';
      card.appendChild(val); card.appendChild(label); card.appendChild(desc);
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    wrap.appendChild(sec);
  }

  // Fallback: old flywheel for legacy blueprints
  if (!journey.length && b.flywheelStages?.length) {
    wrap.appendChild(buildDiagramSection('Customer Value Flywheel', buildPillChain(b.flywheelStages, 'name')));
    wrap.appendChild(buildDetailSection('Customer Value Details', buildPillarBulletCards(b.flywheelStages, 'name')));
  }

  return wrap;
}

// ── AI Governance — Data Privacy & Security ───────────────────────────────────

function buildDataPrivacyLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'data-privacy-layout';

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  if (b.securityPillars?.length) {
    wrap.appendChild(buildDiagramSection(
      'Security-by-Design Framework',
      buildSpokeWheel(b.securityPillars.map(p => p.name), 'Secure AI Delivery'),
      'cto-spoke-panel',
    ));
    wrap.appendChild(buildDetailSection('Security Pillar Details', buildPillarBulletCards(b.securityPillars, 'name')));
  }

  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI Governance — Ethical AI Guidelines ─────────────────────────────────────

function buildEthicalAILayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'ethical-ai-layout';

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  if (b.ethicsPillars?.length) {
    wrap.appendChild(buildDiagramSection(
      'Responsible AI Framework',
      buildSpokeWheel(b.ethicsPillars.map(p => p.name), 'Responsible AI'),
      'cto-spoke-panel',
    ));
    wrap.appendChild(buildDetailSection('Responsible AI Pillar Details', buildPillarBulletCards(b.ethicsPillars, 'name')));
  }

  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI Governance — Model Validation & Monitoring ─────────────────────────────

function buildModelValidationLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'model-validation-layout';

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  if (b.modelLifecycleStages?.length) {
    wrap.appendChild(buildDiagramSection('AI Lifecycle Monitoring Loop', buildPillChain(b.modelLifecycleStages, 'stage')));
    wrap.appendChild(buildDetailSection('Lifecycle Stage Details', buildPillarBulletCards(b.modelLifecycleStages, 'stage')));
  }

  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI Governance — Regulatory Compliance ─────────────────────────────────────

function buildRegulatoryComplianceLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'regulatory-compliance-layout';

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  if (b.complianceControls?.length) {
    wrap.appendChild(buildDiagramSection(
      'Compliance Control Framework',
      buildSpokeWheel(b.complianceControls.map(p => p.name), 'AI Compliance Management'),
      'cto-spoke-panel',
    ));
    wrap.appendChild(buildDetailSection('Compliance Control Details', buildPillarBulletCards(b.complianceControls, 'name')));
  }

  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI Governance — Trust & Adoption ──────────────────────────────────────────

function buildTrustAdoptionLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'trust-adoption-layout';

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  if (b.adoptionStages?.length) {
    wrap.appendChild(buildDiagramSection('Trust & Adoption Flywheel', buildPillChain(b.adoptionStages, 'name')));
    wrap.appendChild(buildDetailSection('Trust & Adoption Stage Details', buildPillarBulletCards(b.adoptionStages, 'name')));
  }

  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI Use Cases — Classification ────────────────────────────────────────────

function buildClassificationView(section) {
  const b = section.brief || {};

  // Legacy blueprints only classified one (or two) initiatives; fold them into
  // the same list shape so the render path below is uniform either way.
  const items = Array.isArray(b.opportunityClassifications) && b.opportunityClassifications.length
    ? b.opportunityClassifications
    : [b.primaryClassification, b.secondaryClassification]
        .filter(c => c && c.name)
        .map(c => ({ opportunity: '', classification: c.name, rationale: c.rationale || '' }));

  const COLORS = { 'Productivity AI': 'productivity', 'Functional AI': 'functional', 'Product AI': 'product' };

  const wrap = document.createElement('div');
  wrap.className = 'cls-view';

  if (b.strategicPosition) {
    wrap.appendChild(buildExecCallout('STRATEGIC POSITION', '', b.strategicPosition));
  }

  if (items.length) {
    // Legend: count of opportunities per archetype, e.g. "PRODUCTIVITY AI × 3"
    const counts = new Map();
    items.forEach(item => counts.set(item.classification, (counts.get(item.classification) || 0) + 1));
    const legendHtml = [...counts.entries()]
      .map(([cls, n]) => `<span class="cls-legend__item"><span class="cls-legend__dot cls-name--${COLORS[cls] || 'functional'}"></span><span class="cls-name--${COLORS[cls] || 'functional'}">${cls.toUpperCase()}</span> × ${n}</span>`)
      .join('');

    const summary = document.createElement('div');
    summary.className = 'cls-summary';
    summary.innerHTML = `
      <span class="cls-summary__text">${items.length} use case${items.length === 1 ? '' : 's'} classified by AI archetype</span>
      <span class="cls-legend">${legendHtml}</span>`;
    wrap.appendChild(summary);

    const table = document.createElement('table');
    table.className = 'cls-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="cls-table__num">N°</th>
          <th>Use Case</th>
          <th>Classification Rationale</th>
          <th class="cls-table__archetype">Archetype</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
          <tr>
            <td class="cls-table__num">${String(i + 1).padStart(2, '0')}</td>
            <td class="cls-table__usecase">${item.opportunity || '—'}</td>
            <td class="cls-table__rationale">${item.rationale || ''}</td>
            <td class="cls-table__archetype">
              <span class="cls-legend__dot cls-name--${COLORS[item.classification] || 'functional'}"></span>
              <span class="cls-name--${COLORS[item.classification] || 'functional'}">${(item.classification || '').toUpperCase()}</span>
            </td>
          </tr>`).join('')}
      </tbody>`;
    wrap.appendChild(table);
  }

  return wrap;
}

// ── AI Use Cases — Business Value Definition ──────────────────────────────────

function buildBvdOppCard(item) {
  const card = document.createElement('div');
  card.className = 'bvd-lever-card';
  card.innerHTML = `
    <span class="bvd-lever-card__dot"></span>
    ${item.valueArea ? `<p class="bvd-lever-card__area">${item.valueArea.toUpperCase()}</p>` : ''}
    <p class="bvd-lever-card__title">${item.opportunity || item.title || ''}</p>
    ${item.outcomes?.length ? `<ul class="bvd-lever-card__outcomes">${item.outcomes.map(o => `<li>${o}</li>`).join('')}</ul>` : ''}`;
  return card;
}

function buildBusinessValueDefinitionView(section) {
  const b = section.brief || {};

  // Legacy blueprints had exactly 4 fixed-dimension cards for one initiative;
  // fold them into the same per-opportunity shape so the render path is uniform either way.
  const items = Array.isArray(b.opportunityValues) && b.opportunityValues.length
    ? b.opportunityValues
    : (b.valueCategories || []).map(c => ({ opportunity: '', valueArea: c.title, focus: c.focus, outcomes: c.outcomes }));

  const kpiPills = b.kpiPills || [];
  const insight  = b.businessValueInsight || '';

  const wrap = document.createElement('div');
  wrap.className = 'bvd-view';

  if (b.strategicPosition) {
    wrap.appendChild(buildExecCallout('STRATEGIC POSITION', '', b.strategicPosition));
  }

  // Value levers
  if (items.length) {
    const leverSection = document.createElement('div');
    leverSection.appendChild(buildExhibitHeading('Value levers', 'What each initiative automates, and the value it unlocks'));
    const row = document.createElement('div');
    row.className = 'bvd-lever-grid';
    items.forEach(item => row.appendChild(buildBvdOppCard(item)));
    leverSection.appendChild(row);
    wrap.appendChild(leverSection);
  }

  // KPI grid
  if (kpiPills.length) {
    const kpiSection = document.createElement('div');
    kpiSection.appendChild(buildExhibitHeading('Key performance indicators', ''));
    const grid = document.createElement('div');
    grid.className = 'bvd-kpi-grid';
    grid.innerHTML = kpiPills.map((pill, i) => `
      <div class="bvd-kpi-item">
        <span class="bvd-kpi-item__num">${String(i + 1).padStart(2, '0')}</span>
        <span class="bvd-kpi-item__label">${pill}</span>
      </div>`).join('');
    kpiSection.appendChild(grid);
    wrap.appendChild(kpiSection);
  }

  // Business Value Insight
  if (insight) {
    wrap.appendChild(buildExecCallout('BUSINESS VALUE INSIGHT', '', insight));
  }

  return wrap;
}

// ── AI Use Cases — Prioritization ────────────────────────────────────────────

function buildPrioritizationView(section) {
  const b              = section.brief || {};
  const recStart       = b.recommendedStartingPoint || '';
  const quadrants      = b.priorityQuadrants        || [];
  const dimCards       = b.dimensionCards           || [];
  const phases         = b.implementationPhases     || [];

  const wrap = document.createElement('div');
  wrap.className = 'pri-view';

  if (b.strategicPosition) {
    wrap.appendChild(buildExecCallout('STRATEGIC POSITION', '', b.strategicPosition));
  }

  if (recStart) {
    wrap.appendChild(buildExecCallout('★ RECOMMENDED STARTING POINT', '', recStart));
  }

  // 2×2 Priority Matrix
  if (quadrants.length) {
    const matSection = document.createElement('div');
    matSection.appendChild(buildExhibitHeading('Prioritization matrix', 'Business value vs. implementation feasibility'));

    const matWrap = document.createElement('div');
    matWrap.className = 'pri-matrix-wrap';

    const yAxis = document.createElement('div');
    yAxis.className = 'pri-y-axis';
    yAxis.textContent = 'BUSINESS VALUE →';
    matWrap.appendChild(yAxis);

    const matBody = document.createElement('div');
    matBody.className = 'pri-matrix-body';

    // Order: [0] Strategic Bets (top-left), [1] Quick Wins (top-right), [2] Fill-ins (bottom-left), [3] Future Opportunities (bottom-right)
    const grid = document.createElement('div');
    grid.className = 'pri-matrix-grid';
    quadrants.forEach(q => {
      // Highlight whichever quadrant contains the recommended starting point.
      const isRecommended = recStart && (q.initiatives || []).some(init =>
        init && recStart.toLowerCase().includes(init.toLowerCase())
      );
      const cell = document.createElement('div');
      cell.className = `pri-quadrant${isRecommended ? ' pri-quadrant--recommended' : ''}`;
      cell.innerHTML = `
        <p class="pri-quadrant__label">${isRecommended ? '★ ' : ''}${(q.label || '').toUpperCase()}</p>
        ${q.initiatives?.length ? `<p class="pri-quadrant__items">${q.initiatives.join(', ')}</p>` : ''}`;
      grid.appendChild(cell);
    });
    matBody.appendChild(grid);

    const xAxis = document.createElement('div');
    xAxis.className = 'pri-x-axis';
    xAxis.textContent = 'IMPLEMENTATION FEASIBILITY →';
    matBody.appendChild(xAxis);

    matWrap.appendChild(matBody);
    matSection.appendChild(matWrap);
    wrap.appendChild(matSection);
  }

  // Evaluation Dimension Cards
  if (dimCards.length) {
    const dimSection = document.createElement('div');
    dimSection.appendChild(buildExhibitHeading('Evaluation dimensions', 'Criteria behind the matrix placement, shown for the recommended starting point'));
    const dimRow = document.createElement('div');
    dimRow.className = 'pri-dim-cards';
    dimCards.forEach(d => {
      const card = document.createElement('div');
      card.className = 'pri-dim-card';
      card.innerHTML = `
        <p class="pri-dim-card__title">${d.title || ''}</p>
        ${d.bullets?.length ? `<ul class="pri-dim-card__bullets">${d.bullets.map(bullet => `<li>${bullet}</li>`).join('')}</ul>` : ''}`;
      dimRow.appendChild(card);
    });
    dimSection.appendChild(dimRow);
    wrap.appendChild(dimSection);
  }

  // Implementation Roadmap — phased sequence of all identified opportunities
  if (phases.length) {
    const roadmapSection = document.createElement('div');
    roadmapSection.appendChild(buildExhibitHeading('Implementation roadmap', `Sequenced rollout across ${phases.length} phase${phases.length === 1 ? '' : 's'}`));

    const track = document.createElement('div');
    track.className = 'pri-roadmap-track';
    phases.forEach((p, i) => {
      const phaseCard = document.createElement('div');
      phaseCard.className = 'pri-roadmap-phase';
      phaseCard.innerHTML = `
        <span class="pri-roadmap-phase__dot"></span>
        <p class="pri-roadmap-phase__meta">${(p.phase || '').toUpperCase()}</p>
        ${p.initiatives?.length ? `<p class="pri-roadmap-phase__name">${p.initiatives.join(' · ')}</p>` : ''}
        ${p.rationale ? `<p class="pri-roadmap-phase__rationale">${p.rationale}</p>` : ''}`;
      track.appendChild(phaseCard);
      if (i < phases.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'pri-roadmap-arrow';
        arrow.textContent = '→';
        track.appendChild(arrow);
      }
    });
    roadmapSection.appendChild(track);
    wrap.appendChild(roadmapSection);
  }

  return wrap;
}

// ── AI Use Cases — Opportunity Discovery ──────────────────────────────────────

// ── Shared "exhibit report" components (used across all 4 AI Use Cases views) ──

// Section heading: optional "EXHIBIT N" eyebrow + serif title + gray subtitle, all inline.
function buildExhibitHeading(title, subtitle, exhibitLabel) {
  const wrap = document.createElement('div');
  wrap.className = 'aiuc-heading';
  wrap.innerHTML = `
    ${exhibitLabel ? `<span class="aiuc-heading__exhibit">${exhibitLabel}</span>` : ''}
    <h3 class="aiuc-heading__title">${title}</h3>
    ${subtitle ? `<span class="aiuc-heading__subtitle">${subtitle}</span>` : ''}`;
  return wrap;
}

// Executive callout: left label column (title + description) + right blockquote,
// used for Strategic Position, Business Value Insight, Recommended Starting Point.
function buildExecCallout(labelText, labelDesc, contentText) {
  const wrap = document.createElement('div');
  wrap.className = 'aiuc-callout';
  wrap.innerHTML = `
    <div class="aiuc-callout__label">
      <p class="aiuc-callout__label-text">${labelText}</p>
      ${labelDesc ? `<p class="aiuc-callout__label-desc">${labelDesc}</p>` : ''}
    </div>
    <blockquote class="aiuc-callout__content">${contentText}</blockquote>`;
  return wrap;
}

function buildOpportunityDiscoveryView(section) {
  const b                    = section.brief || {};
  const businessProblems     = b.businessProblems     || [];
  const workflowSteps        = b.workflowSteps        || [];
  const highEffortActivities = b.highEffortActivities || [];
  const aiOpportunities      = b.aiOpportunities      || [];
  // Exact-match (case-insensitive) so a workflow step gets a HIGH EFFORT tag
  // only when its text also appears in highEffortActivities.
  const heaSet = new Set(highEffortActivities.map(a => a.trim().toLowerCase()));

  const wrap = document.createElement('div');
  wrap.className = 'opp-discovery';

  // Strategic position
  if (b.strategicPosition) {
    wrap.appendChild(buildExecCallout(
      'STRATEGIC POSITION',
      'The target state this use case aims to establish',
      b.strategicPosition,
    ));
  }

  // ── Business Problem ────────────────────────────────────────────────────
  const layer1 = document.createElement('div');
  layer1.className = 'opp-layer';
  layer1.appendChild(buildExhibitHeading('Business problem', `${businessProblems.length || 'Several'} structural pain points in today's process`, 'EXHIBIT 1'));
  const probGrid = document.createElement('div');
  probGrid.className = 'opp-problem-grid';
  probGrid.innerHTML = businessProblems.length
    ? businessProblems.map((p, i) => `
        <div class="opp-problem-card">
          <span class="opp-problem-card__num">${String(i + 1).padStart(2, '0')}</span>
          <p class="opp-problem-card__title">${p}</p>
        </div>`).join('')
    : '<p class="opp-empty-note">Generating…</p>';
  layer1.appendChild(probGrid);
  wrap.appendChild(layer1);

  // ── Current Workflow ────────────────────────────────────────────────────
  const layer2 = document.createElement('div');
  layer2.className = 'opp-layer';
  layer2.appendChild(buildExhibitHeading('Current workflow', 'As-is process, with high-effort activities flagged'));
  const track = document.createElement('div');
  track.className = 'opp-workflow-track';
  workflowSteps.forEach((step, i) => {
    const isHigh = heaSet.has(step.trim().toLowerCase());
    const stepEl = document.createElement('div');
    stepEl.className = 'opp-workflow-step';
    stepEl.innerHTML = `
      <span class="opp-workflow-step__num">${String(i + 1).padStart(2, '0')}</span>
      <p class="opp-workflow-step__label">${step}</p>
      ${isHigh ? '<span class="opp-workflow-step__flag">● HIGH EFFORT</span>' : ''}`;
    track.appendChild(stepEl);
    if (i < workflowSteps.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'opp-workflow-arrow';
      arrow.textContent = '→';
      track.appendChild(arrow);
    }
  });
  layer2.appendChild(track);
  wrap.appendChild(layer2);

  // ── AI Opportunities ────────────────────────────────────────────────────
  const layer3 = document.createElement('div');
  layer3.className = 'opp-layer';
  layer3.appendChild(buildExhibitHeading('AI opportunities', `${aiOpportunities.length || 'Several'} candidate interventions identified against the workflow above`));
  const oppGrid = document.createElement('div');
  oppGrid.className = 'opp-ai-grid';
  oppGrid.innerHTML = aiOpportunities.map((o, i) => {
    // Legacy blueprints store aiOpportunities as plain strings; new ones as { name, why }.
    const name = (o && typeof o === 'object') ? (o.name || '') : o;
    const why  = (o && typeof o === 'object') ? (o.why  || '') : '';
    return `
      <div class="opp-ai-grid-card">
        <span class="opp-ai-grid-card__num">${String(i + 1).padStart(2, '0')}</span>
        <p class="opp-ai-grid-card__name">${name}</p>
        ${why ? `<p class="opp-ai-grid-card__why">${why}</p>` : ''}
      </div>`;
  }).join('');
  layer3.appendChild(oppGrid);
  wrap.appendChild(layer3);

  return wrap;
}

function buildVisionLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'vision-layout';

  // 1. Vision Statement
  const stmtBlock = document.createElement('div');
  stmtBlock.className = 'vision-statement';
  const stmtLabel = document.createElement('p');
  stmtLabel.className = 'brief-label';
  stmtLabel.textContent = 'Vision Statement';
  const stmtText = document.createElement('p');
  stmtText.className = 'vision-statement__text';
  stmtText.textContent = b.strategicPosition || '—';
  stmtBlock.appendChild(stmtLabel);
  stmtBlock.appendChild(stmtText);
  wrap.appendChild(stmtBlock);

  // 2. Strategic Pillars
  if (b.strategicPillars?.length) {
    wrap.appendChild(buildPillarsGrid(b.strategicPillars));
  }

  // 3. Business Outcome Metrics — large-number KPI cards
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights, 'Business Outcomes'));
  }

  return wrap;
}

// ── Data Readiness — Data Architecture Enablement ─────────────────────────────

function buildDataArchitectureLayout(section) {
  const b             = section.brief || {};
  const archLayers             = Array.isArray(b.archLayers)    ? b.archLayers    : [];
  const archDecisions          = Array.isArray(b.archDecisions) ? b.archDecisions : [];
  const techStack              = Array.isArray(b.techStack)     ? b.techStack     : [];
  const archSummary            = b.archSummary || {};
  const archPattern            = Array.isArray(b.archPattern)   ? b.archPattern   : [];
  const archConsultantGuidance = b.archConsultantGuidance || '';
  // Legacy fallbacks
  const projectSystems = Array.isArray(b.projectSystems)     ? b.projectSystems     : [];
  const archRecs       = Array.isArray(b.archRecommendations) ? b.archRecommendations : [];
  const archStats      = b.archStats     || {};
  const healthTimeline = Array.isArray(b.healthTimeline) ? b.healthTimeline : [];
  const leadershipQ    = b.leadershipValidation?.context || '';

  const PRIORITY_PIP  = { High: 'dae-pip--high', Medium: 'dae-pip--medium', Low: 'dae-pip--low' };
  const DAE_IMPL_SEQ  = ['Connect Project Systems', 'Build Integration Layer', 'Create AI Data Store', 'Deploy AI Assistant', 'Scale Across Projects'];
  const isNewFormat   = archLayers.length > 0;

  const wrap = document.createElement('div');
  wrap.className = 'dae-view';

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // ── Upper body: Blueprint (left) | Flow (right) ───────────────────────────

  const upperBody = document.createElement('div');
  upperBody.className = 'dae-upper';

  // LEFT: Architecture Blueprint — 4 layer cards
  const blueprintCol = document.createElement('div');
  blueprintCol.className = 'dae-blueprint-col';

  if (isNewFormat) {
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Recommended AI Architecture';
    blueprintCol.appendChild(lbl);

    const grid = document.createElement('div');
    grid.className = 'dae-layer-grid';

    archLayers.forEach((layer, i) => {
      const card = document.createElement('div');
      card.className = `dae-layer-card dae-layer-card--${i}`;

      const name = document.createElement('p');
      name.className = 'dae-layer-card__name'; name.textContent = layer.name;
      card.appendChild(name);

      if (layer.purpose) {
        const purposeLabel = document.createElement('span');
        purposeLabel.className = 'dae-layer-card__field-label'; purposeLabel.textContent = 'Purpose';
        card.appendChild(purposeLabel);
        const purpose = document.createElement('p');
        purpose.className = 'dae-layer-card__purpose'; purpose.textContent = layer.purpose;
        card.appendChild(purpose);
      }

      if (layer.recommended?.length) {
        const recLabel = document.createElement('span');
        recLabel.className = 'dae-layer-card__field-label';
        recLabel.textContent = i === 0 ? 'Recommended Systems' : 'Recommended Technologies';
        card.appendChild(recLabel);
        const tags = document.createElement('div');
        tags.className = 'dae-layer-card__tags';
        layer.recommended.forEach(item => {
          const tag = document.createElement('span');
          tag.className = 'dae-layer-card__tag'; tag.textContent = item;
          tags.appendChild(tag);
        });
        card.appendChild(tags);
      }

      if (layer.whyNeeded) {
        const whyLabel = document.createElement('span');
        whyLabel.className = 'dae-layer-card__field-label'; whyLabel.textContent = 'Why Needed';
        card.appendChild(whyLabel);
        const why = document.createElement('p');
        why.className = 'dae-layer-card__why'; why.textContent = layer.whyNeeded;
        card.appendChild(why);
      }

      grid.appendChild(card);
    });

    blueprintCol.appendChild(grid);
  } else {
    // Legacy: project systems
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Project Systems';
    blueprintCol.appendChild(lbl);
    const CONN_CLASS = { Connected: 'dae-conn--connected', Partial: 'dae-conn--partial', Disconnected: 'dae-conn--disconnected' };
    projectSystems.forEach(sys => {
      const card = document.createElement('div');
      card.className = `dae-sys-card ${CONN_CLASS[sys.connectionStatus] || 'dae-conn--disconnected'}`;
      const nm = document.createElement('p'); nm.className = 'dae-sys-card__name'; nm.textContent = sys.name;
      const conn = document.createElement('p'); conn.className = 'dae-sys-card__conn'; conn.textContent = `Connection Status: ${sys.connectionStatus}`;
      card.appendChild(nm); card.appendChild(conn); blueprintCol.appendChild(card);
    });
    if (!projectSystems.length) {
      const empty = document.createElement('p'); empty.className = 'dae-empty'; empty.textContent = 'System list will appear after generation.';
      blueprintCol.appendChild(empty);
    }
  }

  upperBody.appendChild(blueprintCol);

  // RIGHT: Architecture Flow — vertical chain
  const flowCol = document.createElement('div');
  flowCol.className = 'dae-flow-col';

  const flowLbl = document.createElement('p');
  flowLbl.className = 'brief-label'; flowLbl.textContent = 'Architecture Flow';
  flowCol.appendChild(flowLbl);

  const flow = document.createElement('div');
  flow.className = 'dae-flow';

  if (isNewFormat && archLayers.length) {
    archLayers.forEach((layer, i) => {
      const node = document.createElement('div');
      node.className = `dae-flow__node dae-flow__node--${i}`;
      const nName = document.createElement('p');
      nName.className = 'dae-flow__node-name'; nName.textContent = layer.name;
      node.appendChild(nName);
      if (layer.recommended?.length) {
        const nSubs = document.createElement('p');
        nSubs.className = 'dae-flow__node-subs';
        nSubs.textContent = layer.recommended.slice(0, 3).join(' · ');
        node.appendChild(nSubs);
      }
      flow.appendChild(node);
      if (i < archLayers.length - 1) {
        const arr = document.createElement('div'); arr.className = 'dae-flow__arrow'; arr.textContent = '↓';
        flow.appendChild(arr);
      }
    });
  } else {
    // Legacy: static flow nodes
    ['Source Systems', 'Integration Layer', 'AI Data Hub', 'AI Applications'].forEach((name, i, arr) => {
      const node = document.createElement('div'); node.className = 'dae-flow__node';
      const nName = document.createElement('p'); nName.className = 'dae-flow__node-name'; nName.textContent = name;
      node.appendChild(nName); flow.appendChild(node);
      if (i < arr.length - 1) {
        const arrow = document.createElement('div'); arrow.className = 'dae-flow__arrow'; arrow.textContent = '↓';
        flow.appendChild(arrow);
      }
    });
  }

  flowCol.appendChild(flow);
  upperBody.appendChild(flowCol);
  wrap.appendChild(upperBody);

  // ── Middle: Decisions (left) | Tech Stack (right) ────────────────────────

  const middleBody = document.createElement('div');
  middleBody.className = 'dae-middle';

  // Decisions
  const decisionsCol = document.createElement('div');
  decisionsCol.className = 'dae-decisions-col';

  const isNewDecisions = archDecisions.length && archDecisions[0].decisionArea;
  if (archDecisions.length) {
    const dLbl = document.createElement('p');
    dLbl.className = 'brief-label'; dLbl.textContent = 'Recommended Architecture Decisions';
    decisionsCol.appendChild(dLbl);

    if (isNewDecisions) {
      // Table layout: Decision Area | Recommendation | Why
      const table = document.createElement('div');
      table.className = 'dae-dec-table';

      const header = document.createElement('div');
      header.className = 'dae-dec-table__row dae-dec-table__row--header';
      ['Decision Area', 'Recommendation', 'Why'].forEach(h => {
        const cell = document.createElement('span'); cell.className = 'dae-dec-table__cell'; cell.textContent = h;
        header.appendChild(cell);
      });
      table.appendChild(header);

      archDecisions.forEach(dec => {
        const row = document.createElement('div'); row.className = 'dae-dec-table__row';
        const area = document.createElement('span'); area.className = 'dae-dec-table__cell dae-dec-table__cell--area'; area.textContent = dec.decisionArea;
        const rec  = document.createElement('span'); rec.className  = 'dae-dec-table__cell dae-dec-table__cell--rec';  rec.textContent  = dec.recommendation;
        const why  = document.createElement('span'); why.className  = 'dae-dec-table__cell dae-dec-table__cell--why';  why.textContent  = dec.why;
        row.appendChild(area); row.appendChild(rec); row.appendChild(why);
        table.appendChild(row);
      });

      decisionsCol.appendChild(table);
    } else {
      // Legacy card layout
      archDecisions.forEach(dec => {
        const card = document.createElement('div'); card.className = 'dae-decision-card';
        const decLabel = document.createElement('span'); decLabel.className = 'dae-decision-card__field-label'; decLabel.textContent = 'Decision';
        const decText  = document.createElement('p');    decText.className  = 'dae-decision-card__decision';   decText.textContent  = dec.decision;
        const benLabel = document.createElement('span'); benLabel.className = 'dae-decision-card__field-label'; benLabel.textContent = 'Benefit';
        const benText  = document.createElement('p');    benText.className  = 'dae-decision-card__benefit';    benText.textContent  = dec.benefit;
        card.appendChild(decLabel); card.appendChild(decText); card.appendChild(benLabel); card.appendChild(benText);
        if (dec.priority) {
          const pip = document.createElement('span');
          pip.className = `dae-pip ${PRIORITY_PIP[dec.priority] || 'dae-pip--medium'}`; pip.textContent = dec.priority;
          card.appendChild(pip);
        }
        decisionsCol.appendChild(card);
      });
    }
  } else if (archRecs.length) {
    // Legacy
    const dLbl = document.createElement('p'); dLbl.className = 'brief-label'; dLbl.textContent = 'AI Recommendations';
    decisionsCol.appendChild(dLbl);
    const IMPACT_CLASS = { High: 'dae-impact--high', Medium: 'dae-impact--medium', Low: 'dae-impact--low' };
    const recGrid = document.createElement('div'); recGrid.className = 'dae-rec-grid';
    archRecs.forEach(rec => {
      const card = document.createElement('div'); card.className = 'dae-rec-card';
      const title = document.createElement('p'); title.className = 'dae-rec-card__title'; title.textContent = rec.title;
      const meta = document.createElement('div'); meta.className = 'dae-rec-card__meta';
      meta.innerHTML = `<span class="dae-rec-meta-row">Impact: <strong class="${IMPACT_CLASS[rec.impact] || ''}">${rec.impact}</strong></span><span class="dae-rec-meta-row">Effort: <strong>${rec.effort}</strong></span>`;
      card.appendChild(title); card.appendChild(meta); recGrid.appendChild(card);
    });
    decisionsCol.appendChild(recGrid);
  }

  middleBody.appendChild(decisionsCol);

  // Tech Stack table
  const techCol = document.createElement('div');
  techCol.className = 'dae-tech-col';

  if (techStack.length) {
    const tLbl = document.createElement('p');
    tLbl.className = 'brief-label'; tLbl.textContent = 'AI Technology Recommendation';
    techCol.appendChild(tLbl);

    const table = document.createElement('div');
    table.className = 'dae-tech-table';

    const header = document.createElement('div');
    header.className = 'dae-tech-table__row dae-tech-table__row--header';
    ['Architecture Layer', 'Recommendation'].forEach(h => {
      const cell = document.createElement('span'); cell.className = 'dae-tech-table__cell'; cell.textContent = h;
      header.appendChild(cell);
    });
    table.appendChild(header);

    techStack.forEach(item => {
      const row = document.createElement('div');
      row.className = 'dae-tech-table__row';
      const layer = document.createElement('span'); layer.className = 'dae-tech-table__cell dae-tech-table__cell--layer'; layer.textContent = item.layer;
      const rec   = document.createElement('span'); rec.className   = 'dae-tech-table__cell dae-tech-table__cell--rec';   rec.textContent   = item.recommendation;
      row.appendChild(layer); row.appendChild(rec); table.appendChild(row);
    });

    techCol.appendChild(table);
  }

  middleBody.appendChild(techCol);
  wrap.appendChild(middleBody);

  // ── Architecture Pattern ──────────────────────────────────────────────────

  const patternNodes = archPattern.length ? archPattern : (isNewFormat ? archLayers.map(l => l.name) : []);
  if (patternNodes.length) {
    const patternSection = document.createElement('div');
    patternSection.className = 'dae-pattern-section';

    const patternLbl = document.createElement('p');
    patternLbl.className = 'brief-label'; patternLbl.textContent = 'Architecture Pattern';
    patternSection.appendChild(patternLbl);

    const patternRow = document.createElement('div');
    patternRow.className = 'dae-pattern-row';

    patternNodes.forEach((node, i) => {
      const nodeEl = document.createElement('div'); nodeEl.className = `dae-pattern-node dae-pattern-node--${i}`;
      const nodeLabel = document.createElement('p'); nodeLabel.className = 'dae-pattern-node__label'; nodeLabel.textContent = node;
      nodeEl.appendChild(nodeLabel);
      patternRow.appendChild(nodeEl);
      if (i < patternNodes.length - 1) {
        const arr = document.createElement('span'); arr.className = 'dae-pattern-row__arrow'; arr.textContent = '↓';
        patternRow.appendChild(arr);
      }
    });

    patternSection.appendChild(patternRow);
    wrap.appendChild(patternSection);
  }

  // ── Consultant Guidance ───────────────────────────────────────────────────

  if (archConsultantGuidance) {
    const cg = document.createElement('div');
    cg.className = 'dae-consultant-guidance';
    const cgHeader = document.createElement('div'); cgHeader.className = 'dae-consultant-guidance__header';
    const cgIcon  = document.createElement('span'); cgIcon.className  = 'dae-consultant-guidance__icon';  cgIcon.textContent  = '◆';
    const cgTitle = document.createElement('span'); cgTitle.className = 'dae-consultant-guidance__title'; cgTitle.textContent = 'Consultant Guidance';
    cgHeader.appendChild(cgIcon); cgHeader.appendChild(cgTitle);
    cg.appendChild(cgHeader);
    const cgText = document.createElement('p'); cgText.className = 'dae-consultant-guidance__text'; cgText.textContent = archConsultantGuidance;
    cg.appendChild(cgText);
    wrap.appendChild(cg);
  }

  // ── Implementation Sequence ───────────────────────────────────────────────

  const implSection = document.createElement('div');
  implSection.className = 'dae-impl-section';

  const implLbl = document.createElement('p');
  implLbl.className = 'brief-label'; implLbl.textContent = 'Recommended Implementation Sequence';
  implSection.appendChild(implLbl);

  const implRow = document.createElement('div');
  implRow.className = 'dae-impl-row';

  DAE_IMPL_SEQ.forEach((step, i) => {
    const stepEl = document.createElement('div');
    stepEl.className = 'dae-impl-step';
    const num = document.createElement('span'); num.className = 'dae-impl-step__num'; num.textContent = i + 1;
    const label = document.createElement('p'); label.className = 'dae-impl-step__label'; label.textContent = step;
    stepEl.appendChild(num); stepEl.appendChild(label);
    implRow.appendChild(stepEl);
    if (i < DAE_IMPL_SEQ.length - 1) {
      const arr = document.createElement('span'); arr.className = 'dae-impl-row__arrow'; arr.textContent = '→';
      implRow.appendChild(arr);
    }
  });

  implSection.appendChild(implRow);
  wrap.appendChild(implSection);

  // ── Architecture Summary strip ────────────────────────────────────────────

  const hasSummary = archSummary.sourceSystems || archSummary.integrationPoints;
  if (hasSummary) {
    const strip = document.createElement('div');
    strip.className = 'dae-arch-summary';

    const stripLbl = document.createElement('p');
    stripLbl.className = 'brief-label'; stripLbl.textContent = 'Architecture Summary';
    strip.appendChild(stripLbl);

    const cells = document.createElement('div'); cells.className = 'dae-arch-summary__cells';
    [
      { value: archSummary.sourceSystems,     label: 'Source Systems' },
      { value: archSummary.integrationPoints, label: 'Integration Points' },
      { value: archSummary.aiStorage  || '—', label: 'AI Storage',   isText: true },
      { value: archSummary.aiConsumers || '—', label: 'AI Consumers', isText: true },
    ].forEach(stat => {
      const cell = document.createElement('div'); cell.className = 'dae-arch-summary__cell';
      const val  = document.createElement('p');
      val.className = stat.isText ? 'dae-arch-summary__value dae-arch-summary__value--text' : 'dae-arch-summary__value';
      val.textContent = stat.value ?? '—';
      const lbl2 = document.createElement('p'); lbl2.className = 'dae-arch-summary__label'; lbl2.textContent = stat.label;
      cell.appendChild(val); cell.appendChild(lbl2); cells.appendChild(cell);
    });
    strip.appendChild(cells);

    wrap.appendChild(strip);
  } else if (archStats.architectureReadiness) {
    // Legacy stats bar
    const statsBar = document.createElement('div'); statsBar.className = 'dae-stats-bar';
    [
      { value: `${archStats.architectureReadiness || 0}%`, label: 'Architecture Readiness' },
      { value: `${archStats.automation || 0}%`,            label: 'Automation' },
      { value: archStats.connectedSystems    || 0,          label: 'Connected Systems' },
      { value: archStats.disconnectedSystems || 0,          label: 'Disconnected Systems' },
    ].forEach(stat => {
      const cell = document.createElement('div'); cell.className = 'dae-stat-cell';
      const val = document.createElement('p'); val.className = 'dae-stat-cell__value'; val.textContent = stat.value;
      const lbl = document.createElement('p'); lbl.className = 'dae-stat-cell__label'; lbl.textContent = stat.label;
      cell.appendChild(val); cell.appendChild(lbl); statsBar.appendChild(cell);
    });
    wrap.appendChild(statsBar);
  }

  return wrap;
}

// ── Data Readiness — AI Data Preparation ──────────────────────────────────────

function buildAIDataPreparationLayout(section) {
  const b                = section.brief || {};
  const prepWorkPackages = Array.isArray(b.prepWorkPackages) ? b.prepWorkPackages : [];
  const firstSteps       = Array.isArray(b.firstSteps)       ? b.firstSteps       : [];
  const prepSummary      = b.prepSummary || {};
  // Legacy fallbacks
  const prepActivities   = Array.isArray(b.prepActivities)   ? b.prepActivities   : [];
  const inputDatasets    = Array.isArray(b.inputDatasets)     ? b.inputDatasets    : [];
  const prepRecs         = Array.isArray(b.prepRecommendations) ? b.prepRecommendations : [];
  const readiness        = b.readinessSummary || {};
  const leadershipQ      = b.leadershipValidation?.context || '';

  const PRIORITY_CLASS = { HIGH: 'cdi-badge--high', MEDIUM: 'cdi-badge--medium', LOW: 'cdi-badge--low' };
  const ADP_ROADMAP = [
    { stage: 'Identify',    outcome: 'Know which datasets are required' },
    { stage: 'Clean',       outcome: 'Remove incorrect information' },
    { stage: 'Standardize', outcome: 'Common naming and formats' },
    { stage: 'Integrate',   outcome: 'Connect related repositories' },
    { stage: 'Enrich',      outcome: 'Add business context' },
    { stage: 'Validate',    outcome: 'Verify AI readiness' },
    { stage: 'AI Ready',    outcome: 'Data prepared for implementation' },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'adp-view';

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // Three-column body
  const body = document.createElement('div');
  body.className = 'adp-body';

  // ── LEFT: Preparation Work Packages ──────────────────────────────────────

  const leftCol = document.createElement('div');
  leftCol.className = 'adp-col adp-col--left';

  const activePackages = prepWorkPackages.length ? prepWorkPackages : prepActivities;
  const isNewFormat    = prepWorkPackages.length > 0;

  if (activePackages.length) {
    const lbl = document.createElement('p');
    lbl.className = 'brief-label';
    lbl.textContent = 'Preparation Work Packages';
    leftCol.appendChild(lbl);

    activePackages.forEach(pkg => {
      const card = document.createElement('div');
      card.className = 'adp-wp-card';

      const name = document.createElement('p');
      name.className = 'adp-wp-card__name';
      name.textContent = pkg.name || '—';
      card.appendChild(name);

      // Work Package bullets (new format) or single activity (legacy)
      if (isNewFormat && Array.isArray(pkg.workPackage) && pkg.workPackage.length) {
        const wpLabel = document.createElement('span');
        wpLabel.className = 'adp-wp-card__field-label'; wpLabel.textContent = 'Work Package';
        card.appendChild(wpLabel);
        const ul = document.createElement('ul');
        ul.className = 'adp-wp-card__work-list';
        pkg.workPackage.forEach(item => {
          const li = document.createElement('li');
          li.className = 'adp-wp-card__work-item'; li.textContent = item;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      } else if (pkg.preparationActivity) {
        const row = document.createElement('div'); row.className = 'adp-wp-card__row';
        const lbl2 = document.createElement('span'); lbl2.className = 'adp-wp-card__field-label'; lbl2.textContent = 'Preparation Activity';
        const val = document.createElement('span'); val.className = 'adp-wp-card__value'; val.textContent = pkg.preparationActivity;
        row.appendChild(lbl2); row.appendChild(val); card.appendChild(row);
      }

      // Why AI Needs This (new) or Business Purpose (legacy)
      const whyText = isNewFormat ? pkg.whyAINeeds : pkg.businessPurpose;
      const whyLabel = isNewFormat ? 'Why AI Needs This' : 'Business Purpose';
      if (whyText) {
        const whyRow = document.createElement('div'); whyRow.className = 'adp-wp-card__why-row';
        const wLbl = document.createElement('span'); wLbl.className = 'adp-wp-card__field-label'; wLbl.textContent = whyLabel;
        card.appendChild(wLbl);
        const wVal = document.createElement('p'); wVal.className = 'adp-wp-card__why'; wVal.textContent = whyText;
        card.appendChild(wVal);
      }

      // Deliverable (new format only)
      if (isNewFormat && pkg.deliverable) {
        const delRow = document.createElement('div'); delRow.className = 'adp-wp-card__row';
        const dLbl = document.createElement('span'); dLbl.className = 'adp-wp-card__field-label'; dLbl.textContent = 'Deliverable';
        const dVal = document.createElement('span'); dVal.className = 'adp-wp-card__deliverable'; dVal.textContent = pkg.deliverable;
        delRow.appendChild(dLbl); delRow.appendChild(dVal); card.appendChild(delRow);
      }

      // Owner + Priority row
      const metaRow = document.createElement('div'); metaRow.className = 'adp-wp-card__meta-row';
      if (pkg.recommendedOwner) {
        const ownerWrap = document.createElement('div'); ownerWrap.className = 'adp-wp-card__row';
        const oLbl = document.createElement('span'); oLbl.className = 'adp-wp-card__field-label'; oLbl.textContent = 'Primary Owner';
        const oVal = document.createElement('span'); oVal.className = 'adp-wp-card__value'; oVal.textContent = pkg.recommendedOwner;
        ownerWrap.appendChild(oLbl); ownerWrap.appendChild(oVal);
        metaRow.appendChild(ownerWrap);
      }
      if (pkg.priority) {
        const badge = document.createElement('span');
        badge.className = `cdi-badge ${PRIORITY_CLASS[pkg.priority] || 'cdi-badge--medium'}`;
        badge.textContent = pkg.priority;
        metaRow.appendChild(badge);
      }
      if (metaRow.children.length) card.appendChild(metaRow);

      leftCol.appendChild(card);
    });
  } else {
    // Legacy: input datasets
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Input Datasets';
    leftCol.appendChild(lbl);
    const STATUS_ICON  = { AVAILABLE: '◉', MISSING: '◎', 'IN PROGRESS': '◷' };
    const STATUS_CLASS = { AVAILABLE: 'adp-status--available', MISSING: 'adp-status--missing', 'IN PROGRESS': 'adp-status--progress' };
    inputDatasets.forEach(ds => {
      const card = document.createElement('div'); card.className = 'adp-dataset-card';
      const icon = document.createElement('div'); icon.className = 'adp-dataset-card__icon'; icon.textContent = STATUS_ICON[ds.status] || '◉';
      const nm   = document.createElement('p');   nm.className   = 'adp-dataset-card__name'; nm.textContent = ds.name;
      const bdg  = document.createElement('span'); bdg.className = `adp-status ${STATUS_CLASS[ds.status] || 'adp-status--available'}`; bdg.textContent = ds.status;
      card.appendChild(icon); card.appendChild(nm); card.appendChild(bdg);
      leftCol.appendChild(card);
    });
    if (!inputDatasets.length) {
      const empty = document.createElement('p');
      empty.className = 'adp-empty'; empty.textContent = 'Preparation work packages will appear after generation.';
      leftCol.appendChild(empty);
    }
  }

  body.appendChild(leftCol);

  // ── CENTER: Preparation Roadmap ───────────────────────────────────────────

  const centerCol = document.createElement('div');
  centerCol.className = 'adp-col adp-col--center';

  const centerLbl = document.createElement('p');
  centerLbl.className = 'brief-label'; centerLbl.textContent = 'Preparation Roadmap';
  centerCol.appendChild(centerLbl);

  const roadmap = document.createElement('div');
  roadmap.className = 'adp-roadmap';

  ADP_ROADMAP.forEach((item, i) => {
    const node = document.createElement('div');
    node.className = i === 0 ? 'adp-roadmap__node adp-roadmap__node--start'
                   : i === ADP_ROADMAP.length - 1 ? 'adp-roadmap__node adp-roadmap__node--end'
                   : 'adp-roadmap__node';
    const stage = document.createElement('span');
    stage.className = 'adp-roadmap__stage'; stage.textContent = item.stage;
    node.appendChild(stage);
    const outcome = document.createElement('span');
    outcome.className = 'adp-roadmap__outcome'; outcome.textContent = item.outcome;
    node.appendChild(outcome);
    roadmap.appendChild(node);
    if (i < ADP_ROADMAP.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'adp-roadmap__arrow'; arrow.textContent = '↓';
      roadmap.appendChild(arrow);
    }
  });

  centerCol.appendChild(roadmap);
  body.appendChild(centerCol);

  // ── RIGHT: Recommended First Steps ───────────────────────────────────────

  const rightCol = document.createElement('div');
  rightCol.className = 'adp-col adp-col--right';

  if (firstSteps.length) {
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Recommended First Steps';
    rightCol.appendChild(lbl);

    firstSteps.forEach((step, i) => {
      const row = document.createElement('div');
      row.className = 'adp-step-row';

      const num = document.createElement('span');
      num.className = 'adp-step-row__num'; num.textContent = i + 1;

      const content = document.createElement('div');
      content.className = 'adp-step-row__content';

      const action = document.createElement('p');
      action.className = 'adp-step-row__action'; action.textContent = step.action;
      content.appendChild(action);

      if (step.why) {
        const why = document.createElement('p');
        why.className = 'adp-step-row__why'; why.textContent = step.why;
        content.appendChild(why);
      }

      const addMeta = (labelText, value, cls) => {
        if (!value) return;
        const wrap = document.createElement('div'); wrap.className = 'adp-step-row__meta-row';
        const lbl2 = document.createElement('span'); lbl2.className = 'adp-step-row__owner-label'; lbl2.textContent = labelText;
        const val  = document.createElement('span'); val.className = cls; val.textContent = value;
        wrap.appendChild(lbl2); wrap.appendChild(val); content.appendChild(wrap);
      };

      addMeta('Owner',           step.owner,          'adp-step-row__owner');
      addMeta('Expected Output', step.expectedOutput,  'adp-step-row__output');

      row.appendChild(num); row.appendChild(content);
      rightCol.appendChild(row);

      if (i < firstSteps.length - 1) {
        const div = document.createElement('div');
        div.className = 'adp-step-divider';
        rightCol.appendChild(div);
      }
    });
  } else {
    // Legacy: recommendations
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'AI Recommendations';
    rightCol.appendChild(lbl);
    prepRecs.forEach(rec => {
      const recCard = document.createElement('div'); recCard.className = 'adp-rec-card';
      const bullet = document.createElement('span'); bullet.className = 'adp-rec-card__bullet';
      recCard.appendChild(bullet);
      const recBody = document.createElement('div'); recBody.className = 'adp-rec-card__body';
      const recText = document.createElement('p'); recText.className = 'adp-rec-card__text'; recText.textContent = rec.text;
      recBody.appendChild(recText);
      const recMeta = document.createElement('div'); recMeta.className = 'adp-rec-card__meta';
      recMeta.innerHTML = `<span>Priority: <strong>${rec.priority}</strong></span><span>Effort: <strong>${rec.effort}</strong></span>${rec.impact ? `<span>Expected Impact: <em>${rec.impact}</em></span>` : ''}`;
      recBody.appendChild(recMeta); recCard.appendChild(recBody); rightCol.appendChild(recCard);
    });
  }

  body.appendChild(rightCol);
  wrap.appendChild(body);

  // ── Preparation Summary strip ─────────────────────────────────────────────

  const hasNewSummary    = prepSummary.workPackages || prepSummary.repositories;
  const hasLegacySummary = prepSummary.preparationActivities || prepSummary.engineeringRepositories;

  if (hasNewSummary || hasLegacySummary) {
    const strip = document.createElement('div');
    strip.className = 'adp-prep-summary';

    const stripLbl = document.createElement('p');
    stripLbl.className = 'brief-label'; stripLbl.textContent = 'Preparation Summary';
    strip.appendChild(stripLbl);

    const stats = hasNewSummary ? [
      { value: prepSummary.workPackages,    label: 'Work Packages' },
      { value: prepSummary.repositories,    label: 'Engineering Repositories' },
      { value: prepSummary.deliverables,    label: 'AI-ready Deliverables' },
      { value: prepSummary.estimatedDuration || '—', label: 'Estimated Duration', isText: true },
    ] : [
      { value: prepSummary.preparationActivities,   label: 'Preparation Activities' },
      { value: prepSummary.engineeringRepositories, label: 'Engineering Repositories' },
      { value: prepSummary.recommendedOwners,       label: 'Recommended Owners' },
      { value: prepSummary.implementationPriority || '—', label: 'Implementation Priority', isText: true },
    ];

    const cells = document.createElement('div'); cells.className = 'adp-prep-summary__cells';
    stats.forEach(stat => {
      const cell = document.createElement('div'); cell.className = 'adp-prep-summary__cell';
      const val  = document.createElement('p');
      val.className = stat.isText ? 'adp-prep-summary__value adp-prep-summary__value--text' : 'adp-prep-summary__value';
      val.textContent = stat.value ?? '—';
      const lbl2 = document.createElement('p'); lbl2.className = 'adp-prep-summary__label'; lbl2.textContent = stat.label;
      cell.appendChild(val); cell.appendChild(lbl2); cells.appendChild(cell);
    });
    strip.appendChild(cells);

    wrap.appendChild(strip);
  } else {
    // Legacy: readiness 2×2 grid
    const hasReadiness = readiness.quality || readiness.standardization || readiness.integration || readiness.aiReadiness;
    if (hasReadiness) {
      const readinessSection = document.createElement('div'); readinessSection.className = 'adp-readiness';
      const readinessLbl = document.createElement('p'); readinessLbl.className = 'adp-readiness__label'; readinessLbl.textContent = 'Readiness Summary';
      readinessSection.appendChild(readinessLbl);
      const readinessGrid = document.createElement('div'); readinessGrid.className = 'adp-readiness-grid';
      [
        { label: 'Quality', value: readiness.quality },
        { label: 'Standardization', value: readiness.standardization },
        { label: 'Integration', value: readiness.integration },
        { label: 'AI Readiness', value: readiness.aiReadiness },
      ].forEach(item => {
        const cell = document.createElement('div'); cell.className = 'adp-readiness-cell';
        const cellLabel = document.createElement('p'); cellLabel.className = 'adp-readiness-cell__label'; cellLabel.textContent = item.label;
        const cellValue = document.createElement('p'); cellValue.className = 'adp-readiness-cell__value'; cellValue.textContent = `${item.value || 0}%`;
        cell.appendChild(cellLabel); cell.appendChild(cellValue); readinessGrid.appendChild(cell);
      });
      readinessSection.appendChild(readinessGrid); wrap.appendChild(readinessSection);
    }
  }

  // ── Leadership question footer ────────────────────────────────────────────

  if (false) {
    // Ready to Proceed and Leadership Question removed
    const footer = document.createElement('div');
    footer.className = 'adp-leadership';
    footer.innerHTML = `<span class="adp-leadership__icon">?</span><p class="adp-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── Data Readiness — Critical Data Identification ─────────────────────────────

function buildCriticalDataLayout(section) {
  const b = section.brief || {};
  const datasets              = Array.isArray(b.datasets)              ? b.datasets              : [];
  const traceabilityChain     = Array.isArray(b.traceabilityChain)     ? b.traceabilityChain     : [];
  const collectionOrder       = Array.isArray(b.collectionOrder)       ? b.collectionOrder       : [];
  const implementationRoadmap = Array.isArray(b.implementationRoadmap) ? b.implementationRoadmap : [];
  const consultantGuidance    = b.consultantGuidance || '';
  const aiRecommendation      = b.aiRecommendation   || '';
  // Legacy fallbacks
  const relationshipMap     = b.relationshipMap || {};
  const recommendations     = Array.isArray(b.recommendations)     ? b.recommendations     : [];
  const coverage            = b.coverageSummary || {};
  const leadershipQ         = b.leadershipValidation?.context || b.successMetrics?.[0] || '';

  const PRIORITY_CLASS = { HIGH: 'cdi-badge--high', MEDIUM: 'cdi-badge--medium', LOW: 'cdi-badge--low' };

  const wrap = document.createElement('div');
  wrap.className = 'cdi-view';

  // Strategic Position
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // Two-panel body: 70 / 30
  const body = document.createElement('div');
  body.className = 'cdi-body';

  // ── LEFT (70%): Critical Data Blueprint ──────────────────────────────────────
  const leftPanel = document.createElement('div');
  leftPanel.className = 'cdi-left';

  if (datasets.length) {
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Critical Data Blueprint';
    leftPanel.appendChild(lbl);

    datasets.forEach(ds => {
      const card = document.createElement('div');
      card.className = 'cdi-dataset-card';

      const name = document.createElement('p');
      name.className = 'cdi-dataset-card__name'; name.textContent = ds.name || '—';
      card.appendChild(name);

      const addInfoRow = (label, value, isBadge, isOutput = false) => {
        if (!value) return;
        const row = document.createElement('div');
        row.className = isOutput
          ? 'cdi-dataset-card__info-row cdi-dataset-card__info-row--output'
          : 'cdi-dataset-card__info-row';
        const lbl2 = document.createElement('span');
        lbl2.className = 'cdi-dataset-card__info-label'; lbl2.textContent = label;
        row.appendChild(lbl2);
        if (isBadge) {
          const badge = document.createElement('span');
          badge.className = `cdi-badge ${PRIORITY_CLASS[value] || 'cdi-badge--medium'}`;
          badge.textContent = value;
          row.appendChild(badge);
        } else {
          const val = document.createElement('span');
          val.className = 'cdi-dataset-card__info-value'; val.textContent = value;
          row.appendChild(val);
        }
        card.appendChild(row);
      };

      addInfoRow('Purpose',                   ds.purpose,          false);
      addInfoRow('Recommended Source System', ds.typicalSource,    false);
      addInfoRow('Expected AI Output',        ds.expectedAIOutput, false, true);
      addInfoRow('Priority',                  ds.priority,         true);

      leftPanel.appendChild(card);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'cdi-empty';
    empty.textContent = 'Dataset analysis will appear after blueprint generation.';
    leftPanel.appendChild(empty);
  }

  body.appendChild(leftPanel);

  // ── RIGHT (30%): Traceability + Collection Order + Roadmap ───────────────────
  const rightPanel = document.createElement('div');
  rightPanel.className = 'cdi-right';

  // Engineering Traceability chain
  const chainToRender = traceabilityChain.length ? traceabilityChain : null;
  if (chainToRender) {
    const sec = document.createElement('div');
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Engineering Traceability';
    sec.appendChild(lbl);

    const chain = document.createElement('div');
    chain.className = 'cdi-traceability';
    chainToRender.forEach((node, i) => {
      const el = document.createElement('div');
      el.className = i === 0 ? 'cdi-traceability__node cdi-traceability__node--start'
                   : i === chainToRender.length - 1 ? 'cdi-traceability__node cdi-traceability__node--end'
                   : 'cdi-traceability__node';
      el.textContent = node;
      chain.appendChild(el);
      if (i < chainToRender.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'cdi-traceability__arrow'; arrow.textContent = '↓';
        chain.appendChild(arrow);
      }
    });
    sec.appendChild(chain);
    rightPanel.appendChild(sec);
  } else {
    // Legacy: Data Relationship Map
    const hasRelMap = [relationshipMap.dataSource, relationshipMap.dependentData,
                       relationshipMap.relatedData, relationshipMap.targetData].some(a => a?.length);
    if (hasRelMap) {
      const relSection = document.createElement('div');
      relSection.className = 'cdi-relmap';
      const relLbl = document.createElement('p');
      relLbl.className = 'brief-label'; relLbl.textContent = 'Data Relationship Map';
      relSection.appendChild(relLbl);
      const relGrid = document.createElement('div');
      relGrid.className = 'cdi-relmap__grid';
      [
        { key: 'dataSource', label: 'Data Source', icon: '◉' },
        { key: 'dependentData', label: 'Dependent Data', icon: '◈' },
        { key: 'relatedData', label: 'Related Data', icon: '◇' },
        { key: 'targetData', label: 'Target Data', icon: '◆' },
      ].forEach((node, i, arr) => {
        const items = relationshipMap[node.key] || [];
        const nodeEl = document.createElement('div');
        nodeEl.className = `cdi-relnode cdi-relnode--${node.key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        nodeEl.innerHTML = `<div class="cdi-relnode__header"><span class="cdi-relnode__icon">${node.icon}</span><span class="cdi-relnode__label">${node.label}</span></div>`;
        if (items.length) {
          const ul = document.createElement('ul'); ul.className = 'cdi-relnode__list';
          items.slice(0, 3).forEach(item => { const li = document.createElement('li'); li.textContent = item; ul.appendChild(li); });
          nodeEl.appendChild(ul);
        }
        relGrid.appendChild(nodeEl);
        if (i < arr.length - 1) { const a = document.createElement('div'); a.className = 'cdi-relmap__arrow'; a.textContent = '→'; relGrid.appendChild(a); }
      });
      relSection.appendChild(relGrid);
      rightPanel.appendChild(relSection);
    }
  }

  // Recommended Collection Order
  if (collectionOrder.length) {
    const sec = document.createElement('div');
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Recommended Collection Order';
    sec.appendChild(lbl);

    collectionOrder.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'cdi-collection-row';
      const num = document.createElement('span');
      num.className = 'cdi-collection-row__num'; num.textContent = i + 1;
      const content = document.createElement('div');
      content.className = 'cdi-collection-row__content';
      const name = document.createElement('p');
      // Show action (verb phrase) if available, fall back to dataset name
      name.className = 'cdi-collection-row__name'; name.textContent = item.action || item.name;
      content.appendChild(name);
      if (item.reason) {
        const reason = document.createElement('p');
        reason.className = 'cdi-collection-row__reason'; reason.textContent = item.reason;
        content.appendChild(reason);
      }
      row.appendChild(num); row.appendChild(content);
      sec.appendChild(row);
    });
    rightPanel.appendChild(sec);
  } else if (recommendations.length) {
    // Legacy: plain recommendations
    const recSection = document.createElement('div');
    recSection.className = 'cdi-recs';
    const recLbl = document.createElement('p');
    recLbl.className = 'brief-label'; recLbl.textContent = 'Data Collection Recommendations';
    recSection.appendChild(recLbl);
    recommendations.forEach((rec, i) => {
      const row = document.createElement('div');
      row.className = 'cdi-rec-row';
      const num = document.createElement('span'); num.className = 'cdi-rec-row__num'; num.textContent = i + 1;
      const text = document.createElement('p'); text.className = 'cdi-rec-row__text'; text.textContent = rec.text;
      const badge = document.createElement('span');
      badge.className = `cdi-badge ${PRIORITY_CLASS[rec.priority] || 'cdi-badge--medium'}`; badge.textContent = rec.priority || 'MEDIUM';
      row.appendChild(num); row.appendChild(text); row.appendChild(badge);
      recSection.appendChild(row);
    });
    rightPanel.appendChild(recSection);
  }

  // Implementation Roadmap
  if (implementationRoadmap.length) {
    const sec = document.createElement('div');
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Data Collection Roadmap';
    sec.appendChild(lbl);

    const roadmap = document.createElement('div');
    roadmap.className = 'cdi-roadmap';
    implementationRoadmap.forEach(step => {
      const row = document.createElement('div');
      row.className = `cdi-roadmap__step cdi-roadmap__step--${step.status === 'ready' ? 'ready' : 'pending'}`;
      const icon = document.createElement('span');
      icon.className = 'cdi-roadmap__icon'; icon.textContent = step.status === 'ready' ? '✓' : '↓';
      const label = document.createElement('p');
      label.className = 'cdi-roadmap__label'; label.textContent = step.step;
      row.appendChild(icon); row.appendChild(label);
      roadmap.appendChild(row);
    });
    sec.appendChild(roadmap);
    rightPanel.appendChild(sec);
  } else if (coverage.criticalDatasets || coverage.confidence) {
    // Legacy: coverage summary
    const covSection = document.createElement('div');
    covSection.className = 'cdi-coverage';
    const covLbl = document.createElement('p');
    covLbl.className = 'brief-label'; covLbl.textContent = 'Coverage Summary';
    covSection.appendChild(covLbl);
    const covStats = document.createElement('div');
    covStats.className = 'cdi-coverage__stats';
    [
      { value: coverage.criticalDatasets || 0, label: 'Datasets Identified' },
      { value: coverage.missingData || 0, label: 'Missing or Partial' },
      { value: `${coverage.confidence || 0}%`, label: 'Data Confidence' },
    ].forEach(stat => {
      const cell = document.createElement('div'); cell.className = 'cdi-coverage__cell';
      const val = document.createElement('p'); val.className = 'cdi-coverage__value'; val.textContent = stat.value;
      const lbl2 = document.createElement('p'); lbl2.className = 'cdi-coverage__label'; lbl2.textContent = stat.label;
      cell.appendChild(val); cell.appendChild(lbl2); covStats.appendChild(cell);
    });
    covSection.appendChild(covStats);
    rightPanel.appendChild(covSection);
  }

  body.appendChild(rightPanel);
  wrap.appendChild(body);

  // Consultant Guidance
  if (consultantGuidance) {
    const cg = document.createElement('div');
    cg.className = 'cdi-consultant-guidance';
    const cgHeader = document.createElement('div');
    cgHeader.className = 'cdi-consultant-guidance__header';
    const cgIcon = document.createElement('span'); cgIcon.className = 'cdi-consultant-guidance__icon'; cgIcon.textContent = '◆';
    const cgTitle = document.createElement('span'); cgTitle.className = 'cdi-consultant-guidance__title'; cgTitle.textContent = 'Consultant Guidance';
    cgHeader.appendChild(cgIcon); cgHeader.appendChild(cgTitle);
    cg.appendChild(cgHeader);
    const cgText = document.createElement('p'); cgText.className = 'cdi-consultant-guidance__text'; cgText.textContent = consultantGuidance;
    cg.appendChild(cgText);
    wrap.appendChild(cg);
  }

  // AI Recommendation
  if (aiRecommendation) {
    const ar = document.createElement('div');
    ar.className = 'cdi-ai-recommendation';
    const arHeader = document.createElement('div');
    arHeader.className = 'cdi-ai-recommendation__header';
    const arIcon = document.createElement('span'); arIcon.className = 'cdi-ai-recommendation__icon'; arIcon.textContent = '⬡';
    const arTitle = document.createElement('span'); arTitle.className = 'cdi-ai-recommendation__title'; arTitle.textContent = 'AI Recommendation';
    arHeader.appendChild(arIcon); arHeader.appendChild(arTitle);
    ar.appendChild(arHeader);
    const arText = document.createElement('p'); arText.className = 'cdi-ai-recommendation__text'; arText.textContent = aiRecommendation;
    ar.appendChild(arText);
    wrap.appendChild(ar);
  }

  // Leadership question footer
  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'cdi-leadership';
    footer.innerHTML = `<span class="cdi-leadership__icon">?</span><p class="cdi-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── Technology Infrastructure — System Integration & Architecture (legacy SVG) ─

function buildIntegrationArchitectureSvg(systems) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 480, H = 340;
  const cx = W / 2, cy = H / 2;
  const centerR = 40;
  const spokeR  = 118;
  const nodeW   = 108, nodeH = 72;

  // 4-node positions: top, left, right, bottom
  const POSITIONS = [
    { x: cx,              y: cy - spokeR },
    { x: cx - spokeR - 8, y: cy },
    { x: cx + spokeR + 8, y: cy },
    { x: cx,              y: cy + spokeR },
  ];

  const STATUS_COLOR = {
    CONNECTED: '#5CC5A7',
    PARTIAL:   '#fbbf24',
    MISSING:   '#f87171',
  };

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'AI Integration Architecture diagram');
  svg.classList.add('sia-arch-svg');

  function mkLine(x1, y1, x2, y2, color) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', color || 'rgba(99,102,241,0.35)');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '5,3');
    return line;
  }

  function mkRect(x, y, w, h, fill, stroke, rx) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x - w / 2); r.setAttribute('y', y - h / 2);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', rx ?? '10');
    r.setAttribute('fill', fill);
    if (stroke) { r.setAttribute('stroke', stroke); r.setAttribute('stroke-width', '1.5'); }
    return r;
  }

  function mkText(x, y, text, size, fill, weight, anchor) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', anchor || 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-size', size); t.setAttribute('fill', fill);
    if (weight) t.setAttribute('font-weight', weight);
    t.textContent = text;
    return t;
  }

  function mkCircle(cx, cy, r, fill, stroke) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    c.setAttribute('fill', fill);
    if (stroke) { c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', '1.5'); }
    return c;
  }

  // Decorative diamond accents
  function mkDiamond(x, y, size) {
    const d = document.createElementNS(NS, 'polygon');
    d.setAttribute('points', `${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`);
    d.setAttribute('fill', 'none');
    d.setAttribute('stroke', 'rgba(197,155,52,0.25)');
    d.setAttribute('stroke-width', '1');
    return d;
  }

  svg.appendChild(mkDiamond(cx - spokeR - 30, cy - spokeR + 10, 5));
  svg.appendChild(mkDiamond(cx + spokeR + 28, cy + spokeR - 10, 5));
  svg.appendChild(mkDiamond(cx - 60, cy + spokeR + 20, 4));
  svg.appendChild(mkDiamond(cx + 55, cy - spokeR - 18, 4));

  // Spokes (drawn first, behind nodes)
  systems.slice(0, 4).forEach((sys, i) => {
    const pos = POSITIONS[i];
    if (!pos) return;
    const color = STATUS_COLOR[(sys.status || 'MISSING').toUpperCase()] || 'rgba(99,102,241,0.3)';
    svg.appendChild(mkLine(cx, cy, pos.x, pos.y, `${color}55`));
  });

  // Center: AI Solution circle
  svg.appendChild(mkCircle(cx, cy, centerR, 'rgba(99,102,241,0.14)', 'rgba(99,102,241,0.55)'));
  svg.appendChild(mkText(cx, cy - 6,  'AI',       '10', 'rgba(255,255,255,0.92)', '700'));
  svg.appendChild(mkText(cx, cy + 7,  'Solution', '9',  'rgba(255,255,255,0.72)'));

  // System nodes
  systems.slice(0, 4).forEach((sys, i) => {
    const pos = POSITIONS[i];
    if (!pos) return;
    const status = (sys.status || 'MISSING').toUpperCase();
    const statusColor = STATUS_COLOR[status] || '#f87171';

    // Node background rect
    svg.appendChild(mkRect(pos.x, pos.y, nodeW, nodeH, 'rgba(255,255,255,0.04)', 'rgba(99,102,241,0.25)'));

    // System name
    const nameWords = (sys.name || '').split(' ');
    const nameLine1 = nameWords.slice(0, 2).join(' ');
    const nameLine2 = nameWords.slice(2).join(' ');
    if (nameLine2) {
      svg.appendChild(mkText(pos.x, pos.y - 24, nameLine1, '8', 'rgba(255,255,255,0.85)', '600'));
      svg.appendChild(mkText(pos.x, pos.y - 14, nameLine2, '8', 'rgba(255,255,255,0.85)', '600'));
    } else {
      svg.appendChild(mkText(pos.x, pos.y - 18, nameLine1, '8', 'rgba(255,255,255,0.85)', '600'));
    }

    // Connection status row
    svg.appendChild(mkCircle(pos.x - 34, pos.y - 3, 3, statusColor));
    svg.appendChild(mkText(pos.x - 28, pos.y - 3, 'Connection Status', '6', 'rgba(255,255,255,0.4)', null, 'start'));

    // Integration Method row
    svg.appendChild(mkCircle(pos.x - 34, pos.y + 8, 3, 'rgba(255,255,255,0.25)'));
    svg.appendChild(mkText(pos.x - 28, pos.y + 8, sys.integrationMethod || '—', '6', 'rgba(255,255,255,0.4)', null, 'start'));

    // Health Indicator row
    const healthColor = sys.healthIndicator === 'Healthy' ? '#5CC5A7'
                      : sys.healthIndicator === 'Degraded' ? '#fbbf24' : 'rgba(255,255,255,0.25)';
    svg.appendChild(mkCircle(pos.x - 34, pos.y + 19, 3, healthColor));
    svg.appendChild(mkText(pos.x - 28, pos.y + 19, sys.healthIndicator || '—', '6', 'rgba(255,255,255,0.4)', null, 'start'));
  });

  return svg;
}

function buildSystemIntegrationLayout(section) {
  const b = section.brief || {};

  // New fields
  const siaEngineeringSystems    = b.siaEngineeringSystems    || [];
  const siaWorkflowSteps           = b.siaWorkflowSteps           || [];
  const siaIntegrationPriorities   = b.siaIntegrationPriorities   || [];
  const siaArchLayers              = b.siaArchLayers              || [];
  const siaImplSequence            = b.siaImplSequence            || [];
  const siaIntegrationPrinciples   = b.siaIntegrationPrinciples   || [];
  const siaConsultantGuidance      = b.siaConsultantGuidance      || '';
  const siaAIRecommendation        = b.siaAIRecommendation        || '';

  // Legacy fields
  const connectedSystems   = b.connectedSystems   || [];
  const integrationSummary = b.integrationSummary || {};

  const isNewFormat = siaEngineeringSystems.length > 0 || !!siaConsultantGuidance;

  const SIA_IMPL_STEPS = [
    'Connect Engineering Systems', 'Standardize Data Exchange',
    'Embed AI into Existing Workflows', 'Enable Secure Monitoring', 'Scale Across Engineering Programs',
  ];
  const PRIORITY_COLOR = { HIGH: '#f87171', MEDIUM: '#fbbf24', LOW: '#5CC5A7' };
  const ARCH_ACCENT = ['#5CC5A7', '#818cf8', '#fbbf24', '#c084fc', '#fb923c'];

  const wrap = document.createElement('div');
  wrap.className = 'sia-view';

  // ── Strategic Position ────────────────────────────────────────────────────
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'sia-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  if (isNewFormat) {
    // ── Two-column body (65 / 35) ─────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'sia-main-body';

    // LEFT (65%): Engineering Integration Blueprint — system cards
    const leftCol = document.createElement('div');
    leftCol.className = 'sia-blueprint-col';

    const blueprintLbl = document.createElement('p');
    blueprintLbl.className = 'brief-label';
    blueprintLbl.textContent = 'Integration Blueprint';
    leftCol.appendChild(blueprintLbl);

    const sysGrid = document.createElement('div');
    sysGrid.className = 'sia-blueprint-grid';

    siaEngineeringSystems.forEach(sys => {
      const card = document.createElement('div');
      card.className = 'sia-system-card';

      const name = document.createElement('p');
      name.className = 'sia-system-card__name';
      name.textContent = sys.name;
      card.appendChild(name);

      [
        { label: 'Purpose',             value: sys.purpose },
        { label: 'Integration Pattern', value: sys.integrationPattern },
        { label: 'AI Interaction',      value: sys.aiInteraction },
        { label: 'Expected Outcome',    value: sys.expectedOutcome },
      ].forEach(({ label, value }) => {
        if (!value) return;
        const fl = document.createElement('p');
        fl.className = 'sia-system-card__field-label';
        fl.textContent = label;
        card.appendChild(fl);
        const vt = document.createElement('p');
        vt.className = 'sia-system-card__value';
        vt.textContent = value;
        card.appendChild(vt);
      });

      sysGrid.appendChild(card);
    });

    leftCol.appendChild(sysGrid);
    body.appendChild(leftCol);

    // RIGHT (35%): AI Workflow Integration + Integration Priorities
    const rightCol = document.createElement('div');
    rightCol.className = 'sia-right-col';

    // Workflow flow
    const wfLbl = document.createElement('p');
    wfLbl.className = 'brief-label';
    wfLbl.textContent = 'Embedded AI Workflow';
    rightCol.appendChild(wfLbl);

    const wfChain = document.createElement('div');
    wfChain.className = 'sia-workflow-chain';

    const steps = siaWorkflowSteps.length ? siaWorkflowSteps : ['Engineer', 'Engineering Tool', 'AI Service', 'Recommendation', 'Engineer Decision'];
    steps.forEach((step, i) => {
      const node = document.createElement('div');
      node.className = 'sia-workflow-node';
      node.textContent = step;
      wfChain.appendChild(node);

      if (i < steps.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'sia-workflow-arrow';
        arrow.textContent = '↓';
        wfChain.appendChild(arrow);
      }
    });

    rightCol.appendChild(wfChain);

    // Integration Priorities
    if (siaIntegrationPriorities.length) {
      const prioLbl = document.createElement('p');
      prioLbl.className = 'brief-label';
      prioLbl.style.marginTop = '1.25rem';
      prioLbl.textContent = 'Recommended Integration Priorities';
      rightCol.appendChild(prioLbl);

      const prioList = document.createElement('div');
      prioList.className = 'sia-priorities';

      siaIntegrationPriorities.forEach(p => {
        const item = document.createElement('div');
        item.className = 'sia-priority-item';

        const header = document.createElement('div');
        header.className = 'sia-priority-item__header';

        const num = document.createElement('span');
        num.className = 'sia-priority-item__num';
        num.textContent = p.order;
        header.appendChild(num);

        const itemName = document.createElement('span');
        itemName.className = 'sia-priority-item__name';
        itemName.textContent = p.name;
        header.appendChild(itemName);

        const pColor = PRIORITY_COLOR[p.priority] || '#fbbf24';
        const badge = document.createElement('span');
        badge.className = 'sia-priority-badge';
        badge.style.color = pColor;
        badge.style.borderColor = `${pColor}55`;
        badge.textContent = p.priority;
        header.appendChild(badge);

        item.appendChild(header);

        if (p.businessBenefit) {
          const benefit = document.createElement('p');
          benefit.className = 'sia-priority-item__benefit';
          benefit.textContent = p.businessBenefit;
          item.appendChild(benefit);
        }

        prioList.appendChild(item);
      });

      rightCol.appendChild(prioList);
    }

    body.appendChild(rightCol);
    wrap.appendChild(body);

    // ── Integration Architecture Blueprint (full-width) ───────────────────
    if (siaArchLayers.some(l => l.technologies && l.technologies.length)) {
      const archLbl = document.createElement('p');
      archLbl.className = 'brief-label';
      archLbl.textContent = 'Integration Architecture Blueprint';
      wrap.appendChild(archLbl);

      const archChain = document.createElement('div');
      archChain.className = 'sia-arch-chain';

      siaArchLayers.forEach((layer, i) => {
        const layerEl = document.createElement('div');
        layerEl.className = 'sia-arch-layer';
        layerEl.style.borderTop = `2px solid ${ARCH_ACCENT[i] || '#5CC5A7'}`;

        const layerName = document.createElement('p');
        layerName.className = 'sia-arch-layer__name';
        layerName.style.color = ARCH_ACCENT[i] || '#5CC5A7';
        layerName.textContent = layer.name;
        layerEl.appendChild(layerName);

        if (layer.technologies && layer.technologies.length) {
          const techRow = document.createElement('div');
          techRow.className = 'sia-arch-techs';
          layer.technologies.forEach(tech => {
            const pill = document.createElement('span');
            pill.className = 'sia-tech-pill';
            pill.textContent = tech;
            techRow.appendChild(pill);
          });
          layerEl.appendChild(techRow);
        }

        archChain.appendChild(layerEl);

        if (i < siaArchLayers.length - 1) {
          const arrow = document.createElement('div');
          arrow.className = 'sia-arch-arrow';
          arrow.textContent = '↓';
          archChain.appendChild(arrow);
        }
      });

      wrap.appendChild(archChain);
    }

    // ── Integration Principles ────────────────────────────────────────────
    if (siaIntegrationPrinciples.length) {
      const principleLbl = document.createElement('p');
      principleLbl.className = 'brief-label';
      principleLbl.textContent = 'Integration Principles';
      wrap.appendChild(principleLbl);

      const principlesGrid = document.createElement('div');
      principlesGrid.className = 'sia-principles';

      siaIntegrationPrinciples.forEach(principle => {
        const item = document.createElement('div');
        item.className = 'sia-principle-item';
        item.textContent = principle;
        principlesGrid.appendChild(item);
      });

      wrap.appendChild(principlesGrid);
    }

    // ── Recommended Implementation Sequence ───────────────────────────────
    {
      const seqLbl = document.createElement('p');
      seqLbl.className = 'brief-label';
      seqLbl.textContent = 'Recommended Implementation Sequence';
      wrap.appendChild(seqLbl);

      const steps = siaImplSequence.length ? siaImplSequence : SIA_IMPL_STEPS;
      const seq = document.createElement('div');
      seq.className = 'sia-impl-seq';

      steps.forEach((step, i) => {
        const item = document.createElement('div');
        item.className = 'sia-impl-step';

        const num = document.createElement('span');
        num.className = 'sia-impl-step__num';
        num.textContent = i + 1;
        item.appendChild(num);

        const label = document.createElement('span');
        label.className = 'sia-impl-step__label';
        label.textContent = step;
        item.appendChild(label);

        seq.appendChild(item);
      });

      wrap.appendChild(seq);
    }

    // ── Consultant Guidance ───────────────────────────────────────────────
    if (siaConsultantGuidance) {
      const cg = document.createElement('div');
      cg.className = 'sia-consultant-guidance';
      const cgTitle = document.createElement('p');
      cgTitle.className = 'sia-consultant-guidance__title';
      cgTitle.textContent = 'Consultant Guidance';
      cg.appendChild(cgTitle);
      const cgText = document.createElement('p');
      cgText.className = 'sia-consultant-guidance__text';
      cgText.textContent = siaConsultantGuidance;
      cg.appendChild(cgText);
      wrap.appendChild(cg);
    }

    // ── AI Recommendation ─────────────────────────────────────────────────
    if (siaAIRecommendation) {
      const ar = document.createElement('div');
      ar.className = 'sia-ai-recommendation';
      const arTitle = document.createElement('p');
      arTitle.className = 'sia-ai-recommendation__title';
      arTitle.textContent = 'AI Recommendation';
      ar.appendChild(arTitle);
      const arText = document.createElement('p');
      arText.className = 'sia-ai-recommendation__text';
      arText.textContent = siaAIRecommendation;
      ar.appendChild(arText);
      wrap.appendChild(ar);
    }

  } else {
    // ── Legacy layout ─────────────────────────────────────────────────────
    if (b.integrationReadiness) {
      const badge = document.createElement('div');
      badge.className = 'sia-readiness-badge';
      badge.textContent = `INTEGRATION READINESS: ${b.integrationReadiness}%`;
      wrap.appendChild(badge);
    }

    const body = document.createElement('div');
    body.className = 'sia-body';

    const leftCol = document.createElement('div');
    leftCol.className = 'sia-systems-col';
    const sysLbl = document.createElement('p');
    sysLbl.className = 'brief-label';
    sysLbl.textContent = 'Connected Systems';
    leftCol.appendChild(sysLbl);
    const sysGrid = document.createElement('div');
    sysGrid.className = 'sia-sys-grid';
    connectedSystems.forEach(sys => {
      const status = (sys.status || 'MISSING').toUpperCase();
      const card = document.createElement('div');
      card.className = `sia-sys-card sia-sys-card--${status.toLowerCase()}`;
      const name = document.createElement('p');
      name.className = 'sia-sys-card__name';
      name.textContent = sys.name;
      card.appendChild(name);
      if (sys.integrationMethod) {
        const method = document.createElement('p');
        method.className = 'sia-sys-card__method';
        method.textContent = `Integration Method: ${sys.integrationMethod}`;
        card.appendChild(method);
      }
      sysGrid.appendChild(card);
    });
    leftCol.appendChild(sysGrid);
    body.appendChild(leftCol);

    const rightCol = document.createElement('div');
    rightCol.className = 'sia-arch-col';
    const archLbl = document.createElement('p');
    archLbl.className = 'brief-label';
    archLbl.textContent = 'AI Integration Architecture';
    rightCol.appendChild(archLbl);
    const archPanel = document.createElement('div');
    archPanel.className = 'sia-arch-panel';
    archPanel.appendChild(buildIntegrationArchitectureSvg(connectedSystems));
    rightCol.appendChild(archPanel);
    body.appendChild(rightCol);
    wrap.appendChild(body);
  }

  return wrap;
}

// ── Technology Infrastructure — AI Platform Readiness ────────────────────────

function buildPlatformReadinessLayout(section) {
  const b = section.brief || {};

  // New fields
  const platformCapabilities    = b.platformCapabilities    || [];
  const platformBlueprintLayers = b.platformBlueprintLayers || [];
  const platformRecs            = b.platformRecs            || [];
  const aprImplRoadmap          = b.aprImplRoadmap          || [];
  const aprStackLayers          = b.aprStackLayers          || [];
  const aprConsultantGuidance   = b.aprConsultantGuidance   || '';
  const aprAIRecommendation     = b.aprAIRecommendation     || '';

  // Legacy fields
  const capabilityAssessment    = b.capabilityAssessment    || [];
  const platformStack           = b.platformStack           || [];
  const platformRecommendations = b.platformRecommendations || [];
  const platformSummary         = b.platformSummary         || {};

  const isNewFormat = platformCapabilities.some(c => c.purpose) ||
                      platformBlueprintLayers.some(l => l.recommendation) ||
                      platformRecs.length > 0 ||
                      !!aprConsultantGuidance;

  const APR_IMPL_STEPS = [
    'Establish Development Workspace', 'Build Knowledge Platform', 'Configure Prompt Management',
    'Deploy AI Services', 'Enable Monitoring', 'Scale Across Projects',
  ];
  const APR_BLUEPRINT_LAYERS = [
    'Engineering Users', 'AI Applications', 'Prompt & Model Services',
    'Knowledge Platform', 'Deployment Services', 'Monitoring & Governance', 'Development Workspace',
  ];
  const LAYER_ACCENT = ['#c084fc', '#5CC5A7', '#818cf8', '#fbbf24', '#34d399', '#f87171', '#94a3b8'];
  const PRIORITY_COLOR = { HIGH: '#f87171', MEDIUM: '#fbbf24', LOW: '#5CC5A7' };

  // Legacy constants (kept for old blueprints)
  const STATUS_CLASS = { READY: 'apr-status--ready', PARTIAL: 'apr-status--partial', MISSING: 'apr-status--missing' };
  const PRIORITY_CLASS = { HIGH: 'apr-priority--high', MEDIUM: 'apr-priority--medium', LOW: 'apr-priority--low' };
  const STACK_ICONS = {
    'AI Applications': '⊞', 'AI Model & Prompt Management': '⚙',
    'Knowledge & Retrieval Services': '◻', 'AI Deployment & Automation': '▷',
    'AI Monitoring & Evaluation': '△', 'AI Development Environment': '⌨',
  };

  const wrap = document.createElement('div');
  wrap.className = 'apr-view';

  // ── 1. Strategic Position ─────────────────────────────────────────────────
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'apr-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  if (isNewFormat) {
    // ── 2. Main Body: LEFT capabilities + RIGHT blueprint chain ────────────────
    const body = document.createElement('div');
    body.className = 'apr-main-body';

    // LEFT: 6 capability cards
    const leftCol = document.createElement('div');
    leftCol.className = 'apr-cap-list-col';

    const capLbl = document.createElement('p');
    capLbl.className = 'brief-label';
    capLbl.textContent = 'Recommended AI Platform';
    leftCol.appendChild(capLbl);

    const capList = document.createElement('div');
    capList.className = 'apr-cap-list';

    platformCapabilities.forEach(cap => {
      const card = document.createElement('div');
      card.className = 'apr-cap2-card';

      const name = document.createElement('p');
      name.className = 'apr-cap2-card__name';
      name.textContent = cap.name;
      card.appendChild(name);

      if (cap.purpose) {
        const fl = document.createElement('p');
        fl.className = 'apr-cap2-card__field-label';
        fl.textContent = 'Purpose';
        card.appendChild(fl);
        const purpose = document.createElement('p');
        purpose.className = 'apr-cap2-card__purpose';
        purpose.textContent = cap.purpose;
        card.appendChild(purpose);
      }

      if (cap.capabilities && cap.capabilities.length) {
        const cl = document.createElement('p');
        cl.className = 'apr-cap2-card__field-label';
        cl.textContent = 'Recommended Capabilities';
        card.appendChild(cl);
        const ul = document.createElement('ul');
        ul.className = 'apr-cap2-card__caps';
        cap.capabilities.forEach(c => {
          const li = document.createElement('li');
          li.textContent = c;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }

      if (cap.businessValue) {
        const vl = document.createElement('p');
        vl.className = 'apr-cap2-card__field-label';
        vl.textContent = 'Business Value';
        card.appendChild(vl);
        const val = document.createElement('p');
        val.className = 'apr-cap2-card__value';
        val.textContent = cap.businessValue;
        card.appendChild(val);
      }

      capList.appendChild(card);
    });

    leftCol.appendChild(capList);
    body.appendChild(leftCol);

    // RIGHT: Vertical blueprint chain
    const rightCol = document.createElement('div');
    rightCol.className = 'apr-blueprint-col';

    const bpLbl = document.createElement('p');
    bpLbl.className = 'brief-label';
    bpLbl.textContent = 'AI Platform Blueprint';
    rightCol.appendChild(bpLbl);

    const bpChain = document.createElement('div');
    bpChain.className = 'apr-blueprint-chain';

    const bpLayers = platformBlueprintLayers.length
      ? platformBlueprintLayers
      : APR_BLUEPRINT_LAYERS.map(layer => ({ layer, recommendation: '' }));

    bpLayers.forEach((layerObj, i) => {
      const node = document.createElement('div');
      node.className = 'apr-blueprint-node';
      node.style.borderLeft = `3px solid ${LAYER_ACCENT[i] || '#5CC5A7'}`;

      const layerName = document.createElement('p');
      layerName.className = 'apr-blueprint-node__layer';
      layerName.textContent = layerObj.layer;
      node.appendChild(layerName);

      if (layerObj.recommendation) {
        const rec = document.createElement('p');
        rec.className = 'apr-blueprint-node__rec';
        rec.textContent = layerObj.recommendation;
        node.appendChild(rec);
      }

      bpChain.appendChild(node);

      if (i < bpLayers.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'apr-blueprint-arrow';
        arrow.textContent = '↓';
        bpChain.appendChild(arrow);
      }
    });

    rightCol.appendChild(bpChain);
    body.appendChild(rightCol);
    wrap.appendChild(body);

    // ── 3. AI Platform Recommendations ───────────────────────────────────────
    if (platformRecs.length) {
      const recsLbl = document.createElement('p');
      recsLbl.className = 'brief-label';
      recsLbl.textContent = 'AI Platform Recommendations';
      wrap.appendChild(recsLbl);

      const recsGrid = document.createElement('div');
      recsGrid.className = 'apr-recs2-grid';

      platformRecs.forEach(rec => {
        const card = document.createElement('div');
        card.className = 'apr-rec2-card';

        const title = document.createElement('p');
        title.className = 'apr-rec2-card__title';
        title.textContent = rec.recommendation;
        card.appendChild(title);

        if (rec.why) {
          const wl = document.createElement('p');
          wl.className = 'apr-rec2-card__field-label';
          wl.textContent = 'Why';
          card.appendChild(wl);
          const why = document.createElement('p');
          why.className = 'apr-rec2-card__why';
          why.textContent = rec.why;
          card.appendChild(why);
        }

        const footer = document.createElement('div');
        footer.className = 'apr-rec2-card__footer';

        const pColor = PRIORITY_COLOR[rec.priority] || '#fbbf24';
        const pBadge = document.createElement('span');
        pBadge.className = 'apr-rec2-priority';
        pBadge.style.color = pColor;
        pBadge.style.borderColor = `${pColor}55`;
        pBadge.textContent = rec.priority || 'MEDIUM';
        footer.appendChild(pBadge);

        if (rec.implementationPhase) {
          const phase = document.createElement('span');
          phase.className = 'apr-rec2-phase';
          phase.textContent = rec.implementationPhase;
          footer.appendChild(phase);
        }

        card.appendChild(footer);
        recsGrid.appendChild(card);
      });

      wrap.appendChild(recsGrid);
    }

    // ── 4. Platform Implementation Roadmap ────────────────────────────────────
    {
      const roadmapLbl = document.createElement('p');
      roadmapLbl.className = 'brief-label';
      roadmapLbl.textContent = 'Platform Implementation Roadmap';
      wrap.appendChild(roadmapLbl);

      const steps = aprImplRoadmap.length ? aprImplRoadmap : APR_IMPL_STEPS;
      const seq = document.createElement('div');
      seq.className = 'apr-impl-seq';

      steps.forEach((step, i) => {
        const item = document.createElement('div');
        item.className = 'apr-impl-step';

        const num = document.createElement('span');
        num.className = 'apr-impl-step__num';
        num.textContent = i + 1;
        item.appendChild(num);

        const label = document.createElement('span');
        label.className = 'apr-impl-step__label';
        label.textContent = step;
        item.appendChild(label);

        seq.appendChild(item);
      });

      wrap.appendChild(seq);
    }

    // ── 5. Recommended AI Stack table ─────────────────────────────────────────
    if (aprStackLayers.some(l => l.recommendation)) {
      const stackLbl = document.createElement('p');
      stackLbl.className = 'brief-label';
      stackLbl.textContent = 'Recommended AI Stack';
      wrap.appendChild(stackLbl);

      const stackTable = document.createElement('table');
      stackTable.className = 'apr-stack2-table';

      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Layer</th><th>Recommendation</th></tr>';
      stackTable.appendChild(thead);

      const tbody = document.createElement('tbody');
      aprStackLayers.forEach(layer => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${layer.layer}</td><td>${layer.recommendation || '—'}</td>`;
        tbody.appendChild(tr);
      });
      stackTable.appendChild(tbody);
      wrap.appendChild(stackTable);
    }

    // ── 6. Consultant Guidance ────────────────────────────────────────────────
    if (aprConsultantGuidance) {
      const cg = document.createElement('div');
      cg.className = 'apr-consultant-guidance';
      const cgTitle = document.createElement('p');
      cgTitle.className = 'apr-consultant-guidance__title';
      cgTitle.textContent = 'Consultant Guidance';
      cg.appendChild(cgTitle);
      const cgText = document.createElement('p');
      cgText.className = 'apr-consultant-guidance__text';
      cgText.textContent = aprConsultantGuidance;
      cg.appendChild(cgText);
      wrap.appendChild(cg);
    }

    // ── 7. AI Recommendation ──────────────────────────────────────────────────
    if (aprAIRecommendation) {
      const ar = document.createElement('div');
      ar.className = 'apr-ai-recommendation';
      const arTitle = document.createElement('p');
      arTitle.className = 'apr-ai-recommendation__title';
      arTitle.textContent = 'AI Recommendation';
      ar.appendChild(arTitle);
      const arText = document.createElement('p');
      arText.className = 'apr-ai-recommendation__text';
      arText.textContent = aprAIRecommendation;
      ar.appendChild(arText);
      wrap.appendChild(ar);
    }

  } else {
    // ── Legacy layout (old blueprints) ────────────────────────────────────────
    if (b.platformReadiness) {
      const badge = document.createElement('div');
      badge.className = 'apr-readiness-badge';
      badge.textContent = `PLATFORM READINESS: ${b.platformReadiness}%`;
      wrap.appendChild(badge);
    }

    const body = document.createElement('div');
    body.className = 'apr-body';

    const leftCol = document.createElement('div');
    leftCol.className = 'apr-capability-col';
    const capLbl = document.createElement('p');
    capLbl.className = 'brief-label';
    capLbl.textContent = 'Platform Capability Assessment';
    leftCol.appendChild(capLbl);
    capabilityAssessment.forEach(cap => {
      const status = (cap.status || 'PARTIAL').toUpperCase();
      const card = document.createElement('div');
      card.className = `apr-cap-card apr-cap-card--${status.toLowerCase()}`;
      const name = document.createElement('p');
      name.className = 'apr-cap-card__name';
      name.textContent = cap.name;
      card.appendChild(name);
      const score = document.createElement('p');
      score.className = 'apr-cap-card__score';
      score.textContent = `${cap.score}%`;
      card.appendChild(score);
      const badge = document.createElement('span');
      badge.className = `apr-status ${STATUS_CLASS[status] || 'apr-status--partial'}`;
      badge.textContent = status;
      card.appendChild(badge);
      leftCol.appendChild(card);
    });
    body.appendChild(leftCol);

    const centerCol = document.createElement('div');
    centerCol.className = 'apr-stack-col';
    const stackLbl = document.createElement('p');
    stackLbl.className = 'brief-label';
    stackLbl.textContent = 'AI Platform Stack';
    centerCol.appendChild(stackLbl);
    const stackList = document.createElement('div');
    stackList.className = 'apr-stack-list';
    platformStack.forEach(layer => {
      const status = (layer.status || 'MISSING').toUpperCase();
      const row = document.createElement('div');
      row.className = `apr-stack-row apr-stack-row--${status.toLowerCase()}`;
      const icon = document.createElement('div');
      icon.className = 'apr-stack-row__icon';
      icon.textContent = STACK_ICONS[layer.layer] || '●';
      row.appendChild(icon);
      const info = document.createElement('div');
      info.className = 'apr-stack-row__info';
      const name = document.createElement('p');
      name.className = 'apr-stack-row__name';
      name.textContent = layer.layer;
      info.appendChild(name);
      const scoreEl = document.createElement('p');
      scoreEl.className = 'apr-stack-row__score';
      scoreEl.textContent = `${layer.score}%`;
      info.appendChild(scoreEl);
      row.appendChild(info);
      const badge = document.createElement('span');
      badge.className = `apr-status ${STATUS_CLASS[status] || 'apr-status--missing'}`;
      badge.textContent = status;
      row.appendChild(badge);
      stackList.appendChild(row);
    });
    centerCol.appendChild(stackList);
    body.appendChild(centerCol);

    const rightCol = document.createElement('div');
    rightCol.className = 'apr-recs-col';
    const recsLbl = document.createElement('p');
    recsLbl.className = 'brief-label';
    recsLbl.textContent = 'AI Recommendations';
    rightCol.appendChild(recsLbl);
    const recsList = document.createElement('div');
    recsList.className = 'apr-recs-list';
    platformRecommendations.forEach(rec => {
      const item = document.createElement('div');
      item.className = 'apr-rec-item';
      const text = document.createElement('p');
      text.className = 'apr-rec-item__text';
      text.textContent = rec.text;
      item.appendChild(text);
      const priority = document.createElement('p');
      priority.className = 'apr-rec-item__meta';
      const pk = (rec.priority || 'MEDIUM').toUpperCase();
      priority.innerHTML = `Priority: <span class="apr-priority ${PRIORITY_CLASS[pk] || 'apr-priority--medium'}">${rec.priority || 'MEDIUM'}</span>`;
      item.appendChild(priority);
      if (rec.benefit) {
        const benefit = document.createElement('p');
        benefit.className = 'apr-rec-item__benefit';
        benefit.textContent = `Expected Benefit: ${rec.benefit}`;
        item.appendChild(benefit);
      }
      recsList.appendChild(item);
    });
    rightCol.appendChild(recsList);
    body.appendChild(rightCol);
    wrap.appendChild(body);
  }

  return wrap;
}

// ── Technology Infrastructure — AI Compute & Deployment Strategy ──────────────

function buildDeploymentCanvasSvg(scores) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 420, H = 250;
  const cx = W / 2, cy = H / 2;
  const centerR = 44;
  const spokeR = 90;
  const nodeW = 78, nodeH = 50;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Deployment decision canvas');
  svg.classList.add('cds-canvas-svg');

  const NODES = [
    { label: 'Public Cloud',    x: cx,              y: cy - spokeR },
    { label: 'Private Cloud',   x: cx - spokeR - 8, y: cy },
    { label: 'Hybrid Cloud',    x: cx + spokeR + 8, y: cy },
    { label: 'Edge Deployment', x: cx,              y: cy + spokeR },
  ];

  function mkLine(x1, y1, x2, y2) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', 'rgba(197,155,52,0.35)');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '5,3');
    return line;
  }

  function mkRect(x, y, w, h, fill, stroke) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x - w / 2); r.setAttribute('y', y - h / 2);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', '8');
    r.setAttribute('fill', fill);
    if (stroke) { r.setAttribute('stroke', stroke); r.setAttribute('stroke-width', '1.5'); }
    return r;
  }

  function mkText(x, y, text, size, fill, weight) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-size', size); t.setAttribute('fill', fill);
    if (weight) t.setAttribute('font-weight', weight);
    t.textContent = text;
    return t;
  }

  // Sub-label rows inside each outer node (static visual indicators)
  const SUB_LABELS = ['Suitability', 'Performance', 'Scalability'];

  // Confidence label (top-right watermark)
  if (scores.deploymentConfidence) {
    svg.appendChild(mkText(W - 36, 14, `Confidence: ${scores.deploymentConfidence}%`, '8.5', 'rgba(197,155,52,0.75)'));
  }

  // Spokes (drawn behind nodes)
  NODES.forEach(n => svg.appendChild(mkLine(cx, cy, n.x, n.y)));

  // Center hexagon
  const cc = document.createElementNS(NS, 'circle');
  cc.setAttribute('cx', cx); cc.setAttribute('cy', cy); cc.setAttribute('r', centerR);
  cc.setAttribute('fill', 'rgba(99,102,241,0.14)');
  cc.setAttribute('stroke', 'rgba(99,102,241,0.55)');
  cc.setAttribute('stroke-width', '2');
  svg.appendChild(cc);
  svg.appendChild(mkText(cx, cy - 7, 'AI Decision', '8.5', 'rgba(255,255,255,0.92)', '600'));
  svg.appendChild(mkText(cx, cy + 7, 'Engine', '8.5', 'rgba(255,255,255,0.92)', '600'));

  // Outer deployment nodes
  NODES.forEach(n => {
    const words = n.label.split(' ');
    const line1 = words.slice(0, -1).join(' ') || n.label;
    const line2 = words.length > 1 ? words[words.length - 1] : '';

    svg.appendChild(mkRect(n.x, n.y, nodeW, nodeH, 'rgba(255,255,255,0.04)', 'rgba(99,102,241,0.3)'));

    // Title (1 or 2 lines)
    if (line2) {
      svg.appendChild(mkText(n.x, n.y - 14, line1, '7.5', 'rgba(255,255,255,0.85)', '600'));
      svg.appendChild(mkText(n.x, n.y - 4,  line2, '7.5', 'rgba(255,255,255,0.85)', '600'));
    } else {
      svg.appendChild(mkText(n.x, n.y - 9, line1, '7.5', 'rgba(255,255,255,0.85)', '600'));
    }

    // Sub-labels with dot indicators
    SUB_LABELS.forEach((lbl, i) => {
      const dotX = n.x - 22;
      const txtX = n.x - 16;
      const y = n.y + 5 + i * 8;

      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', dotX); dot.setAttribute('cy', y - 0.5);
      dot.setAttribute('r', '1.8');
      dot.setAttribute('fill', 'rgba(197,155,52,0.7)');
      svg.appendChild(dot);

      svg.appendChild(mkText(txtX + 10, y, lbl, '6', 'rgba(255,255,255,0.45)'));
    });
  });

  return svg;
}

function buildComputeDeploymentLayout(section) {
  const b = section.brief || {};

  // New fields
  const deploymentBlocks      = b.deploymentBlocks      || [];
  const cdsDeploymentFlow     = b.cdsDeploymentFlow     || [];
  const techRecommendations   = b.techRecommendations   || [];
  const cdsArchRationale      = b.cdsArchRationale      || [];
  const deploymentDecisions   = b.deploymentDecisions   || [];
  const cdsImplSequence       = b.cdsImplSequence       || [];
  const infraItems            = b.infraItems            || [];
  const cdsInvestmentEstimate = b.cdsInvestmentEstimate || [];
  const cdsConsultantGuidance = b.cdsConsultantGuidance || '';
  const cdsAIRecommendation   = b.cdsAIRecommendation   || '';

  // Legacy fields (kept for old blueprints)
  const workloadProfile           = b.workloadProfile           || [];
  const deploymentRecommendations = b.deploymentRecommendations || [];
  const deploymentScores          = b.deploymentScores          || {};

  const isNewFormat = deploymentBlocks.length > 0 || techRecommendations.length > 0;

  const CDS_FLOW_NODES = [
    'Engineering Repositories', 'Integration Layer', 'AI Data Store',
    'LLM Inference', 'AI Application', 'Engineering Users',
  ];
  const CDS_IMPL_STEPS = [
    'Prepare AI Data', 'Provision Infrastructure', 'Deploy AI Platform',
    'Deploy AI Assistant', 'Pilot with Engineering Team', 'Scale to Organisation',
  ];

  const BLOCK_ACCENT = {
    'AI Workload':      '#5CC5A7',
    'Deployment Model': '#818cf8',
    'Compute Strategy': '#fbbf24',
    'Scaling Strategy': '#f87171',
  };

  const wrap = document.createElement('div');
  wrap.className = 'cds-view';

  // ── 1. Strategic Position ─────────────────────────────────────────────────
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'cds-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  if (isNewFormat) {
    // ── 2. Recommended Deployment Architecture ────────────────────────────────
    if (deploymentBlocks.length) {
      const archLbl = document.createElement('p');
      archLbl.className = 'brief-label';
      archLbl.textContent = 'Recommended Deployment Architecture';
      wrap.appendChild(archLbl);

      const archGrid = document.createElement('div');
      archGrid.className = 'cds-arch-grid';

      deploymentBlocks.forEach(block => {
        const card = document.createElement('div');
        card.className = 'cds-arch-block';
        const accent = BLOCK_ACCENT[block.blockType] || '#5CC5A7';
        card.style.borderTop = `3px solid ${accent}`;

        const type = document.createElement('p');
        type.className = 'cds-arch-block__type';
        type.style.color = accent;
        type.textContent = block.blockType;
        card.appendChild(type);

        const recLabel = document.createElement('p');
        recLabel.className = 'cds-arch-block__field-label';
        recLabel.textContent = 'Recommendation';
        card.appendChild(recLabel);

        const name = document.createElement('p');
        name.className = 'cds-arch-block__name';
        name.textContent = block.name;
        card.appendChild(name);

        if (block.why) {
          const whyLabel = document.createElement('p');
          whyLabel.className = 'cds-arch-block__field-label';
          whyLabel.textContent = 'Why Recommended';
          card.appendChild(whyLabel);

          const why = document.createElement('p');
          why.className = 'cds-arch-block__why';
          why.textContent = block.why;
          card.appendChild(why);
        }

        archGrid.appendChild(card);
      });

      wrap.appendChild(archGrid);
    }

    // ── 3 + 4. Middle row: Deployment Flow + Technology Recommendations ───────
    const midRow = document.createElement('div');
    midRow.className = 'cds-mid-row';

    // LEFT: Deployment Flow vertical chain
    const flowCol = document.createElement('div');
    flowCol.className = 'cds-flow-col';

    const flowLbl = document.createElement('p');
    flowLbl.className = 'brief-label';
    flowLbl.textContent = 'Recommended Deployment Flow';
    flowCol.appendChild(flowLbl);

    const flowNodes = cdsDeploymentFlow.length ? cdsDeploymentFlow : CDS_FLOW_NODES;
    const flowChain = document.createElement('div');
    flowChain.className = 'cds-flow-chain';
    flowNodes.forEach((node, i) => {
      const nodeEl = document.createElement('div');
      nodeEl.className = `cds-flow-node cds-flow-node--${i}`;
      nodeEl.textContent = node;
      flowChain.appendChild(nodeEl);
      if (i < flowNodes.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'cds-flow-arrow';
        arrow.textContent = '↓';
        flowChain.appendChild(arrow);
      }
    });
    flowCol.appendChild(flowChain);
    midRow.appendChild(flowCol);

    // RIGHT: Technology Recommendations table
    if (techRecommendations.length) {
      const techCol = document.createElement('div');
      techCol.className = 'cds-tech-col';

      const techLbl = document.createElement('p');
      techLbl.className = 'brief-label';
      techLbl.textContent = 'Technology Recommendations';
      techCol.appendChild(techLbl);

      const techTable = document.createElement('table');
      techTable.className = 'cds-tech-table';

      const tHead = document.createElement('thead');
      tHead.innerHTML = '<tr><th>Layer</th><th>Recommended Technology</th><th>Selection Rationale</th></tr>';
      techTable.appendChild(tHead);

      const tBody = document.createElement('tbody');
      techRecommendations.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.layer || ''}</td><td>${r.recommendation || ''}</td><td>${r.selectionRationale || ''}</td>`;
        tBody.appendChild(tr);
      });
      techTable.appendChild(tBody);
      techCol.appendChild(techTable);
      midRow.appendChild(techCol);
    }

    wrap.appendChild(midRow);

    // ── Why this Architecture? ────────────────────────────────────────────────
    if (cdsArchRationale.length) {
      const ratLbl = document.createElement('p');
      ratLbl.className = 'brief-label';
      ratLbl.textContent = 'Why this Architecture?';
      wrap.appendChild(ratLbl);

      const ratList = document.createElement('ul');
      ratList.className = 'cds-arch-rationale';
      cdsArchRationale.forEach(point => {
        const li = document.createElement('li');
        li.className = 'cds-arch-rationale__item';
        li.textContent = point;
        ratList.appendChild(li);
      });
      wrap.appendChild(ratList);
    }

    // ── 5. Deployment Decisions ───────────────────────────────────────────────
    if (deploymentDecisions.length) {
      const decLbl = document.createElement('p');
      decLbl.className = 'brief-label';
      decLbl.textContent = 'Deployment Decisions';
      wrap.appendChild(decLbl);

      const decGrid = document.createElement('div');
      decGrid.className = 'cds-dec-grid';

      deploymentDecisions.forEach(d => {
        const card = document.createElement('div');
        card.className = 'cds-dec-card';

        const dtype = document.createElement('p');
        dtype.className = 'cds-dec-card__type';
        dtype.textContent = d.decisionType;
        card.appendChild(dtype);

        const choice = document.createElement('p');
        choice.className = 'cds-dec-card__choice';
        choice.textContent = d.choice;
        card.appendChild(choice);

        if (d.reason) {
          const reason = document.createElement('p');
          reason.className = 'cds-dec-card__reason';
          reason.textContent = d.reason;
          card.appendChild(reason);
        }

        decGrid.appendChild(card);
      });

      wrap.appendChild(decGrid);
    }

    // ── 6. Implementation Sequence ────────────────────────────────────────────
    {
      const implLbl = document.createElement('p');
      implLbl.className = 'brief-label';
      implLbl.textContent = 'Implementation Sequence';
      wrap.appendChild(implLbl);

      const implSteps = cdsImplSequence.length ? cdsImplSequence : CDS_IMPL_STEPS;
      const implSeq = document.createElement('div');
      implSeq.className = 'cds-impl-seq';

      implSteps.forEach((step, i) => {
        const item = document.createElement('div');
        item.className = 'cds-impl-step';

        const num = document.createElement('span');
        num.className = 'cds-impl-step__num';
        num.textContent = i + 1;
        item.appendChild(num);

        const label = document.createElement('span');
        label.className = 'cds-impl-step__label';
        label.textContent = step;
        item.appendChild(label);

        implSeq.appendChild(item);
      });

      wrap.appendChild(implSeq);
    }

    // ── 7. Expected Infrastructure ────────────────────────────────────────────
    if (infraItems.length) {
      const infraLbl = document.createElement('p');
      infraLbl.className = 'brief-label';
      infraLbl.textContent = 'Expected Infrastructure';
      wrap.appendChild(infraLbl);

      const infraTable = document.createElement('table');
      infraTable.className = 'cds-infra-table';

      const iHead = document.createElement('thead');
      iHead.innerHTML = '<tr><th>Component</th><th>Recommendation</th></tr>';
      infraTable.appendChild(iHead);

      const iBody = document.createElement('tbody');
      infraItems.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.item || ''}</td><td>${item.recommendation || ''}</td>`;
        iBody.appendChild(tr);
      });
      infraTable.appendChild(iBody);
      wrap.appendChild(infraTable);
    }

    // ── 8. Estimated Investment ────────────────────────────────────────────────
    if (cdsInvestmentEstimate.length) {
      const investLbl = document.createElement('p');
      investLbl.className = 'brief-label';
      investLbl.textContent = 'Estimated Infrastructure Investment';
      wrap.appendChild(investLbl);

      const investTable = document.createElement('table');
      investTable.className = 'cds-investment-table';

      const vHead = document.createElement('thead');
      vHead.innerHTML = '<tr><th>Area</th><th>Estimate</th></tr>';
      investTable.appendChild(vHead);

      const vBody = document.createElement('tbody');
      cdsInvestmentEstimate.forEach(row => {
        const tr = document.createElement('tr');
        const levelClass = row.estimate === 'High' ? 'cds-invest--high' : row.estimate === 'Low' ? 'cds-invest--low' : 'cds-invest--medium';
        tr.innerHTML = `<td>${row.area || ''}</td><td><span class="cds-invest-badge ${levelClass}">${row.estimate || 'Medium'}</span></td>`;
        vBody.appendChild(tr);
      });
      investTable.appendChild(vBody);
      wrap.appendChild(investTable);
    }

    // ── 9. Consultant Guidance ────────────────────────────────────────────────
    if (cdsConsultantGuidance) {
      const cg = document.createElement('div');
      cg.className = 'cds-consultant-guidance';
      const cgTitle = document.createElement('p');
      cgTitle.className = 'cds-consultant-guidance__title';
      cgTitle.textContent = 'Consultant Guidance';
      cg.appendChild(cgTitle);
      const cgText = document.createElement('p');
      cgText.className = 'cds-consultant-guidance__text';
      cgText.textContent = cdsConsultantGuidance;
      cg.appendChild(cgText);
      wrap.appendChild(cg);
    }

    // ── 9. AI Recommendation ──────────────────────────────────────────────────
    if (cdsAIRecommendation) {
      const ar = document.createElement('div');
      ar.className = 'cds-ai-recommendation';
      const arTitle = document.createElement('p');
      arTitle.className = 'cds-ai-recommendation__title';
      arTitle.textContent = 'AI Recommendation';
      ar.appendChild(arTitle);
      const arText = document.createElement('p');
      arText.className = 'cds-ai-recommendation__text';
      arText.textContent = cdsAIRecommendation;
      ar.appendChild(arText);
      wrap.appendChild(ar);
    }

  } else {
    // ── Legacy layout (old blueprints) ────────────────────────────────────────
    if (b.deploymentReadiness) {
      const badge = document.createElement('div');
      badge.className = 'cds-readiness-badge';
      badge.textContent = `DEPLOYMENT READINESS: ${b.deploymentReadiness}%`;
      wrap.appendChild(badge);
    }

    const body = document.createElement('div');
    body.className = 'cds-body';

    const workloadCol = document.createElement('div');
    workloadCol.className = 'cds-workload-col';
    const workloadLbl = document.createElement('p');
    workloadLbl.className = 'brief-label';
    workloadLbl.textContent = 'AI Workload Profile';
    workloadCol.appendChild(workloadLbl);

    workloadProfile.forEach(wl => {
      const card = document.createElement('div');
      card.className = 'cds-workload-card';
      const wlName = document.createElement('p');
      wlName.className = 'cds-workload-card__name';
      wlName.textContent = wl.workloadType;
      card.appendChild(wlName);
      [['Compute Requirement', wl.computeRequirement], ['Performance Requirement', wl.performanceRequirement], ['Scalability Requirement', wl.scalabilityRequirement]].forEach(([lbl, val]) => {
        if (!val) return;
        const row = document.createElement('p');
        row.className = 'cds-workload-card__spec';
        row.innerHTML = `<span class="cds-workload-card__spec-label">${lbl}:</span> ${val}`;
        card.appendChild(row);
      });
      const PRIORITY_CLASS = { CRITICAL: 'cds-priority--critical', HIGH: 'cds-priority--high', MEDIUM: 'cds-priority--medium', LOW: 'cds-priority--low' };
      const badge = document.createElement('span');
      badge.className = `cds-priority ${PRIORITY_CLASS[wl.priority] || 'cds-priority--medium'}`;
      badge.textContent = `PRIORITY: ${wl.priority || 'MEDIUM'}`;
      card.appendChild(badge);
      workloadCol.appendChild(card);
    });

    body.appendChild(workloadCol);

    const rightCol = document.createElement('div');
    rightCol.className = 'cds-right-col';

    if (deploymentRecommendations.length) {
      const recsSection = document.createElement('div');
      recsSection.className = 'cds-recs-section';
      const recsLbl = document.createElement('p');
      recsLbl.className = 'brief-label';
      recsLbl.textContent = 'AI Recommendations';
      recsSection.appendChild(recsLbl);
      const recsGrid = document.createElement('div');
      recsGrid.className = 'cds-recs-grid';
      const IMPACT_CLASS = { High: 'cds-impact--high', Medium: 'cds-impact--medium', Low: 'cds-impact--low' };
      deploymentRecommendations.forEach(rec => {
        const card = document.createElement('div');
        card.className = 'cds-rec-card';
        const text = document.createElement('p');
        text.className = 'cds-rec-card__text';
        text.textContent = rec.text;
        card.appendChild(text);
        const impactRow = document.createElement('div');
        impactRow.className = 'cds-rec-card__impact-row';
        impactRow.innerHTML = `Impact: <span class="cds-impact ${IMPACT_CLASS[rec.impact] || 'cds-impact--medium'}">${rec.impact || 'Medium'}</span>`;
        card.appendChild(impactRow);
        if (rec.reason) {
          const reason = document.createElement('p');
          reason.className = 'cds-rec-card__reason';
          reason.textContent = `Reason: ${rec.reason}`;
          card.appendChild(reason);
        }
        recsGrid.appendChild(card);
      });
      recsSection.appendChild(recsGrid);
      rightCol.appendChild(recsSection);
    }

    body.appendChild(rightCol);
    wrap.appendChild(body);

    if (deploymentScores.computeFit || deploymentScores.deploymentConfidence) {
      const scoresBar = document.createElement('div');
      scoresBar.className = 'cds-scores-bar';
      [{ value: `${deploymentScores.computeFit || 0}%`, label: 'Compute Fit' }, { value: deploymentScores.estimatedScalability || '—', label: 'Estimated Scalability' }, { value: `${deploymentScores.deploymentConfidence || 0}%`, label: 'Deployment Confidence' }].forEach(stat => {
        const cell = document.createElement('div');
        cell.className = 'cds-score-cell';
        const val = document.createElement('p');
        val.className = 'cds-score-cell__value';
        val.textContent = stat.value;
        const lbl = document.createElement('p');
        lbl.className = 'cds-score-cell__label';
        lbl.textContent = stat.label;
        cell.appendChild(val);
        cell.appendChild(lbl);
        scoresBar.appendChild(cell);
      });
      wrap.appendChild(scoresBar);
    }
  }

  return wrap;
}

// ── Horizontal 5-stage Lifecycle (AI Learning & Adoption) ─────────────────────
function buildAdoptionLifecycleDiagram(lifecycle) {
  const wrap = document.createElement('div');
  wrap.className = 'ala-lifecycle';

  lifecycle.forEach((stage, i) => {
    const stageEl = document.createElement('div');
    stageEl.className = 'ala-lifecycle__stage';

    const hdr = document.createElement('div');
    hdr.className = 'ala-lifecycle__stage-header';
    hdr.innerHTML = `<span class="ala-lifecycle__num">${i + 1}</span><span class="ala-lifecycle__stage-name">${stage.stage}</span>`;
    stageEl.appendChild(hdr);

    if (stage.currentStatus) {
      const st = document.createElement('p');
      st.className = 'ala-lifecycle__stage-status';
      st.textContent = stage.currentStatus;
      stageEl.appendChild(st);
    }

    const barWrap = document.createElement('div');
    barWrap.className = 'ala-lifecycle__bar-wrap';
    const barFill = document.createElement('div');
    barFill.className = 'ala-lifecycle__bar-fill';
    barFill.style.width = `${stage.readiness || 0}%`;
    barWrap.appendChild(barFill);
    const pct = document.createElement('span');
    pct.className = 'ala-lifecycle__bar-pct';
    pct.textContent = `${stage.readiness || 0}%`;
    stageEl.appendChild(barWrap);
    stageEl.appendChild(pct);

    if (stage.keyActivities && stage.keyActivities.length) {
      const ul = document.createElement('ul');
      ul.className = 'ala-lifecycle__activities';
      stage.keyActivities.forEach(act => {
        const li = document.createElement('li');
        li.textContent = act;
        ul.appendChild(li);
      });
      stageEl.appendChild(ul);
    }

    wrap.appendChild(stageEl);
    if (i < lifecycle.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'ala-lifecycle__arrow';
      arrow.textContent = '›';
      wrap.appendChild(arrow);
    }
  });
  return wrap;
}

// ── Layout: AI Roles & Capability Planning ────────────────────────────────────
function buildAISkillsAssessmentLayout(section) {
  const b = section.brief || {};
  const isNewFormat = !!(b.arcpConsultantGuidance || (b.projectRoles && b.projectRoles.length));
  return isNewFormat ? buildARCPNewLayout(b) : buildARCPLegacyLayout(b);
}

function buildARCPNewLayout(b) {
  const projectRoles          = b.projectRoles          || [];
  const responsibilityJourney = b.responsibilityJourney || [];
  const capabilityPriorities  = b.capabilityPriorities  || [];
  const workforceStats        = b.workforceStats        || {};

  const PRI_CLASS = { High: 'arcp-pri--high', Medium: 'arcp-pri--medium', Low: 'arcp-pri--low' };

  const wrap = document.createElement('div');
  wrap.className = 'arcp-view';

  // Header: blueprint label + strategic position
  const blueprintLabel = document.createElement('p');
  blueprintLabel.className = 'brief-label';
  blueprintLabel.textContent = 'AI Workforce Blueprint';
  wrap.appendChild(blueprintLabel);

  if (b.strategicPosition) {
    const pos = document.createElement('p');
    pos.className = 'arcp-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // 3-column body
  const body = document.createElement('div');
  body.className = 'arcp-body';

  // ── LEFT (45%): Required Project Roles ──────────────────────────────────
  const leftCol = document.createElement('div');
  leftCol.className = 'arcp-roles-col';
  const leftLbl = document.createElement('p');
  leftLbl.className = 'brief-label';
  leftLbl.textContent = 'Required Project Roles';
  leftCol.appendChild(leftLbl);

  projectRoles.forEach(role => {
    const card = document.createElement('div');
    card.className = 'arcp-role-card';

    const header = document.createElement('div');
    header.className = 'arcp-role-card__header';
    const name = document.createElement('p');
    name.className = 'arcp-role-card__name';
    name.textContent = role.name;
    const pri = document.createElement('span');
    pri.className = `arcp-pri-badge ${PRI_CLASS[role.priority] || 'arcp-pri--medium'}`;
    pri.textContent = (role.priority || 'MEDIUM').toUpperCase();
    header.appendChild(name);
    header.appendChild(pri);
    card.appendChild(header);

    if (role.primaryResponsibility) {
      const respLabel = document.createElement('p');
      respLabel.className = 'arcp-role-card__field-label';
      respLabel.textContent = 'Primary Responsibility';
      card.appendChild(respLabel);
      const resp = document.createElement('p');
      resp.className = 'arcp-role-card__field-value';
      resp.textContent = role.primaryResponsibility;
      card.appendChild(resp);
    }

    if (role.aiCapabilities && role.aiCapabilities.length) {
      const capLabel = document.createElement('p');
      capLabel.className = 'arcp-role-card__field-label';
      capLabel.textContent = 'AI Capability';
      card.appendChild(capLabel);
      const capList = document.createElement('div');
      capList.className = 'arcp-role-card__caps';
      role.aiCapabilities.forEach(cap => {
        const pill = document.createElement('span');
        pill.className = 'arcp-cap-pill';
        pill.textContent = cap;
        capList.appendChild(pill);
      });
      card.appendChild(capList);
    }

    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // ── CENTER (25%): AI Responsibility Journey ──────────────────────────────
  const centerCol = document.createElement('div');
  centerCol.className = 'arcp-journey-col';
  const journeyLbl = document.createElement('p');
  journeyLbl.className = 'brief-label';
  journeyLbl.textContent = 'AI Responsibility Journey';
  centerCol.appendChild(journeyLbl);

  if (responsibilityJourney.length) {
    const chain = document.createElement('div');
    chain.className = 'arcp-journey-chain';
    responsibilityJourney.forEach((role, i) => {
      const node = document.createElement('div');
      node.className = 'arcp-journey-node';
      node.textContent = role;
      chain.appendChild(node);
      if (i < responsibilityJourney.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'arcp-journey-arrow';
        arrow.textContent = '↓';
        chain.appendChild(arrow);
      }
    });
    centerCol.appendChild(chain);
  }
  body.appendChild(centerCol);

  // ── RIGHT (30%): Capability Development Priorities ───────────────────────
  const rightCol = document.createElement('div');
  rightCol.className = 'arcp-priorities-col';
  const rightLbl = document.createElement('p');
  rightLbl.className = 'brief-label';
  rightLbl.textContent = 'Capability Development Priorities';
  rightCol.appendChild(rightLbl);

  if (capabilityPriorities.length) {
    const priList = document.createElement('div');
    priList.className = 'arcp-pri-list';
    capabilityPriorities.forEach(item => {
      const priItem = document.createElement('div');
      priItem.className = 'arcp-pri-item';

      const priHeader = document.createElement('div');
      priHeader.className = 'arcp-pri-item__header';
      const num = document.createElement('span');
      num.className = 'arcp-pri-item__num';
      num.textContent = `Priority ${item.priority}`;
      priItem.appendChild(priHeader);
      priHeader.appendChild(num);

      const addLabeledRow = (label, value, valueCls) => {
        if (!value) return;
        const row = document.createElement('div');
        row.className = 'arcp-pri-item__row';
        const lbl = document.createElement('span');
        lbl.className = 'arcp-pri-item__field-label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = valueCls;
        val.textContent = value;
        row.appendChild(lbl);
        row.appendChild(val);
        priItem.appendChild(row);
      };

      addLabeledRow('Role', item.role, 'arcp-pri-item__role');
      addLabeledRow('Capability', item.capability, 'arcp-pri-item__capability');
      addLabeledRow('Business Outcome', item.businessOutcome, 'arcp-pri-item__outcome');

      priList.appendChild(priItem);
    });
    rightCol.appendChild(priList);
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Stats strip
  const statsData = [
    { label: 'Required Roles',      value: workforceStats.requiredRoles },
    { label: 'Critical Roles',      value: workforceStats.criticalRoles },
    { label: 'AI Capabilities',     value: workforceStats.aiCapabilities },
    { label: 'Implementation Priority', value: workforceStats.implementationPriority },
  ].filter(s => s.value !== undefined && s.value !== null && s.value !== 0 && s.value !== '');

  if (statsData.length) {
    const strip = document.createElement('div');
    strip.className = 'arcp-stats-strip';
    statsData.forEach(s => {
      const cell = document.createElement('div');
      cell.className = 'arcp-stat-cell';
      const val = document.createElement('p');
      val.className = 'arcp-stat-cell__value';
      val.textContent = s.value;
      const lbl = document.createElement('p');
      lbl.className = 'arcp-stat-cell__label';
      lbl.textContent = s.label;
      cell.appendChild(val);
      cell.appendChild(lbl);
      strip.appendChild(cell);
    });
    wrap.appendChild(strip);
  }

  // Consultant Guidance (teal)
  if (b.arcpConsultantGuidance) {
    const guidance = document.createElement('div');
    guidance.className = 'arcp-consultant-guidance';
    guidance.innerHTML = `<span class="arcp-guidance__icon">◆</span><p class="arcp-guidance__text">${b.arcpConsultantGuidance}</p>`;
    wrap.appendChild(guidance);
  }

  // AI Recommendation (amber)
  if (b.arcpAIRecommendation) {
    const rec = document.createElement('div');
    rec.className = 'arcp-ai-recommendation';
    rec.innerHTML = `<span class="arcp-rec__icon">⬡</span><p class="arcp-rec__text">${b.arcpAIRecommendation}</p>`;
    wrap.appendChild(rec);
  }

  // Next Capability footer
  const footer = document.createElement('div');
  footer.className = 'arcp-next-capability';
  const nextLabel = document.createElement('p');
  nextLabel.className = 'arcp-next__label';
  nextLabel.textContent = 'Next Capability';
  const nextName = document.createElement('p');
  nextName.className = 'arcp-next__name';
  nextName.textContent = 'AI Learning & Adoption';
  const nextGoal = document.createElement('p');
  nextGoal.className = 'arcp-next__goal';
  nextGoal.textContent = 'Goal: Design targeted learning programs and adoption strategies to build AI competency across the team.';
  footer.appendChild(nextLabel);
  footer.appendChild(nextName);
  footer.appendChild(nextGoal);
  wrap.appendChild(footer);

  return wrap;
}

function buildARCPLegacyLayout(b) {
  const requiredSkills   = b.requiredSkills        || [];
  const skillsMatrix     = b.skillsMatrix          || [];
  const skillsRecs       = b.skillsRecommendations || [];
  const skillsStats      = b.skillsStats           || {};
  const skillsCatSummary = b.skillsCategorySummary || [];

  const AVAIL_COLOR  = { Available: 'asa-skill--available', Partial: 'asa-skill--partial', Missing: 'asa-skill--missing' };
  const PRI_CLASS    = { High: 'asa-priority--high', Medium: 'asa-priority--medium', Low: 'asa-priority--low' };
  const STATUS_CLASS = { Ready: 'asa-cat--ready', Strong: 'asa-cat--strong', Partial: 'asa-cat--partial', 'Needs Improvement': 'asa-cat--needs' };

  const wrap = document.createElement('div');
  wrap.className = 'asa-view';

  if (b.skillsReadiness) {
    const badge = document.createElement('div');
    badge.className = 'asa-readiness-badge';
    badge.textContent = `SKILLS READINESS: ${b.skillsReadiness}%`;
    wrap.appendChild(badge);
  }
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'asa-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  const body = document.createElement('div');
  body.className = 'asa-body';

  const leftCol = document.createElement('div');
  leftCol.className = 'asa-skills-col';
  const leftLbl = document.createElement('p');
  leftLbl.className = 'brief-label';
  leftLbl.textContent = 'Required Skills';
  leftCol.appendChild(leftLbl);
  requiredSkills.forEach(sk => {
    const card = document.createElement('div');
    card.className = `asa-skill-card ${AVAIL_COLOR[sk.availability] || 'asa-skill--partial'}`;
    const name = document.createElement('p');
    name.className = 'asa-skill-card__name';
    name.textContent = sk.name;
    card.appendChild(name);
    const meta = document.createElement('p');
    meta.className = 'asa-skill-card__meta';
    meta.textContent = `${sk.category} · ${sk.availability}`;
    card.appendChild(meta);
    const pri = document.createElement('span');
    pri.className = `asa-priority ${PRI_CLASS[sk.priority] || 'asa-priority--medium'}`;
    pri.textContent = sk.priority;
    card.appendChild(pri);
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  const centerCol = document.createElement('div');
  centerCol.className = 'asa-matrix-col';
  const matrixLbl = document.createElement('p');
  matrixLbl.className = 'brief-label';
  matrixLbl.textContent = 'Skills Matrix';
  centerCol.appendChild(matrixLbl);
  if (skillsMatrix.length) {
    const matrixWrap = document.createElement('div');
    matrixWrap.className = 'asa-matrix-wrap';
    skillsMatrix.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'asa-matrix-row';
      const catEl = document.createElement('p');
      catEl.className = 'asa-matrix-row__cat';
      catEl.textContent = row.category;
      rowEl.appendChild(catEl);
      const barTrack = document.createElement('div');
      barTrack.className = 'asa-matrix-bar-track';
      const barFill = document.createElement('div');
      barFill.className = 'asa-matrix-bar-fill';
      barFill.style.width = `${row.readiness || 0}%`;
      barTrack.appendChild(barFill);
      rowEl.appendChild(barTrack);
      const counts = document.createElement('p');
      counts.className = 'asa-matrix-row__counts';
      counts.textContent = `Required: ${row.required || 0}  ·  Missing: ${row.missing || 0}`;
      rowEl.appendChild(counts);
      matrixWrap.appendChild(rowEl);
    });
    centerCol.appendChild(matrixWrap);
  }
  body.appendChild(centerCol);

  const rightCol = document.createElement('div');
  rightCol.className = 'asa-recs-col';
  const recsLbl = document.createElement('p');
  recsLbl.className = 'brief-label';
  recsLbl.textContent = 'AI Recommendations';
  rightCol.appendChild(recsLbl);
  skillsRecs.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'asa-rec-item';
    const title = document.createElement('p');
    title.className = 'asa-rec-item__title';
    title.textContent = rec.title;
    item.appendChild(title);
    const meta = document.createElement('p');
    meta.className = 'asa-rec-item__meta';
    meta.innerHTML = `Priority: <span class="asa-priority ${PRI_CLASS[rec.priority] || 'asa-priority--medium'}">${rec.priority || 'Medium'}</span>`;
    item.appendChild(meta);
    if (rec.expectedBenefit) {
      const ben = document.createElement('p');
      ben.className = 'asa-rec-item__benefit';
      ben.textContent = rec.expectedBenefit;
      item.appendChild(ben);
    }
    rightCol.appendChild(item);
  });
  const statsEntries = [
    { label: 'Available', value: skillsStats.available },
    { label: 'Gaps',      value: skillsStats.gaps },
    { label: 'Critical',  value: skillsStats.critical },
  ].filter(e => e.value !== undefined && e.value !== null);
  if (statsEntries.length) {
    const statsBlock = document.createElement('div');
    statsBlock.className = 'asa-stats-block';
    statsEntries.forEach(e => {
      const row = document.createElement('div');
      row.className = 'asa-stat-row';
      const lbl = document.createElement('span');
      lbl.className = 'asa-stat-row__label';
      lbl.textContent = `${e.label}:`;
      const val = document.createElement('span');
      val.className = 'asa-stat-row__value';
      val.textContent = e.value;
      row.appendChild(lbl); row.appendChild(val);
      statsBlock.appendChild(row);
    });
    rightCol.appendChild(statsBlock);
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  if (skillsCatSummary.some(c => c.status)) {
    const sumLbl = document.createElement('p');
    sumLbl.className = 'brief-label';
    sumLbl.textContent = 'Skills Category Summary';
    wrap.appendChild(sumLbl);
    const grid = document.createElement('div');
    grid.className = 'asa-summary-grid';
    skillsCatSummary.forEach(c => {
      const cell = document.createElement('div');
      cell.className = `asa-summary-cell ${STATUS_CLASS[c.status] || ''}`;
      const catLbl = document.createElement('p');
      catLbl.className = 'asa-summary-cell__label';
      catLbl.textContent = c.category;
      cell.appendChild(catLbl);
      if (c.status) {
        const val = document.createElement('p');
        val.className = 'asa-summary-cell__value';
        val.textContent = c.status;
        cell.appendChild(val);
      }
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
  }
  return wrap;
}

// ── Layout: AI Learning & Adoption ────────────────────────────────────────────
function buildAILearningAdoptionLayout(section) {
  const b = section.brief || {};
  const isNewFormat = !!(b.alaConsultantGuidance || (b.roleLearningJourney && b.roleLearningJourney.length));
  return isNewFormat ? buildALANewLayout(section) : buildALALegacyLayout(section);
}

function buildALANewLayout(section) {
  const b                  = section.brief || {};
  const roleLearning       = b.roleLearningJourney  || [];
  const adoptionRoadmap    = b.adoptionRoadmap       || [];
  const enablementActions  = b.enablementActions     || [];
  const enablementSummary  = b.enablementSummary     || {};
  const learningResources  = b.learningResources     || [];

  const IMPACT_CLASS = { High: 'alan-impact--high', Medium: 'alan-impact--medium', Low: 'alan-impact--low' };
  const PRI_CLASS    = { High: 'alan-pri--high',    Medium: 'alan-pri--medium',    Low: 'alan-pri--low' };

  const wrap = document.createElement('div');
  wrap.className = 'alan-view';

  // Top badge
  const badge = document.createElement('div');
  badge.className = 'alan-badge';
  badge.textContent = 'AI ENABLEMENT PLAN';
  wrap.appendChild(badge);

  // Strategic Position
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'alan-position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  const body = document.createElement('div');
  body.className = 'alan-body';

  // ── LEFT (45%): Role-Based Learning Journey ───────────────────────────────
  const leftCol = document.createElement('div');
  leftCol.className = 'alan-roles-col';
  const leftLbl = document.createElement('p');
  leftLbl.className = 'brief-label';
  leftLbl.textContent = 'Role-Based Learning Journey';
  leftCol.appendChild(leftLbl);
  roleLearning.forEach(r => {
    const card = document.createElement('div');
    card.className = 'alan-role-card';

    const roleName = document.createElement('p');
    roleName.className = 'alan-role-card__name';
    roleName.textContent = r.role;
    card.appendChild(roleName);

    if (r.learningPath && r.learningPath.length) {
      const pathLbl = document.createElement('p');
      pathLbl.className = 'alan-role-card__path-label';
      pathLbl.textContent = 'Learning Path';
      card.appendChild(pathLbl);
      const pills = document.createElement('div');
      pills.className = 'alan-role-card__pills';
      r.learningPath.forEach(topic => {
        const pill = document.createElement('span');
        pill.className = 'alan-role-card__pill';
        pill.textContent = topic;
        pills.appendChild(pill);
      });
      card.appendChild(pills);
    }

    if (r.businessOutcome) {
      const outLbl = document.createElement('p');
      outLbl.className = 'alan-role-card__outcome-label';
      outLbl.textContent = 'Business Outcome';
      card.appendChild(outLbl);
      const outText = document.createElement('p');
      outText.className = 'alan-role-card__outcome';
      outText.textContent = r.businessOutcome;
      card.appendChild(outText);
    }
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // ── CENTER (20%): AI Adoption Roadmap ─────────────────────────────────────
  const centerCol = document.createElement('div');
  centerCol.className = 'alan-roadmap-col';
  const centerLbl = document.createElement('p');
  centerLbl.className = 'brief-label';
  centerLbl.textContent = 'AI Adoption Roadmap';
  centerCol.appendChild(centerLbl);
  adoptionRoadmap.forEach((st, idx) => {
    const stageEl = document.createElement('div');
    stageEl.className = 'alan-roadmap-stage';
    const stageName = document.createElement('p');
    stageName.className = 'alan-roadmap-stage__name';
    stageName.textContent = st.stage;
    stageEl.appendChild(stageName);
    if (st.goal) {
      const goalRow = document.createElement('div');
      goalRow.className = 'alan-roadmap-stage__row';
      const goalLbl = document.createElement('span');
      goalLbl.className = 'alan-roadmap-stage__field-label';
      goalLbl.textContent = 'Goal';
      const goalVal = document.createElement('span');
      goalVal.className = 'alan-roadmap-stage__value';
      goalVal.textContent = st.goal;
      goalRow.appendChild(goalLbl);
      goalRow.appendChild(goalVal);
      stageEl.appendChild(goalRow);
    }
    if (st.expectedOutput) {
      const outRow = document.createElement('div');
      outRow.className = 'alan-roadmap-stage__row';
      const outLbl = document.createElement('span');
      outLbl.className = 'alan-roadmap-stage__field-label';
      outLbl.textContent = 'Output';
      const outVal = document.createElement('span');
      outVal.className = 'alan-roadmap-stage__value';
      outVal.textContent = st.expectedOutput;
      outRow.appendChild(outLbl);
      outRow.appendChild(outVal);
      stageEl.appendChild(outRow);
    }
    centerCol.appendChild(stageEl);
    if (idx < adoptionRoadmap.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'alan-roadmap-arrow';
      arrow.textContent = '↓';
      centerCol.appendChild(arrow);
    }
  });
  body.appendChild(centerCol);

  // ── RIGHT (35%): AI Enablement Actions ───────────────────────────────────
  const rightCol = document.createElement('div');
  rightCol.className = 'alan-actions-col';
  const rightLbl = document.createElement('p');
  rightLbl.className = 'brief-label';
  rightLbl.textContent = 'AI Enablement Actions';
  rightCol.appendChild(rightLbl);
  enablementActions.forEach(a => {
    const card = document.createElement('div');
    card.className = 'alan-action-card';
    const actionTitle = document.createElement('p');
    actionTitle.className = 'alan-action-card__action';
    actionTitle.textContent = a.action;
    card.appendChild(actionTitle);

    const rows = [
      { label: 'Owner',           value: a.owner },
      { label: 'Business Impact', value: a.businessImpact, cls: IMPACT_CLASS[a.businessImpact] },
      { label: 'Timeline',        value: a.timeline },
    ];
    rows.forEach(({ label, value, cls }) => {
      if (!value) return;
      const row = document.createElement('div');
      row.className = 'alan-action-card__row';
      const lbl = document.createElement('span');
      lbl.className = 'alan-action-card__field-label';
      lbl.textContent = `${label}:`;
      row.appendChild(lbl);
      const val = document.createElement('span');
      val.className = cls ? `alan-action-card__value ${cls}` : 'alan-action-card__value';
      val.textContent = value;
      row.appendChild(val);
      card.appendChild(row);
    });
    rightCol.appendChild(card);
  });
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // ── Bottom Strip: Capability Development Summary ──────────────────────────
  const summaryStats = [
    { label: 'Project Roles',       value: enablementSummary.projectRoles },
    { label: 'Learning Paths',      value: enablementSummary.learningPaths },
    { label: 'AI Tools',            value: enablementSummary.aiTools },
    { label: 'Adoption Activities', value: enablementSummary.adoptionActivities },
  ].filter(e => e.value !== undefined && e.value !== null);
  if (summaryStats.length) {
    const stripLbl = document.createElement('p');
    stripLbl.className = 'brief-label';
    stripLbl.textContent = 'Capability Development Summary';
    wrap.appendChild(stripLbl);
    const strip = document.createElement('div');
    strip.className = 'alan-summary-strip';
    summaryStats.forEach(e => {
      const cell = document.createElement('div');
      cell.className = 'alan-summary-cell';
      const val = document.createElement('p');
      val.className = 'alan-summary-cell__value';
      val.textContent = e.value;
      const lbl = document.createElement('p');
      lbl.className = 'alan-summary-cell__label';
      lbl.textContent = e.label;
      cell.appendChild(val);
      cell.appendChild(lbl);
      strip.appendChild(cell);
    });
    wrap.appendChild(strip);
  }

  // ── Recommended Learning Resources ───────────────────────────────────────
  if (learningResources.length) {
    const resLbl = document.createElement('p');
    resLbl.className = 'brief-label';
    resLbl.textContent = 'Recommended Learning Resources';
    wrap.appendChild(resLbl);
    const resList = document.createElement('div');
    resList.className = 'alan-resources';
    learningResources.forEach(r => {
      const item = document.createElement('div');
      item.className = 'alan-resource-item';
      const name = document.createElement('p');
      name.className = 'alan-resource-item__name';
      name.textContent = r.name;
      item.appendChild(name);
      const metaRow = document.createElement('div');
      metaRow.className = 'alan-resource-item__meta';
      if (r.audience) {
        const audSpan = document.createElement('span');
        audSpan.className = 'alan-resource-item__audience';
        audSpan.textContent = r.audience;
        metaRow.appendChild(audSpan);
      }
      if (r.priority) {
        const priSpan = document.createElement('span');
        priSpan.className = `alan-resource-item__priority ${PRI_CLASS[r.priority] || 'alan-pri--medium'}`;
        priSpan.textContent = r.priority;
        metaRow.appendChild(priSpan);
      }
      item.appendChild(metaRow);
      resList.appendChild(item);
    });
    wrap.appendChild(resList);
  }

  // ── Consultant Guidance ───────────────────────────────────────────────────
  if (b.alaConsultantGuidance) {
    const cg = document.createElement('div');
    cg.className = 'alan-consultant-guidance';
    cg.innerHTML = `<span class="alan-cg__icon">◆</span><p class="alan-cg__text">${b.alaConsultantGuidance}</p>`;
    wrap.appendChild(cg);
  }

  // ── AI Recommendation ─────────────────────────────────────────────────────
  if (b.alaAIRecommendation) {
    const ar = document.createElement('div');
    ar.className = 'alan-ai-recommendation';
    ar.innerHTML = `<span class="alan-ar__icon">⬡</span><p class="alan-ar__text">${b.alaAIRecommendation}</p>`;
    wrap.appendChild(ar);
  }

  return wrap;
}

function buildALALegacyLayout(section) {
  const b                    = section.brief || {};
  const learningPillars      = b.learningPillars          || [];
  const adoptionLifecycle    = b.adoptionLifecycle         || [];
  const adoptionRecs         = b.adoptionRecommendations   || [];
  const adoptionStats        = b.adoptionStats             || {};
  const adoptionSummary      = b.adoptionReadinessSummary  || [];
  const leadershipQ          = b.leadershipValidation?.context || '';

  const PILLAR_CLASS  = { Ready: 'ala-pillar--ready', 'In Progress': 'ala-pillar--progress', 'Not Started': 'ala-pillar--notstarted' };
  const PRI_CLASS     = { High: 'ala-priority--high', Medium: 'ala-priority--medium', Low: 'ala-priority--low' };
  const STATUS_CLASS  = { Ready: 'ala-sum--ready', 'In Progress': 'ala-sum--progress', Emerging: 'ala-sum--emerging', Developing: 'ala-sum--developing' };

  const wrap = document.createElement('div');
  wrap.className = 'ala-view';

  if (b.adoptionReadiness) {
    const badge = document.createElement('div');
    badge.className = 'ala-readiness-badge';
    badge.textContent = `ADOPTION READINESS: ${b.adoptionReadiness}%`;
    wrap.appendChild(badge);
  }
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'ala-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  const body = document.createElement('div');
  body.className = 'ala-body';

  const leftCol = document.createElement('div');
  leftCol.className = 'ala-pillars-col';
  const leftLbl = document.createElement('p');
  leftLbl.className = 'brief-label';
  leftLbl.textContent = 'Learning Pillars';
  leftCol.appendChild(leftLbl);
  if (learningPillars.length) {
    learningPillars.forEach(pillar => {
      const card = document.createElement('div');
      card.className = `ala-pillar-card ${PILLAR_CLASS[pillar.status] || 'ala-pillar--notstarted'}`;
      const name = document.createElement('p');
      name.className = 'ala-pillar-card__name';
      name.textContent = pillar.name;
      card.appendChild(name);
      if (pillar.description) {
        const desc = document.createElement('p');
        desc.className = 'ala-pillar-card__desc';
        desc.textContent = pillar.description;
        card.appendChild(desc);
      }
      const statusEl = document.createElement('span');
      statusEl.className = 'ala-pillar-card__status';
      statusEl.textContent = pillar.status || 'Not Started';
      card.appendChild(statusEl);
      leftCol.appendChild(card);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'ala-empty';
    empty.textContent = 'Learning pillars will appear after generation.';
    leftCol.appendChild(empty);
  }
  body.appendChild(leftCol);

  const centerCol = document.createElement('div');
  centerCol.className = 'ala-lifecycle-col';
  const lifecycleLbl = document.createElement('p');
  lifecycleLbl.className = 'brief-label';
  lifecycleLbl.textContent = 'Adoption Lifecycle';
  centerCol.appendChild(lifecycleLbl);
  const lifecycleWrap = document.createElement('div');
  lifecycleWrap.className = 'ala-lifecycle-wrap';
  lifecycleWrap.appendChild(buildAdoptionLifecycleDiagram(adoptionLifecycle));
  centerCol.appendChild(lifecycleWrap);
  body.appendChild(centerCol);

  const rightCol = document.createElement('div');
  rightCol.className = 'ala-recs-col';
  const recsLbl = document.createElement('p');
  recsLbl.className = 'brief-label';
  recsLbl.textContent = 'AI Recommendations';
  rightCol.appendChild(recsLbl);
  if (adoptionRecs.length) {
    const recsList = document.createElement('div');
    recsList.className = 'ala-recs-list';
    adoptionRecs.forEach(rec => {
      const item = document.createElement('div');
      item.className = 'ala-rec-item';
      const title = document.createElement('p');
      title.className = 'ala-rec-item__title';
      title.textContent = rec.title;
      item.appendChild(title);
      const meta = document.createElement('p');
      meta.className = 'ala-rec-item__meta';
      meta.innerHTML = `Priority: <span class="ala-priority ${PRI_CLASS[rec.priority] || 'ala-priority--medium'}">${rec.priority || 'Medium'}</span>`;
      item.appendChild(meta);
      if (rec.expectedOutcome) {
        const out = document.createElement('p');
        out.className = 'ala-rec-item__outcome';
        out.textContent = rec.expectedOutcome;
        item.appendChild(out);
      }
      recsList.appendChild(item);
    });
    rightCol.appendChild(recsList);
  }
  const statsEntries = [
    { label: 'Teams Trained', value: adoptionStats.teamsTrained },
    { label: 'Tools Adopted', value: adoptionStats.toolsAdopted },
    { label: 'Adoption Rate', value: adoptionStats.adoptionRate },
  ].filter(e => e.value !== undefined && e.value !== null && e.value !== '');
  if (statsEntries.length) {
    const statsBlock = document.createElement('div');
    statsBlock.className = 'ala-stats-block';
    statsEntries.forEach(e => {
      const row = document.createElement('div');
      row.className = 'ala-stat-row';
      const lbl = document.createElement('span');
      lbl.className = 'ala-stat-row__label';
      lbl.textContent = `${e.label}:`;
      const val = document.createElement('span');
      val.className = 'ala-stat-row__value';
      val.textContent = e.value;
      row.appendChild(lbl); row.appendChild(val);
      statsBlock.appendChild(row);
    });
    rightCol.appendChild(statsBlock);
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  if (adoptionSummary.some(c => c.status)) {
    const sumLbl = document.createElement('p');
    sumLbl.className = 'brief-label';
    sumLbl.textContent = 'Adoption Readiness Summary';
    wrap.appendChild(sumLbl);
    const grid = document.createElement('div');
    grid.className = 'ala-summary-grid';
    adoptionSummary.forEach(c => {
      const cell = document.createElement('div');
      cell.className = `ala-summary-cell ${STATUS_CLASS[c.status] || ''}`;
      const catLbl = document.createElement('p');
      catLbl.className = 'ala-summary-cell__label';
      catLbl.textContent = c.category;
      cell.appendChild(catLbl);
      if (c.status) {
        const val = document.createElement('p');
        val.className = 'ala-summary-cell__value';
        val.textContent = c.status;
        cell.appendChild(val);
      }
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
  }

  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'ala-leadership';
    footer.innerHTML = `<span class="ala-leadership__icon">?</span><p class="ala-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }
  return wrap;
}

function buildSectionCard(blueprint, cap, section) {
  const card = document.createElement('div');
  card.className = 'bp-section';
  card.dataset.sectionTitle = section.title;

  // Header
  // "Refine with AI Assistant" is a capability-level action only (see the header
  // built in renderBlueprintContent) — sections no longer carry their own refine
  // button. Every KB capability file also opens with a self-titled overview pillar
  // ("# 1. <Capability Name>"); when a section's title matches its parent capability's
  // name, this IS that overview pillar, so its title is skipped as redundant too.
  const isSelfTitled = resolveCapName(section.title) === resolveCapName(cap.capabilityName);
  if (!isSelfTitled) {
    const header = document.createElement('div');
    header.className = 'bp-section__header';
    header.innerHTML = `<h3 class="bp-section__title">${resolveCapName(section.title)}</h3>`;
    card.appendChild(header);
  }

  // Route to the correct renderer based on active view mode
  if (BLUEPRINT_VIEW_MODE === 'essay') {
    card.appendChild(buildEssayBlock(section));
  } else if (BLUEPRINT_VIEW_MODE === 'pm') {
    card.appendChild(buildBriefGrid(section));
  } else {
    // CTO view: route by section title to the matching template renderer.
    // Routing on title (not data presence) ensures the correct layout is always
    // used regardless of whether extras were generated, avoiding brief-grid fallback
    // which includes the Leadership Validation cell not needed in CTO style.
    if (section.title === 'Vision') {
      card.appendChild(buildVisionLayout(section));
    } else if (section.title === 'Alignment') {
      card.appendChild(buildAlignmentLayout(section));
    } else if (section.title === 'Commitment') {
      card.appendChild(buildCommitmentLayout(section));
    } else if (section.title === 'Business-Led Roadmap') {
      card.appendChild(buildBusinessRoadmapLayout(section));
    } else if (section.title === 'Strategic Roadmap Design' || section.title === 'Strategic Roadmap') {
      card.appendChild(buildStrategicRoadmapLayout(section));
    } else if (section.title === 'Solution-Centric Organization') {
      card.appendChild(buildSolutionCentricLayout(section));
    } else if (section.title === 'Cross-Functional Delivery Teams') {
      card.appendChild(buildCrossFunctionalLayout(section));
    } else if (section.title === 'End-to-End Ownership') {
      card.appendChild(buildEndToEndOwnershipLayout(section));
    } else if (section.title === 'Financial Performance') {
      card.appendChild(buildFinancialPerformanceLayout(section));
    } else if (section.title === 'Operational Excellence') {
      card.appendChild(buildOperationalExcellenceLayout(section));
    } else if (section.title === 'Customer Value') {
      card.appendChild(buildCustomerValueLayout(section));
    } else if (section.title === 'Data Privacy & Security') {
      card.appendChild(buildDataPrivacyLayout(section));
    } else if (section.title === 'Ethical AI Guidelines') {
      card.appendChild(buildEthicalAILayout(section));
    } else if (section.title === 'Model Validation & Monitoring') {
      card.appendChild(buildModelValidationLayout(section));
    } else if (section.title === 'Regulatory Compliance') {
      card.appendChild(buildRegulatoryComplianceLayout(section));
    } else if (section.title === 'Trust & Adoption') {
      card.appendChild(buildTrustAdoptionLayout(section));
    } else if (section.title === 'AI Opportunity Discovery') {
      card.appendChild(buildOpportunityDiscoveryView(section));
    } else if (section.title === 'AI Use Case Classification') {
      card.appendChild(buildClassificationView(section));
    } else if (section.title === 'Business Value Definition') {
      card.appendChild(buildBusinessValueDefinitionView(section));
    } else if (section.title === 'AI Implementation Prioritization' || section.title === 'AI Use Case Prioritization') {
      card.appendChild(buildPrioritizationView(section));
    } else if (section.title === 'Critical Data Identification') {
      card.appendChild(buildCriticalDataLayout(section));
    } else if (section.title === 'AI Data Preparation') {
      card.appendChild(buildAIDataPreparationLayout(section));
    } else if (section.title === 'Data Architecture Enablement') {
      card.appendChild(buildDataArchitectureLayout(section));
    } else if (section.title === 'System Integration & Architecture') {
      card.appendChild(buildSystemIntegrationLayout(section));
    } else if (section.title === 'AI Platform Readiness') {
      card.appendChild(buildPlatformReadinessLayout(section));
    } else if (section.title === 'AI Compute & Deployment Strategy') {
      card.appendChild(buildComputeDeploymentLayout(section));
    } else if (section.title === 'AI Roles & Capability Planning' || section.title === 'AI Skills Assessment') {
      card.appendChild(buildAISkillsAssessmentLayout(section));
    } else if (section.title === 'AI Learning & Adoption') {
      card.appendChild(buildAILearningAdoptionLayout(section));
    } else {
      card.appendChild(buildBriefGrid(section));
    }
  }

  // Essay (secondary, hidden by default)
  if (section.content) {
    const toggle = document.createElement('button');
    toggle.className = 'bp-essay-toggle';
    toggle.textContent = '▸ Show full analysis';
    const essay = document.createElement('p');
    essay.className = 'bp-essay-content';
    essay.textContent = section.content;
    toggle.addEventListener('click', () => {
      const open = essay.classList.toggle('is-visible');
      toggle.textContent = open ? '▾ Hide full analysis' : '▸ Show full analysis';
    });
    card.appendChild(toggle);
    card.appendChild(essay);
  }

  return card;
}

function buildBriefGrid(section) {
  const b = section.brief || {};
  const grid = document.createElement('div');
  grid.className = 'brief-grid';
  grid.dataset.sectionTitle = section.title;

  // Strategic Position (full width)
  const posCell = document.createElement('div');
  posCell.className = 'brief-cell brief-cell--position';
  posCell.innerHTML = `
    <p class="brief-label">Strategic Position</p>
    <p class="brief-position-text">${b.strategicPosition || '—'}</p>
  `;
  grid.appendChild(posCell);

  // Priority Actions
  const actCell = document.createElement('div');
  actCell.className = 'brief-cell brief-cell--actions';
  actCell.innerHTML = `
    <p class="brief-label">Priority Actions (90 days)</p>
    <ul class="brief-list">
      ${(b.priorityActions || []).map(a => `<li>${a}</li>`).join('') || '<li>—</li>'}
    </ul>
  `;
  grid.appendChild(actCell);

  // Success Metrics
  const metCell = document.createElement('div');
  metCell.className = 'brief-cell brief-cell--metrics';
  metCell.innerHTML = `
    <p class="brief-label">Success Metrics</p>
    <ul class="brief-list">
      ${(b.successMetrics || []).map(m => `<li>${m}</li>`).join('') || '<li>—</li>'}
    </ul>
  `;
  grid.appendChild(metCell);

  // Leadership Validation (full width)
  const lv         = b.leadershipValidation || {};
  const lvStatus   = lv.status || 'Not Yet Validated';
  const lvContext  = lv.context || '';
  const badgeClass = lvStatus === 'Approved'  ? 'brief-validation-badge--approved'
                   : lvStatus === 'In Review' ? 'brief-validation-badge--review'
                   : 'brief-validation-badge--pending';
  const badgeDot   = lvStatus === 'Approved'  ? '✓'
                   : lvStatus === 'In Review' ? '◐'
                   : '○';

  const validationCell = document.createElement('div');
  validationCell.className = 'brief-cell brief-cell--validation';
  validationCell.innerHTML = `
    <div>
      <p class="brief-label">Leadership Validation</p>
      <p class="brief-validation-context">${lvContext || '—'}</p>
    </div>
    <span class="brief-validation-badge ${badgeClass}" aria-label="Validation status: ${lvStatus}">
      ${badgeDot} ${lvStatus}
    </span>
  `;
  grid.appendChild(validationCell);

  return grid;
}

// ── Capability regeneration ───────────────────────────────────────────────────

async function triggerCapabilityRegeneration(cap, btn) {
  btn.disabled = true;
  btn.textContent = 'Regenerating…';

  // Optimistically show in-progress state
  const dom = currentDomain();
  const capIdx = (dom?.capabilities || []).findIndex(c => c.capabilityId === cap.capabilityId);
  if (capIdx >= 0 && dom) {
    dom.capabilities[capIdx].status = 'in-progress';
    renderCapabilityTabs(_blueprint);
  }

  const domainId = currentDomain()?.domainId;
  try {
    const resp = await fetch(
      `${API_BASE}/strategy-canvas/transformation-blueprint/${_blueprint._id}/domain/${domainId}/capability/${cap.capabilityId}/regenerate`,
      { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } }
    );
    if (resp.status === 401) { window.handleSessionExpired(); return; }
    if (!resp.ok) {
      const { error } = await resp.json().catch(() => ({}));
      throw new Error(error || 'Failed to start regeneration.');
    }

    await pollForCapabilityCompletion(cap.capabilityId);

  } catch (err) {
    console.error('[workspace] Regeneration failed:', err.message);
    if (capIdx >= 0 && dom) {
      dom.capabilities[capIdx].status = 'error';
      renderCapabilityTabs(_blueprint);
      renderBlueprintContent(_blueprint, capIdx);
    }
  }
}

async function pollForCapabilityCompletion(capabilityId) {
  const maxAttempts = 90; // 3 minutes at 2 s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));

    try {
      const resp = await fetch(`${API_BASE}/strategy-canvas/transformation-blueprint`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) continue;

      const freshBp = await resp.json();
      let freshCap = null;
      for (const dom of (freshBp.domains || [])) {
        freshCap = (dom.capabilities || []).find(c => c.capabilityId === capabilityId);
        if (freshCap) break;
      }

      if (freshCap && freshCap.status !== 'in-progress' && freshCap.status !== 'pending' && freshCap.status !== 'generating') {
        await augmentBlueprintWithMissingDomains(freshBp);
        stripRetiredCapabilities(freshBp);
        _blueprint = freshBp;
        renderHeader(freshBp);
        renderDomainTabs(freshBp);
        renderCapabilityTabs(freshBp);
        renderBlueprintContent(freshBp, _selectedCapIndex);
        return;
      }
    } catch {
      // transient network error — keep polling
    }
  }
}

// ── AI Assistant panel ────────────────────────────────────────────────────────

function initAssistantButton() {
  const btn = document.getElementById('btn-ai-assistant');
  if (btn) btn.addEventListener('click', toggleAssistant);

  const closeBtn = document.getElementById('btn-close-assistant');
  if (closeBtn) closeBtn.addEventListener('click', () => setAssistantOpen(false));

  const newBlueprintBtn = document.getElementById('btn-new-blueprint');
  if (newBlueprintBtn) newBlueprintBtn.addEventListener('click', () => {
    // New blueprints start from the landing-page prompt box
    window.location.href = '/cob.html';
  });

  const exportBtn = document.getElementById('btn-export-pdf');
  if (exportBtn) exportBtn.addEventListener('click', handleExportPDF);
}

async function handleExportPDF() {
  const btn    = document.getElementById('btn-export-pdf');
  const label  = document.getElementById('btn-export-pdf-text');
  const loader = document.getElementById('btn-export-pdf-loader');

  if (!btn || btn.disabled) return;

  btn.disabled      = true;
  label.style.display  = 'none';
  loader.style.display = '';

  try {
    const res = await fetch(`${API_BASE}/strategy-canvas/company-blueprint/export-pdf`, {
      method:  'GET',
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const blob        = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const nameMatch   = disposition.match(/filename="([^"]+)"/);
    const filename    = nameMatch ? nameMatch[1] : 'AI_Strategy_Blueprint.pdf';

    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error('[exportPDF]', err.message);
    alert('PDF export failed. Please try again.');
  } finally {
    btn.disabled         = false;
    label.style.display  = '';
    loader.style.display = 'none';
  }
}

function toggleAssistant() {
  setAssistantOpen(!_assistantOpen);
}

function setAssistantOpen(open) {
  _assistantOpen = open;
  const panel   = document.getElementById('ai-panel');
  const btn     = document.getElementById('btn-ai-assistant');
  const wsBody  = document.getElementById('ws-body');
  const sidebar = document.getElementById('domain-nav');

  if (panel)   panel.style.display = open ? '' : 'none';
  if (btn)     btn.classList.toggle('is-open', open);
  if (wsBody)  wsBody.classList.toggle('assistant-open', open);
  if (sidebar) sidebar.classList.toggle('ws-domain-sidebar--collapsed', open);

  if (open) updateAssistantContext();
}

function updateAssistantContext() {
  const ctxEl = document.getElementById('ai-panel-context');
  if (!ctxEl) return;
  ctxEl.innerHTML = 'Discuss your <strong>Company AI Strategy</strong> — ask questions, explore options, or refine any section.';
  ctxEl.style.display = '';
}

// Capability-level refine: opens the panel and pre-fills a starting prompt without
// auto-sending, since a whole-capability review may span multiple sections.
function openAssistantForCapability(capName) {
  _refineTargetSection = null;
  setAssistantOpen(true);
  setTimeout(() => {
    const input = document.getElementById('ai-chat-input');
    if (input) {
      input.value = `Please review "${capName}" and suggest specific improvements.`;
      input.focus();
    }
  }, 80);
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

function initChat() {
  const form     = document.getElementById('ai-chat-form');
  const retryBtn = document.getElementById('ai-chat-retry');
  const log      = document.getElementById('ai-chat-messages');

  if (form) form.addEventListener('submit', handleChatSubmit);

  // Enter sends; Shift+Enter inserts a newline (matches ChatGPT / Claude behaviour)
  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!_isSending && input.value.trim()) handleChatSubmit(null, input.value.trim());
      }
    });
  }

  if (retryBtn) retryBtn.addEventListener('click', () => {
    const inp = document.getElementById('ai-chat-input');
    if (inp?.value?.trim()) handleChatSubmit(null, inp.value.trim());
  });

  // Delegate Accept / Discard clicks — card is dynamically created inside the log
  if (log) {
    log.addEventListener('click', (e) => {
      if (e.target.id === 'ai-suggestion-accept')  acceptSuggestion();
      if (e.target.id === 'ai-suggestion-discard') clearSuggestionCard();
    });
  }
}

async function handleChatSubmit(e, prefillText) {
  if (e) e.preventDefault();
  if (_isSending) return;

  const input = document.getElementById('ai-chat-input');
  const message = prefillText || input?.value?.trim();
  if (!message) return;

  if (input) input.value = '';
  clearSuggestionCard();
  setErrorVisible(false);

  appendChatMessage('user', message);
  _chatHistory.push({ role: 'user', content: message });
  saveChatHistory();
  setChatSending(true);

  const cap = currentCap();
  if (!cap) return;

  // Build a minimal blueprint summary for the advisor
  const blueprintSummary = buildBlueprintSummary(_blueprint, _selectedCapIndex);

  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/blueprint-suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        capabilityId:        cap.capabilityId,
        blueprint:           blueprintSummary,
        sectionTitle:        cap.capabilityName, // capability-level context
        currentContent:      getCurrentCapabilityContent(cap),
        request:             message,
        automotiveBlueprint: '',
        conversationHistory: _chatHistory.slice(-10),
        companyMemory:       {},
        allCapabilitySections: getAllCapabilitySections(_blueprint),
      }),
    });

    if (resp.status === 401) { window.handleSessionExpired(); return; }
    if (!resp.ok) {
      const { error } = await resp.json().catch(() => ({}));
      throw new Error(error || 'AI request failed.');
    }

    const result = await resp.json();
    setChatSending(false);

    if (result.mode === 'conversation') {
      const text = result.response || '';
      appendChatMessage('assistant', text);
      _chatHistory.push({ role: 'assistant', content: text });
      saveChatHistory();
    } else if (result.mode === 'blueprint') {
      const s = result.suggestion || {};
      showSuggestionCard(cap.capabilityName, s.suggestedRevision || '', s.whyThisHelps || '', _refineTargetSection);
      _chatHistory.push({ role: 'assistant', content: s.suggestedRevision || '' });
      saveChatHistory();
    } else if (result.mode === 'blueprint-multi') {
      const updates = result.updates || [];
      const summary = result.summary || '';
      await showMultiUpdateResult(summary, updates, cap);
      _chatHistory.push({ role: 'assistant', content: summary });
      saveChatHistory();
    }

  } catch (err) {
    setChatSending(false);
    setErrorVisible(true, err.message);
    // Errors are transient — not persisted so they don't re-appear on refresh
  }
}

function buildBlueprintSummary(blueprint, capIdx) {
  const dom = (blueprint.domains || [])[_selectedDomainIdx];
  const cap = (dom?.capabilities || [])[capIdx];
  if (!cap) return {};
  return {
    capabilityName: cap.capabilityName,
    sections: (cap.sections || []).map(s => ({
      title:   s.title,
      content: s.brief?.strategicPosition || s.content || '',
    })),
  };
}

function getCurrentCapabilityContent(cap) {
  return (cap.sections || [])
    .map(s => `${s.title}:\n${s.brief?.strategicPosition || s.content || ''}`)
    .join('\n\n');
}

function getCapabilitySections(cap) {
  return (cap.sections || []).map(s => ({
    title:             s.title,
    strategicPosition: s.brief?.strategicPosition || s.content || '',
  }));
}

function getAllCapabilitySections(blueprint) {
  return (blueprint.domains || []).flatMap(dom =>
    (dom.capabilities || []).map(cap => ({
      capabilityId:   cap.capabilityId,
      capabilityName: cap.capabilityName,
      sections: (cap.sections || []).map(s => ({
        title:             s.title,
        strategicPosition: s.brief?.strategicPosition || s.content || '',
      })),
    }))
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────
// Card is appended directly into the chat log so it scrolls with the conversation
// and the Accept / Discard buttons are always visible without extra scrolling.

function showSuggestionCard(capabilityName, text, rationale, sectionTitle) {
  clearSuggestionCard(); // remove any existing card first (also nulls _pendingSuggestion)

  _pendingSuggestion = { capabilityName, text, rationale, sectionTitle: sectionTitle || null };

  const log = document.getElementById('ai-chat-messages');
  if (!log) return;

  const card = document.createElement('div');
  card.id        = 'ai-suggestion-card';
  card.className = 'ai-suggestion-card';

  const label = document.createElement('p');
  label.className   = 'ai-suggestion-card__label';
  label.textContent = 'Suggested revision';

  const textEl = document.createElement('p');
  textEl.className   = 'ai-suggestion-card__text';
  textEl.textContent = text;

  const rationaleEl = document.createElement('p');
  rationaleEl.className   = 'ai-suggestion-card__rationale';
  rationaleEl.textContent = rationale;

  const actions = document.createElement('div');
  actions.className = 'ai-suggestion-card__actions';
  actions.innerHTML =
    '<button id="ai-suggestion-accept"  class="ai-suggestion-btn ai-suggestion-btn--accept">Accept &amp; Replace</button>' +
    '<button id="ai-suggestion-discard" class="ai-suggestion-btn ai-suggestion-btn--discard">Discard</button>';

  card.appendChild(label);
  card.appendChild(textEl);
  card.appendChild(rationaleEl);
  card.appendChild(actions);
  log.appendChild(card);

  // Scroll so the card and its buttons are fully visible
  log.scrollTop = log.scrollHeight;
}

function clearSuggestionCard() {
  _pendingSuggestion = null;
  document.getElementById('ai-suggestion-card')?.remove();
}

function appendProgressMessage(text) {
  const log = document.getElementById('ai-chat-messages');
  if (!log) return null;
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg--progress';
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function resolveProgressMessage(el, finalText) {
  if (!el) return;
  el.textContent = finalText;
  el.className = 'chat-msg chat-msg--progress chat-msg--progress-done';
  const log = document.getElementById('ai-chat-messages');
  if (log) log.scrollTop = log.scrollHeight;
}

async function showMultiUpdateResult(summary, updates, currentCap) {
  if (!updates.length || !_blueprint) return;

  // Resolve each update to its target domain + capability + section.
  // Case-insensitive section title matching tolerates minor AI variation.
  // Skip any update where the capabilityId or sectionTitle can't be matched.
  const resolvedUpdates = updates.map(u => {
    let targetDom = null;
    let targetCap = null;
    if (u.capabilityId) {
      for (const dom of (_blueprint.domains || [])) {
        const found = (dom.capabilities || []).find(c => c.capabilityId === u.capabilityId);
        if (found) { targetDom = dom; targetCap = found; break; }
      }
    } else {
      targetCap = currentCap;
      targetDom = currentDomain();
    }
    if (!targetCap || !targetDom) {
      console.warn('[multi-update] capabilityId not found, skipping:', u.capabilityId, u.sectionTitle);
      return null;
    }
    const sectionLower = (u.sectionTitle || '').toLowerCase();
    const section = (targetCap.sections || []).find(s => s.title === u.sectionTitle)
      || (targetCap.sections || []).find(s => s.title.toLowerCase() === sectionLower);
    if (!section) {
      console.warn('[multi-update] sectionTitle not found, skipping:', u.capabilityId, u.sectionTitle,
        '| available:', targetCap.sections?.map(s => s.title).join(', '));
      return null;
    }
    return { ...u, _targetDom: targetDom, _targetCap: targetCap, _section: section };
  }).filter(Boolean);

  // Snapshot for undo before applying anything
  const undoData = resolvedUpdates.map(u => ({
    domainId:         u._targetDom.domainId,
    capabilityId:     u._targetCap.capabilityId,
    sectionTitle:     u._section.title,
    previousPosition: u._section.brief?.strategicPosition || u._section.content || '',
  }));

  // Apply all updates to in-memory blueprint + DOM (DOM only for currently visible capability)
  for (const u of resolvedUpdates) {
    const section = u._section;
    if (!section.brief) section.brief = {};
    section.brief.strategicPosition = u.suggestedRevision;
    section.updatedAt = new Date().toISOString();

    if (u._targetCap.capabilityId === currentCap.capabilityId) {
      const oldCard = document.querySelector(`.bp-section[data-section-title="${CSS.escape(section.title)}"]`);
      if (oldCard) oldCard.replaceWith(buildSectionCard(_blueprint, u._targetCap, section));
    }
  }
  _blueprint.updatedAt = new Date().toISOString();
  renderHeader(_blueprint);

  // Build applied summary card with Undo
  const log = document.getElementById('ai-chat-messages');
  if (!log) return;

  document.getElementById('ai-multi-update-card')?.remove();

  const card = document.createElement('div');
  card.id        = 'ai-multi-update-card';
  card.className = 'ai-multi-update ai-multi-update--applied';

  const summaryEl = document.createElement('p');
  summaryEl.className   = 'ai-multi-update__summary';
  summaryEl.textContent = summary;
  card.appendChild(summaryEl);

  // Group by capability for display
  const byCapabilityDisplay = {};
  resolvedUpdates.forEach(u => {
    const name = u.capabilityName || u._targetCap.capabilityName;
    if (!byCapabilityDisplay[name]) byCapabilityDisplay[name] = [];
    byCapabilityDisplay[name].push(u.sectionTitle);
  });
  const changesLabel = Object.entries(byCapabilityDisplay)
    .map(([capName, sections]) => `${capName}: ${sections.join(', ')}`)
    .join(' · ');
  const sectionsEl = document.createElement('p');
  sectionsEl.className   = 'ai-multi-update__sections';
  sectionsEl.textContent = `Updated — ${changesLabel}`;
  card.appendChild(sectionsEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'ai-multi-update__actions';
  const undoBtn = document.createElement('button');
  undoBtn.className   = 'ai-multi-update-btn ai-multi-update-btn--undo';
  undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', () => undoMultiUpdate(undoData, currentCap, card));
  actionsEl.appendChild(undoBtn);
  card.appendChild(actionsEl);

  log.appendChild(card);
  log.scrollTop = log.scrollHeight;

  // Phase 1 — persist strategicPosition for all sections.
  // Use _section.title (exact DB value) not sectionTitle (AI-returned, may differ in case).
  const patchErrors = [];
  await Promise.all(resolvedUpdates.map(u =>
    fetch(
      `${API_BASE}/strategy-canvas/transformation-blueprint/${_blueprint._id}/domain/${u._targetDom.domainId}/capability/${u._targetCap.capabilityId}/section/${encodeURIComponent(u._section.title)}`,
      {
        method:   'PATCH',
        headers:  { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:     JSON.stringify({ brief: { strategicPosition: u.suggestedRevision } }),
        keepalive: true, // survive page navigation
      }
    ).then(r => {
      if (!r.ok) {
        const msg = `"${u._section.title}" (${r.status})`;
        console.warn('[multi-update] PATCH failed:', r.status, u._targetCap.capabilityId, u._section.title);
        patchErrors.push(msg);
      }
    })
     .catch(err => {
       const msg = `"${u._section.title}": ${err.message}`;
       console.warn('[multi-update] PATCH error:', u._targetCap.capabilityId, u._section.title, err.message);
       patchErrors.push(msg);
     })
  ));
  if (patchErrors.length) {
    const errEl = appendProgressMessage(`⚠ Save failed for: ${patchErrors.join(', ')} — changes may not persist`);
    resolveProgressMessage(errEl, `⚠ Save failed for: ${patchErrors.join(', ')} — changes may not persist`);
  }

  // Phase 2 — regenerate visual extras per capability, with chat progress.
  // Use _section.title (exact DB value) so the backend can find each section.
  const byCapability = {};
  resolvedUpdates.forEach(u => {
    const id = u._targetCap.capabilityId;
    if (!byCapability[id]) byCapability[id] = { cap: u._targetCap, domainId: u._targetDom?.domainId, titles: [] };
    byCapability[id].titles.push(u._section.title);
  });

  for (const [capId, { cap: targetCap, domainId: capDomainId, titles }] of Object.entries(byCapability)) {
    const progressMsg = appendProgressMessage(`Updating graphs for ${targetCap.capabilityName}…`);
    try {
      const resp = await fetch(
        `${API_BASE}/strategy-canvas/transformation-blueprint/${_blueprint._id}/domain/${capDomainId}/capability/${capId}/regenerate-section-extras`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body:    JSON.stringify({ sectionTitles: titles }),
        }
      );
      if (resp.ok) {
        const { updatedBriefs } = await resp.json();
        for (const [sectionTitle, extraBrief] of Object.entries(updatedBriefs || {})) {
          const section = (targetCap.sections || []).find(s => s.title === sectionTitle)
            || (targetCap.sections || []).find(s => s.title.toLowerCase() === sectionTitle.toLowerCase());
          if (section) {
            // Merge extras only — never let extraBrief overwrite strategicPosition
            const { strategicPosition: _sp, priorityActions: _pa, successMetrics: _sm, leadershipValidation: _lv, ...extrasOnly } = extraBrief;
            section.brief = { ...(section.brief || {}), ...extrasOnly };
            if (targetCap.capabilityId === currentCap.capabilityId) {
              const oldCard = document.querySelector(`.bp-section[data-section-title="${CSS.escape(section.title)}"]`);
              if (oldCard) oldCard.replaceWith(buildSectionCard(_blueprint, targetCap, section));
            }
          }
        }
        resolveProgressMessage(progressMsg, `Graphs updated — ${targetCap.capabilityName} ✓`);
      } else {
        resolveProgressMessage(progressMsg, `Graphs skipped — ${targetCap.capabilityName}`);
      }
    } catch {
      resolveProgressMessage(progressMsg, `Graphs skipped — ${targetCap.capabilityName}`);
    }
  }
}

async function undoMultiUpdate(undoData, currentCap, doneCard) {
  if (!_blueprint) return;

  for (const u of undoData) {
    let targetDom = null;
    let targetCap = null;
    for (const dom of (_blueprint.domains || [])) {
      const found = (dom.capabilities || []).find(c => c.capabilityId === u.capabilityId);
      if (found) { targetDom = dom; targetCap = found; break; }
    }
    if (!targetDom || !targetCap) continue;

    const section = (targetCap.sections || []).find(s => s.title === u.sectionTitle);
    if (!section) continue;
    if (!section.brief) section.brief = {};
    section.brief.strategicPosition = u.previousPosition;
    section.updatedAt = new Date().toISOString();

    if (targetCap.capabilityId === currentCap?.capabilityId) {
      const oldCard = document.querySelector(`.bp-section[data-section-title="${CSS.escape(section.title)}"]`);
      if (oldCard) oldCard.replaceWith(buildSectionCard(_blueprint, targetCap, section));
    }
  }
  _blueprint.updatedAt = new Date().toISOString();
  renderHeader(_blueprint);

  doneCard?.remove();

  const msg = 'Changes undone.';
  appendChatMessage('assistant', msg);
  _chatHistory.push({ role: 'assistant', content: msg });
  saveChatHistory();

  // Restore in backend — fire-and-forget
  for (const u of undoData) {
    fetch(
      `${API_BASE}/strategy-canvas/transformation-blueprint/${_blueprint._id}/domain/${u.domainId}/capability/${u.capabilityId}/section/${encodeURIComponent(u.sectionTitle)}`,
      {
        method:    'PATCH',
        headers:   { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:      JSON.stringify({ brief: { strategicPosition: u.previousPosition } }),
        keepalive: true,
      }
    )
    .then(r => { if (!r.ok) console.warn('[undo-multi] PATCH non-ok:', r.status, u.capabilityId, u.sectionTitle); })
    .catch(err => console.warn('[undo-multi] PATCH error:', u.capabilityId, u.sectionTitle, err.message));
  }
}

async function acceptSuggestion() {
  if (!_pendingSuggestion || !_blueprint) return;

  const dom = currentDomain();
  const cap = currentCap();
  if (!cap || !dom) { clearSuggestionCard(); return; }

  // Find the exact section that was being refined (by title), fall back to first
  const targetTitle = _pendingSuggestion.sectionTitle;
  const section = targetTitle
    ? (cap.sections || []).find(s => s.title === targetTitle)
    : (cap.sections || [])[0];

  if (!section) { clearSuggestionCard(); return; }

  // Apply suggestion to the primary prose field used by all view modes
  const newPosition = _pendingSuggestion.text;
  if (!section.brief) section.brief = {};
  section.brief.strategicPosition = newPosition;
  section.updatedAt = new Date().toISOString();
  _blueprint.updatedAt = new Date().toISOString();

  // Re-render the section card in-place — works for all view modes (CTO, PM, essay)
  const oldCard = document.querySelector(`.bp-section[data-section-title="${CSS.escape(section.title)}"]`);
  if (oldCard) {
    const newCard = buildSectionCard(_blueprint, cap, section);
    oldCard.replaceWith(newCard);
  }

  renderHeader(_blueprint);
  clearSuggestionCard();
  _refineTargetSection = null;

  const doneMsg = `Done — the "${section.title}" section has been updated. Continue refining or ask a follow-up question.`;
  appendChatMessage('assistant', doneMsg);
  _chatHistory.push({ role: 'assistant', content: doneMsg });
  saveChatHistory();

  // Persist to backend (non-blocking — UI already updated above)
  try {
    await fetch(
      `${API_BASE}/strategy-canvas/transformation-blueprint/${_blueprint._id}/domain/${dom.domainId}/capability/${cap.capabilityId}/section/${encodeURIComponent(section.title)}`,
      {
        method:    'PATCH',
        headers:   { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:      JSON.stringify({ brief: { strategicPosition: newPosition } }),
        keepalive: true,
      }
    );
  } catch (err) {
    console.warn('[workspace] Failed to persist section update:', err.message);
  }
}

// ── Chat persistence ──────────────────────────────────────────────────────────

function chatStorageKey() {
  if (!_blueprint?._id) return null;
  return `soorgaai_chat_v1_${_blueprint._id}`;
}

function saveChatHistory() {
  const key = chatStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(_chatHistory.slice(-60)));
  } catch { /* quota exceeded */ }
}

function restoreChat() {
  const key = chatStorageKey();
  const stored = key ? localStorage.getItem(key) : null;
  let history = [];
  if (stored) {
    try { history = JSON.parse(stored); } catch { history = []; }
  }
  _chatHistory = Array.isArray(history) ? history : [];

  const log = document.getElementById('ai-chat-messages');
  if (!log) return;
  log.innerHTML = '';

  for (const msg of _chatHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      const el = document.createElement('div');
      el.className = `chat-msg chat-msg--${msg.role}`;
      el.textContent = msg.content || '';
      log.appendChild(el);
    }
  }
  log.scrollTop = log.scrollHeight;
}

// ── Chat UI helpers ───────────────────────────────────────────────────────────

function appendChatMessage(role, content) {
  const log = document.getElementById('ai-chat-messages');
  if (!log) return;

  const msg = document.createElement('div');
  msg.className = `chat-msg chat-msg--${role}`;
  msg.textContent = content;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

function setChatSending(sending) {
  _isSending = sending;
  const sendBtn    = document.getElementById('ai-chat-send');
  const sendIcon   = document.getElementById('ai-chat-send-icon');
  const sendLoader = document.getElementById('ai-chat-send-loader');
  const input      = document.getElementById('ai-chat-input');

  if (sendBtn)    sendBtn.disabled          = sending;
  if (sendIcon)   sendIcon.style.display    = sending ? 'none' : '';
  if (sendLoader) sendLoader.style.display  = sending ? '' : 'none';
  if (input)      input.disabled            = sending;

  if (sending) {
    const typing = document.createElement('div');
    typing.id = 'ai-typing-indicator';
    typing.className = 'chat-msg chat-msg--typing';
    typing.textContent = 'Thinking…';
    document.getElementById('ai-chat-messages')?.appendChild(typing);
    document.getElementById('ai-chat-messages')?.scrollTo({ top: 99999 });
  } else {
    document.getElementById('ai-typing-indicator')?.remove();
  }
}

function setErrorVisible(visible, msg = '') {
  const errEl  = document.getElementById('ai-chat-error');
  const errTxt = document.getElementById('ai-chat-error-text');
  if (errEl)  errEl.style.display  = visible ? '' : 'none';
  if (errTxt) errTxt.textContent   = msg || 'Something went wrong. Please try again.';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const DOMAIN_ORDER = ['ai-use-cases','ai-strategy','data-readiness','technology-infrastructure','skills-workforce','governance-security'];

// Capability IDs that have been retired and should never appear in the workspace,
// even if they are stored in older blueprints in the database.
function stripRetiredCapabilities(blueprint) {
  for (const dom of blueprint.domains || []) {
    dom.capabilities = (dom.capabilities || []).filter(
      c => !RETIRED_CAPABILITY_IDS.has(c.capabilityId)
    );
  }
}

async function augmentBlueprintWithMissingDomains(blueprint) {
  try {
    const resp = await fetch(`${API_BASE}/workspace/domains`);
    if (!resp.ok) return;
    const { domains } = await resp.json();
    const existingIds = new Set(blueprint.domains.map(d => d.domainId));
    for (const d of domains.filter(d => d.enabled)) {
      if (!existingIds.has(d.domainId)) {
        blueprint.domains.push({ domainId: d.domainId, domainName: d.title, capabilities: [], status: 'pending' });
      }
    }
    blueprint.domains.sort((a, b) => DOMAIN_ORDER.indexOf(a.domainId) - DOMAIN_ORDER.indexOf(b.domainId));
  } catch { /* non-critical — render with what we have */ }
}

// Shown once the objective has been classified as outside the automotive KB
// (industryFit.checked && !industryFit.matched — see industryFitService.js).
// Undefined/not-yet-checked never shows the banner, so it stays silent during
// the brief window before the first-capability classification completes.
function renderIndustryFitBanner(blueprint) {
  const banner = document.getElementById('domain-industryfit-banner');
  if (!banner) return;
  const fit = blueprint.industryFit;
  if (fit?.checked && fit.matched === false) {
    const reasonEl = document.getElementById('domain-industryfit-reason');
    if (reasonEl) reasonEl.textContent = fit.reason || '';
    banner.style.display = '';
  } else {
    banner.style.display = 'none';
  }
}

async function initWorkspace(blueprint) {
  await augmentBlueprintWithMissingDomains(blueprint);
  stripRetiredCapabilities(blueprint);

  _blueprint         = blueprint;
  _selectedDomainIdx = 0;
  _selectedCapIndex  = 0;

  // The workspace is reached either as a fresh tab (Open Blueprint opens
  // one via ?openBlueprint=1) or in-place after approving — either way,
  // "← Home" doesn't make sense here. ?view=cob forces the Cob/
  // Opportunities screen to show even for an already-approved blueprint,
  // which would otherwise just bounce straight back to the workspace.
  const backLink = document.querySelector('.workspace-nav__back');
  if (backLink) {
    backLink.href = '/domain/domain.html?view=cob';
    backLink.textContent = '← Back to Cob';
    backLink.setAttribute('aria-label', 'Back to Cob');
  }

  // Guests browse read-only — assistant (and its authed API calls) stays hidden
  const assistantBtn = document.getElementById('btn-ai-assistant');
  if (assistantBtn && !window.SOORGA_GUEST) assistantBtn.style.display = '';

  renderIndustryFitBanner(blueprint);
  renderHeader(blueprint);
  renderDomainTabs(blueprint);
  renderCapabilityTabs(blueprint);
  renderBlueprintContent(blueprint, _selectedCapIndex);
  restoreChat();

  showScreen('screen-workspace');

  initAssistantButton();
  initChat();

  // Start the one-time feedback timer for this session
  clearTimeout(_feedbackTimer);
  _feedbackTimer = setTimeout(() => maybeShowFeedback(), FEEDBACK_DELAY_MS);
}

// Listen for 'blueprint:ready' from blueprintGenerate.js
document.addEventListener('blueprint:ready', (e) => {
  const { blueprint } = e.detail || {};
  if (blueprint) initWorkspace(blueprint);
});

// Live updates while generation runs — blueprintGenerate.js polls and emits
// fresh snapshots; re-render only what actually changed so reading isn't
// disturbed.
function statusSnapshot(bp) {
  return JSON.stringify((bp.domains || []).map(d => [
    d.status,
    (d.capabilities || []).map(c => [c.status, (c.sections || []).length]),
  ]));
}

document.addEventListener('blueprint:update', (e) => {
  const { blueprint } = e.detail || {};
  if (!blueprint || !_blueprint) return;

  stripRetiredCapabilities(blueprint);
  blueprint.domains?.sort((a, b) => DOMAIN_ORDER.indexOf(a.domainId) - DOMAIN_ORDER.indexOf(b.domainId));

  const before = statusSnapshot(_blueprint);
  const after  = statusSnapshot(blueprint);

  const selBefore = currentCap();
  const selKey    = JSON.stringify([selBefore?.status, (selBefore?.sections || []).length]);

  _blueprint.domains = blueprint.domains;
  _blueprint.status  = blueprint.status;

  // Classification typically lands before the first capability completes,
  // but re-check on every update in case it arrives slightly later.
  if (blueprint.industryFit && !_blueprint.industryFit?.checked) {
    _blueprint.industryFit = blueprint.industryFit;
    renderIndustryFitBanner(_blueprint);
  }

  if (before !== after) {
    renderDomainTabs(_blueprint);
    renderCapabilityTabs(_blueprint);
  }

  const selAfter    = currentCap();
  const selKeyAfter = JSON.stringify([selAfter?.status, (selAfter?.sections || []).length]);
  if (selKey !== selKeyAfter) {
    renderBlueprintContent(_blueprint, _selectedCapIndex);
  }
});
