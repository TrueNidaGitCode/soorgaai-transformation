/**
 * Unit Tests — strategyCanvasService.js
 *
 * Strategy:
 *  - `fs` is fully mocked via vi.hoisted() so the same mock instances are
 *    shared between vi.mock() factory and each test.
 *  - vi.resetModules() clears the module-level _capabilitiesCache between tests.
 *  - No real knowledge-base files are read during these tests.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Fixture markdown ──────────────────────────────────────────────────────────

const SPEC_MD = `# AI Strategy Intelligence Specification

# Knowledge Architecture

The AI Strategy domain consists of five core intelligence areas.

| Domain                      | Primary Objective                        |
| --------------------------- | ---------------------------------------- |
| AI Initiative Leadership    | Lead AI transformation                   |
| Business Strategy Alignment | Connect AI with business objectives      |
`;

const CORE_LEADERSHIP_MD = `# AI Initiative Leadership

## Purpose

Leadership purpose text.

# Core Principles

1. Vision
2. Alignment

# 1. Vision

## Definition

Vision provides strategic direction for AI transformation.

## Key Principles

* Define a clear long-term aspiration.
* Focus on business value.

## Leadership Question

**Why are we investing in AI?**

---

# 2. Alignment

## Definition

Alignment ensures leadership teams share a common understanding.

## Key Principles

* Build a common AI vocabulary.
* Clarify executive responsibilities.

## Leadership Question

**Does our leadership team share a common understanding?**

---

# Key Takeaways

Summary takeaways here.
`;

const AUTOMOTIVE_LEADERSHIP_MD = `# Automotive AI Initiative Leadership

## Purpose

Automotive purpose text.

## Vision in Automotive

Automotive OEMs must accelerate product delivery while meeting evolving expectations.

### Automotive Vision Drivers

* Cleaner and sustainable mobility
* Software-defined vehicles

## Alignment in Automotive

Automotive alignment requires cross-functional collaboration.

## Key Takeaways

Automotive key takeaways here.
`;

// ── Hoisted mock references ───────────────────────────────────────────────────

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { readFileSync: mockReadFileSync },
}));

// ── Mock configuration ────────────────────────────────────────────────────────

function setupFsMocks({ missingIndustry = false, missingCore = false } = {}) {
  mockReadFileSync.mockImplementation((filePath) => {
    const p = String(filePath);
    if (p.includes('AI_Strategy_Intelligence_Specification.md')) return SPEC_MD;
    if (!missingCore && p.includes('Automotive_AI_Initiative_Leadership.md'))
      return missingIndustry ? (() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); })() : AUTOMOTIVE_LEADERSHIP_MD;
    if (!missingCore && p.includes('AI_Initiative_Leadership.md')) return CORE_LEADERSHIP_MD;
    throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('strategyCanvasService', () => {
  let service;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    setupFsMocks();
    service = await import('../services/strategyCanvasService.js');
  });

  // ── getCapabilities ─────────────────────────────────────────────────────────

  describe('getCapabilities()', () => {
    it('returns an array of capability objects', () => {
      const caps = service.getCapabilities();
      expect(Array.isArray(caps)).toBe(true);
      expect(caps.length).toBeGreaterThan(0);
    });

    it('each capability has id, name, and objective fields', () => {
      const caps = service.getCapabilities();
      for (const cap of caps) {
        expect(typeof cap.id).toBe('string');
        expect(typeof cap.name).toBe('string');
        expect(typeof cap.objective).toBe('string');
        expect(cap.id.length).toBeGreaterThan(0);
      }
    });

    it('extracts exactly the capabilities defined in the spec table', () => {
      const caps = service.getCapabilities();
      expect(caps).toHaveLength(2);
      const names = caps.map(c => c.name);
      expect(names).toContain('AI Initiative Leadership');
      expect(names).toContain('Business Strategy Alignment');
    });

    it('produces kebab-case IDs from capability names', () => {
      const caps = service.getCapabilities();
      const leadership = caps.find(c => c.name === 'AI Initiative Leadership');
      expect(leadership.id).toBe('ai-initiative-leadership');
    });

    it('includes the objective from the spec table', () => {
      const caps = service.getCapabilities();
      const leadership = caps.find(c => c.name === 'AI Initiative Leadership');
      expect(leadership.objective).toBe('Lead AI transformation');
    });

    it('reads the spec file from disk', () => {
      service.getCapabilities();
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('AI_Strategy_Intelligence_Specification.md'),
        'utf-8',
      );
    });

    it('returns cached result on subsequent calls without re-reading disk', () => {
      service.getCapabilities();
      service.getCapabilities();
      const calls = mockReadFileSync.mock.calls.filter(c =>
        String(c[0]).includes('AI_Strategy_Intelligence_Specification.md'),
      );
      expect(calls).toHaveLength(1);
    });

    it('throws when the spec file cannot be read', async () => {
      vi.resetModules();
      mockReadFileSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const fresh = await import('../services/strategyCanvasService.js');
      expect(() => fresh.getCapabilities()).toThrow();
    });
  });

  // ── getCapabilityBlueprint ──────────────────────────────────────────────────

  describe('getCapabilityBlueprint()', () => {
    it('returns a blueprint with required top-level fields', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      expect(bp).toHaveProperty('capabilityId', 'ai-initiative-leadership');
      expect(bp).toHaveProperty('capabilityName', 'AI Initiative Leadership');
      expect(bp).toHaveProperty('industry', 'Automotive');
      expect(Array.isArray(bp.sections)).toBe(true);
    });

    it('extracts the numbered pillar sections from the core document', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      expect(bp.sections).toHaveLength(2);
      const titles = bp.sections.map(s => s.title);
      expect(titles).toContain('Vision');
      expect(titles).toContain('Alignment');
    });

    it('each section has definition, keyPrinciples, and leadershipQuestion', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      for (const section of bp.sections) {
        expect(section).toHaveProperty('title');
        expect(section).toHaveProperty('definition');
        expect(section).toHaveProperty('keyPrinciples');
        expect(section).toHaveProperty('leadershipQuestion');
        expect(Array.isArray(section.keyPrinciples)).toBe(true);
      }
    });

    it('correctly extracts the definition text from ## Definition', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      const vision = bp.sections.find(s => s.title === 'Vision');
      expect(vision.definition).toContain('Vision provides strategic direction');
    });

    it('extracts key principles as a string array (strips bullet markers)', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      const vision = bp.sections.find(s => s.title === 'Vision');
      expect(vision.keyPrinciples.length).toBeGreaterThan(0);
      expect(vision.keyPrinciples).toContain('Define a clear long-term aspiration.');
      for (const p of vision.keyPrinciples) {
        expect(p).not.toMatch(/^\*/); // no bullet marker
      }
    });

    it('extracts the leadership question and strips bold markdown', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      const vision = bp.sections.find(s => s.title === 'Vision');
      expect(vision.leadershipQuestion).toContain('Why are we investing in AI?');
      expect(vision.leadershipQuestion).not.toContain('**');
    });

    it('merges industry context for matching sections (source = "both")', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      const vision = bp.sections.find(s => s.title === 'Vision');
      expect(vision.source).toBe('both');
      expect(vision.industryContext).toBeTruthy();
    });

    it('industryContext contains the matching automotive section content', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      const vision = bp.sections.find(s => s.title === 'Vision');
      expect(vision.industryContext).toContain('Automotive OEMs');
    });

    it('sets source to "core" and industryContext to null when industry file is missing', async () => {
      vi.resetModules();
      mockReadFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('AI_Strategy_Intelligence_Specification.md')) return SPEC_MD;
        if (p.includes('Automotive_AI_Initiative_Leadership.md'))
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        if (p.includes('AI_Initiative_Leadership.md')) return CORE_LEADERSHIP_MD;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const fresh = await import('../services/strategyCanvasService.js');
      const bp = fresh.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      for (const section of bp.sections) {
        expect(section.source).toBe('core');
        expect(section.industryContext).toBeNull();
      }
    });

    it('reads the correct core capability file path', () => {
      service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('AI_Initiative_Leadership.md'),
        'utf-8',
      );
    });

    it('reads the correct industry capability file path', () => {
      service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('Automotive_AI_Initiative_Leadership.md'),
        'utf-8',
      );
    });

    it('throws "Capability not found" for an unknown capability id', () => {
      expect(() =>
        service.getCapabilityBlueprint('nonexistent-capability', 'Automotive'),
      ).toThrow('Capability not found: nonexistent-capability');
    });

    it('returns empty sections array when the core file cannot be read', async () => {
      vi.resetModules();
      mockReadFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('AI_Strategy_Intelligence_Specification.md')) return SPEC_MD;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const fresh = await import('../services/strategyCanvasService.js');
      const bp = fresh.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      expect(bp.sections).toHaveLength(0);
    });

    it('does not include non-numbered h1 sections (Key Takeaways, Core Principles) in sections', () => {
      const bp = service.getCapabilityBlueprint('ai-initiative-leadership', 'Automotive');
      const titles = bp.sections.map(s => s.title);
      expect(titles).not.toContain('Key Takeaways');
      expect(titles).not.toContain('Core Principles');
      expect(titles).not.toContain('AI Initiative Leadership');
    });
  });
});
