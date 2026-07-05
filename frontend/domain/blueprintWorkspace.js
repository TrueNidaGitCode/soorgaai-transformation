/**
 * SoorgaAI — Blueprint Workspace Module (PI 26.3 Sprint 1)
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

// ── Screen helpers ────────────────────────────────────────────────────────────

function showScreen(id) {
  ['screen-generate', 'screen-progress', 'screen-workspace', 'domain-loading'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? '' : 'none';
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

async function regenerateDomain(blueprintId, domainId) {
  try {
    const resp = await fetch(
      `${API_BASE}/strategy-canvas/transformation-blueprint/${blueprintId}/regenerate-domains`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ domainIds: [domainId] }),
      }
    );
    if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
    if (!resp.ok) throw new Error('Failed to start regeneration');
    // Redirect to workspace — it detects 'generating' status and shows the progress screen
    window.location.href = '/workspace/workspace.html';
  } catch (err) {
    console.error('[blueprintWorkspace] domain regen error:', err);
    alert('Could not start generation. Please try again.');
  }
}

function renderDomainTabs(blueprint) {
  const nav = document.getElementById('domain-nav');
  if (!nav) return;
  nav.innerHTML = '<p class="ws-domain-sidebar__label">Domains</p>';

  (blueprint.domains || []).forEach((domain, idx) => {
    const icon         = DOMAIN_ICONS_MAP[domain.domainId] || '●';
    const notStarted   = isDomainNotStarted(domain);

    // Wrapper so we can place the Generate chip without nesting buttons
    const row = document.createElement('div');
    row.className = 'ws-domain-row';

    const item = document.createElement('button');
    item.className = `ws-domain-item${idx === _selectedDomainIdx ? ' is-active' : ''}`;
    item.dataset.idx = idx;
    item.title = domain.domainName;
    item.innerHTML = `
      <span class="ws-domain-item__icon">${icon}</span>
      <span class="ws-domain-item__name">${domain.domainName}</span>
    `;
    item.addEventListener('click', () => selectDomain(idx));
    row.appendChild(item);

    if (notStarted) {
      const chip = document.createElement('button');
      chip.className = 'ws-domain-regen-chip';
      chip.textContent = 'Generate';
      chip.title = `Generate ${domain.domainName}`;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        chip.disabled = true;
        chip.textContent = '…';
        regenerateDomain(blueprint._id, domain.domainId);
      });
      row.appendChild(chip);
    }

    nav.appendChild(row);
  });
}

function selectDomain(idx) {
  _selectedDomainIdx = idx;
  _selectedCapIndex  = 0;
  _refineTargetSection = null;
  clearSuggestionCard();

  document.querySelectorAll('.ws-domain-item').forEach((t, i) => {
    t.classList.toggle('is-active', i === idx);
  });

  renderCapabilityTabs(_blueprint);
  renderBlueprintContent(_blueprint, 0);
  updateAssistantContext();
}

// ── Capability tabs ───────────────────────────────────────────────────────────

function renderCapabilityTabs(blueprint) {
  const nav    = document.getElementById('cap-nav');
  const header = document.getElementById('cap-journey-header');
  if (!nav) return;
  nav.innerHTML = '';

  const dom  = (blueprint.domains || [])[_selectedDomainIdx];
  const caps = (dom?.capabilities || []).filter(c => !RETIRED_CAPABILITY_IDS.has(c.capabilityId));

  // Journey header: label + "Step N of M" counter
  if (header) {
    if (caps.length) {
      header.innerHTML =
        `<span class="cap-journey-label">Transformation Journey</span>` +
        `<span class="cap-step-counter">Step ${_selectedCapIndex + 1} of ${caps.length}</span>`;
    } else {
      header.innerHTML = '';
    }
  }

  caps.forEach((cap, idx) => {
    const tab = document.createElement('button');
    tab.className = `cap-nav__tab${idx === _selectedCapIndex ? ' is-active' : ''}`;
    tab.dataset.idx = idx;

    const dotClass  = `cap-nav__tab-dot--${cap.status === 'in-progress' ? 'progress' : cap.status}`;
    const stepLabel = String(idx + 1).padStart(2, '0');
    tab.innerHTML =
      `<span class="cap-nav__step-badge" aria-hidden="true">${stepLabel}</span>` +
      `<span class="cap-nav__tab-dot ${dotClass}" aria-hidden="true"></span>` +
      resolveCapName(cap.capabilityName);

    tab.addEventListener('click', () => selectCapability(idx));
    nav.appendChild(tab);
  });

  applyCapAccent(_selectedCapIndex);
}

// ── One-time feedback card ─────────────────────────────────────────────────────

const FB_LS_KEY = 'soorgaai_fb_done';

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

  // Update tab active state
  document.querySelectorAll('.cap-nav__tab').forEach((t, i) => {
    t.classList.toggle('is-active', i === idx);
  });

  // Update step counter in journey header
  const caps = currentDomain()?.capabilities || [];
  const counter = document.querySelector('.cap-step-counter');
  if (counter && caps.length) counter.textContent = `Step ${idx + 1} of ${caps.length}`;

  // Apply per-capability accent colour
  applyCapAccent(idx);

  renderBlueprintContent(_blueprint, idx);
  // Chat is blueprint-wide — no restoreChat() on tab switch, history stays visible
  updateAssistantContext();

  // Trigger one-time feedback prompt on first AI ROI tab visit
  const cap = (currentDomain()?.capabilities || [])[idx];
  if (cap?.capabilityName === 'AI ROI') maybeShowFeedback();
}

// ── Blueprint content ─────────────────────────────────────────────────────────

function renderBlueprintContent(blueprint, capIdx) {
  const area = document.getElementById('bp-content');
  if (!area) return;
  area.innerHTML = '';

  const dom = (blueprint.domains || [])[_selectedDomainIdx];
  const cap = (dom?.capabilities || [])[capIdx];
  if (!cap) return;

  // Capability title + regenerate button (always available for completed caps)
  const header = document.createElement('div');
  header.className = 'bp-cap-header';
  const capTitle = document.createElement('h2');
  capTitle.className = 'bp-cap-title';
  capTitle.textContent = resolveCapName(cap.capabilityName);
  header.appendChild(capTitle);
  if (cap.status === 'completed') {
    const regenBtn = document.createElement('button');
    regenBtn.className = 'bp-cap-regen-btn';
    regenBtn.textContent = 'Regenerate';
    regenBtn.addEventListener('click', () => triggerCapabilityRegeneration(cap, regenBtn));
    header.appendChild(regenBtn);
  }
  area.appendChild(header);

  if (cap.status !== 'completed' || !cap.sections?.length) {
    const empty = document.createElement('div');
    empty.className = 'bp-empty';
    const isError = cap.status === 'error';
    empty.innerHTML = `
      <div class="bp-empty__icon">${isError ? '⚠' : '⟳'}</div>
      <p class="bp-empty__title">${isError ? 'Generation failed for this capability' : 'Still generating…'}</p>
      <p class="bp-empty__text">${isError ? 'The AI encountered an error generating this section.' : 'This section will appear when generation completes.'}</p>
    `;
    const regenBtn = document.createElement('button');
    regenBtn.className = 'bp-regen-btn';
    regenBtn.textContent = 'Regenerate';
    regenBtn.addEventListener('click', () => triggerCapabilityRegeneration(cap, regenBtn));
    empty.appendChild(regenBtn);
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

  // 2. Operational Improvement Dashboard — Before → After table
  const txRows = Array.isArray(b.transformationRows) ? b.transformationRows : [];
  if (txRows.length) {
    const sec = document.createElement('div');
    sec.className = 'roi-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Operational Improvement Dashboard';
    sec.appendChild(lbl);

    const table = document.createElement('div');
    table.className = 'oe-transformation-table';

    const hdr = document.createElement('div');
    hdr.className = 'oe-transform-header';
    ['oe-transform-header__current', 'oe-transform-header__arrow', 'oe-transform-header__future'].forEach((cls, i) => {
      const cell = document.createElement('div');
      cell.className = cls;
      if (i === 0) cell.textContent = 'Current State';
      if (i === 2) cell.textContent = 'Future State';
      hdr.appendChild(cell);
    });
    table.appendChild(hdr);

    txRows.forEach(row => {
      const r = document.createElement('div');
      r.className = 'oe-transform-row';
      const cur = document.createElement('div');
      cur.className = 'oe-transform-row__current'; cur.textContent = row.currentState || '—';
      const arr = document.createElement('div');
      arr.className = 'oe-transform-row__arrow'; arr.textContent = '→';
      const fut = document.createElement('div');
      fut.className = 'oe-transform-row__future'; fut.textContent = row.futureState || '—';
      r.appendChild(cur); r.appendChild(arr); r.appendChild(fut);
      table.appendChild(r);
    });

    sec.appendChild(table);
    wrap.appendChild(sec);
  }

  // 3. Operational Impact Areas — 5 business capability cards
  const impactAreas = Array.isArray(b.impactAreas) ? b.impactAreas : [];
  if (impactAreas.length) {
    const sec = document.createElement('div');
    sec.className = 'roi-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Operational Impact Areas';
    sec.appendChild(lbl);

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
      (area.points || []).forEach(pt => {
        const li = document.createElement('li'); li.textContent = pt;
        ul.appendChild(li);
      });
      card.appendChild(ul);
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    wrap.appendChild(sec);
  }

  // 4. Operational KPI Dashboard — PM-focused question cards
  const pmDash = Array.isArray(b.pmDashboard) ? b.pmDashboard : [];
  if (pmDash.length) {
    const sec = document.createElement('div');
    sec.className = 'roi-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Operational KPI Dashboard';
    sec.appendChild(lbl);

    const grid = document.createElement('div');
    grid.className = 'pm-dashboard-grid';

    pmDash.forEach(item => {
      const card = document.createElement('div');
      card.className = 'pm-dashboard-card';

      const area = document.createElement('p');
      area.className = 'pm-dashboard-card__area'; area.textContent = item.area || '—';
      card.appendChild(area);

      if (item.question) {
        const q = document.createElement('p');
        q.className = 'pm-dashboard-card__question'; q.textContent = item.question;
        card.appendChild(q);
      }

      const divider = document.createElement('div');
      divider.className = 'pm-dashboard-card__divider';
      card.appendChild(divider);

      const addRow = (cls, labelText, valueText, isKpi) => {
        if (!valueText) return;
        const row = document.createElement('div');
        row.className = 'pm-dashboard-card__row';
        const lbl2 = document.createElement('p');
        lbl2.className = `pm-dashboard-card__row-label pm-dashboard-card__row-label--${cls}`;
        lbl2.textContent = labelText;
        const val = document.createElement('p');
        val.className = isKpi ? 'pm-dashboard-card__kpi-value' : 'pm-dashboard-card__row-text';
        val.textContent = valueText;
        row.appendChild(lbl2); row.appendChild(val);
        card.appendChild(row);
      };

      addRow('current', 'Current',        item.currentChallenge, false);
      addRow('ai',      'AI Improvement',  item.aiImprovement,    false);
      addRow('kpi',     'Expected KPI',    item.expectedKpi,      true);

      grid.appendChild(card);
    });

    sec.appendChild(grid);
    wrap.appendChild(sec);
  }

  // Fallback: old SDLC layout for legacy blueprints
  if (!txRows.length && b.sdlcStages?.length) {
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
    if (b.kpiHighlights?.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI ROI — Customer Value ────────────────────────────────────────────────────

function buildCustomerValueLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'customer-value-layout';

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  if (b.flywheelStages?.length) {
    wrap.appendChild(buildDiagramSection('Customer Value Flywheel', buildPillChain(b.flywheelStages, 'name')));
    wrap.appendChild(buildDetailSection('Customer Value Details', buildPillarBulletCards(b.flywheelStages, 'name')));
  }

  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
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
  const b              = section.brief || {};
  const primaryClass   = b.primaryClassification   || null;
  const secondaryClass = b.secondaryClassification || null;
  const insight        = b.transformationImplication   || '';

  const ICONS   = { 'Productivity AI': '⚡', 'Functional AI': '⚙', 'Product AI': '🚗' };
  const COLORS  = { 'Productivity AI': 'productivity', 'Functional AI': 'functional', 'Product AI': 'product' };

  const wrap = document.createElement('div');
  wrap.className = 'cls-view';

  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'cls-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // ── Classification Banner ─────────────────────────────────────────────────
  if (primaryClass) {
    const banner = document.createElement('div');
    banner.className = 'cls-banner';

    const mkCell = (label, cls, isSec) => {
      const cell = document.createElement('div');
      cell.className = `cls-banner__cell${isSec ? ' cls-banner__cell--secondary' : ''}`;
      cell.innerHTML = `
        <span class="cls-banner__label">${label}</span>
        <span class="cls-banner__name cls-name--${COLORS[cls.name] || 'functional'}">${cls.name}</span>
        ${cls.rationale      ? `<span class="cls-banner__rationale">${cls.rationale}</span>`       : ''}
        ${cls.businessOutcome ? `<span class="cls-banner__outcome">${cls.businessOutcome}</span>` : ''}`;
      return cell;
    };

    banner.appendChild(mkCell('Primary Classification', primaryClass, false));
    if (secondaryClass) banner.appendChild(mkCell('Secondary Classification', secondaryClass, true));
    wrap.appendChild(banner);
  }

  // ── Insight Footer ────────────────────────────────────────────────────────
  if (insight) {
    const footer = document.createElement('div');
    footer.className = 'cls-insight';
    footer.innerHTML = `
      <span class="cls-insight__icon">□</span>
      <p class="cls-insight__text"><strong>Transformation Implication</strong> — ${insight}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── AI Use Cases — Business Value Definition ──────────────────────────────────

function buildBvdCatCard(cat) {
  const card = document.createElement('div');
  card.className = 'bvd-cat-card';

  const dot = document.createElement('div');
  dot.className = 'bvd-cat-card__dot';
  card.appendChild(dot);

  const body = document.createElement('div');
  body.className = 'bvd-cat-card__body';

  const title = document.createElement('p');
  title.className = 'bvd-cat-card__title';
  title.textContent = cat.title;
  body.appendChild(title);

  if (cat.focus) {
    const focus = document.createElement('p');
    focus.className = 'bvd-cat-card__focus';
    focus.innerHTML = `<span class="bvd-cat-card__focus-label">Focus: </span>${cat.focus}`;
    body.appendChild(focus);
  }

  if (cat.outcomes?.length) {
    const ul = document.createElement('ul');
    ul.className = 'bvd-cat-card__outcomes';
    cat.outcomes.forEach(o => {
      const li = document.createElement('li');
      li.textContent = o;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  card.appendChild(body);
  return card;
}

function buildBusinessValueDefinitionView(section) {
  const b          = section.brief || {};
  const categories = b.valueCategories     || [];
  const kpiPills   = b.kpiPills            || [];
  const insight    = b.businessValueInsight || '';

  const wrap = document.createElement('div');
  wrap.className = 'bvd-view';

  // Strategic Position
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const quote = document.createElement('div');
    quote.className = 'bvd-quote';
    const p = document.createElement('p');
    p.className = 'bvd-quote__text';
    p.textContent = b.strategicPosition;
    quote.appendChild(p);
    wrap.appendChild(quote);
  }

  // Top row — first 3 categories connected by amber line
  const topCats    = categories.slice(0, 3);
  const bottomCats = categories.slice(3, 4);

  function buildRow(cats, centered) {
    const rowWrap = document.createElement('div');
    rowWrap.className = 'bvd-row-wrap';

    const line = document.createElement('div');
    line.className = 'bvd-row-line';
    rowWrap.appendChild(line);

    const row = document.createElement('div');
    row.className = centered ? 'bvd-cards-row bvd-cards-row--center' : 'bvd-cards-row';
    cats.forEach(cat => row.appendChild(buildBvdCatCard(cat)));
    rowWrap.appendChild(row);
    return rowWrap;
  }

  if (topCats.length)    wrap.appendChild(buildRow(topCats, false));
  if (bottomCats.length) wrap.appendChild(buildRow(bottomCats, true));

  // KPI pills
  if (kpiPills.length) {
    const kpiLabel = document.createElement('p');
    kpiLabel.className = 'brief-label';
    kpiLabel.textContent = 'Key Performance Indicators';
    wrap.appendChild(kpiLabel);
    const pillsWrap = document.createElement('div');
    pillsWrap.className = 'bvd-kpi-pills';
    kpiPills.forEach(pill => {
      const span = document.createElement('span');
      span.className = 'bvd-kpi-pill';
      span.textContent = pill;
      pillsWrap.appendChild(span);
    });
    wrap.appendChild(pillsWrap);
  }

  // Insight footer
  if (insight) {
    const insightLabel = document.createElement('p');
    insightLabel.className = 'brief-label';
    insightLabel.textContent = 'Business Value Insight';
    wrap.appendChild(insightLabel);
    const footer = document.createElement('div');
    footer.className = 'bvd-insight';
    const icon = document.createElement('span');
    icon.className = 'bvd-insight__icon';
    icon.textContent = '□';
    const text = document.createElement('p');
    text.className = 'bvd-insight__text';
    const dotIdx = insight.indexOf('. ');
    if (dotIdx !== -1) {
      text.innerHTML = `<strong>${insight.slice(0, dotIdx + 1)}</strong> ${insight.slice(dotIdx + 2)}`;
    } else {
      text.innerHTML = `<strong>${insight}</strong>`;
    }
    footer.appendChild(icon);
    footer.appendChild(text);
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── AI Use Cases — Prioritization ────────────────────────────────────────────

function buildPrioritizationView(section) {
  const b              = section.brief || {};
  const recStart       = b.recommendedStartingPoint || '';
  const quadrants      = b.priorityQuadrants        || [];
  const dimCards       = b.dimensionCards           || [];
  const insight        = b.prioritizationInsight    || '';

  const wrap = document.createElement('div');
  wrap.className = 'pri-view';

  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'pri-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // Recommended Starting Point banner
  if (recStart) {
    const banner = document.createElement('div');
    banner.className = 'pri-recommended';
    banner.innerHTML = `
      <span class="pri-recommended__icon">★</span>
      <div>
        <p class="pri-recommended__title">Recommended Starting Point</p>
        <p class="pri-recommended__text">${recStart}</p>
      </div>`;
    wrap.appendChild(banner);
  }

  // 2×2 Priority Matrix
  if (quadrants.length) {
    const matSection = document.createElement('div');
    matSection.className = 'pri-matrix-section';

    const lbl = document.createElement('p');
    lbl.className = 'brief-label';
    lbl.textContent = 'Prioritization Matrix';
    matSection.appendChild(lbl);

    const matWrap = document.createElement('div');
    matWrap.className = 'pri-matrix-wrap';

    // Y-axis label
    const yAxis = document.createElement('div');
    yAxis.className = 'pri-y-axis';
    ['High', 'Business Value', 'Low'].forEach((t, i) => {
      const el = document.createElement('span');
      el.className = i === 1 ? 'pri-axis-label' : 'pri-axis-tick';
      el.textContent = t;
      yAxis.appendChild(el);
    });
    matWrap.appendChild(yAxis);

    const matBody = document.createElement('div');
    matBody.className = 'pri-matrix-body';

    // X-axis top labels
    const xHeader = document.createElement('div');
    xHeader.className = 'pri-x-header';
    ['Low Implementation Feasibility', 'High Implementation Feasibility'].forEach(t => {
      const el = document.createElement('span');
      el.textContent = t;
      xHeader.appendChild(el);
    });
    matBody.appendChild(xHeader);

    // 2×2 grid — order: [0] Strategic Bets (top-left), [1] Quick Wins (top-right), [2] Fill-ins (bottom-left), [3] Future Opportunities (bottom-right)
    const QUADRANT_CLASS = {
      'quick-wins':          'pri-quadrant--quick-wins',
      'strategic-bets':      'pri-quadrant--strategic-bets',
      'fill-ins':            'pri-quadrant--fill-ins',
      'future-opportunities': 'pri-quadrant--avoid',
      'avoid':               'pri-quadrant--avoid', // legacy fallback
    };
    const grid = document.createElement('div');
    grid.className = 'pri-matrix-grid';
    quadrants.forEach(q => {
      const cell = document.createElement('div');
      cell.className = `pri-quadrant ${QUADRANT_CLASS[q.id] || 'pri-quadrant--fill-ins'}`;
      const title = document.createElement('p');
      title.className = 'pri-quadrant__label';
      title.textContent = q.label;
      cell.appendChild(title);
      if (q.initiatives?.length) {
        const items = document.createElement('p');
        items.className = 'pri-quadrant__items';
        items.textContent = q.initiatives.join(', ');
        cell.appendChild(items);
      }
      grid.appendChild(cell);
    });
    matBody.appendChild(grid);

    // X-axis bottom label
    const xAxis = document.createElement('div');
    xAxis.className = 'pri-x-axis';
    ['Low', 'Implementation Feasibility', 'High'].forEach((t, i) => {
      const el = document.createElement('span');
      el.className = i === 1 ? 'pri-axis-label' : 'pri-axis-tick';
      el.textContent = t;
      xAxis.appendChild(el);
    });
    matBody.appendChild(xAxis);

    matWrap.appendChild(matBody);
    matSection.appendChild(matWrap);
    wrap.appendChild(matSection);
  }

  // Evaluation Dimension Cards
  if (dimCards.length) {
    const dimSection = document.createElement('div');
    dimSection.className = 'pri-dim-section';
    const dimLbl = document.createElement('p');
    dimLbl.className = 'brief-label';
    dimLbl.textContent = 'Evaluation Dimensions';
    dimSection.appendChild(dimLbl);
    const dimRow = document.createElement('div');
    dimRow.className = 'pri-dim-cards';
    dimCards.forEach(d => {
      const card = document.createElement('div');
      card.className = 'pri-dim-card';
      const title = document.createElement('p');
      title.className = 'pri-dim-card__title';
      title.textContent = d.title;
      card.appendChild(title);
      if (d.bullets?.length) {
        const ul = document.createElement('ul');
        ul.className = 'pri-dim-card__bullets';
        d.bullets.forEach(bullet => {
          const li = document.createElement('li');
          li.textContent = bullet;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      dimRow.appendChild(card);
    });
    dimSection.appendChild(dimRow);
    wrap.appendChild(dimSection);
  }

  // Insight footer
  if (insight) {
    const footer = document.createElement('div');
    footer.className = 'pri-insight';
    footer.innerHTML = `
      <span class="pri-insight__icon">💡</span>
      <p class="pri-insight__text"><strong>Prioritization Insight</strong> — ${insight}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── AI Use Cases — Opportunity Discovery ──────────────────────────────────────

function buildOppConnector() {
  const c = document.createElement('div');
  c.className = 'opp-connector';
  c.innerHTML = '<div class="opp-connector__line"></div><div class="opp-connector__arrow">▼</div>';
  return c;
}

function buildOpportunityDiscoveryView(section) {
  const b                    = section.brief || {};
  const businessProblems     = b.businessProblems     || [];
  const workflowSteps        = b.workflowSteps        || [];
  const highEffortActivities = b.highEffortActivities || [];
  const aiOpportunities      = b.aiOpportunities      || [];

  const wrap = document.createElement('div');
  wrap.className = 'opp-discovery';

  // Strategic position
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'opp-discovery__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // ── Layer 1: Business Problem ─────────────────────────────────────────────
  const layer1 = document.createElement('div');
  layer1.className = 'opp-layer';
  layer1.innerHTML = `
    <div class="opp-layer__header">
      <span class="opp-layer__dot opp-layer__dot--problem"></span>
      <span class="opp-layer__title">Business Problem</span>
    </div>
    <div class="opp-chips">
      ${businessProblems.length
        ? businessProblems.map(p => `<span class="opp-chip opp-chip--problem">${p}</span>`).join('')
        : '<span class="opp-chip opp-chip--problem opp-chip--placeholder">Generating…</span>'}
    </div>`;
  wrap.appendChild(layer1);

  wrap.appendChild(buildOppConnector());

  // ── Layer 2: Current Workflow + High-Effort Activities ────────────────────
  const layer2 = document.createElement('div');
  layer2.className = 'opp-layer';
  const stepsHtml = workflowSteps.map((step, i) =>
    `<div class="opp-step">${step}</div>${i < workflowSteps.length - 1 ? '<div class="opp-step-arrow">→</div>' : ''}`
  ).join('');
  const heaHtml = highEffortActivities.length
    ? `<div class="opp-workflow__hea-label">High-Effort Activities</div>
       <div class="opp-hea-row">${highEffortActivities.map(a => `<div class="opp-hea">${a}</div>`).join('')}</div>`
    : '';
  layer2.innerHTML = `
    <div class="opp-layer__header">
      <span class="opp-layer__dot opp-layer__dot--workflow"></span>
      <span class="opp-layer__title">Current Workflow</span>
    </div>
    <div class="opp-workflow">
      <div class="opp-workflow__steps">${stepsHtml}</div>
      ${heaHtml}
    </div>`;
  wrap.appendChild(layer2);

  wrap.appendChild(buildOppConnector());

  // ── Layer 3: AI Opportunities ─────────────────────────────────────────────
  const layer3 = document.createElement('div');
  layer3.className = 'opp-layer';
  const mid      = Math.ceil(aiOpportunities.length / 2);
  const leftOpps = aiOpportunities.slice(0, mid);
  const rightOpps = aiOpportunities.slice(mid);
  layer3.innerHTML = `
    <div class="opp-layer__header">
      <span class="opp-layer__dot opp-layer__dot--ai"></span>
      <span class="opp-layer__title">AI Opportunities</span>
    </div>
    <div class="opp-ai-hub">
      <div class="opp-ai-hub__side opp-ai-hub__left">
        ${leftOpps.map(o => `<span class="opp-chip opp-chip--ai">${o}</span>`).join('')}
      </div>
      <div class="opp-ai-node">AI</div>
      <div class="opp-ai-hub__side opp-ai-hub__right">
        ${rightOpps.map(o => `<span class="opp-chip opp-chip--ai">${o}</span>`).join('')}
      </div>
    </div>`;
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
  const b                  = section.brief || {};
  const projectSystems     = b.projectSystems      || [];
  const archRecs           = b.archRecommendations || [];
  const archStats          = b.archStats           || {};
  const healthTimeline     = b.healthTimeline      || [];
  const leadershipQ        = b.leadershipValidation?.context || '';

  const CONN_CLASS  = { Connected: 'dae-conn--connected', Partial: 'dae-conn--partial', Disconnected: 'dae-conn--disconnected' };
  const HEALTH_CLASS = { Healthy: 'dae-health--healthy', 'Needs Attention': 'dae-health--attention', Pending: 'dae-health--pending', Critical: 'dae-health--critical' };
  const HEALTH_ICON  = { Healthy: '◉', 'Needs Attention': '◈', Pending: '◷', Critical: '◎' };

  const wrap = document.createElement('div');
  wrap.className = 'dae-view';

  // Architecture Health badge (top-right)
  if (archStats.architectureReadiness) {
    const badge = document.createElement('div');
    badge.className = 'dae-health-badge';
    badge.textContent = `ARCHITECTURE HEALTH: ${archStats.architectureReadiness}% HEALTHY`;
    wrap.appendChild(badge);
  }

  // Strategic position
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'dae-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // ── Upper body: 2-column (Systems | Network + Recs) ──────────────────────

  const upperBody = document.createElement('div');
  upperBody.className = 'dae-upper';

  // LEFT: Project Systems list
  const sysCol = document.createElement('div');
  sysCol.className = 'dae-sys-col';

  const sysLbl = document.createElement('p');
  sysLbl.className = 'brief-label';
  sysLbl.textContent = 'Project Systems';
  sysCol.appendChild(sysLbl);

  projectSystems.forEach(sys => {
    const card = document.createElement('div');
    card.className = `dae-sys-card ${CONN_CLASS[sys.connectionStatus] || 'dae-conn--disconnected'}`;

    const name = document.createElement('p');
    name.className = 'dae-sys-card__name';
    name.textContent = sys.name;
    card.appendChild(name);

    const conn = document.createElement('p');
    conn.className = 'dae-sys-card__conn';
    conn.textContent = `Connection Status: ${sys.connectionStatus}`;
    card.appendChild(conn);

    sysCol.appendChild(card);
  });

  if (!projectSystems.length) {
    const empty = document.createElement('p');
    empty.className = 'dae-empty';
    empty.textContent = 'System list will appear after generation.';
    sysCol.appendChild(empty);
  }

  upperBody.appendChild(sysCol);

  // RIGHT: Network diagram + Recommendations
  const rightCol = document.createElement('div');
  rightCol.className = 'dae-right-col';

  // Network diagram
  const netSection = document.createElement('div');
  netSection.className = 'dae-network';

  const netLbl = document.createElement('p');
  netLbl.className = 'brief-label';
  netLbl.textContent = 'Data Architecture Network';
  netSection.appendChild(netLbl);

  // Build network from projectSystems — connected/partial/disconnected links
  const netDiagram = document.createElement('div');
  netDiagram.className = 'dae-net-diagram';

  // Top row: source nodes (one per system, up to 4)
  const netTop = document.createElement('div');
  netTop.className = 'dae-net-row dae-net-row--top';
  projectSystems.forEach(sys => {
    const node = document.createElement('div');
    node.className = `dae-net-node ${CONN_CLASS[sys.connectionStatus] || 'dae-conn--disconnected'}`;
    node.innerHTML = `<span class="dae-net-node__icon">▣</span><span class="dae-net-node__name">${sys.name}</span>`;
    netTop.appendChild(node);
  });
  netDiagram.appendChild(netTop);

  // Connector arrows down to hub
  const netArrows = document.createElement('div');
  netArrows.className = 'dae-net-arrows';
  projectSystems.forEach(sys => {
    const arrow = document.createElement('div');
    arrow.className = `dae-net-arrow ${CONN_CLASS[sys.connectionStatus] || 'dae-conn--disconnected'}`;
    netArrows.appendChild(arrow);
  });
  netDiagram.appendChild(netArrows);

  // Hub
  const netHub = document.createElement('div');
  netHub.className = 'dae-net-hub';
  netHub.innerHTML = '<span class="dae-net-hub__icon">⬡</span><span class="dae-net-hub__label">AI Data Hub</span>';
  netDiagram.appendChild(netHub);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'dae-net-legend';
  [
    { cls: 'dae-conn--connected',    label: 'Healthy' },
    { cls: 'dae-conn--partial',      label: 'Limited' },
    { cls: 'dae-conn--disconnected', label: 'Missing' },
  ].forEach(item => {
    const dot = document.createElement('span');
    dot.className = `dae-net-legend__dot ${item.cls}`;
    const lbl = document.createElement('span');
    lbl.className = 'dae-net-legend__label';
    lbl.textContent = item.label;
    legend.appendChild(dot);
    legend.appendChild(lbl);
  });
  netDiagram.appendChild(legend);

  netSection.appendChild(netDiagram);
  rightCol.appendChild(netSection);

  // AI Recommendations grid
  if (archRecs.length) {
    const recSection = document.createElement('div');
    recSection.className = 'dae-recs';

    const recLbl = document.createElement('p');
    recLbl.className = 'brief-label';
    recLbl.textContent = 'AI Recommendations';
    recSection.appendChild(recLbl);

    const recGrid = document.createElement('div');
    recGrid.className = 'dae-rec-grid';

    const IMPACT_CLASS = { High: 'dae-impact--high', Medium: 'dae-impact--medium', Low: 'dae-impact--low' };

    archRecs.forEach(rec => {
      const card = document.createElement('div');
      card.className = 'dae-rec-card';

      const title = document.createElement('p');
      title.className = 'dae-rec-card__title';
      title.textContent = rec.title;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'dae-rec-card__meta';
      meta.innerHTML = `
        <span class="dae-rec-meta-row">Impact: <strong class="${IMPACT_CLASS[rec.impact] || ''}">${rec.impact}</strong></span>
        <span class="dae-rec-meta-row">Estimated Effort: <strong>${rec.effort}</strong></span>`;
      card.appendChild(meta);

      recGrid.appendChild(card);
    });

    recSection.appendChild(recGrid);
    rightCol.appendChild(recSection);
  }

  upperBody.appendChild(rightCol);
  wrap.appendChild(upperBody);

  // ── Stats bar ─────────────────────────────────────────────────────────────

  const hasStats = archStats.architectureReadiness || archStats.automation ||
                   archStats.connectedSystems || archStats.disconnectedSystems;
  if (hasStats) {
    const statsBar = document.createElement('div');
    statsBar.className = 'dae-stats-bar';

    [
      { value: `${archStats.architectureReadiness || 0}%`, label: 'Architecture Readiness' },
      { value: `${archStats.automation || 0}%`,            label: 'Automation' },
      { value: archStats.connectedSystems || 0,            label: 'Connected Systems' },
      { value: archStats.disconnectedSystems || 0,         label: 'Disconnected Systems' },
    ].forEach(stat => {
      const cell = document.createElement('div');
      cell.className = 'dae-stat-cell';
      const val = document.createElement('p');
      val.className = 'dae-stat-cell__value';
      val.textContent = stat.value;
      const lbl = document.createElement('p');
      lbl.className = 'dae-stat-cell__label';
      lbl.textContent = stat.label;
      cell.appendChild(val);
      cell.appendChild(lbl);
      statsBar.appendChild(cell);
    });

    wrap.appendChild(statsBar);
  }

  // ── Architecture Health Timeline ──────────────────────────────────────────

  if (healthTimeline.length) {
    const timelineSection = document.createElement('div');
    timelineSection.className = 'dae-timeline';

    const timelineLbl = document.createElement('p');
    timelineLbl.className = 'dae-timeline__heading';
    timelineLbl.textContent = 'Architecture Health Timeline';
    timelineSection.appendChild(timelineLbl);

    const timelineRows = document.createElement('div');
    timelineRows.className = 'dae-timeline__rows';

    healthTimeline.forEach(item => {
      const row = document.createElement('div');
      row.className = 'dae-timeline-row';

      const iconWrap = document.createElement('div');
      iconWrap.className = `dae-timeline-row__icon ${HEALTH_CLASS[item.health] || 'dae-health--pending'}`;
      iconWrap.textContent = HEALTH_ICON[item.health] || '◷';
      row.appendChild(iconWrap);

      const text = document.createElement('div');
      text.className = 'dae-timeline-row__text';

      const stageName = document.createElement('p');
      stageName.className = 'dae-timeline-row__stage';
      stageName.textContent = item.stage;
      text.appendChild(stageName);

      if (item.status) {
        const stageStatus = document.createElement('p');
        stageStatus.className = 'dae-timeline-row__status';
        stageStatus.textContent = item.status;
        text.appendChild(stageStatus);
      }

      row.appendChild(text);

      const healthPill = document.createElement('span');
      healthPill.className = `dae-health-pill ${HEALTH_CLASS[item.health] || 'dae-health--pending'}`;
      healthPill.textContent = item.health;
      row.appendChild(healthPill);

      timelineRows.appendChild(row);
    });

    timelineSection.appendChild(timelineRows);
    wrap.appendChild(timelineSection);
  }

  // ── Leadership question footer ────────────────────────────────────────────

  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'dae-leadership';
    footer.innerHTML = `<span class="dae-leadership__icon">?</span><p class="dae-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── Data Readiness — AI Data Preparation ──────────────────────────────────────

function buildAIDataPreparationLayout(section) {
  const b                = section.brief || {};
  const inputDatasets    = b.inputDatasets       || [];
  const pipelineStages   = b.pipelineStages      || [];
  const prepRecs         = b.prepRecommendations || [];
  const dataStats        = b.dataStats           || {};
  const readiness        = b.readinessSummary    || {};
  const leadershipQ      = b.leadershipValidation?.context || '';

  const wrap = document.createElement('div');
  wrap.className = 'adp-view';

  // Top-right AI Readiness badge
  if (readiness.aiReadiness) {
    const badge = document.createElement('div');
    badge.className = 'adp-readiness-badge';
    badge.textContent = `AI READINESS: ${readiness.aiReadiness}%`;
    wrap.appendChild(badge);
  }

  // Strategic position
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'adp-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // Three-column body
  const body = document.createElement('div');
  body.className = 'adp-body';

  // ── LEFT: Input Datasets ──────────────────────────────────────────────────

  const leftCol = document.createElement('div');
  leftCol.className = 'adp-col adp-col--left';

  const leftLbl = document.createElement('p');
  leftLbl.className = 'brief-label';
  leftLbl.textContent = 'Input Datasets';
  leftCol.appendChild(leftLbl);

  const STATUS_ICON = { AVAILABLE: '◉', MISSING: '◎', 'IN PROGRESS': '◷' };
  const STATUS_CLASS = { AVAILABLE: 'adp-status--available', MISSING: 'adp-status--missing', 'IN PROGRESS': 'adp-status--progress' };

  inputDatasets.forEach(ds => {
    const card = document.createElement('div');
    card.className = 'adp-dataset-card';

    const icon = document.createElement('div');
    icon.className = 'adp-dataset-card__icon';
    icon.textContent = STATUS_ICON[ds.status] || '◉';
    card.appendChild(icon);

    const name = document.createElement('p');
    name.className = 'adp-dataset-card__name';
    name.textContent = ds.name;
    card.appendChild(name);

    const statusBadge = document.createElement('span');
    statusBadge.className = `adp-status ${STATUS_CLASS[ds.status] || 'adp-status--available'}`;
    statusBadge.textContent = ds.status;
    card.appendChild(statusBadge);

    leftCol.appendChild(card);
  });

  if (!inputDatasets.length) {
    const empty = document.createElement('p');
    empty.className = 'adp-empty';
    empty.textContent = 'Dataset list will appear after generation.';
    leftCol.appendChild(empty);
  }

  body.appendChild(leftCol);

  // ── CENTER: Pipeline circles ──────────────────────────────────────────────

  const centerCol = document.createElement('div');
  centerCol.className = 'adp-col adp-col--center';

  const centerLbl = document.createElement('p');
  centerLbl.className = 'brief-label';
  centerLbl.textContent = 'AI Data Preparation Pipeline';
  centerCol.appendChild(centerLbl);

  const circleGrid = document.createElement('div');
  circleGrid.className = 'adp-pipeline-grid';

  const STAGE_STATUS_CLASS = {
    'Completed':       'adp-circle--completed',
    'Needs Attention': 'adp-circle--attention',
    'In Progress':     'adp-circle--progress',
    'Pending':         'adp-circle--pending',
  };

  pipelineStages.forEach(stage => {
    const cell = document.createElement('div');
    cell.className = 'adp-pipeline-cell';

    const circle = document.createElement('div');
    circle.className = `adp-circle ${STAGE_STATUS_CLASS[stage.status] || 'adp-circle--pending'}`;

    const stageName = document.createElement('p');
    stageName.className = 'adp-circle__name';
    stageName.textContent = stage.stage;
    circle.appendChild(stageName);

    const stageStatus = document.createElement('p');
    stageStatus.className = 'adp-circle__status';
    stageStatus.textContent = stage.status;
    circle.appendChild(stageStatus);

    cell.appendChild(circle);
    circleGrid.appendChild(cell);
  });

  centerCol.appendChild(circleGrid);
  body.appendChild(centerCol);

  // ── RIGHT: Recommendations + Stats ───────────────────────────────────────

  const rightCol = document.createElement('div');
  rightCol.className = 'adp-col adp-col--right';

  if (prepRecs.length) {
    const recLbl = document.createElement('p');
    recLbl.className = 'brief-label';
    recLbl.textContent = 'AI Recommendations';
    rightCol.appendChild(recLbl);

    const PRIORITY_CLASS = { HIGH: 'adp-badge--high', MEDIUM: 'adp-badge--medium', LOW: 'adp-badge--low' };

    prepRecs.forEach(rec => {
      const recCard = document.createElement('div');
      recCard.className = 'adp-rec-card';

      const bullet = document.createElement('span');
      bullet.className = 'adp-rec-card__bullet';
      rightCol.appendChild; // placeholder
      recCard.appendChild(bullet);

      const recBody = document.createElement('div');
      recBody.className = 'adp-rec-card__body';

      const recText = document.createElement('p');
      recText.className = 'adp-rec-card__text';
      recText.textContent = rec.text;
      recBody.appendChild(recText);

      const recMeta = document.createElement('div');
      recMeta.className = 'adp-rec-card__meta';
      recMeta.innerHTML = `
        <span>Priority: <strong>${rec.priority}</strong></span>
        <span>Effort: <strong>${rec.effort}</strong></span>
        ${rec.impact ? `<span>Expected Impact: <em>${rec.impact}</em></span>` : ''}`;
      recBody.appendChild(recMeta);

      recCard.appendChild(recBody);
      rightCol.appendChild(recCard);
    });
  }

  // Data stats
  if (dataStats.dataQuality || dataStats.traceability || dataStats.missingData !== undefined) {
    const statsDivider = document.createElement('div');
    statsDivider.className = 'adp-stats-divider';
    rightCol.appendChild(statsDivider);

    const statsBlock = document.createElement('div');
    statsBlock.className = 'adp-stats-block';

    [
      { value: dataStats.missingData ?? 0, label: 'Missing Data', isCount: true },
      { value: dataStats.dataQuality  ?? 0, label: 'Data Quality',  isCount: false },
      { value: dataStats.traceability ?? 0, label: 'Traceability',  isCount: false },
    ].forEach(stat => {
      const statEl = document.createElement('div');
      statEl.className = 'adp-stat';
      const valEl = document.createElement('p');
      valEl.className = 'adp-stat__value';
      valEl.textContent = stat.isCount ? stat.value : `${stat.value}`;
      const lblEl = document.createElement('p');
      lblEl.className = 'adp-stat__label';
      lblEl.textContent = stat.label;
      statEl.appendChild(valEl);
      statEl.appendChild(lblEl);
      statsBlock.appendChild(statEl);
    });

    rightCol.appendChild(statsBlock);
  }

  body.appendChild(rightCol);
  wrap.appendChild(body);

  // ── Readiness Summary 2×2 grid ────────────────────────────────────────────

  const hasReadiness = readiness.quality || readiness.standardization ||
                       readiness.integration || readiness.aiReadiness;
  if (hasReadiness) {
    const readinessSection = document.createElement('div');
    readinessSection.className = 'adp-readiness';

    const readinessLbl = document.createElement('p');
    readinessLbl.className = 'adp-readiness__label';
    readinessLbl.textContent = 'Readiness Summary';
    readinessSection.appendChild(readinessLbl);

    const readinessGrid = document.createElement('div');
    readinessGrid.className = 'adp-readiness-grid';

    [
      { label: 'Quality',          value: readiness.quality },
      { label: 'Standardization',  value: readiness.standardization },
      { label: 'Integration',      value: readiness.integration },
      { label: 'AI Readiness',     value: readiness.aiReadiness },
    ].forEach(item => {
      const cell = document.createElement('div');
      cell.className = 'adp-readiness-cell';

      const cellLabel = document.createElement('p');
      cellLabel.className = 'adp-readiness-cell__label';
      cellLabel.textContent = item.label;
      cell.appendChild(cellLabel);

      const cellValue = document.createElement('p');
      cellValue.className = 'adp-readiness-cell__value';
      cellValue.textContent = `${item.value || 0}%`;
      cell.appendChild(cellValue);

      readinessGrid.appendChild(cell);
    });

    readinessSection.appendChild(readinessGrid);
    wrap.appendChild(readinessSection);
  }

  // ── Leadership question footer ────────────────────────────────────────────

  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'adp-leadership';
    footer.innerHTML = `<span class="adp-leadership__icon">?</span><p class="adp-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── Data Readiness — Critical Data Identification ─────────────────────────────

function buildCriticalDataLayout(section) {
  const b               = section.brief || {};
  const datasets        = b.datasets        || [];
  const relationshipMap = b.relationshipMap || {};
  const recommendations = b.recommendations || [];
  const coverage        = b.coverageSummary || {};
  const leadershipQ     = b.leadershipValidation?.context || b.successMetrics?.[0] || '';

  const wrap = document.createElement('div');
  wrap.className = 'cdi-view';

  // Strategic position
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'cdi-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // Two-panel body
  const body = document.createElement('div');
  body.className = 'cdi-body';

  // LEFT: Dataset cards
  const leftPanel = document.createElement('div');
  leftPanel.className = 'cdi-left';

  const datasetLbl = document.createElement('p');
  datasetLbl.className = 'brief-label';
  datasetLbl.textContent = 'Critical Datasets';
  leftPanel.appendChild(datasetLbl);

  const PRIORITY_CLASS = { HIGH: 'cdi-badge--high', MEDIUM: 'cdi-badge--medium', LOW: 'cdi-badge--low' };
  const AVAIL_CLASS    = { AVAILABLE: 'cdi-avail--available', MISSING: 'cdi-avail--missing', PARTIAL: 'cdi-avail--partial' };

  datasets.forEach(ds => {
    const card = document.createElement('div');
    card.className = 'cdi-dataset-card';

    const badges = document.createElement('div');
    badges.className = 'cdi-dataset-card__badges';
    const priB = document.createElement('span');
    priB.className = `cdi-badge ${PRIORITY_CLASS[ds.priority] || 'cdi-badge--medium'}`;
    priB.textContent = ds.priority || 'MEDIUM';
    const availB = document.createElement('span');
    availB.className = `cdi-avail ${AVAIL_CLASS[ds.availability] || ''}`;
    availB.textContent = ds.availability || '';
    badges.appendChild(priB);
    badges.appendChild(availB);
    card.appendChild(badges);

    const name = document.createElement('p');
    name.className = 'cdi-dataset-card__name';
    name.textContent = ds.name;
    card.appendChild(name);

    if (ds.purpose) {
      const purp = document.createElement('p');
      purp.className = 'cdi-dataset-card__purpose';
      purp.textContent = ds.purpose;
      card.appendChild(purp);
    }

    if (ds.category) {
      const cat = document.createElement('span');
      cat.className = 'cdi-dataset-card__category';
      cat.textContent = ds.category;
      card.appendChild(cat);
    }

    leftPanel.appendChild(card);
  });

  if (!datasets.length) {
    const empty = document.createElement('p');
    empty.className = 'cdi-empty';
    empty.textContent = 'Dataset analysis will appear after blueprint generation.';
    leftPanel.appendChild(empty);
  }

  body.appendChild(leftPanel);

  // RIGHT: Relationship map + recommendations + coverage
  const rightPanel = document.createElement('div');
  rightPanel.className = 'cdi-right';

  // Relationship map
  const hasRelMap = [relationshipMap.dataSource, relationshipMap.dependentData,
                     relationshipMap.relatedData, relationshipMap.targetData].some(a => a?.length);
  if (hasRelMap) {
    const relSection = document.createElement('div');
    relSection.className = 'cdi-relmap';
    const relLbl = document.createElement('p');
    relLbl.className = 'brief-label';
    relLbl.textContent = 'Data Relationship Map';
    relSection.appendChild(relLbl);

    const relGrid = document.createElement('div');
    relGrid.className = 'cdi-relmap__grid';

    const REL_NODES = [
      { key: 'dataSource',    label: 'Data Source',     icon: '◉' },
      { key: 'dependentData', label: 'Dependent Data',  icon: '◈' },
      { key: 'relatedData',   label: 'Related Data',    icon: '◇' },
      { key: 'targetData',    label: 'Target Data',     icon: '◆' },
    ];

    REL_NODES.forEach((node, i) => {
      const items = relationshipMap[node.key] || [];
      const nodeEl = document.createElement('div');
      nodeEl.className = `cdi-relnode cdi-relnode--${node.key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;

      const nodeHeader = document.createElement('div');
      nodeHeader.className = 'cdi-relnode__header';
      nodeHeader.innerHTML = `<span class="cdi-relnode__icon">${node.icon}</span><span class="cdi-relnode__label">${node.label}</span>`;
      nodeEl.appendChild(nodeHeader);

      if (items.length) {
        const list = document.createElement('ul');
        list.className = 'cdi-relnode__list';
        items.slice(0, 3).forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          list.appendChild(li);
        });
        nodeEl.appendChild(list);
      }

      relGrid.appendChild(nodeEl);

      // Arrow connector between nodes (skip after last)
      if (i < REL_NODES.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'cdi-relmap__arrow';
        arrow.textContent = '→';
        relGrid.appendChild(arrow);
      }
    });

    relSection.appendChild(relGrid);
    rightPanel.appendChild(relSection);
  }

  // AI Recommendations
  if (recommendations.length) {
    const recSection = document.createElement('div');
    recSection.className = 'cdi-recs';
    const recLbl = document.createElement('p');
    recLbl.className = 'brief-label';
    recLbl.textContent = 'Data Collection Recommendations';
    recSection.appendChild(recLbl);

    recommendations.forEach((rec, i) => {
      const row = document.createElement('div');
      row.className = 'cdi-rec-row';
      const num = document.createElement('span');
      num.className = 'cdi-rec-row__num';
      num.textContent = i + 1;
      const text = document.createElement('p');
      text.className = 'cdi-rec-row__text';
      text.textContent = rec.text;
      const priB = document.createElement('span');
      priB.className = `cdi-badge ${PRIORITY_CLASS[rec.priority] || 'cdi-badge--medium'}`;
      priB.textContent = rec.priority || 'MEDIUM';
      row.appendChild(num);
      row.appendChild(text);
      row.appendChild(priB);
      recSection.appendChild(row);
    });

    rightPanel.appendChild(recSection);
  }

  // Coverage summary
  if (coverage.criticalDatasets || coverage.confidence) {
    const covSection = document.createElement('div');
    covSection.className = 'cdi-coverage';
    const covLbl = document.createElement('p');
    covLbl.className = 'brief-label';
    covLbl.textContent = 'Coverage Summary';
    covSection.appendChild(covLbl);

    const covStats = document.createElement('div');
    covStats.className = 'cdi-coverage__stats';

    [
      { value: coverage.criticalDatasets || 0, label: 'Datasets Identified' },
      { value: coverage.missingData || 0,       label: 'Missing or Partial' },
      { value: `${coverage.confidence || 0}%`,  label: 'Data Confidence' },
    ].forEach(stat => {
      const cell = document.createElement('div');
      cell.className = 'cdi-coverage__cell';
      const val = document.createElement('p');
      val.className = 'cdi-coverage__value';
      val.textContent = stat.value;
      const lbl = document.createElement('p');
      lbl.className = 'cdi-coverage__label';
      lbl.textContent = stat.label;
      cell.appendChild(val);
      cell.appendChild(lbl);
      covStats.appendChild(cell);
    });

    covSection.appendChild(covStats);
    rightPanel.appendChild(covSection);
  }

  body.appendChild(rightPanel);
  wrap.appendChild(body);

  // Leadership question footer
  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'cdi-leadership';
    footer.innerHTML = `<span class="cdi-leadership__icon">?</span><p class="cdi-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── Technology Infrastructure — System Integration & Architecture ─────────────

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
  const b                  = section.brief || {};
  const connectedSystems   = b.connectedSystems   || [];
  const integrationSummary = b.integrationSummary || {};
  const leadershipQ        = b.leadershipValidation?.context || '';

  const STATUS_CLASS = {
    CONNECTED: 'sia-status--connected',
    PARTIAL:   'sia-status--partial',
    MISSING:   'sia-status--missing',
  };

  const wrap = document.createElement('div');
  wrap.className = 'sia-view';

  // Integration readiness badge (top-right)
  if (b.integrationReadiness) {
    const badge = document.createElement('div');
    badge.className = 'sia-readiness-badge';
    badge.textContent = `INTEGRATION READINESS: ${b.integrationReadiness}%`;
    wrap.appendChild(badge);
  }

  // Strategic position
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

  // ── Two-column body ───────────────────────────────────────────────────────

  const body = document.createElement('div');
  body.className = 'sia-body';

  // LEFT: Connected Systems 2×2 grid
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

    const badge = document.createElement('span');
    badge.className = `sia-status ${STATUS_CLASS[status] || 'sia-status--missing'}`;
    badge.textContent = status;
    card.appendChild(badge);

    sysGrid.appendChild(card);
  });

  if (!connectedSystems.length) {
    const empty = document.createElement('p');
    empty.className = 'sia-empty';
    empty.textContent = 'System inventory will appear after generation.';
    sysGrid.appendChild(empty);
  }

  leftCol.appendChild(sysGrid);
  body.appendChild(leftCol);

  // RIGHT: AI Integration Architecture SVG
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

  // ── Bottom 2×2 summary grid ───────────────────────────────────────────────

  const hasSummary = integrationSummary.integration || integrationSummary.automation ||
                     integrationSummary.reliability || integrationSummary.scalability;
  if (hasSummary) {
    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'sia-summary-grid';

    [
      { label: 'Integration', value: integrationSummary.integration },
      { label: 'Automation',  value: integrationSummary.automation },
      { label: 'Reliability', value: integrationSummary.reliability },
      { label: 'Scalability', value: integrationSummary.scalability },
    ].forEach(item => {
      const cell = document.createElement('div');
      cell.className = 'sia-summary-cell';

      const label = document.createElement('p');
      label.className = 'sia-summary-cell__label';
      label.textContent = item.label;
      cell.appendChild(label);

      if (item.value) {
        const value = document.createElement('p');
        value.className = 'sia-summary-cell__value';
        value.textContent = item.value;
        cell.appendChild(value);
      }

      summaryGrid.appendChild(cell);
    });

    wrap.appendChild(summaryGrid);
  }

  // ── Leadership question footer ────────────────────────────────────────────

  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'sia-leadership';
    footer.innerHTML = `<span class="sia-leadership__icon">?</span><p class="sia-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── Technology Infrastructure — AI Platform Readiness ────────────────────────

function buildPlatformReadinessLayout(section) {
  const b                      = section.brief || {};
  const capabilityAssessment   = b.capabilityAssessment   || [];
  const platformStack          = b.platformStack          || [];
  const platformRecommendations = b.platformRecommendations || [];
  const platformSummary        = b.platformSummary        || {};
  const leadershipQ            = b.leadershipValidation?.context || '';

  const STATUS_CLASS = {
    READY:   'apr-status--ready',
    PARTIAL: 'apr-status--partial',
    MISSING: 'apr-status--missing',
  };

  const PRIORITY_CLASS = {
    HIGH:   'apr-priority--high',
    MEDIUM: 'apr-priority--medium',
    LOW:    'apr-priority--low',
  };

  const STACK_ICONS = {
    'AI Applications':                '⊞',
    'AI Model & Prompt Management':   '⚙',
    'Knowledge & Retrieval Services': '◻',
    'AI Deployment & Automation':     '▷',
    'AI Monitoring & Evaluation':     '△',
    'AI Development Environment':     '⌨',
  };

  const wrap = document.createElement('div');
  wrap.className = 'apr-view';

  // Platform readiness badge (top-right)
  if (b.platformReadiness) {
    const badge = document.createElement('div');
    badge.className = 'apr-readiness-badge';
    badge.textContent = `PLATFORM READINESS: ${b.platformReadiness}%`;
    wrap.appendChild(badge);
  }

  // Strategic position
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

  // ── Three-column body ─────────────────────────────────────────────────────

  const body = document.createElement('div');
  body.className = 'apr-body';

  // LEFT: Platform Capability Assessment cards
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

  if (!capabilityAssessment.length) {
    const empty = document.createElement('p');
    empty.className = 'apr-empty';
    empty.textContent = 'Capability assessment will appear after generation.';
    leftCol.appendChild(empty);
  }

  body.appendChild(leftCol);

  // CENTER: AI Platform Stack (6 fixed layers)
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

  // RIGHT: AI Recommendations
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
    const priorityKey = (rec.priority || 'MEDIUM').toUpperCase();
    priority.innerHTML = `Priority: <span class="apr-priority ${PRIORITY_CLASS[priorityKey] || 'apr-priority--medium'}">${rec.priority || 'MEDIUM'}</span>`;
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

  // ── Bottom 2×2 summary grid ───────────────────────────────────────────────

  const hasSummary = platformSummary.development || platformSummary.knowledge ||
                     platformSummary.deployment  || platformSummary.monitoring;
  if (hasSummary) {
    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'apr-summary-grid';

    [
      { label: 'Development', value: platformSummary.development },
      { label: 'Knowledge',   value: platformSummary.knowledge },
      { label: 'Deployment',  value: platformSummary.deployment },
      { label: 'Monitoring',  value: platformSummary.monitoring },
    ].forEach(item => {
      const cell = document.createElement('div');
      cell.className = 'apr-summary-cell';

      const label = document.createElement('p');
      label.className = 'apr-summary-cell__label';
      label.textContent = item.label;
      cell.appendChild(label);

      if (item.value) {
        const value = document.createElement('p');
        value.className = 'apr-summary-cell__value';
        value.textContent = item.value;
        cell.appendChild(value);
      }

      summaryGrid.appendChild(cell);
    });

    wrap.appendChild(summaryGrid);
  }

  // ── Leadership question footer ────────────────────────────────────────────

  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'apr-leadership';
    footer.innerHTML = `<span class="apr-leadership__icon">?</span><p class="apr-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
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
  const b                       = section.brief || {};
  const workloadProfile         = b.workloadProfile || [];
  const deploymentRecommendations = b.deploymentRecommendations || [];
  const deploymentScores        = b.deploymentScores || {};
  const deploymentKpis          = b.deploymentKpis || {};
  const leadershipQ             = b.leadershipValidation?.context || '';

  const PRIORITY_CLASS = {
    CRITICAL: 'cds-priority--critical',
    HIGH:     'cds-priority--high',
    MEDIUM:   'cds-priority--medium',
    LOW:      'cds-priority--low',
  };

  const IMPACT_CLASS = {
    High:   'cds-impact--high',
    Medium: 'cds-impact--medium',
    Low:    'cds-impact--low',
  };

  const wrap = document.createElement('div');
  wrap.className = 'cds-view';

  // Deployment readiness badge (top-right)
  if (b.deploymentReadiness) {
    const badge = document.createElement('div');
    badge.className = 'cds-readiness-badge';
    badge.textContent = `DEPLOYMENT READINESS: ${b.deploymentReadiness}%`;
    wrap.appendChild(badge);
  }

  // Strategic position
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

  // ── Two-column body ───────────────────────────────────────────────────────

  const body = document.createElement('div');
  body.className = 'cds-body';

  // LEFT: AI Workload Profile cards
  const workloadCol = document.createElement('div');
  workloadCol.className = 'cds-workload-col';

  const workloadLbl = document.createElement('p');
  workloadLbl.className = 'brief-label';
  workloadLbl.textContent = 'AI Workload Profile';
  workloadCol.appendChild(workloadLbl);

  workloadProfile.forEach(wl => {
    const card = document.createElement('div');
    card.className = 'cds-workload-card';

    const name = document.createElement('p');
    name.className = 'cds-workload-card__name';
    name.textContent = wl.workloadType;
    card.appendChild(name);

    [
      ['Compute Requirement',     wl.computeRequirement],
      ['Performance Requirement', wl.performanceRequirement],
      ['Scalability Requirement', wl.scalabilityRequirement],
    ].forEach(([label, value]) => {
      if (!value) return;
      const row = document.createElement('p');
      row.className = 'cds-workload-card__spec';
      row.innerHTML = `<span class="cds-workload-card__spec-label">${label}:</span> ${value}`;
      card.appendChild(row);
    });

    const badge = document.createElement('span');
    badge.className = `cds-priority ${PRIORITY_CLASS[wl.priority] || 'cds-priority--medium'}`;
    badge.textContent = `PRIORITY: ${wl.priority || 'MEDIUM'}`;
    card.appendChild(badge);

    workloadCol.appendChild(card);
  });

  if (!workloadProfile.length) {
    const empty = document.createElement('p');
    empty.className = 'cds-empty';
    empty.textContent = 'Workload profile will appear after generation.';
    workloadCol.appendChild(empty);
  }

  body.appendChild(workloadCol);

  // RIGHT: Canvas + Recommendations
  const rightCol = document.createElement('div');
  rightCol.className = 'cds-right-col';

  // Deployment Decision Canvas SVG
  const canvasSection = document.createElement('div');
  canvasSection.className = 'cds-canvas-section';
  const canvasLbl = document.createElement('p');
  canvasLbl.className = 'brief-label';
  canvasLbl.textContent = 'Deployment Decision Canvas';
  canvasSection.appendChild(canvasLbl);
  const canvasPannel = document.createElement('div');
  canvasPannel.className = 'cds-canvas-panel';
  canvasPannel.appendChild(buildDeploymentCanvasSvg(deploymentScores));
  canvasSection.appendChild(canvasPannel);
  rightCol.appendChild(canvasSection);

  // AI Recommendations grid
  if (deploymentRecommendations.length) {
    const recsSection = document.createElement('div');
    recsSection.className = 'cds-recs-section';
    const recsLbl = document.createElement('p');
    recsLbl.className = 'brief-label';
    recsLbl.textContent = 'AI Recommendations';
    recsSection.appendChild(recsLbl);

    const recsGrid = document.createElement('div');
    recsGrid.className = 'cds-recs-grid';

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

  // ── Deployment Scores bar ─────────────────────────────────────────────────

  if (deploymentScores.computeFit || deploymentScores.deploymentConfidence || deploymentScores.estimatedScalability) {
    const scoresBar = document.createElement('div');
    scoresBar.className = 'cds-scores-bar';

    [
      { value: `${deploymentScores.computeFit || 0}%`,           label: 'Compute Fit' },
      { value: deploymentScores.estimatedScalability || '—',     label: 'Estimated Scalability' },
      { value: `${deploymentScores.deploymentConfidence || 0}%`, label: 'Deployment Confidence' },
    ].forEach(stat => {
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

  // ── Deployment Summary KPIs ───────────────────────────────────────────────

  const hasKpis = deploymentKpis.compute || deploymentKpis.deployment ||
                  deploymentKpis.latency || deploymentKpis.scalability;
  if (hasKpis) {
    const kpiSection = document.createElement('div');
    kpiSection.className = 'cds-kpi-section';
    const kpiLbl = document.createElement('p');
    kpiLbl.className = 'cds-kpi-section__label';
    kpiLbl.textContent = 'Deployment Summary KPIs';
    kpiSection.appendChild(kpiLbl);

    const kpiBar = document.createElement('div');
    kpiBar.className = 'cds-kpi-bar';

    [
      { label: 'Compute',     value: deploymentKpis.compute },
      { label: 'Deployment',  value: deploymentKpis.deployment },
      { label: 'Latency',     value: deploymentKpis.latency },
      { label: 'Scalability', value: deploymentKpis.scalability },
    ].filter(k => k.value).forEach(kpi => {
      const item = document.createElement('div');
      item.className = 'cds-kpi-item';
      const label = document.createElement('p');
      label.className = 'cds-kpi-item__label';
      label.textContent = kpi.label;
      const value = document.createElement('p');
      value.className = 'cds-kpi-item__value';
      value.textContent = kpi.value;
      item.appendChild(label);
      item.appendChild(value);
      kpiBar.appendChild(item);
    });

    kpiSection.appendChild(kpiBar);
    wrap.appendChild(kpiSection);
  }

  // ── Leadership question footer ────────────────────────────────────────────

  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'cds-leadership';
    footer.innerHTML = `<span class="cds-leadership__icon">?</span><p class="cds-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── Technology Infrastructure — AI Engineering Enablement ─────────────────────

function buildEngineeringLifecycleSvg(stages) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 320, H = 300;
  const cx = W / 2, cy = H / 2;
  const R = 105;
  const n = stages.length || 6;
  const nodeW = 62, nodeH = 40;
  const angOff = 0.30;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'AI Engineering Lifecycle');
  svg.classList.add('aee-lifecycle-svg');

  // Defs: arrowhead marker
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'aee-arrow');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(NS, 'path');
  arrowPath.setAttribute('d', 'M0,0 L0,6 L8,3 z');
  arrowPath.setAttribute('fill', 'rgba(129,140,248,0.65)');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Background dashed ring
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', R);
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'rgba(99,102,241,0.12)');
  ring.setAttribute('stroke-width', '1.5');
  ring.setAttribute('stroke-dasharray', '5,4');
  svg.appendChild(ring);

  // Center labels
  ['Engineering', 'Lifecycle'].forEach((word, i) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', cx); t.setAttribute('y', cy + (i - 0.5) * 13);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '8');
    t.setAttribute('fill', 'rgba(255,255,255,0.3)');
    t.textContent = word;
    svg.appendChild(t);
  });

  const angOf = i => i * (2 * Math.PI / n) - Math.PI / 2;

  // Draw arc arrows between consecutive nodes
  for (let i = 0; i < n; i++) {
    const startA = angOf(i) + angOff;
    const endA   = angOf(i + 1) - angOff;
    const x1 = cx + R * Math.cos(startA);
    const y1 = cy + R * Math.sin(startA);
    const x2 = cx + R * Math.cos(endA);
    const y2 = cy + R * Math.sin(endA);
    const arcPath = document.createElementNS(NS, 'path');
    arcPath.setAttribute('d', `M ${x1.toFixed(1)},${y1.toFixed(1)} A ${R},${R} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)}`);
    arcPath.setAttribute('fill', 'none');
    arcPath.setAttribute('stroke', 'rgba(129,140,248,0.4)');
    arcPath.setAttribute('stroke-width', '1.5');
    arcPath.setAttribute('marker-end', 'url(#aee-arrow)');
    svg.appendChild(arcPath);
  }

  // Draw node rectangles on top of arcs
  stages.forEach((stage, i) => {
    const angle  = angOf(i);
    const nx     = cx + R * Math.cos(angle);
    const ny     = cy + R * Math.sin(angle);
    const autoColor = stage.automation === 'High'   ? '#5CC5A7'
                    : stage.automation === 'Medium' ? '#fbbf24'
                    : 'rgba(255,255,255,0.38)';

    const g = document.createElementNS(NS, 'g');

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x',      (nx - nodeW / 2).toFixed(1));
    rect.setAttribute('y',      (ny - nodeH / 2).toFixed(1));
    rect.setAttribute('width',  nodeW);
    rect.setAttribute('height', nodeH);
    rect.setAttribute('rx',     '7');
    rect.setAttribute('fill',   'rgba(10,10,20,0.92)');
    rect.setAttribute('stroke', 'rgba(99,102,241,0.5)');
    rect.setAttribute('stroke-width', '1.5');
    g.appendChild(rect);

    const mkText = (text, dy, size, fill, weight) => {
      const el = document.createElementNS(NS, 'text');
      el.setAttribute('x', nx.toFixed(1));
      el.setAttribute('y', (ny + dy).toFixed(1));
      el.setAttribute('text-anchor', 'middle');
      el.setAttribute('dominant-baseline', 'middle');
      el.setAttribute('font-size', size);
      el.setAttribute('fill', fill);
      if (weight) el.setAttribute('font-weight', weight);
      el.textContent = text;
      return el;
    };

    g.appendChild(mkText(stage.stage,                   -8,  '8.5', 'rgba(255,255,255,0.92)', '700'));
    g.appendChild(mkText(`${stage.readiness}%`,          3,  '7',   'rgba(255,255,255,0.5)',  null));
    g.appendChild(mkText(stage.automation || '',         13, '6.5', autoColor,                 null));
    svg.appendChild(g);
  });

  return svg;
}

function buildAIEngineeringEnablementLayout(section) {
  const b                      = section.brief || {};
  const engineeringCapabilities  = b.engineeringCapabilities    || [];
  const engineeringLifecycle     = b.engineeringLifecycle       || [];
  const engineeringRecs          = b.engineeringRecommendations || [];
  const automationStats          = b.automationStats            || {};
  const engineeringSummary       = b.engineeringSummary         || {};
  const leadershipQ              = b.leadershipValidation?.context || '';

  const STATUS_CLASS = {
    READY:     'aee-status--ready',
    PARTIAL:   'aee-status--partial',
    ATTENTION: 'aee-status--attention',
  };
  const PRIORITY_CLASS = {
    HIGH:   'aee-priority--high',
    MEDIUM: 'aee-priority--medium',
    LOW:    'aee-priority--low',
  };

  const wrap = document.createElement('div');
  wrap.className = 'aee-view';

  // Engineering readiness badge
  if (b.engineeringReadiness) {
    const badge = document.createElement('div');
    badge.className = 'aee-readiness-badge';
    badge.textContent = `ENGINEERING READINESS: ${b.engineeringReadiness}%`;
    wrap.appendChild(badge);
  }

  // Strategic position
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'aee-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // ── Three-column body ─────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'aee-body';

  // LEFT: Engineering Capabilities
  const leftCol = document.createElement('div');
  leftCol.className = 'aee-capabilities-col';
  const capLbl = document.createElement('p');
  capLbl.className = 'brief-label';
  capLbl.textContent = 'Engineering Capabilities';
  leftCol.appendChild(capLbl);

  if (engineeringCapabilities.length) {
    engineeringCapabilities.forEach(cap => {
      const status = String(cap.status || 'PARTIAL').toUpperCase();
      const card   = document.createElement('div');
      card.className = `aee-cap-card aee-cap-card--${status.toLowerCase()}`;

      const name = document.createElement('p');
      name.className = 'aee-cap-card__name';
      name.textContent = cap.name;
      card.appendChild(name);

      const score = document.createElement('p');
      score.className = 'aee-cap-card__score';
      score.textContent = `Readiness Score: ${cap.score}%`;
      card.appendChild(score);

      const badge = document.createElement('span');
      badge.className = `aee-status ${STATUS_CLASS[status] || 'aee-status--partial'}`;
      badge.textContent = status === 'ATTENTION' ? 'Needs Attention' : status.charAt(0) + status.slice(1).toLowerCase();
      card.appendChild(badge);

      leftCol.appendChild(card);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'aee-empty';
    empty.textContent = 'Capability assessment will appear after generation.';
    leftCol.appendChild(empty);
  }
  body.appendChild(leftCol);

  // CENTER: AI Engineering Lifecycle
  const centerCol = document.createElement('div');
  centerCol.className = 'aee-lifecycle-col';
  const lifecycleLbl = document.createElement('p');
  lifecycleLbl.className = 'brief-label';
  lifecycleLbl.textContent = 'AI Engineering Lifecycle';
  centerCol.appendChild(lifecycleLbl);
  const svgWrap = document.createElement('div');
  svgWrap.className = 'aee-lifecycle-wrap';
  svgWrap.appendChild(buildEngineeringLifecycleSvg(engineeringLifecycle));
  centerCol.appendChild(svgWrap);
  body.appendChild(centerCol);

  // RIGHT: AI Recommendations + automation stats
  const rightCol = document.createElement('div');
  rightCol.className = 'aee-recs-col';
  const recsLbl = document.createElement('p');
  recsLbl.className = 'brief-label';
  recsLbl.textContent = 'AI Recommendations';
  rightCol.appendChild(recsLbl);

  const recsList = document.createElement('div');
  recsList.className = 'aee-recs-list';
  engineeringRecs.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'aee-rec-item';

    const text = document.createElement('p');
    text.className = 'aee-rec-item__text';
    text.textContent = rec.text;
    item.appendChild(text);

    const priorityKey = String(rec.priority || 'MEDIUM').toUpperCase();
    const meta = document.createElement('p');
    meta.className = 'aee-rec-item__meta';
    meta.innerHTML = `Priority: <span class="aee-priority ${PRIORITY_CLASS[priorityKey] || 'aee-priority--medium'}">${rec.priority || 'MEDIUM'}</span>`;
    item.appendChild(meta);

    if (rec.businessImpact) {
      const impact = document.createElement('p');
      impact.className = 'aee-rec-item__impact';
      impact.textContent = `Business Impact: ${rec.businessImpact}`;
      item.appendChild(impact);
    }
    recsList.appendChild(item);
  });
  rightCol.appendChild(recsList);

  // Automation stats
  const statsEntries = [
    { label: 'Automation', value: automationStats.automation },
    { label: 'Testing',    value: automationStats.testing },
    { label: 'Deployment', value: automationStats.deployment },
  ].filter(s => s.value);
  if (statsEntries.length) {
    const statsBlock = document.createElement('div');
    statsBlock.className = 'aee-stats-block';
    statsEntries.forEach(s => {
      const row = document.createElement('div');
      row.className = 'aee-stat-row';
      const label = document.createElement('span');
      label.className = 'aee-stat-row__label';
      label.textContent = `${s.label}:`;
      const value = document.createElement('span');
      value.className = 'aee-stat-row__value';
      value.textContent = s.value;
      row.appendChild(label);
      row.appendChild(value);
      statsBlock.appendChild(row);
    });
    rightCol.appendChild(statsBlock);
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // ── Engineering Health Metrics (4-cell grid) ──────────────────────────────
  const hasSummary = engineeringSummary.development || engineeringSummary.testing ||
                     engineeringSummary.deployment  || engineeringSummary.continuousImprovement;
  if (hasSummary) {
    const summaryLbl = document.createElement('p');
    summaryLbl.className = 'brief-label';
    summaryLbl.textContent = 'Engineering Health Metrics';
    wrap.appendChild(summaryLbl);

    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'aee-summary-grid';
    [
      { label: 'Development',            value: engineeringSummary.development },
      { label: 'Testing',                value: engineeringSummary.testing },
      { label: 'Deployment',             value: engineeringSummary.deployment },
      { label: 'Continuous Improvement', value: engineeringSummary.continuousImprovement },
    ].forEach(item => {
      const cell = document.createElement('div');
      cell.className = 'aee-summary-cell';
      const lbl = document.createElement('p');
      lbl.className = 'aee-summary-cell__label';
      lbl.textContent = item.label;
      cell.appendChild(lbl);
      if (item.value) {
        const val = document.createElement('p');
        val.className = 'aee-summary-cell__value';
        val.textContent = item.value;
        cell.appendChild(val);
      }
      summaryGrid.appendChild(cell);
    });
    wrap.appendChild(summaryGrid);
  }

  // ── Leadership question footer ────────────────────────────────────────────
  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'aee-leadership';
    footer.innerHTML = `<span class="aee-leadership__icon">?</span><p class="aee-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }

  return wrap;
}

// ── SVG: Team Network Diagram (AI Team Readiness) ─────────────────────────────
function buildTeamNetworkSvg(roles) {
  const W = 340, H = 280, cx = 170, cy = 140, R = 105;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width',  W);
  svg.setAttribute('height', H);

  const AVAIL_COLOR = { Available: '#5CC5A7', Partial: '#fbbf24', Missing: '#f87171' };
  const DEF_COLOR = '#6b7280';
  const mk = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  // Center hub
  svg.appendChild(mk('circle', { cx, cy, r: 30, fill: '#1e3a5f' }));
  const ht1 = mk('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', fill: '#fff', 'font-size': 8.5, 'font-weight': 700 });
  ht1.textContent = 'AI'; svg.appendChild(ht1);
  const ht2 = mk('text', { x: cx, y: cy + 7, 'text-anchor': 'middle', fill: 'rgba(255,255,255,0.7)', 'font-size': 6.5 });
  ht2.textContent = 'PROJECT'; svg.appendChild(ht2);

  const visible = roles.slice(0, 6);
  const n = visible.length || 1;
  visible.forEach((role, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    const rx = Math.round(cx + R * Math.cos(angle));
    const ry = Math.round(cy + R * Math.sin(angle));
    const color = AVAIL_COLOR[role.availability] || DEF_COLOR;
    const rW = 70, rH = 30;

    svg.appendChild(mk('line', {
      x1: Math.round(cx + 31 * Math.cos(angle)), y1: Math.round(cy + 31 * Math.sin(angle)),
      x2: Math.round(rx - 36 * Math.cos(angle)), y2: Math.round(ry - 36 * Math.sin(angle)),
      stroke: '#2a4a6b', 'stroke-width': 1.5,
    }));
    svg.appendChild(mk('rect', { x: rx - rW / 2, y: ry - rH / 2, width: rW, height: rH, rx: 5, fill: color, opacity: 0.15 }));
    svg.appendChild(mk('rect', { x: rx - rW / 2, y: ry - rH / 2, width: rW, height: rH, rx: 5, fill: 'none', stroke: color, 'stroke-width': 1.5 }));

    const words = role.name.split(' ');
    const l1 = words.slice(0, 2).join(' ');
    const l2 = words.slice(2).join(' ');
    const t1 = mk('text', { x: rx, y: ry + (l2 ? -4 : 2), 'text-anchor': 'middle', fill: color, 'font-size': 6.5, 'font-weight': 600 });
    t1.textContent = l1; svg.appendChild(t1);
    if (l2) {
      const t2 = mk('text', { x: rx, y: ry + 6, 'text-anchor': 'middle', fill: color, 'font-size': 6.5, 'font-weight': 600 });
      t2.textContent = l2; svg.appendChild(t2);
    }
  });
  return svg;
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

// ── Layout: AI Skills Assessment ──────────────────────────────────────────────
function buildAISkillsAssessmentLayout(section) {
  const b                  = section.brief || {};
  const requiredSkills     = b.requiredSkills       || [];
  const skillsMatrix       = b.skillsMatrix         || [];
  const skillsRecs         = b.skillsRecommendations || [];
  const skillsStats        = b.skillsStats          || {};
  const skillsCatSummary   = b.skillsCategorySummary || [];
  const leadershipQ        = b.leadershipValidation?.context || '';

  const AVAIL_COLOR = { Available: 'asa-skill--available', Partial: 'asa-skill--partial', Missing: 'asa-skill--missing' };
  const PRI_CLASS   = { High: 'asa-priority--high', Medium: 'asa-priority--medium', Low: 'asa-priority--low' };
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

  // LEFT: Required Skills
  const leftCol = document.createElement('div');
  leftCol.className = 'asa-skills-col';
  const leftLbl = document.createElement('p');
  leftLbl.className = 'brief-label';
  leftLbl.textContent = 'Required Skills';
  leftCol.appendChild(leftLbl);
  if (requiredSkills.length) {
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
  } else {
    const empty = document.createElement('p');
    empty.className = 'asa-empty';
    empty.textContent = 'Skills data will appear after generation.';
    leftCol.appendChild(empty);
  }
  body.appendChild(leftCol);

  // CENTER: Skills Matrix
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

  // RIGHT: Recommendations + Stats
  const rightCol = document.createElement('div');
  rightCol.className = 'asa-recs-col';
  const recsLbl = document.createElement('p');
  recsLbl.className = 'brief-label';
  recsLbl.textContent = 'AI Recommendations';
  rightCol.appendChild(recsLbl);
  if (skillsRecs.length) {
    const recsList = document.createElement('div');
    recsList.className = 'asa-recs-list';
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
      recsList.appendChild(item);
    });
    rightCol.appendChild(recsList);
  }
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

  // Category Summary grid
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

  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'asa-leadership';
    footer.innerHTML = `<span class="asa-leadership__icon">?</span><p class="asa-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }
  return wrap;
}

// ── Layout: AI Team Readiness ─────────────────────────────────────────────────
function buildAITeamReadinessLayout(section) {
  const b                = section.brief || {};
  const requiredRoles    = b.requiredRoles       || [];
  const teamRecs         = b.teamRecommendations || [];
  const teamStats        = b.teamStats           || {};
  const teamCoverage     = b.teamCoverageSummary  || [];
  const leadershipQ      = b.leadershipValidation?.context || '';

  const AVAIL_COLOR = { Available: 'atr-role--available', Partial: 'atr-role--partial', Missing: 'atr-role--missing' };
  const PRI_CLASS   = { High: 'atr-priority--high', Medium: 'atr-priority--medium', Low: 'atr-priority--low' };
  const STATUS_CLASS = { Ready: 'atr-cov--ready', Strong: 'atr-cov--strong', 'Needs Support': 'atr-cov--needs', Missing: 'atr-cov--missing' };

  const wrap = document.createElement('div');
  wrap.className = 'atr-view';

  if (b.teamReadiness) {
    const badge = document.createElement('div');
    badge.className = 'atr-readiness-badge';
    badge.textContent = `TEAM READINESS: ${b.teamReadiness}%`;
    wrap.appendChild(badge);
  }
  if (b.strategicPosition) {
    const posLabel = document.createElement('p');
    posLabel.className = 'brief-label';
    posLabel.textContent = 'Strategic Position';
    wrap.appendChild(posLabel);
    const pos = document.createElement('p');
    pos.className = 'atr-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  const body = document.createElement('div');
  body.className = 'atr-body';

  // LEFT: Required Roles
  const leftCol = document.createElement('div');
  leftCol.className = 'atr-roles-col';
  const leftLbl = document.createElement('p');
  leftLbl.className = 'brief-label';
  leftLbl.textContent = 'Required Roles';
  leftCol.appendChild(leftLbl);
  if (requiredRoles.length) {
    requiredRoles.forEach(role => {
      const card = document.createElement('div');
      card.className = `atr-role-card ${AVAIL_COLOR[role.availability] || 'atr-role--partial'}`;
      const name = document.createElement('p');
      name.className = 'atr-role-card__name';
      name.textContent = role.name;
      card.appendChild(name);
      if (role.responsibility) {
        const resp = document.createElement('p');
        resp.className = 'atr-role-card__resp';
        resp.textContent = role.responsibility;
        card.appendChild(resp);
      }
      const pri = document.createElement('span');
      pri.className = `atr-priority ${PRI_CLASS[role.priority] || 'atr-priority--medium'}`;
      pri.textContent = `${role.availability} · ${role.priority}`;
      card.appendChild(pri);
      leftCol.appendChild(card);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'atr-empty';
    empty.textContent = 'Team roles will appear after generation.';
    leftCol.appendChild(empty);
  }
  body.appendChild(leftCol);

  // CENTER: Team Network SVG
  const centerCol = document.createElement('div');
  centerCol.className = 'atr-network-col';
  const networkLbl = document.createElement('p');
  networkLbl.className = 'brief-label';
  networkLbl.textContent = 'Team Structure';
  centerCol.appendChild(networkLbl);
  const svgWrap = document.createElement('div');
  svgWrap.className = 'atr-network-wrap';
  svgWrap.appendChild(buildTeamNetworkSvg(requiredRoles));
  centerCol.appendChild(svgWrap);
  body.appendChild(centerCol);

  // RIGHT: Recommendations + Stats
  const rightCol = document.createElement('div');
  rightCol.className = 'atr-recs-col';
  const recsLbl = document.createElement('p');
  recsLbl.className = 'brief-label';
  recsLbl.textContent = 'AI Recommendations';
  rightCol.appendChild(recsLbl);
  if (teamRecs.length) {
    const recsList = document.createElement('div');
    recsList.className = 'atr-recs-list';
    teamRecs.forEach(rec => {
      const item = document.createElement('div');
      item.className = 'atr-rec-item';
      const title = document.createElement('p');
      title.className = 'atr-rec-item__title';
      title.textContent = rec.title;
      item.appendChild(title);
      const meta = document.createElement('p');
      meta.className = 'atr-rec-item__meta';
      meta.innerHTML = `Priority: <span class="atr-priority ${PRI_CLASS[rec.priority] || 'atr-priority--medium'}">${rec.priority || 'Medium'}</span>`;
      item.appendChild(meta);
      if (rec.impact) {
        const imp = document.createElement('p');
        imp.className = 'atr-rec-item__impact';
        imp.textContent = rec.impact;
        item.appendChild(imp);
      }
      recsList.appendChild(item);
    });
    rightCol.appendChild(recsList);
  }
  const statsEntries = [
    { label: 'Required',  value: teamStats.required },
    { label: 'Available', value: teamStats.available },
    { label: 'Missing',   value: teamStats.missing },
  ].filter(e => e.value !== undefined && e.value !== null);
  if (statsEntries.length) {
    const statsBlock = document.createElement('div');
    statsBlock.className = 'atr-stats-block';
    statsEntries.forEach(e => {
      const row = document.createElement('div');
      row.className = 'atr-stat-row';
      const lbl = document.createElement('span');
      lbl.className = 'atr-stat-row__label';
      lbl.textContent = `${e.label}:`;
      const val = document.createElement('span');
      val.className = 'atr-stat-row__value';
      val.textContent = e.value;
      row.appendChild(lbl); row.appendChild(val);
      statsBlock.appendChild(row);
    });
    rightCol.appendChild(statsBlock);
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Team Coverage Summary grid
  if (teamCoverage.some(c => c.status)) {
    const sumLbl = document.createElement('p');
    sumLbl.className = 'brief-label';
    sumLbl.textContent = 'Team Coverage Summary';
    wrap.appendChild(sumLbl);
    const grid = document.createElement('div');
    grid.className = 'atr-summary-grid';
    teamCoverage.forEach(c => {
      const cell = document.createElement('div');
      cell.className = `atr-summary-cell ${STATUS_CLASS[c.status] || ''}`;
      const catLbl = document.createElement('p');
      catLbl.className = 'atr-summary-cell__label';
      catLbl.textContent = c.category;
      cell.appendChild(catLbl);
      if (c.status) {
        const val = document.createElement('p');
        val.className = 'atr-summary-cell__value';
        val.textContent = c.status;
        cell.appendChild(val);
      }
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
  }

  if (leadershipQ) {
    const footer = document.createElement('div');
    footer.className = 'atr-leadership';
    footer.innerHTML = `<span class="atr-leadership__icon">?</span><p class="atr-leadership__text">${leadershipQ}</p>`;
    wrap.appendChild(footer);
  }
  return wrap;
}

// ── Layout: AI Learning & Adoption ────────────────────────────────────────────
function buildAILearningAdoptionLayout(section) {
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

  // LEFT: Learning Pillars
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

  // CENTER: Adoption Lifecycle
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

  // RIGHT: Recommendations + Stats
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

  // Adoption Readiness Summary grid
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
  const header = document.createElement('div');
  header.className = 'bp-section__header';
  const titleHtml = resolveCapName(section.title) !== resolveCapName(cap.capabilityName)
    ? `<h3 class="bp-section__title">${resolveCapName(section.title)}</h3>`
    : '';
  header.innerHTML = `
    ${titleHtml}
    <div class="bp-section__actions">
      <button class="bp-section__action-btn js-refine-btn" aria-label="Refine this section with AI Assistant">Refine with AI Assistant</button>
    </div>
  `;
  header.querySelector('.js-refine-btn').addEventListener('click', () => openAssistantForSection(section.title));
  card.appendChild(header);

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
    } else if (section.title === 'AI Engineering Enablement') {
      card.appendChild(buildAIEngineeringEnablementLayout(section));
    } else if (section.title === 'AI Skills Assessment') {
      card.appendChild(buildAISkillsAssessmentLayout(section));
    } else if (section.title === 'AI Team Readiness') {
      card.appendChild(buildAITeamReadinessLayout(section));
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
    if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
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
    showScreen('screen-generate');
    const assistantBtn = document.getElementById('btn-ai-assistant');
    if (assistantBtn) assistantBtn.style.display = 'none';
    setAssistantOpen(false);
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

function openAssistantForSection(sectionTitle) {
  _refineTargetSection = sectionTitle;
  setAssistantOpen(true);
  const cap = currentCap();
  const capName = cap?.capabilityName || 'this capability';
  setTimeout(() => {
    handleChatSubmit(null, `Please review the "${sectionTitle}" section in ${capName} and suggest specific improvements.`);
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

    if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
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

async function initWorkspace(blueprint) {
  await augmentBlueprintWithMissingDomains(blueprint);
  stripRetiredCapabilities(blueprint);

  _blueprint         = blueprint;
  _selectedDomainIdx = 0;
  _selectedCapIndex  = 0;

  const assistantBtn = document.getElementById('btn-ai-assistant');
  if (assistantBtn) assistantBtn.style.display = '';

  renderHeader(blueprint);
  renderDomainTabs(blueprint);
  renderCapabilityTabs(blueprint);
  renderBlueprintContent(blueprint, _selectedCapIndex);
  restoreChat();

  showScreen('screen-workspace');

  initAssistantButton();
  initChat();
}

// Listen for 'blueprint:ready' from blueprintGenerate.js
document.addEventListener('blueprint:ready', (e) => {
  const { blueprint } = e.detail || {};
  if (blueprint) initWorkspace(blueprint);
});
