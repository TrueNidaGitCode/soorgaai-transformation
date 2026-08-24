/**
 * Svarg — Company AI Strategy Dashboard (Sprint 18)
 *
 * Executive, read-oriented view of the company blueprint built in the
 * workspace (Sprints 16–17). No backend, no LLM, no editing controls —
 * everything is derived from Sprint 17 LocalStorage on every page load.
 *
 * Navigation contract (Feature 8):
 *   "Open in Workspace" saves the capability pointer via saveCurrentCapability()
 *   so the workspace auto-restores straight into that capability. Section
 *   states are never written here — edits happen only in workspace mode.
 */

import {
  loadCurrentCapability,
  saveCurrentCapability,
  loadCapabilityState,
  loadActivities,
} from '../domain/blueprintStorage.js';

import {
  CAPABILITIES,
  STATUS,
  buildCapabilityOverview,
  buildCompanyTotals,
  recommendNextFocus,
  buildExecutiveSummary,
  buildCurrentFocus,
  formatActivityLabel,
} from './dashboardMetrics.js';

const WORKSPACE_URL = '/domain/domain.html?domain=ai-strategy';

function getToken() { return localStorage.getItem('token'); }

function logout() {
  [
    'token', 'username', 'userId', 'role', 'redirectAfterLogin',
    'soorgaai_blueprint_v1', 'soorgaai_blueprint_activity_v1',
    'soorgaai_executive_memory_v1', 'soorgaai_company_context_v1',
    'da_score', 'soorga_assessment_progress',
  ].forEach(k => localStorage.removeItem(k));
  window.location.href = '/index.html';
}

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)    return 'Just now';
  if (diffMin < 60)   return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24)     return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7)      return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Data collection (read-only) ───────────────────────────────────────────────

function collectDashboardData() {
  const stored = {};
  for (const cap of CAPABILITIES) {
    stored[cap.id] = loadCapabilityState(cap.id);
  }

  const overview   = buildCapabilityOverview(stored);
  const totals     = buildCompanyTotals(overview);
  const activities = loadActivities(10);

  return {
    overview,
    totals,
    activities,
    summary: buildExecutiveSummary(overview),
    focus:   buildCurrentFocus(overview, loadCurrentCapability(), activities),
    next:    recommendNextFocus(overview),
  };
}

// ── Renderers ─────────────────────────────────────────────────────────────────

function renderProgress(totals, next) {
  document.getElementById('csd-overall-pct').textContent = `${totals.overallPct}%`;
  document.getElementById('csd-overall-bar').style.width = `${totals.overallPct}%`;

  const stats = [
    { value: totals.capabilitiesCompleted,  label: 'Capabilities Completed' },
    { value: totals.capabilitiesInProgress, label: 'Capabilities In Progress' },
    { value: totals.approvedSections,       label: 'Approved Sections' },
    { value: totals.draftSections,          label: 'Draft Sections' },
  ];
  document.getElementById('csd-stat-grid').innerHTML = stats.map(s => `
    <div class="csd-stat">
      <span class="csd-stat__value">${s.value}</span>
      <span class="csd-stat__label">${s.label}</span>
    </div>
  `).join('');

  document.getElementById('csd-next-focus-text').textContent = next
    ? `${next.action === 'complete' ? 'Complete' : 'Develop'} ${next.name}`
    : 'All capabilities complete';
}

function renderSummary(summary) {
  document.getElementById('csd-summary-list').innerHTML =
    summary.map(line => `<li>${esc(line)}</li>`).join('');
}

function renderFocus(focus) {
  const card = document.getElementById('csd-focus-card');
  if (!focus) { card.style.display = 'none'; return; }

  card.style.display = 'block';
  document.getElementById('csd-focus-capability').textContent     = focus.capabilityName;
  document.getElementById('csd-focus-section').textContent        = focus.sectionTitle || '—';
  document.getElementById('csd-focus-updated').textContent        = formatWhen(focus.lastUpdated);
  document.getElementById('csd-focus-recommendation').textContent = focus.recommendation;
}

// ── Capability cards (Features 2 & 3) ─────────────────────────────────────────

const STATUS_CLASS = {
  [STATUS.NOT_STARTED]: 'csd-status--not-started',
  [STATUS.IN_PROGRESS]: 'csd-status--in-progress',
  [STATUS.COMPLETED]:   'csd-status--completed',
};

const SECTION_STATUS_CLASS = {
  'Template':      'status-badge--template',
  'Working Draft': 'status-badge--working-draft',
  'Approved':      'status-badge--approved',
};

function sourceBadgeClass(src) {
  return src === 'User Modified' ? 'source-badge--user-modified'
       : src === 'Core'          ? 'source-badge--core'
       :                           'source-badge--industry';
}

