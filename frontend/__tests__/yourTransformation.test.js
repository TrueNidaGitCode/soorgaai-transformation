/**
 * Unit Tests — workspace/yourTransformation.js (Sprint 18.1)
 *
 * Environment: jsdom. The summary builder is pure; rendering tests use the
 * real DOM fixture and Sprint 17 localStorage (cleared in beforeEach).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildTransformationSummary,
  formatLastActivity,
  renderWidget,
} from '../workspace/yourTransformation.js';
import { buildCapabilityOverview } from '../company-strategy/dashboardMetrics.js';
import { saveCapabilityState, saveCurrentCapability, logActivity } from '../domain/blueprintStorage.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LEADERSHIP_ID = 'ai-initiative-leadership';

const SECTION = {
  approved: { status: 'Approved',      sources: ['Core', 'User Modified'], content: 'Approved text.' },
  draft:    { status: 'Working Draft', sources: ['Core', 'User Modified'], content: 'Draft text.' },
  template: { status: 'Template',      sources: ['Core'],                  content: '' },
};

function capState(sections, name = 'AI Initiative Leadership') {
  return { capabilityName: name, industry: 'Automotive', sections };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

// ── buildTransformationSummary ────────────────────────────────────────────────

describe('buildTransformationSummary', () => {
  it('reports no progress for a first-time user and suggests where to start', () => {
    const summary = buildTransformationSummary(buildCapabilityOverview({}), null, []);
    expect(summary.hasProgress).toBe(false);
    expect(summary.nextAction).toBe('Start with AI Initiative Leadership');
  });

  it('reports the current domain, capability and progress for the stored pointer', () => {
    const overview = buildCapabilityOverview({
      [LEADERSHIP_ID]: capState({
        Vision: SECTION.approved, Alignment: SECTION.draft, Commitment: SECTION.template,
      }),
    });

    const summary = buildTransformationSummary(overview, LEADERSHIP_ID, []);
    expect(summary.hasProgress).toBe(true);
    expect(summary.domainTitle).toBe('AI Strategy');
    expect(summary.capabilityName).toBe('AI Initiative Leadership');
    expect(summary.pct).toBe(33);
  });

  it('falls back to the in-progress capability when no pointer is stored', () => {
    const overview = buildCapabilityOverview({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.draft }),
    });

    const summary = buildTransformationSummary(overview, null, []);
    expect(summary.capabilityName).toBe('AI Initiative Leadership');
  });

  it('recommends reviewing the current section as the next action', () => {
    const overview = buildCapabilityOverview({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved, Alignment: SECTION.draft }),
    });

    const summary = buildTransformationSummary(overview, LEADERSHIP_ID, []);
    expect(summary.nextAction).toBe('Review Alignment section');
  });

  it('recommends starting the next capability when the current one is complete', () => {
    const overview = buildCapabilityOverview({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.approved }),
    });

    const summary = buildTransformationSummary(overview, LEADERSHIP_ID, []);
    expect(summary.nextAction).toBe('Start Business Strategy Alignment');
  });

  it('takes last activity from the newest matching event', () => {
    const overview = buildCapabilityOverview({
      [LEADERSHIP_ID]: capState({ Vision: SECTION.draft }),
    });
    const activities = [
      { action: 'Accepted', capabilityName: 'AI Initiative Leadership', sectionTitle: 'Vision', at: '2026-06-12T08:00:00.000Z' },
    ];

    const summary = buildTransformationSummary(overview, LEADERSHIP_ID, activities);
    expect(summary.lastActivityAt).toBe('2026-06-12T08:00:00.000Z');
  });
});

// ── formatLastActivity ────────────────────────────────────────────────────────

describe('formatLastActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a dash for null or invalid input', () => {
    expect(formatLastActivity(null)).toBe('—');
    expect(formatLastActivity('not a date')).toBe('—');
  });

  it('returns "Just now" for under a minute', () => {
    expect(formatLastActivity('2026-06-12T11:59:30.000Z')).toBe('Just now');
  });

  it('formats minutes ago', () => {
    expect(formatLastActivity('2026-06-12T11:55:00.000Z')).toBe('5 minutes ago');
  });

  it('formats hours ago', () => {
    expect(formatLastActivity('2026-06-11T13:00:00.000Z')).toBe('23 hours ago');
  });

  it('formats days ago', () => {
    expect(formatLastActivity('2026-06-09T12:00:00.000Z')).toBe('3 days ago');
  });

  it('uses the singular form for exactly one hour', () => {
    expect(formatLastActivity('2026-06-12T11:00:00.000Z')).toBe('1 hour ago');
  });
});

// ── renderWidget (DOM integration) ────────────────────────────────────────────

function buildWidgetDOM() {
  document.body.innerHTML = `
    <section id="ws-transform-card" class="ws-card ws-transform-card" role="button" tabindex="0">
      <span id="ws-transform-continue">Continue →</span>
      <div id="ws-transform-body"></div>
    </section>
  `;
}

describe('renderWidget', () => {
  it('does not throw when the widget elements are absent', () => {
    expect(() => renderWidget()).not.toThrow();
  });

  it('renders the empty state with a Start label for a first-time user', () => {
    buildWidgetDOM();

    renderWidget();

    expect(document.getElementById('ws-transform-continue').textContent).toBe('Start →');
    expect(document.getElementById('ws-transform-body').textContent).toContain("You haven't started yet");
  });

  it('renders domain, capability, progress and next action from Sprint 17 storage', () => {
    saveCapabilityState(LEADERSHIP_ID, capState({
      Vision: SECTION.approved, Alignment: SECTION.draft, Commitment: SECTION.template,
    }));
    saveCurrentCapability(LEADERSHIP_ID);
    buildWidgetDOM();

    renderWidget();

    const body = document.getElementById('ws-transform-body').textContent;
    expect(body).toContain('AI Strategy');
    expect(body).toContain('AI Initiative Leadership');
    expect(body).toContain('33% Complete');
    expect(body).toContain('Review Alignment section');
    expect(document.getElementById('ws-transform-continue').textContent).toBe('Continue →');
  });

  it('shows last activity from the activity log', () => {
    saveCapabilityState(LEADERSHIP_ID, capState({ Vision: SECTION.draft }));
    saveCurrentCapability(LEADERSHIP_ID);
    logActivity('Accepted', 'AI Initiative Leadership', 'Vision');
    buildWidgetDOM();

    renderWidget();

    expect(document.getElementById('ws-transform-body').textContent).toContain('Just now');
  });

  it('includes a link to the executive dashboard when progress exists', () => {
    saveCapabilityState(LEADERSHIP_ID, capState({ Vision: SECTION.draft }));
    buildWidgetDOM();

    renderWidget();

    const link = document.getElementById('ws-transform-dashboard');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/company-strategy/company-strategy.html');
  });

  it('navigates to the editing workspace when the card is clicked', () => {
    saveCapabilityState(LEADERSHIP_ID, capState({ Vision: SECTION.draft }));
    buildWidgetDOM();
    renderWidget();

    document.getElementById('ws-transform-card').click();

    expect(window.location.href).toBe('/domain/domain.html?domain=ai-strategy');
  });
});
