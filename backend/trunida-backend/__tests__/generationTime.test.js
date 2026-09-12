/**
 * The typical run time: measured from finished runs, honest about being a
 * default until there are enough of them, and deaf to runs that were not
 * normal.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../models/TransformationBlueprint.js', () => ({ default: {} }));
vi.mock('dotenv', () => ({ default: { config: () => {} } }));

const { runDurationMs, typicalFrom, DEFAULT_TYPICAL_MS } = await import('../services/generationTimeService.js');

const run = (minutes, { started = '2026-09-13T10:00:00Z', caps = 3 } = {}) => {
  const t0 = new Date(started).getTime();
  return {
    createdAt: started,
    domains: [{ capabilities: Array.from({ length: caps }, (_, i) => ({
      completedAt: new Date(t0 + (minutes * 60000) * ((i + 1) / caps)).toISOString(),
    })) }],
  };
};

describe('runDurationMs', () => {
  it('is the last capability finish less the start', () => {
    expect(runDurationMs(run(4))).toBe(4 * 60000);
  });
  it('is null for a run with no finished capability, and for an abnormal one', () => {
    expect(runDurationMs({ createdAt: '2026-09-13T10:00:00Z', domains: [] })).toBeNull();
    expect(runDurationMs(run(0.5))).toBeNull();   // under a minute: a partial regeneration
    expect(runDurationMs(run(45))).toBeNull();    // over half an hour: a run that hung
  });
});

describe('typicalFrom', () => {
  it('is the default, with samples 0, until three real runs exist', () => {
    expect(typicalFrom([])).toEqual({ typicalMs: DEFAULT_TYPICAL_MS, samples: 0 });
    expect(typicalFrom([run(4), run(6)])).toEqual({ typicalMs: DEFAULT_TYPICAL_MS, samples: 2 });
  });
  it('averages the real runs and ignores the abnormal ones', () => {
    const r = typicalFrom([run(4), run(6), run(5), run(45), run(0.2)]);
    expect(r).toEqual({ typicalMs: 5 * 60000, samples: 3 });
  });
});
