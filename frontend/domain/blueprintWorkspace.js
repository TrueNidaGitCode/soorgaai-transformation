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

// ── View mode ─────────────────────────────────────────────────────────────────
// Controls which renderer the product ships. Match this to BLUEPRINT_CONFIG.activeView
// in backend/config/blueprintConfig.js when toggling between views.
//   'essay' — Long-form prose per section  (section.content)
//   'pm'    — Uniform 4-cell Strategy Brief cards  (section.brief)
//   'cto'   — Presentation-style with section-specific templates  (section.brief + extras)

const BLUEPRINT_VIEW_MODE = 'cto';

// ── State ─────────────────────────────────────────────────────────────────────

let _blueprint           = null;
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
  const caps = blueprint.capabilities || [];
  if (!caps.length) return 0;
  const done = caps.filter(c => c.status === 'completed').length;
  return Math.round((done / caps.length) * 100);
}

// ── Workspace header ──────────────────────────────────────────────────────────

function renderHeader(blueprint) {
  const details = document.getElementById('ws-header-details');
  const statusEl = document.getElementById('ws-header-status');

  if (details) {
    details.innerHTML = `
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Objective</span>
        ${blueprint.businessObjective || '—'}
      </span>
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Industry</span>
        ${blueprint.industry || 'Automotive'}
      </span>
      ${blueprint.companyName ? `
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Company</span>
        ${blueprint.companyName}
      </span>` : ''}
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Generated</span>
        ${fmtDate(blueprint.generatedAt)}
      </span>
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Updated</span>
        ${fmtDate(blueprint.updatedAt)}
      </span>
    `;
  }

  if (statusEl) {
    const pct = calcCompletion(blueprint);
    statusEl.innerHTML = `<span class="ws-completion-pill">⚡ ${pct}% Generated</span>`;
  }
}

// ── Capability tabs ───────────────────────────────────────────────────────────

function renderCapabilityTabs(blueprint) {
  const nav = document.getElementById('cap-nav');
  if (!nav) return;
  nav.innerHTML = '';

  (blueprint.capabilities || []).forEach((cap, idx) => {
    const tab = document.createElement('button');
    tab.className = `cap-nav__tab${idx === _selectedCapIndex ? ' is-active' : ''}`;
    tab.dataset.idx = idx;

    const dotClass = `cap-nav__tab-dot--${cap.status === 'in-progress' ? 'progress' : cap.status}`;
    tab.innerHTML = `<span class="cap-nav__tab-dot ${dotClass}" aria-hidden="true"></span>${cap.capabilityName}`;

    tab.addEventListener('click', () => selectCapability(idx));
    nav.appendChild(tab);
  });
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

  renderBlueprintContent(_blueprint, idx);
  // Chat is blueprint-wide — no restoreChat() on tab switch, history stays visible
  updateAssistantContext();

  // Trigger one-time feedback prompt on first AI ROI tab visit
  const cap = (_blueprint?.capabilities || [])[idx];
  if (cap?.capabilityName === 'AI ROI') maybeShowFeedback();
}

// ── Blueprint content ─────────────────────────────────────────────────────────

