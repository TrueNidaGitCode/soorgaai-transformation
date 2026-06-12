/**
 * Unit Tests — company-strategy/dashboardMetrics.js (Sprint 18)
 *
 * Pure deterministic functions — no storage, no DOM, no LLM.
 * Fixtures use the Sprint 17 blueprint schema (blueprintStorage.js).
 */

import { describe, it, expect } from 'vitest';
import {
  CAPABILITIES,
  STATUS,
  buildCapabilityOverview,
  buildCompanyTotals,
  recommendNextFocus,
  buildExecutiveSummary,
  buildCurrentFocus,
  formatActivityLabel,
} from '../company-strategy/dashboardMetrics.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function capState(sections) {
  return { capabilityName: '', industry: 'Automotive', sections };
}

const SECTION = {
  approved: { status: 'Approved',      sources: ['Core', 'Automotive', 'User Modified'], content: 'Approved text.' },
  draft:    { status: 'Working Draft', sources: ['Core', 'User Modified'],               content: 'Draft text.' },
  template: { status: 'Template',      sources: ['Core'],                                content: '' },
};

const LEADERSHIP_ID = 'ai-initiative-leadership';
const ALIGNMENT_ID  = 'business-strategy-alignment';
const COE_ID        = 'ai-center-of-excellence';

function overviewWith(stored) {
  return buildCapabilityOverview(stored);
}

// ── buildCapabilityOverview ───────────────────────────────────────────────────

describe('buildCapabilityOverview', () => {
  it('returns all five canonical capabilities in order even with empty storage', () => {
    const overview = buildCapabilityOverview({});
    expect(overview.map(c => c.id)).toEqual(CAPABILITIES.map(c => c.id));
  });

  it('marks a capability with no stored state as Not Started', () => {
    const overview = buildCapabilityOverview({});
    expect(overview[0].status).toBe(STATUS.NOT_STARTED);
    expect(overview[0].total).toBe(0);
  });

  it('marks a capability with only Template sections as Not Started', () => {
    const overview = overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.template, Alignment: SECTION.template }),
    });
    expect(overview[0].status).toBe(STATUS.NOT_STARTED);
  });

  it('marks a capability with a Working Draft as In Progress', () => {
    const overview = overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.draft, Alignment: SECTION.template }),
    });
    expect(overview[0].status).toBe(STATUS.IN_PROGRESS);
    expect(overview[0].draft).toBe(1);
  });

  it('marks a capability as Completed when all sections are Approved', () => {
    const overview = overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved, Alignment: SECTION.approved }),
    });
    expect(overview[0].status).toBe(STATUS.COMPLETED);
    expect(overview[0].pct).toBe(100);
  });

  it('computes completion percentage from approved sections only', () => {
    const overview = overviewWith({
      [LEADERSHIP_ID]: capState({
        Vision: SECTION.approved, Alignment: SECTION.draft, Commitment: SECTION.template,
      }),
    });
    expect(overview[0].pct).toBe(33);
    expect(overview[0].approved).toBe(1);
    expect(overview[0].draft).toBe(1);
    expect(overview[0].template).toBe(1);
  });

  it('prefers the stored capabilityName when present', () => {
    const overview = overviewWith({
      [LEADERSHIP_ID]: { ...capState({ Vision: SECTION.approved }), capabilityName: 'AI Initiative Leadership' },
    });
    expect(overview[0].name).toBe('AI Initiative Leadership');
  });

  it('exposes section titles, statuses, sources and content for the detail view', () => {
    const overview = overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved }),
    });
    expect(overview[0].sections).toEqual([{
      title: 'Vision',
      status: 'Approved',
      sources: ['Core', 'Automotive', 'User Modified'],
      content: 'Approved text.',
    }]);
  });
});

// ── buildCompanyTotals ────────────────────────────────────────────────────────

describe('buildCompanyTotals', () => {
  it('returns zeros for an empty blueprint', () => {
    const totals = buildCompanyTotals(buildCapabilityOverview({}));
    expect(totals).toEqual({
      totalCapabilities: 5,
      capabilitiesInProgress: 0,
      capabilitiesCompleted: 0,
      capabilitiesNotStarted: 5,
      approvedSections: 0,
      draftSections: 0,
      totalSections: 0,
      overallPct: 0,
    });
  });

  it('aggregates approved and draft sections across capabilities', () => {
    const totals = buildCompanyTotals(overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved, Alignment: SECTION.approved }),
      [ALIGNMENT_ID]:  capState({ Fit: SECTION.draft, Priorities: SECTION.template }),
    }));
    expect(totals.capabilitiesCompleted).toBe(1);
    expect(totals.capabilitiesInProgress).toBe(1);
    expect(totals.capabilitiesNotStarted).toBe(3);
    expect(totals.approvedSections).toBe(2);
    expect(totals.draftSections).toBe(1);
    expect(totals.overallPct).toBe(50); // 2 approved of 4 known sections
  });
});

// ── recommendNextFocus ────────────────────────────────────────────────────────

