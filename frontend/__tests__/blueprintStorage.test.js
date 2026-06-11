/**
 * Unit Tests — blueprintStorage.js (Sprint 17)
 *
 * Environment: jsdom (configured in vitest.config.js)
 * localStorage is available natively — cleared in beforeEach.
 *
 * Tests cover: current-capability tracking, capability-state round-trips,
 * graceful fallback on corrupt data, and company-snapshot aggregation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCurrentCapability,
  saveCurrentCapability,
  clearCurrentCapability,
  loadCapabilityState,
  saveCapabilityState,
  getCompanySnapshot,
} from '../domain/blueprintStorage.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CAP_ID = 'ai-initiative-leadership';

const STUB_CAPABILITY = {
  capabilityName: 'AI Initiative Leadership',
  industry:       'Automotive',
  sections: {
    Vision: {
      status:  'Working Draft',
      sources: ['Core', 'Automotive', 'User Modified'],
      content: 'By 2027, achieve 30% lead-time reduction.',
    },
    Alignment: {
      status:  'Template',
      sources: ['Core'],
      content: '',
    },
    Commitment: {
      status:  'Approved',
      sources: ['Core', 'Automotive', 'User Modified'],
      content: 'Leadership committed to AI transformation by end of 2026.',
    },
  },
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

// ── Current capability tracking ───────────────────────────────────────────────

describe('loadCurrentCapability / saveCurrentCapability / clearCurrentCapability', () => {
  it('returns null when nothing has been saved', () => {
    expect(loadCurrentCapability()).toBeNull();
  });

  it('returns the saved capabilityId after saveCurrentCapability', () => {
    saveCurrentCapability(CAP_ID);
    expect(loadCurrentCapability()).toBe(CAP_ID);
  });

  it('overwrites the previous capabilityId on a second save', () => {
    saveCurrentCapability(CAP_ID);
    saveCurrentCapability('business-strategy-alignment');
    expect(loadCurrentCapability()).toBe('business-strategy-alignment');
  });

  it('returns null after clearCurrentCapability', () => {
    saveCurrentCapability(CAP_ID);
    clearCurrentCapability();
    expect(loadCurrentCapability()).toBeNull();
  });

  it('preserves capability state when clearing the current capability pointer', () => {
    saveCapabilityState(CAP_ID, STUB_CAPABILITY);
    saveCurrentCapability(CAP_ID);
    clearCurrentCapability();
    expect(loadCapabilityState(CAP_ID)).not.toBeNull();
  });
});

// ── Capability state persistence ──────────────────────────────────────────────

describe('loadCapabilityState / saveCapabilityState', () => {
  it('returns null when the capability has no saved state', () => {
    expect(loadCapabilityState(CAP_ID)).toBeNull();
  });

  it('returns the saved state after saveCapabilityState', () => {
    saveCapabilityState(CAP_ID, STUB_CAPABILITY);
    expect(loadCapabilityState(CAP_ID)).toEqual(STUB_CAPABILITY);
  });

  it('persists multiple capability states independently', () => {
    const bsa = { capabilityName: 'Business Strategy Alignment', industry: 'Automotive', sections: {} };
    saveCapabilityState(CAP_ID, STUB_CAPABILITY);
    saveCapabilityState('business-strategy-alignment', bsa);

    expect(loadCapabilityState(CAP_ID).capabilityName).toBe('AI Initiative Leadership');
    expect(loadCapabilityState('business-strategy-alignment').capabilityName).toBe('Business Strategy Alignment');
  });

  it('overwrites an existing capability state on re-save', () => {
    saveCapabilityState(CAP_ID, STUB_CAPABILITY);
    const updated = { ...STUB_CAPABILITY, capabilityName: 'Updated Name' };
    saveCapabilityState(CAP_ID, updated);
    expect(loadCapabilityState(CAP_ID).capabilityName).toBe('Updated Name');
  });

  it('section data survives a round-trip through localStorage', () => {
    saveCapabilityState(CAP_ID, STUB_CAPABILITY);
    const restored = loadCapabilityState(CAP_ID);
    expect(restored.sections.Vision.content).toBe('By 2027, achieve 30% lead-time reduction.');
    expect(restored.sections.Vision.status).toBe('Working Draft');
    expect(restored.sections.Vision.sources).toContain('User Modified');
  });
});

// ── Graceful fallback on corrupt data ─────────────────────────────────────────

describe('graceful fallback on corrupt localStorage data', () => {
  it('returns null for currentCapability when stored JSON is corrupt', () => {
    localStorage.setItem('soorgaai_blueprint_v1', '{ invalid json :::');
    expect(loadCurrentCapability()).toBeNull();
  });

  it('returns null for capabilityState when stored JSON is corrupt', () => {
    localStorage.setItem('soorgaai_blueprint_v1', 'not json at all');
    expect(loadCapabilityState(CAP_ID)).toBeNull();
  });

  it('returns an all-zero snapshot when stored JSON is corrupt', () => {
    localStorage.setItem('soorgaai_blueprint_v1', '{ broken');
    const snap = getCompanySnapshot();
    expect(snap.totalCapabilities).toBe(0);
    expect(snap.overallPct).toBe(0);
  });

  it('returns safe defaults when localStorage is empty', () => {
    expect(loadCurrentCapability()).toBeNull();
    expect(loadCapabilityState('anything')).toBeNull();
  });
});

// ── Company Snapshot aggregation ──────────────────────────────────────────────

describe('getCompanySnapshot', () => {
  it('returns all-zero snapshot when no capabilities are stored', () => {
    const snap = getCompanySnapshot();
    expect(snap.totalCapabilities).toBe(0);
    expect(snap.capabilitiesStarted).toBe(0);
    expect(snap.capabilitiesCompleted).toBe(0);
    expect(snap.approvedSections).toBe(0);
    expect(snap.draftSections).toBe(0);
    expect(snap.totalSections).toBe(0);
    expect(snap.overallPct).toBe(0);
  });

  it('counts a capability as started when it has at least one Working Draft', () => {
    saveCapabilityState(CAP_ID, STUB_CAPABILITY);
    expect(getCompanySnapshot().capabilitiesStarted).toBe(1);
  });

  it('counts a capability as started when it has at least one Approved section', () => {
    saveCapabilityState('cap-b', {
      sections: {
        Vision:    { status: 'Approved', sources: ['Core'], content: 'x' },
        Alignment: { status: 'Template', sources: ['Core'], content: '' },
      },
    });
    expect(getCompanySnapshot().capabilitiesStarted).toBe(1);
  });

  it('does NOT count a capability as started when all sections are Template', () => {
    saveCapabilityState('cap-c', {
      sections: {
        Vision:    { status: 'Template', sources: ['Core'], content: '' },
        Alignment: { status: 'Template', sources: ['Core'], content: '' },
      },
    });
    expect(getCompanySnapshot().capabilitiesStarted).toBe(0);
  });

  it('counts a capability as completed only when ALL sections are Approved', () => {
    saveCapabilityState('cap-full', {
      sections: {
        A: { status: 'Approved', sources: ['Core'], content: 'x' },
        B: { status: 'Approved', sources: ['Core'], content: 'y' },
      },
    });
    saveCapabilityState('cap-partial', {
      sections: {
        A: { status: 'Approved', sources: ['Core'], content: 'x' },
        B: { status: 'Template', sources: ['Core'], content: '' },
      },
    });
    expect(getCompanySnapshot().capabilitiesCompleted).toBe(1);
  });

  it('aggregates approved and draft sections across the stored capability', () => {
    saveCapabilityState(CAP_ID, STUB_CAPABILITY); // 1 Approved + 1 Draft + 1 Template
    const snap = getCompanySnapshot();
    expect(snap.approvedSections).toBe(1);
    expect(snap.draftSections).toBe(1);
    expect(snap.totalSections).toBe(3);
  });

  it('calculates overallPct as floor(approved / total × 100)', () => {
    saveCapabilityState(CAP_ID, STUB_CAPABILITY); // 1/3 Approved = 33%
    expect(getCompanySnapshot().overallPct).toBe(33);
  });

  it('returns 100% when every section is Approved', () => {
    saveCapabilityState('cap-all', {
      sections: {
        A: { status: 'Approved', sources: ['Core'], content: 'x' },
        B: { status: 'Approved', sources: ['Core'], content: 'y' },
      },
    });
    expect(getCompanySnapshot().overallPct).toBe(100);
  });

  it('reports correct totalCapabilities across multiple stored capabilities', () => {
    saveCapabilityState('cap-1', STUB_CAPABILITY);
    saveCapabilityState('cap-2', { sections: { A: { status: 'Template', sources: ['Core'], content: '' } } });
    saveCapabilityState('cap-3', { sections: { B: { status: 'Approved', sources: ['Core'], content: 'done' } } });
    expect(getCompanySnapshot().totalCapabilities).toBe(3);
  });

  it('aggregates across multiple capabilities correctly', () => {
    saveCapabilityState('cap-1', {
      sections: {
        A: { status: 'Approved',      sources: ['Core'], content: 'done' },
        B: { status: 'Working Draft', sources: ['Core'], content: 'wip'  },
      },
    });
    saveCapabilityState('cap-2', {
      sections: {
        C: { status: 'Approved', sources: ['Core'], content: 'done' },
        D: { status: 'Template', sources: ['Core'], content: ''     },
      },
    });
    const snap = getCompanySnapshot();
    expect(snap.approvedSections).toBe(2);
    expect(snap.draftSections).toBe(1);
    expect(snap.totalSections).toBe(4);
    expect(snap.overallPct).toBe(50); // 2/4
  });
});
