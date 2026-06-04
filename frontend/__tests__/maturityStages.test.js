/**
 * Unit tests — frontend/data/maturityStages.js
 *
 * This module is the single source of truth for the 5 AI maturity stages
 * on the frontend. It MUST stay in sync with:
 *   backend/trunida-backend/knowledge-base/maturity-stages.json
 *
 * The snapshot test at the bottom is the regression guard for that constraint.
 */

import { MATURITY_STAGES } from '../data/maturityStages.js';

const EXPECTED_NAMES = [
  'AI Scramble',
  'AI Pivot',
  'AI Alignment',
  'AI Transform',
  'AI-Fueled Enterprise',
];

const REQUIRED_KEYS = ['id', 'name', 'descriptor', 'color', 'minScore', 'maxScore'];

// ── Shape ──────────────────────────────────────────────────────────────────────

describe('MATURITY_STAGES — export shape', () => {
  it('is exported and is an array', () => {
    expect(Array.isArray(MATURITY_STAGES)).toBe(true);
  });

  it('contains exactly 5 stages', () => {
    expect(MATURITY_STAGES).toHaveLength(5);
  });

  it('each stage has all required keys', () => {
    MATURITY_STAGES.forEach(stage => {
      REQUIRED_KEYS.forEach(key => {
        expect(stage, `stage ${stage.id} is missing key "${key}"`).toHaveProperty(key);
      });
    });
  });
});

// ── ID sequence ───────────────────────────────────────────────────────────────

describe('MATURITY_STAGES — id values', () => {
  it('has ids 1 through 5 in ascending order', () => {
    const ids = MATURITY_STAGES.map(s => s.id);

    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('has no duplicate id values', () => {
    const ids = MATURITY_STAGES.map(s => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every id is a positive integer', () => {
    MATURITY_STAGES.forEach(stage => {
      expect(Number.isInteger(stage.id)).toBe(true);
      expect(stage.id).toBeGreaterThan(0);
    });
  });
});

// ── Stage names ───────────────────────────────────────────────────────────────

describe('MATURITY_STAGES — stage names', () => {
  it('stage names match the specification exactly', () => {
    const names = MATURITY_STAGES.map(s => s.name);

    expect(names).toEqual(EXPECTED_NAMES);
  });

  it('has no duplicate stage names', () => {
    const names = MATURITY_STAGES.map(s => s.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  it('every name is a non-empty string', () => {
    MATURITY_STAGES.forEach(stage => {
      expect(typeof stage.name).toBe('string');
      expect(stage.name.trim().length).toBeGreaterThan(0);
    });
  });
});

// ── Descriptors ───────────────────────────────────────────────────────────────

describe('MATURITY_STAGES — descriptors', () => {
  it('every descriptor is a non-empty string', () => {
    MATURITY_STAGES.forEach(stage => {
      expect(typeof stage.descriptor).toBe('string');
      expect(stage.descriptor.trim().length).toBeGreaterThan(0);
    });
  });

  it('has no duplicate descriptor values', () => {
    const descriptors = MATURITY_STAGES.map(s => s.descriptor);
    const unique = new Set(descriptors);

    expect(unique.size).toBe(descriptors.length);
  });
});

// ── Score ranges ──────────────────────────────────────────────────────────────

describe('MATURITY_STAGES — score ranges', () => {
  it('every stage has a numeric minScore and maxScore', () => {
    MATURITY_STAGES.forEach(stage => {
      expect(typeof stage.minScore).toBe('number');
      expect(typeof stage.maxScore).toBe('number');
    });
  });

  it('minScore is always less than maxScore for each stage', () => {
    MATURITY_STAGES.forEach(stage => {
      expect(stage.minScore).toBeLessThan(stage.maxScore);
    });
  });

  it('score ranges cover 0 to 100 without gaps', () => {
    const sorted = [...MATURITY_STAGES].sort((a, b) => a.minScore - b.minScore);

    expect(sorted[0].minScore).toBe(0);
    expect(sorted[sorted.length - 1].maxScore).toBe(100);

    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].minScore).toBe(sorted[i - 1].maxScore + 1);
    }
  });
});

// ── Colors ────────────────────────────────────────────────────────────────────

describe('MATURITY_STAGES — colors', () => {
  it('every color is a valid CSS hex string', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;

    MATURITY_STAGES.forEach(stage => {
      expect(stage.color, `stage ${stage.id} color "${stage.color}" is not a valid hex`).toMatch(hexPattern);
    });
  });

  it('has no duplicate color values', () => {
    const colors = MATURITY_STAGES.map(s => s.color);
    const unique = new Set(colors);

    expect(unique.size).toBe(colors.length);
  });
});

// ── Snapshot regression guard ─────────────────────────────────────────────────
//
// If this snapshot fails, it means the canonical stage list was changed.
// Before updating the snapshot, verify the change is intentional AND that
// backend/trunida-backend/knowledge-base/maturity-stages.json is updated
// to match.

describe('MATURITY_STAGES — snapshot regression guard', () => {
  it('matches the canonical stage list snapshot (sync guard with backend KB)', () => {
    expect(MATURITY_STAGES).toMatchSnapshot();
  });
});
