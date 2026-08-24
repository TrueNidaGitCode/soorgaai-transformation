/**
 * Svarg — "Your AI Transformation" Workspace Widget (Sprint 18.1)
 *
 * Personal-progress widget at the top of the workspace. Separates the
 * user's own journey from the Transformation Domain (platform capability)
 * cards below it — it is not another domain.
 *
 * Reuses Sprint 17 LocalStorage (blueprintStorage.js) and the Sprint 18
 * deterministic metrics (dashboardMetrics.js). No backend, no AI calls,
 * no new persistence.
 *
 * Continue action: navigates to the editing workspace, which auto-restores
 * the last capability from the existing currentCapabilityId pointer.
 */

import {
  loadCurrentCapability,
  loadCapabilityState,
  loadActivities,
} from '../domain/blueprintStorage.js';

import {
  CAPABILITIES,
  STATUS,
  buildCapabilityOverview,
  buildCompanyTotals,
  recommendNextFocus,
  buildCurrentFocus,
} from '../company-strategy/dashboardMetrics.js';

// Blueprint storage is currently scoped to the single ai-strategy domain.
const DOMAIN_TITLE  = 'AI Strategy';
const CONTINUE_URL  = '/domain/domain.html?domain=ai-strategy';
const DASHBOARD_URL = '/company-strategy/company-strategy.html';

// ── Pure derivations ──────────────────────────────────────────────────────────

/**
 * @param {Array}  overview              from buildCapabilityOverview
 * @param {string} currentCapabilityId   from loadCurrentCapability()
 * @param {Array}  activities            from loadActivities() — newest first
 * @returns {
 *   hasProgress, domainTitle, capabilityName, pct, nextAction, lastActivityAt
 * }
 */
export function buildTransformationSummary(overview, currentCapabilityId, activities = []) {
  const totals = buildCompanyTotals(overview);
  const next   = recommendNextFocus(overview);

  if (totals.totalSections === 0 && activities.length === 0) {
    return {
      hasProgress: false,
      domainTitle: DOMAIN_TITLE,
      capabilityName: '',
      pct: 0,
      nextAction: next ? `Start with ${next.name}` : '',
      lastActivityAt: null,
    };
  }

  const focus = buildCurrentFocus(overview, currentCapabilityId, activities);
  const cap   = overview.find(c => c.id === currentCapabilityId)
             || overview.find(c => c.status === STATUS.IN_PROGRESS)
             || null;

  let nextAction;
  if (!cap || cap.status === STATUS.COMPLETED) {
    nextAction = next ? `Start ${next.name}` : 'All capabilities approved';
  } else if (focus?.sectionTitle) {
    nextAction = `Review ${focus.sectionTitle} section`;
  } else {
    nextAction = `Continue ${cap.name}`;
  }

  return {
    hasProgress: true,
    domainTitle: DOMAIN_TITLE,
    capabilityName: cap?.name || focus?.capabilityName || next?.name || '',
    pct: cap ? cap.pct : totals.overallPct,
    nextAction,
    lastActivityAt: focus?.lastUpdated || activities[0]?.at || null,
  };
}

/** "Just now" · "5 minutes ago" · "23 hours ago" · "3 days ago" · date */
export function formatLastActivity(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';

  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH} hour${diffH === 1 ? '' : 's'} ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7)    return `${diffD} day${diffD === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Data collection (read-only) ───────────────────────────────────────────────

function collectSummary() {
  const stored = {};
  for (const cap of CAPABILITIES) {
    stored[cap.id] = loadCapabilityState(cap.id);
  }
  return buildTransformationSummary(
    buildCapabilityOverview(stored),
    loadCurrentCapability(),
    loadActivities(10),
  );
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderWidget() {
  const card = document.getElementById('ws-transform-card');
  const body = document.getElementById('ws-transform-body');
  if (!card || !body) return;

  const summary  = collectSummary();
  const continueLabel = document.getElementById('ws-transform-continue');

  if (!summary.hasProgress) {
    if (continueLabel) continueLabel.textContent = 'Start →';
    body.innerHTML = `
      <p class="ws-transform-card__empty">
        You haven't started yet. ${esc(summary.nextAction)} — or explore the transformation domains below.
      </p>
    `;
  } else {
    if (continueLabel) continueLabel.textContent = 'Continue →';
    body.innerHTML = `
      <div class="ws-transform-card__stats">
        <div class="ws-transform-stat">
          <span class="ws-transform-stat__label">Current Domain</span>
          <span class="ws-transform-stat__value">${esc(summary.domainTitle)}</span>
        </div>
        <div class="ws-transform-stat">
          <span class="ws-transform-stat__label">Current Capability</span>
          <span class="ws-transform-stat__value">${esc(summary.capabilityName)}</span>
        </div>
        <div class="ws-transform-stat">
          <span class="ws-transform-stat__label">Progress</span>
          <span class="ws-transform-stat__value">${summary.pct}% Complete</span>
        </div>
        <div class="ws-transform-stat">
          <span class="ws-transform-stat__label">Last Activity</span>
          <span class="ws-transform-stat__value">${esc(formatLastActivity(summary.lastActivityAt))}</span>
        </div>
      </div>
      <div class="ws-transform-card__track"><div class="ws-transform-card__bar" style="width:${summary.pct}%"></div></div>
      <p class="ws-transform-card__next"><span>Next:</span> ${esc(summary.nextAction)}</p>
      <a href="${DASHBOARD_URL}" class="ws-transform-card__dashboard-link" id="ws-transform-dashboard">View executive dashboard →</a>
    `;

    // The dashboard link must not trigger the card's Continue navigation
    document.getElementById('ws-transform-dashboard')
      ?.addEventListener('click', e => e.stopPropagation());
  }

  // Continue: the editing workspace auto-restores the last capability
  // from the existing Sprint 17 currentCapabilityId pointer.
  const navigate = () => { window.location.href = CONTINUE_URL; };
  card.addEventListener('click', navigate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(); }
  });
}

document.addEventListener('DOMContentLoaded', renderWidget);

export { renderWidget, collectSummary };
