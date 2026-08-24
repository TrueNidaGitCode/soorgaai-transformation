/**
 * Svarg — Dashboard Metrics (Sprint 18)
 *
 * Pure, deterministic derivations for the Company AI Strategy Dashboard.
 * No LLM calls, no storage access — every function takes plain data in and
 * returns plain data out, so the page module owns all localStorage reads.
 *
 * Inputs come from the Sprint 17 blueprint schema (blueprintStorage.js):
 *   capState = { capabilityName, industry, sections: { [title]: { status, sources, content } } }
 */

// Canonical capability order — ids match backend toCapabilityId() output.
export const CAPABILITIES = [
  { id: 'ai-initiative-leadership',    name: 'AI Initiative Leadership' },
  { id: 'ai-center-of-excellence',     name: 'AI Center of Excellence' },
  { id: 'ai-performance-management',   name: 'AI Performance Management' },
  { id: 'ai-governance-ethics',        name: 'AI Governance & Ethics' },
];

export const STATUS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED:   'Completed',
};

// ── Capability overview ───────────────────────────────────────────────────────

/**
 * @param {Object} storedCapabilities  { [capabilityId]: capState | null }
 * @returns one entry per canonical capability, in canonical order:
 *   { id, name, status, pct, approved, draft, template, total, industry, sections: [{ title, status, sources, content }] }
 */
export function buildCapabilityOverview(storedCapabilities = {}) {
  return CAPABILITIES.map(cap => {
    const state    = storedCapabilities[cap.id] || null;
    const sections = state
      ? Object.entries(state.sections || {}).map(([title, s]) => ({
          title,
          status:  s.status  || 'Template',
          sources: s.sources || [],
          content: s.content || '',
        }))
      : [];

    const total    = sections.length;
    const approved = sections.filter(s => s.status === 'Approved').length;
    const draft    = sections.filter(s => s.status === 'Working Draft').length;
    const pct      = total > 0 ? Math.round((approved / total) * 100) : 0;

    let status = STATUS.NOT_STARTED;
    if (total > 0 && approved === total)      status = STATUS.COMPLETED;
    else if (approved > 0 || draft > 0)       status = STATUS.IN_PROGRESS;

    return {
      id:       cap.id,
      name:     state?.capabilityName || cap.name,
      industry: state?.industry || '',
      status, pct, approved, draft,
      template: total - approved - draft,
      total,
      sections,
    };
  });
}

// ── Company totals ────────────────────────────────────────────────────────────

export function buildCompanyTotals(overview) {
  const started   = overview.filter(c => c.status === STATUS.IN_PROGRESS);
  const completed = overview.filter(c => c.status === STATUS.COMPLETED);

  const approvedSections = overview.reduce((n, c) => n + c.approved, 0);
  const draftSections    = overview.reduce((n, c) => n + c.draft, 0);
  const totalSections    = overview.reduce((n, c) => n + c.total, 0);

  return {
    totalCapabilities:      overview.length,
    capabilitiesInProgress: started.length,
    capabilitiesCompleted:  completed.length,
    capabilitiesNotStarted: overview.length - started.length - completed.length,
    approvedSections,
    draftSections,
    totalSections,
    overallPct: totalSections > 0 ? Math.round((approvedSections / totalSections) * 100) : 0,
  };
}

// ── Next recommended focus ────────────────────────────────────────────────────

/**
 * Deterministic recommendation:
 *   1. The in-progress capability closest to completion (ties → canonical order)
 *   2. Otherwise the first not-started capability
 *   3. Otherwise null — everything is complete
 * @returns { id, name, action: 'complete' | 'start' } | null
 */
export function recommendNextFocus(overview) {
  const inProgress = overview.filter(c => c.status === STATUS.IN_PROGRESS);
  if (inProgress.length > 0) {
    const target = inProgress.reduce((best, c) => (c.pct > best.pct ? c : best), inProgress[0]);
    return { id: target.id, name: target.name, action: 'complete' };
  }

  const notStarted = overview.find(c => c.status === STATUS.NOT_STARTED);
  if (notStarted) return { id: notStarted.id, name: notStarted.name, action: 'start' };

  return null;
}

// ── Executive summary ─────────────────────────────────────────────────────────