function buildSectionDetail(section) {
  const item = document.createElement('div');
  item.className = 'csd-section-detail';

  const badges = [
    `<span class="status-badge ${SECTION_STATUS_CLASS[section.status] || 'status-badge--template'}">${esc(section.status)}</span>`,
    ...section.sources.map(src => `<span class="source-badge ${sourceBadgeClass(src)}">${esc(src)}</span>`),
  ].join(' ');

  item.innerHTML = `
    <div class="csd-section-detail__header">
      <span class="csd-section-detail__title">${esc(section.title)}</span>
      <span class="csd-section-detail__badges">${badges}</span>
    </div>
  `;

  if (section.content) {
    const label = section.status === 'Approved' ? 'APPROVED CONTENT' : 'COMPANY DRAFT';
    const contentEl = document.createElement('div');
    contentEl.className = 'csd-section-detail__content';
    contentEl.innerHTML = `<span class="csd-section-detail__content-label">${label}</span>`;
    const p = document.createElement('p');
    p.textContent = section.content;
    contentEl.appendChild(p);
    item.appendChild(contentEl);
  }

  return item;
}

function buildCapabilityCard(cap) {
  const card = document.createElement('article');
  card.className = 'ws-card csd-capability-card';
  card.dataset.capabilityId = cap.id;

  // ── Header row (always visible, toggles detail) ───────────────────────────
  const header = document.createElement('button');
  header.className = 'csd-capability-card__header';
  header.setAttribute('aria-expanded', 'false');
  header.innerHTML = `
    <div class="csd-capability-card__titles">
      <span class="csd-capability-card__name">${esc(cap.name)}</span>
      <span class="csd-status ${STATUS_CLASS[cap.status]}">${esc(cap.status)}</span>
    </div>
    <div class="csd-capability-card__metrics">
      <span class="csd-capability-card__counts">${cap.approved} approved · ${cap.draft} draft</span>
      <div class="csd-capability-card__track"><div class="csd-capability-card__bar" style="width:${cap.pct}%"></div></div>
      <span class="csd-capability-card__pct">${cap.pct}%</span>
      <span class="csd-capability-card__chevron" aria-hidden="true">▾</span>
    </div>
  `;
  card.appendChild(header);

  // ── Detail view (Feature 3 — read-only) ───────────────────────────────────
  const detail = document.createElement('div');
  detail.className = 'csd-capability-card__detail';
  detail.style.display = 'none';

  if (cap.sections.length > 0) {
    for (const section of cap.sections) detail.appendChild(buildSectionDetail(section));
  } else {
    const empty = document.createElement('p');
    empty.className = 'csd-capability-card__empty';
    empty.textContent = 'Not started — open the workspace to begin developing this capability.';
    detail.appendChild(empty);
  }

  // Navigation back to the editing workspace — no editing here
  const openBtn = document.createElement('a');
  openBtn.className = 'csd-workspace-btn';
  openBtn.href = WORKSPACE_URL;
  openBtn.textContent = cap.sections.length > 0 ? 'Edit in Workspace →' : 'Start in Workspace →';
  openBtn.addEventListener('click', () => {
    // Point the workspace at this capability so it restores directly into it
    saveCurrentCapability(cap.id);
  });
  detail.appendChild(openBtn);

  card.appendChild(detail);

  header.addEventListener('click', () => {
    const open = detail.style.display !== 'none';
    detail.style.display = open ? 'none' : 'block';
    header.setAttribute('aria-expanded', String(!open));
    card.classList.toggle('csd-capability-card--open', !open);
  });

  return card;
}

function renderCapabilities(overview) {
  const list = document.getElementById('csd-capability-list');
  list.innerHTML = '';
  for (const cap of overview) list.appendChild(buildCapabilityCard(cap));
}

// ── Timeline (Feature 6) ──────────────────────────────────────────────────────

const ACTION_CLASS = {
  Accepted: 'csd-timeline__dot--accepted',
  Approved: 'csd-timeline__dot--approved',
  Reset:    'csd-timeline__dot--reset',
};

function renderTimeline(activities) {
  const el = document.getElementById('csd-timeline');

  if (!activities.length) {
    el.innerHTML = '<li class="csd-timeline__empty">No activity yet — actions in the workspace will appear here.</li>';
    return;
  }

  el.innerHTML = activities.map(event => `
    <li class="csd-timeline__item">
      <span class="csd-timeline__dot ${ACTION_CLASS[event.action] || ''}" aria-hidden="true"></span>
      <div class="csd-timeline__body">
        <span class="csd-timeline__label">${esc(formatActivityLabel(event))}</span>
        <span class="csd-timeline__meta">${esc(event.capabilityName)} · ${formatWhen(event.at)}</span>
      </div>
    </li>
  `).join('');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function render() {
  const data = collectDashboardData();

  const hasAnyData = data.totals.totalSections > 0 || data.activities.length > 0;
  document.getElementById('csd-empty').style.display   = hasAnyData ? 'none' : 'block';
  document.getElementById('csd-content').style.display = hasAnyData ? 'block' : 'none';
  if (!hasAnyData) return;

  renderProgress(data.totals, data.next);
  renderSummary(data.summary);
  renderFocus(data.focus);
  renderCapabilities(data.overview);
  renderTimeline(data.activities);
}

function init() {
  if (!getToken()) {
    window.location.href = '/login/login.html?redirect=/company-strategy/company-strategy.html';
    return;
  }

  document.getElementById('csd-logout')?.addEventListener('click', logout);

  const usernameEl = document.getElementById('csd-username');
  if (usernameEl) usernameEl.textContent = localStorage.getItem('username') || '';

  render();
}

document.addEventListener('DOMContentLoaded', init);

// Named exports for unit testing (Vitest ESM)
export { collectDashboardData, formatWhen, render, init };