describe('recommendNextFocus', () => {
  it('recommends starting the first capability when nothing is started', () => {
    const next = recommendNextFocus(buildCapabilityOverview({}));
    expect(next).toEqual({ id: LEADERSHIP_ID, name: 'AI Initiative Leadership', action: 'start' });
  });

  it('recommends completing the in-progress capability closest to completion', () => {
    const next = recommendNextFocus(overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.draft, Alignment: SECTION.template }),          // 0%
      [ALIGNMENT_ID]:  capState({ Fit: SECTION.approved, Priorities: SECTION.template }),          // 50%
    }));
    expect(next.id).toBe(ALIGNMENT_ID);
    expect(next.action).toBe('complete');
  });

  it('recommends the first not-started capability when all started work is complete', () => {
    const next = recommendNextFocus(overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved }),
    }));
    expect(next).toEqual({ id: ALIGNMENT_ID, name: 'Business Strategy Alignment', action: 'start' });
  });

  it('returns null when every capability is completed', () => {
    const stored = {};
    for (const cap of CAPABILITIES) stored[cap.id] = capState({ Vision: SECTION.approved });
    expect(recommendNextFocus(buildCapabilityOverview(stored))).toBeNull();
  });
});

// ── buildExecutiveSummary ─────────────────────────────────────────────────────

describe('buildExecutiveSummary', () => {
  it('reports not-yet-started when there is no progress', () => {
    const lines = buildExecutiveSummary(buildCapabilityOverview({}));
    expect(lines[0]).toBe('AI strategy development has not yet started.');
    expect(lines[1]).toContain('AI Initiative Leadership');
  });

  it('mentions established foundations for completed capabilities', () => {
    const lines = buildExecutiveSummary(overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved }),
    }));
    expect(lines.join(' ')).toContain('AI Initiative Leadership foundations are established.');
  });

  it('mentions partially complete capabilities', () => {
    const lines = buildExecutiveSummary(overviewWith({
      [ALIGNMENT_ID]: capState({ Fit: SECTION.approved, Priorities: SECTION.template }),
    }));
    expect(lines.join(' ')).toContain('Business Strategy Alignment is partially complete.');
  });

  it('names the biggest remaining gap (first not-started capability)', () => {
    const lines = buildExecutiveSummary(overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved }),
    }));
    expect(lines.join(' ')).toContain('Business Strategy Alignment has not yet started');
  });

  it('ends with a deterministic recommended next step', () => {
    const lines = buildExecutiveSummary(overviewWith({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved }),
    }));
    expect(lines[lines.length - 1]).toBe('Recommended next step: develop Business Strategy Alignment.');
  });

  it('declares the blueprint fully approved when everything is complete', () => {
    const stored = {};
    for (const cap of CAPABILITIES) stored[cap.id] = capState({ Vision: SECTION.approved });
    const lines = buildExecutiveSummary(buildCapabilityOverview(stored));
    expect(lines[lines.length - 1]).toContain('fully approved');
  });
});

// ── buildCurrentFocus ─────────────────────────────────────────────────────────

describe('buildCurrentFocus', () => {
  const STORED = {
    [ALIGNMENT_ID]: {
      capabilityName: 'Business Strategy Alignment',
      industry: 'Automotive',
      sections: { Fit: SECTION.approved, 'Investment Prioritization': SECTION.draft },
    },
  };

  it('returns null when nothing is in progress and no pointer is stored', () => {
    expect(buildCurrentFocus(buildCapabilityOverview({}), null, [])).toBeNull();
  });

  it('uses the stored current capability pointer', () => {
    const focus = buildCurrentFocus(overviewWith(STORED), ALIGNMENT_ID, []);
    expect(focus.capabilityName).toBe('Business Strategy Alignment');
  });

  it('falls back to the in-progress capability when no pointer is stored', () => {
    const focus = buildCurrentFocus(overviewWith(STORED), null, []);
    expect(focus.capabilityName).toBe('Business Strategy Alignment');
  });

  it('takes the current section and last-updated from the latest matching activity', () => {
    const focus = buildCurrentFocus(overviewWith(STORED), ALIGNMENT_ID, [
      { action: 'Accepted', capabilityName: 'Business Strategy Alignment', sectionTitle: 'Investment Prioritization', at: '2026-06-12T08:00:00.000Z' },
    ]);
    expect(focus.sectionTitle).toBe('Investment Prioritization');
    expect(focus.lastUpdated).toBe('2026-06-12T08:00:00.000Z');
  });

  it('falls back to the first unapproved section when there is no activity', () => {
    const focus = buildCurrentFocus(overviewWith(STORED), ALIGNMENT_ID, []);
    expect(focus.sectionTitle).toBe('Investment Prioritization');
  });

  it('recommends approving outstanding drafts first', () => {
    const focus = buildCurrentFocus(overviewWith(STORED), ALIGNMENT_ID, []);
    expect(focus.recommendation).toBe('Approve the 1 working draft in Business Strategy Alignment to lock in progress.');
  });

  it('recommends moving on when the focused capability is complete', () => {
    const stored = { [LEADERSHIP_ID]: capState({ Vision: SECTION.approved }) };
    const focus = buildCurrentFocus(overviewWith(stored), LEADERSHIP_ID, []);
    expect(focus.recommendation).toContain('move on to Business Strategy Alignment');
  });
});

// ── formatActivityLabel ───────────────────────────────────────────────────────

describe('formatActivityLabel', () => {
  it('formats Accepted events with a draft suffix', () => {
    expect(formatActivityLabel({ action: 'Accepted', sectionTitle: 'Alignment' })).toBe('Accepted Alignment draft');
  });

  it('formats Approved events', () => {
    expect(formatActivityLabel({ action: 'Approved', sectionTitle: 'Vision' })).toBe('Approved Vision');
  });

  it('formats Reset events', () => {
    expect(formatActivityLabel({ action: 'Reset', sectionTitle: 'Commitment' })).toBe('Reset Commitment');
  });

  it('returns an empty string for malformed events', () => {
    expect(formatActivityLabel(null)).toBe('');
    expect(formatActivityLabel({ action: 'Approved' })).toBe('');
  });
});