function maturityLabel(pct) {
  if (pct >= 100) return 'complete';
  if (pct >= 67)  return 'maturing';
  if (pct >= 34)  return 'developing';
  return 'at an early stage';
}

/**
 * @returns array of plain-language sentences (deterministic, no LLM).
 */
export function buildExecutiveSummary(overview) {
  const totals    = buildCompanyTotals(overview);
  const completed = overview.filter(c => c.status === STATUS.COMPLETED);
  const wip       = overview.filter(c => c.status === STATUS.IN_PROGRESS);
  const gaps      = overview.filter(c => c.status === STATUS.NOT_STARTED);

  if (totals.capabilitiesCompleted === 0 && totals.capabilitiesInProgress === 0) {
    return [
      'AI strategy development has not yet started.',
      `Recommended next step: develop ${overview[0]?.name || 'the first capability'}.`,
    ];
  }

  const lines = [];

  lines.push(`Overall blueprint maturity is ${maturityLabel(totals.overallPct)} — ${totals.approvedSections} of ${totals.totalSections} active sections approved (${totals.overallPct}%).`);

  if (completed.length > 0) {
    lines.push(`${completed.map(c => c.name).join(' and ')} foundations are established.`);
  } else {
    const strongest = wip.reduce((best, c) => (c.pct > best.pct ? c : best), wip[0]);
    lines.push(`${strongest.name} is the most developed capability (${strongest.pct}% complete).`);
  }

  if (wip.length > 0) {
    lines.push(`${wip.map(c => c.name).join(', ')} ${wip.length === 1 ? 'is' : 'are'} partially complete.`);
  }

  if (gaps.length > 0) {
    lines.push(`${gaps[0].name} has not yet started${gaps.length > 1 ? ` (${gaps.length} capabilities remain unstarted)` : ''}.`);
  }

  const next = recommendNextFocus(overview);
  if (next) {
    lines.push(`Recommended next step: ${next.action === 'complete' ? 'complete' : 'develop'} ${next.name}.`);
  } else {
    lines.push('All capabilities are complete — the company AI blueprint is fully approved.');
  }

  return lines;
}

// ── Current focus ─────────────────────────────────────────────────────────────

/**
 * @param {Array}  overview              from buildCapabilityOverview
 * @param {string} currentCapabilityId   from blueprintStorage.loadCurrentCapability()
 * @param {Array}  activities            from blueprintStorage.loadActivities() — newest first
 * @returns { capabilityName, sectionTitle, lastUpdated, recommendation } | null
 */
export function buildCurrentFocus(overview, currentCapabilityId, activities = []) {
  const cap = overview.find(c => c.id === currentCapabilityId)
    // Fall back to the capability being worked on if no pointer is stored
    || overview.find(c => c.status === STATUS.IN_PROGRESS);
  if (!cap) return null;

  // Current section: latest activity in this capability, else first unapproved section
  const lastEvent = activities.find(e => e.capabilityName === cap.name);
  const sectionTitle =
    lastEvent?.sectionTitle
    || cap.sections.find(s => s.status !== 'Approved')?.title
    || cap.sections[0]?.title
    || '';

  let recommendation;
  if (cap.draft > 0) {
    recommendation = `Approve the ${cap.draft} working draft${cap.draft === 1 ? '' : 's'} in ${cap.name} to lock in progress.`;
  } else if (cap.total === 0 || cap.template > 0) {
    recommendation = `Continue developing ${cap.name} — ${cap.approved} of ${cap.total} sections approved.`;
  } else {
    const next = recommendNextFocus(overview.filter(c => c.id !== cap.id));
    recommendation = next
      ? `${cap.name} is complete — move on to ${next.name}.`
      : `${cap.name} is complete. All capabilities are approved.`;
  }

  return {
    capabilityName: cap.name,
    sectionTitle,
    lastUpdated: lastEvent?.at || activities[0]?.at || null,
    recommendation,
  };
}

// ── Timeline labels ───────────────────────────────────────────────────────────

/**
 * 'Accepted' → "Accepted Vision draft" · 'Approved' → "Approved Vision" · 'Reset' → "Reset Vision"
 */
export function formatActivityLabel(event) {
  if (!event?.action || !event?.sectionTitle) return '';
  return event.action === 'Accepted'
    ? `Accepted ${event.sectionTitle} draft`
    : `${event.action} ${event.sectionTitle}`;
}
