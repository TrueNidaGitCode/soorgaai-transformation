/**
 * Unit Tests — kbRetrievalService.js
 *
 * Strategy:
 *  - `fs` is fully mocked via vi.hoisted() so the same mock function instances
 *    are reused across the vi.mock() factory and all beforeEach calls.
 *  - vi.resetModules() is called in beforeEach to clear the module-level _cache
 *    and obtain a fresh import with an empty cache on every test.
 *  - No real files are read during these tests.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import FIXTURE_STAGES from './__fixtures__/maturity-stages.json';
import FIXTURE_AREAS  from './__fixtures__/focus-areas.json';
import { readFileSync } from 'fs';

// ── Stable mock function references (created before any vi.mock hoisting) ─────
const { mockReadFileSync, mockExistsSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockExistsSync:   vi.fn(),
}));

// ── Mock the entire `fs` module ───────────────────────────────────────────────
vi.mock('fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    existsSync:   mockExistsSync,
  },
}));

const AUTOMOTIVE_MD = '# Automotive Domain Study\nTest content for automotive AI.';

/** Configure the default fs mock behaviour for a test. */
function setupFsMocks({ existsResult = true } = {}) {
  mockExistsSync.mockReturnValue(existsResult);
  mockReadFileSync.mockImplementation((filePath) => {
    const p = String(filePath);
    if (p.includes('maturity-stages.json')) return JSON.stringify(FIXTURE_STAGES);
    if (p.includes('focus-areas.json'))     return JSON.stringify(FIXTURE_AREAS);
    if (p.includes('automotive.md'))        return AUTOMOTIVE_MD;
    throw Object.assign(new Error(`ENOENT: no such file: ${filePath}`), { code: 'ENOENT' });
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('kbRetrievalService', () => {
  let service;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    setupFsMocks();
    service = await import('../services/kbRetrievalService.js');
  });

  // ── getMaturityStages ───────────────────────────────────────────────────────

  describe('getMaturityStages()', () => {
    it('returns an object with a stages array of 5 items', () => {
      const result = service.getMaturityStages();
      expect(result).toHaveProperty('stages');
      expect(result.stages).toHaveLength(5);
    });

    it('each stage has the required contract fields', () => {
      const { stages } = service.getMaturityStages();
      for (const stage of stages) {
        expect(stage).toHaveProperty('stage');
        expect(stage).toHaveProperty('stageNumber');
        expect(stage).toHaveProperty('minScore');
        expect(stage).toHaveProperty('maxScore');
        expect(stage).toHaveProperty('description');
        expect(typeof stage.minScore).toBe('number');
        expect(typeof stage.maxScore).toBe('number');
      }
    });

    it('stage bands are contiguous and cover 0–100', () => {
      const { stages } = service.getMaturityStages();
      const sorted = [...stages].sort((a, b) => a.minScore - b.minScore);
      expect(sorted[0].minScore).toBe(0);
      expect(sorted[sorted.length - 1].maxScore).toBe(100);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].minScore).toBe(sorted[i - 1].maxScore + 1);
      }
    });

    it('reads from disk on first call', () => {
      service.getMaturityStages();
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('maturity-stages.json'),
        'utf-8',
      );
    });

    it('returns cached result on second call without re-reading disk', () => {
      service.getMaturityStages();
      service.getMaturityStages();
      const calls = mockReadFileSync.mock.calls.filter(c =>
        String(c[0]).includes('maturity-stages.json'),
      );
      expect(calls).toHaveLength(1);
    });

    it('throws when the file cannot be read', async () => {
      vi.resetModules();
      mockReadFileSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const fresh = await import('../services/kbRetrievalService.js');
      expect(() => fresh.getMaturityStages()).toThrow();
    });
  });

  // ── getFocusAreas ───────────────────────────────────────────────────────────

  describe('getFocusAreas()', () => {
    it('returns an object with a focusAreas array of 7 items', () => {
      const result = service.getFocusAreas();
      expect(result).toHaveProperty('focusAreas');
      expect(result.focusAreas).toHaveLength(7);
    });

    it('each focus area has id and name fields', () => {
      const { focusAreas } = service.getFocusAreas();
      for (const fa of focusAreas) {
        expect(fa).toHaveProperty('id');
        expect(fa).toHaveProperty('name');
        expect(typeof fa.id).toBe('string');
      }
    });

    it('includes all 7 expected focus area IDs', () => {
      const { focusAreas } = service.getFocusAreas();
      const ids = focusAreas.map(f => f.id);
      const expected = [
        'ai-strategy', 'leadership', 'ai-use-cases',
        'data-readiness', 'technology', 'skills-workforce', 'governance',
      ];
      for (const id of expected) {
        expect(ids).toContain(id);
      }
    });

    it('caches result after first read', () => {
      service.getFocusAreas();
      service.getFocusAreas();
      const calls = mockReadFileSync.mock.calls.filter(c =>
        String(c[0]).includes('focus-areas.json'),
      );
      expect(calls).toHaveLength(1);
    });
  });

  // ── getDomainStudy ──────────────────────────────────────────────────────────

  describe('getDomainStudy()', () => {
    it('returns markdown string for a known domain', () => {
      const result = service.getDomainStudy('Automotive');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('reads the matching domain-studies/<domain>.md file', () => {
      service.getDomainStudy('automotive');
      expect(mockExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('automotive.md'),
      );
    });

    it('falls back to automotive.md when the requested domain file is missing', () => {
      mockExistsSync.mockReturnValue(false); // healthcare.md does not exist
      const result = service.getDomainStudy('Healthcare');
      expect(typeof result).toBe('string');
      // Fallback reads automotive.md
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('automotive.md'),
        'utf-8',
      );
    });

    it('normalises domain name to lowercase kebab-case for file lookup', () => {
      service.getDomainStudy('Automotive');
      expect(mockExistsSync).toHaveBeenCalledWith(
        expect.stringMatching(/automotive\.md$/),
      );
    });

    it('defaults to automotive when domain is null or empty', () => {
      const result = service.getDomainStudy(null);
      expect(typeof result).toBe('string');
      expect(mockExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('automotive.md'),
      );
    });

    it('caches the domain study after first read', () => {
      service.getDomainStudy('Automotive');
      service.getDomainStudy('Automotive');
      const existsCalls = mockExistsSync.mock.calls.filter(c =>
        String(c[0]).includes('automotive.md'),
      );
      expect(existsCalls).toHaveLength(1);
    });
  });

  // ── retrieveContext ─────────────────────────────────────────────────────────

  describe('retrieveContext()', () => {
    it('returns all four required context fields', () => {
      const ctx = service.retrieveContext('Automotive');
      expect(ctx).toHaveProperty('maturityStages');
      expect(ctx).toHaveProperty('focusAreas');
      expect(ctx).toHaveProperty('domainStudy');
      expect(ctx).toHaveProperty('contextSummary');
    });

    it('returns all 5 stages when no stageHint is provided', () => {
      const ctx = service.retrieveContext('Automotive');
      expect(ctx.maturityStages).toHaveLength(5);
    });

    it('filters stages when a valid stageHint is provided', () => {
      const ctx = service.retrieveContext('Automotive', null, 'AI Scramble');
      expect(ctx.maturityStages).toHaveLength(1);
      expect(ctx.maturityStages[0].stage).toBe('AI Scramble');
    });

    it('returns empty stages array when stageHint matches nothing', () => {
      const ctx = service.retrieveContext('Automotive', null, 'NonExistent Stage');
      expect(ctx.maturityStages).toHaveLength(0);
    });

    it('returns all 7 focus areas when no focusArea filter is provided', () => {
      const ctx = service.retrieveContext('Automotive');
      expect(ctx.focusAreas).toHaveLength(7);
    });

    it('filters focus areas when a valid focusArea id is provided', () => {
      const ctx = service.retrieveContext('Automotive', 'ai-strategy');
      expect(ctx.focusAreas).toHaveLength(1);
      expect(ctx.focusAreas[0].id).toBe('ai-strategy');
    });

    it('contextSummary includes domain name', () => {
      const ctx = service.retrieveContext('Automotive');
      expect(ctx.contextSummary).toContain('Automotive');
    });

    it('contextSummary includes focusArea when provided', () => {
      const ctx = service.retrieveContext('Automotive', 'leadership');
      expect(ctx.contextSummary).toContain('leadership');
    });

    it('contextSummary includes stageHint when provided', () => {
      const ctx = service.retrieveContext('Automotive', null, 'AI Pivot');
      expect(ctx.contextSummary).toContain('AI Pivot');
    });

    it('domainStudy is a non-empty string', () => {
      const ctx = service.retrieveContext('Automotive');
      expect(typeof ctx.domainStudy).toBe('string');
      expect(ctx.domainStudy.length).toBeGreaterThan(0);
    });
  });

  // ── warmCache ───────────────────────────────────────────────────────────────

  describe('warmCache()', () => {
    it('pre-loads maturity stages, focus areas, and automotive study without throwing', () => {
      expect(() => service.warmCache()).not.toThrow();
    });

    it('reads all three KB files during warm', () => {
      service.warmCache();
      const paths = mockReadFileSync.mock.calls.map(c => String(c[0]));
      expect(paths.some(p => p.includes('maturity-stages.json'))).toBe(true);
      expect(paths.some(p => p.includes('focus-areas.json'))).toBe(true);
      expect(paths.some(p => p.includes('automotive.md'))).toBe(true);
    });

    it('does not throw when a KB file is missing — logs warning instead', async () => {
      vi.resetModules();
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      mockExistsSync.mockReturnValue(false);
      const fresh = await import('../services/kbRetrievalService.js');
      // warmCache catches errors internally and logs them
      expect(() => fresh.warmCache()).not.toThrow();
    });
  });
});
