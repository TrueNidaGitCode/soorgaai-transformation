/**
 * Unit tests — backend/data/domainDefinitions.js
 *
 * Pure data module — no mocks required.
 * Verifies the structure, constraints, and helper functions.
 */

import { describe, it, expect } from 'vitest';
import DOMAINS, { getDomain, getFocusAreaIds } from '../data/domainDefinitions.js';

// ── DOMAINS array structure ───────────────────────────────────────────────────

describe('DOMAINS — array structure', () => {
  it('exports exactly 6 domains', () => {
    expect(DOMAINS).toHaveLength(6);
  });

  it('every domain has the required shape (domainId, title, description, enabled, icon, focusAreas, suggestedPrompts)', () => {
    for (const d of DOMAINS) {
      expect(d).toHaveProperty('domainId');
      expect(d).toHaveProperty('title');
      expect(d).toHaveProperty('description');
      expect(typeof d.enabled).toBe('boolean');
      expect(d).toHaveProperty('icon');
      expect(Array.isArray(d.focusAreas)).toBe(true);
      expect(Array.isArray(d.suggestedPrompts)).toBe(true);
    }
  });

  it('all domain IDs are unique', () => {
    const ids = DOMAINS.map(d => d.domainId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Enabled / disabled split ──────────────────────────────────────────────────

describe('DOMAINS — enabled flag', () => {
  it('all 6 domains are enabled', () => {
    const enabled = DOMAINS.filter(d => d.enabled);
    expect(enabled).toHaveLength(6);
  });

  it('no domains are disabled', () => {
    const disabled = DOMAINS.filter(d => !d.enabled);
    expect(disabled).toHaveLength(0);
  });
});

// ── AI Strategy domain ────────────────────────────────────────────────────────

describe('DOMAINS — ai-strategy content', () => {
  const aiStrategy = DOMAINS.find(d => d.domainId === 'ai-strategy');

  it('has exactly 5 focus areas', () => {
    expect(aiStrategy.focusAreas).toHaveLength(5);
  });

  it('has exactly 4 suggested prompts', () => {
    expect(aiStrategy.suggestedPrompts).toHaveLength(4);
  });

  it('all 5 focus area IDs are unique', () => {
    const ids = aiStrategy.focusAreas.map(fa => fa.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('every focus area has id, title, and defaultDescription', () => {
    for (const fa of aiStrategy.focusAreas) {
      expect(typeof fa.id).toBe('string');
      expect(fa.id.length).toBeGreaterThan(0);
      expect(typeof fa.title).toBe('string');
      expect(fa.title.length).toBeGreaterThan(0);
      expect(typeof fa.defaultDescription).toBe('string');
    }
  });

  it('every defaultDescription is between 20 and 400 characters', () => {
    for (const fa of aiStrategy.focusAreas) {
      expect(fa.defaultDescription.length).toBeGreaterThanOrEqual(20);
      expect(fa.defaultDescription.length).toBeLessThanOrEqual(400);
    }
  });

  it('contains the expected focus area IDs', () => {
    const ids = aiStrategy.focusAreas.map(fa => fa.id);
    expect(ids).toContain('vision-alignment');
    expect(ids).toContain('investment-prioritization');
    expect(ids).toContain('roadmap-execution');
    expect(ids).toContain('culture-change');
    expect(ids).toContain('metrics-value');
  });

  it('all 4 suggested prompts are non-empty strings', () => {
    for (const prompt of aiStrategy.suggestedPrompts) {
      expect(typeof prompt).toBe('string');
      expect(prompt.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── Disabled domains ──────────────────────────────────────────────────────────

describe('DOMAINS — disabled domain content', () => {
  it('disabled domains have empty focusAreas arrays', () => {
    const disabled = DOMAINS.filter(d => !d.enabled);
    for (const d of disabled) {
      expect(d.focusAreas).toHaveLength(0);
    }
  });

  it('disabled domains have empty suggestedPrompts arrays', () => {
    const disabled = DOMAINS.filter(d => !d.enabled);
    for (const d of disabled) {
      expect(d.suggestedPrompts).toHaveLength(0);
    }
  });
});

// ── getDomain() ───────────────────────────────────────────────────────────────

describe('getDomain()', () => {
  it('returns the correct domain for a valid domainId', () => {
    const domain = getDomain('ai-strategy');
    expect(domain.domainId).toBe('ai-strategy');
    expect(domain.enabled).toBe(true);
  });

  it('returns a domain by ID', () => {
    const domain = getDomain('governance-security');
    expect(domain).toBeDefined();
    expect(domain.enabled).toBe(true);
  });

  it('returns undefined for an unknown domainId', () => {
    expect(getDomain('unknown-domain')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getDomain('')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(getDomain('AI-STRATEGY')).toBeUndefined();
  });
});

// ── getFocusAreaIds() ─────────────────────────────────────────────────────────

describe('getFocusAreaIds()', () => {
  it('returns the 5 focus area IDs for ai-strategy', () => {
    const ids = getFocusAreaIds('ai-strategy');
    expect(ids).toHaveLength(5);
    expect(ids).toContain('vision-alignment');
    expect(ids).toContain('metrics-value');
  });

  it('returns an empty array for a domain with no focus areas', () => {
    expect(getFocusAreaIds('governance-security')).toHaveLength(0);
  });

  it('returns an empty array for an unknown domainId', () => {
    expect(getFocusAreaIds('nonexistent')).toHaveLength(0);
  });
});