function renderBlueprintContent(blueprint, capIdx) {
  const area = document.getElementById('bp-content');
  if (!area) return;
  area.innerHTML = '';

  const cap = (blueprint.capabilities || [])[capIdx];
  if (!cap) return;

  // Capability title + regenerate button (always available for completed caps)
  const header = document.createElement('div');
  header.className = 'bp-cap-header';
  const capTitle = document.createElement('h2');
  capTitle.className = 'bp-cap-title';
  capTitle.textContent = cap.capabilityName;
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
    if (isError) {
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

function buildKpiHighlights(highlights) {
  const wrap = document.createElement('div');
  wrap.className = 'kpi-highlights-wrap';

  const heading = document.createElement('p');
  heading.className = 'brief-label';
  heading.textContent = 'Success Metrics';
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
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
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

  // 4. Success Metrics — KPI highlight cards at the bottom
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  return wrap;
}

// ── AI Operating Model — Solution-Centric Organization ────────────────────────

function buildSolutionPortfolioTree(solutions) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 460, H = 240;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Solution portfolio hierarchy diagram');
  svg.classList.add('solution-portfolio-tree');

  const trunc = (s, n) => (s && s.length > n) ? s.slice(0, n) + '…' : (s || '');

  function mkRect(x, y, w, h, rx, fill, stroke) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', rx);
    r.setAttribute('fill', fill);
    if (stroke) { r.setAttribute('stroke', stroke); r.setAttribute('stroke-width', '1.5'); }
    return r;
  }

  function mkText(x, y, text, size, fill, weight) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-size', size);
    t.setAttribute('fill', fill);
    if (weight) t.setAttribute('font-weight', weight);
    t.textContent = text;
    return t;
  }

  function mkLine(x1, y1, x2, y2) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', 'rgba(99,102,241,0.4)');
    l.setAttribute('stroke-width', '1.5');
    return l;
  }

  function mkDot(cx, cy) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', '3');
    c.setAttribute('fill', 'rgba(129,140,248,0.85)');
    return c;
  }

  // Root node
  const rootCx = W / 2, rootY = 8, rootW = 160, rootH = 36;
  svg.appendChild(mkRect(rootCx - rootW / 2, rootY, rootW, rootH, '18',
    'rgba(99,102,241,0.12)', 'rgba(99,102,241,0.5)'));
  svg.appendChild(mkText(rootCx, rootY + rootH / 2, 'Solution Portfolio', '11',
    'rgba(255,255,255,0.9)', '600'));

  // Root → junction → 3 children
  const rootBot = rootY + rootH;
  const childCxs = [78, W / 2, W - 78];
  const childW = 124, childH = 30, childY = 78;
  const juncY = (rootBot + childY) / 2;

  svg.appendChild(mkLine(rootCx, rootBot, rootCx, juncY));
  svg.appendChild(mkLine(childCxs[0], juncY, childCxs[2], juncY));
  childCxs.forEach(cx => {
    svg.appendChild(mkLine(cx, juncY, cx, childY));
    svg.appendChild(mkDot(cx, juncY));
  });

  const subW = 124, subH = 34;
  const subYs = [118, 158, 198];

  childCxs.forEach((cx, i) => {
    const sol = solutions[i] || {};
    const subEntries = [
      { label: 'Owner',  value: sol.businessOwner || '—' },
      { label: 'Team',   value: sol.deliveryTeam  || '—' },
      { label: 'KPI',    value: (sol.kpis || []).join(' · ') || '—' },
    ];

    // Child node
    svg.appendChild(mkRect(cx - childW / 2, childY, childW, childH, '15',
      'rgba(99,102,241,0.1)', 'rgba(99,102,241,0.4)'));
    svg.appendChild(mkText(cx, childY + childH / 2, trunc(sol.name || `Solution ${i + 1}`, 17),
      '9.5', 'rgba(255,255,255,0.88)', '600'));

    // Child → first sub-node
    svg.appendChild(mkLine(cx, childY + childH, cx, subYs[0]));
    svg.appendChild(mkDot(cx, childY + childH));

    // Sub-nodes: label (small, dim) + value (slightly larger, bright)
    subEntries.forEach(({ label, value }, j) => {
      const sy = subYs[j];
      if (j > 0) svg.appendChild(mkLine(cx, subYs[j - 1] + subH, cx, sy));
      svg.appendChild(mkRect(cx - subW / 2, sy, subW, subH, '10',
        'rgba(99,102,241,0.07)', 'rgba(99,102,241,0.28)'));
      // Label row
      svg.appendChild(mkText(cx, sy + 11, label, '7', 'rgba(255,255,255,0.42)'));
      // Value row
      svg.appendChild(mkText(cx, sy + 24, trunc(value, 18), '8', 'rgba(255,255,255,0.85)', '500'));
    });
  });

  return svg;
}

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

  if (b.solutionPortfolio?.length) {
    // 2. Solution Portfolio Map — tree diagram
    const mapSection = document.createElement('div');
    mapSection.className = 'solution-portfolio-section';
    const mapLbl = document.createElement('p');
    mapLbl.className = 'brief-label'; mapLbl.textContent = 'Solution Portfolio Map';
    mapSection.appendChild(mapLbl);
    const treeWrap = document.createElement('div');
    treeWrap.className = 'solution-portfolio-tree-wrap';
    treeWrap.appendChild(buildSolutionPortfolioTree(b.solutionPortfolio));
    mapSection.appendChild(treeWrap);
    wrap.appendChild(mapSection);

    // 3. Solution Details Section — 3-col cards
    const detailSection = document.createElement('div');
    detailSection.className = 'solution-portfolio-section';
    const detailLbl = document.createElement('p');
    detailLbl.className = 'brief-label'; detailLbl.textContent = 'Solution Details Section';
    detailSection.appendChild(detailLbl);
    const grid = document.createElement('div');
    grid.className = 'solution-portfolio-grid';
    b.solutionPortfolio.forEach(sol => {
      const card = document.createElement('div');
      card.className = 'solution-portfolio-card';

      const name = document.createElement('p');
      name.className = 'solution-portfolio-card__name';
      name.textContent = sol.name;
      card.appendChild(name);

      [['Business Owner', sol.businessOwner], ['Delivery Team', sol.deliveryTeam]].forEach(([label, value]) => {
        if (!value) return;
        const row = document.createElement('div');
        row.className = 'solution-portfolio-card__row';
        const rl = document.createElement('span');
        rl.className = 'solution-portfolio-card__row-label'; rl.textContent = label;
        const rv = document.createElement('span');
        rv.className = 'solution-portfolio-card__row-value'; rv.textContent = value;
        row.appendChild(rl); row.appendChild(rv);
        card.appendChild(row);
      });

      if (sol.kpis?.length) {
        const kpisRow = document.createElement('div');
        kpisRow.className = 'solution-portfolio-card__kpis';
        const kl = document.createElement('span');
        kl.className = 'solution-portfolio-card__row-label'; kl.textContent = 'KPIs';
        const kv = document.createElement('p');
        kv.className = 'solution-portfolio-card__kpis-list';
        kv.textContent = sol.kpis.join(' · ');
        kpisRow.appendChild(kl); kpisRow.appendChild(kv);
        card.appendChild(kpisRow);
      }

      grid.appendChild(card);
    });
    detailSection.appendChild(grid);
    wrap.appendChild(detailSection);
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

  // 2. Team Composition Model — SVG hierarchy (centered, full-width panel)
  const compSection = document.createElement('div');
  compSection.className = 'team-composition-section';
  const compLbl = document.createElement('p');
  compLbl.className = 'brief-label'; compLbl.textContent = 'Team Composition Model';
  compSection.appendChild(compLbl);
  const svgWrap = document.createElement('div');
  svgWrap.className = 'team-hierarchy-wrap';
  svgWrap.appendChild(buildTeamHierarchySvg());
  compSection.appendChild(svgWrap);
  wrap.appendChild(compSection);

  // 3. Team Structure Details — role list below, separate section
  if (b.teamRoles?.length) {
    const detailSection = document.createElement('div');
    detailSection.className = 'team-structure-section';
    const detailLbl = document.createElement('p');
    detailLbl.className = 'brief-label'; detailLbl.textContent = 'Team Structure Details';
    detailSection.appendChild(detailLbl);
    const roleList = document.createElement('div');
    roleList.className = 'team-role-list';
    b.teamRoles.forEach(role => {
      const item = document.createElement('div');
      item.className = 'team-role-item';
      const title = document.createElement('p');
      title.className = 'team-role-item__title';
      title.textContent = role.title;
      item.appendChild(title);
      if (role.description) {
        const desc = document.createElement('p');
        desc.className = 'team-role-item__desc';
        desc.textContent = role.description;
        item.appendChild(desc);
      }
      roleList.appendChild(item);
    });
    detailSection.appendChild(roleList);
    wrap.appendChild(detailSection);
  }

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

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  if (b.waterfallItems?.length) {
    // Value Waterfall Visualization
    wrap.appendChild(buildDiagramSection('Value Waterfall Visualization', buildWaterfallSvg(b.waterfallItems)));

    // Financial Breakdown — one card per waterfall item (title + description)
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

  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  if (b.sdlcStages?.length) {
    // SDLC Performance Dashboard
    wrap.appendChild(buildDiagramSection('SDLC Performance Dashboard', buildSdlcPipeline(b.sdlcStages)));

    // SDLC Stage Details
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

  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
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

  // 3. KPI Highlights — large-number cards (falls back to plain metrics list)
  if (b.kpiHighlights?.length) {
    wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }

  // 4. Horizontal Timeline
  const timelineSource = b.timelineSteps?.length ? b.timelineSteps : b.priorityActions || [];
  if (timelineSource.length) {
    wrap.appendChild(buildHorizontalTimeline(timelineSource));
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
  header.innerHTML = `
    <h3 class="bp-section__title">${section.title}</h3>
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
  const capIdx = (_blueprint.capabilities || []).findIndex(c => c.capabilityId === cap.capabilityId);
  if (capIdx >= 0) {
    _blueprint.capabilities[capIdx].status = 'in-progress';
    renderCapabilityTabs(_blueprint);
  }

  try {
    const resp = await fetch(
      `${API_BASE}/strategy-canvas/company-blueprint/${_blueprint._id}/capability/${cap.capabilityId}/regenerate`,
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
    // Restore error state if something went wrong starting the request
    if (capIdx >= 0) {
      _blueprint.capabilities[capIdx].status = 'error';
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
      const resp = await fetch(`${API_BASE}/strategy-canvas/company-blueprint`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) continue;

      const freshBp  = await resp.json();
      const freshCap = (freshBp.capabilities || []).find(c => c.capabilityId === capabilityId);

      if (freshCap && freshCap.status !== 'in-progress' && freshCap.status !== 'pending') {
        _blueprint = freshBp;
        renderHeader(freshBp);
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
  const panel  = document.getElementById('ai-panel');
  const btn    = document.getElementById('btn-ai-assistant');
  const wsBody = document.getElementById('ws-body');

  if (panel)  panel.style.display  = open ? '' : 'none';
  if (btn)    btn.classList.toggle('is-open', open);
  if (wsBody) wsBody.classList.toggle('assistant-open', open);

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
  const cap = (_blueprint?.capabilities || [])[_selectedCapIndex];
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

  const cap = (_blueprint?.capabilities || [])[_selectedCapIndex];
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
  const cap = (blueprint.capabilities || [])[capIdx];
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
  return (blueprint.capabilities || []).map(cap => ({
    capabilityId:   cap.capabilityId,
    capabilityName: cap.capabilityName,
    sections: (cap.sections || []).map(s => ({
      title:             s.title,
      strategicPosition: s.brief?.strategicPosition || s.content || '',
    })),
  }));
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

  // Resolve each update to its target capability + section.
  // Case-insensitive section title matching tolerates minor AI variation.
  // Skip any update where the capabilityId or sectionTitle can't be matched.
  const resolvedUpdates = updates.map(u => {
    const targetCap = u.capabilityId
      ? (_blueprint.capabilities || []).find(c => c.capabilityId === u.capabilityId)
      : currentCap;
    if (!targetCap) {
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
    return { ...u, _targetCap: targetCap, _section: section };
  }).filter(Boolean);

  // Snapshot for undo before applying anything
  const undoData = resolvedUpdates.map(u => ({
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
      `${API_BASE}/strategy-canvas/company-blueprint/${_blueprint._id}/capability/${u._targetCap.capabilityId}/section/${encodeURIComponent(u._section.title)}`,
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
    if (!byCapability[id]) byCapability[id] = { cap: u._targetCap, titles: [] };
    byCapability[id].titles.push(u._section.title);
  });

  for (const [capId, { cap: targetCap, titles }] of Object.entries(byCapability)) {
    const progressMsg = appendProgressMessage(`Updating graphs for ${targetCap.capabilityName}…`);
    try {
      const resp = await fetch(
        `${API_BASE}/strategy-canvas/company-blueprint/${_blueprint._id}/capability/${capId}/regenerate-section-extras`,
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
    const targetCap = u.capabilityId
      ? (_blueprint.capabilities || []).find(c => c.capabilityId === u.capabilityId)
      : currentCap;
    if (!targetCap) continue;
    const section = (targetCap.sections || []).find(s => s.title === u.sectionTitle);
    if (!section) continue;
    if (!section.brief) section.brief = {};
    section.brief.strategicPosition = u.previousPosition;
    section.updatedAt = new Date().toISOString();

    if (targetCap.capabilityId === currentCap.capabilityId) {
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
    const targetCapId = u.capabilityId || currentCap.capabilityId;
    fetch(
      `${API_BASE}/strategy-canvas/company-blueprint/${_blueprint._id}/capability/${targetCapId}/section/${encodeURIComponent(u.sectionTitle)}`,
      {
        method:    'PATCH',
        headers:   { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:      JSON.stringify({ brief: { strategicPosition: u.previousPosition } }),
        keepalive: true,
      }
    )
    .then(r => { if (!r.ok) console.warn('[undo-multi] PATCH non-ok:', r.status, targetCapId, u.sectionTitle); })
    .catch(err => console.warn('[undo-multi] PATCH error:', targetCapId, u.sectionTitle, err.message));
  }
}

async function acceptSuggestion() {
  if (!_pendingSuggestion || !_blueprint) return;

  const cap = (_blueprint.capabilities || [])[_selectedCapIndex];
  if (!cap) { clearSuggestionCard(); return; }

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
      `${API_BASE}/strategy-canvas/company-blueprint/${_blueprint._id}/capability/${cap.capabilityId}/section/${encodeURIComponent(section.title)}`,
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
    // sessionStorage: survives same-tab navigation, clears on tab close/refresh
    sessionStorage.setItem(key, JSON.stringify(_chatHistory.slice(-60)));
  } catch { /* quota exceeded */ }
}

function restoreChat() {
  const key = chatStorageKey();
  const stored = key ? sessionStorage.getItem(key) : null;
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

function initWorkspace(blueprint) {
  _blueprint        = blueprint;
  _selectedCapIndex = 0;

  // Show AI Assistant button now that we're in workspace
  const assistantBtn = document.getElementById('btn-ai-assistant');
  if (assistantBtn) assistantBtn.style.display = '';

  renderHeader(blueprint);
  renderCapabilityTabs(blueprint);
  renderBlueprintContent(blueprint, _selectedCapIndex);
  restoreChat(); // load persisted chat for initial capability

  showScreen('screen-workspace');

  initAssistantButton();
  initChat();
}

// Listen for 'blueprint:ready' from blueprintGenerate.js
document.addEventListener('blueprint:ready', (e) => {
  const { blueprint } = e.detail || {};
  if (blueprint) initWorkspace(blueprint);
});
