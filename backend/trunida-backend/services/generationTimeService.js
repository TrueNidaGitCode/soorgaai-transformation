/**
 * Svarg — how long a blueprint usually takes
 *
 * A run takes about the same time for every objective: the same domains,
 * the same capabilities, the same model. So the useful number for someone
 * watching the Cob screen is not a guess from the first two steps but the
 * average of the last runs -- it tells them whether to watch or to make a
 * coffee, from the first second.
 *
 * Measured, not configured. Each finished capability carries a completedAt,
 * and the blueprint carries createdAt, so a completed run's duration is the
 * last capability's finish less the start. The last twenty completed runs
 * are averaged, with anything under a minute or over half an hour dropped
 * as not a normal run (a re-generation of one domain, a run that hung).
 * Until there are three real runs to average, a fixed estimate stands in
 * and says so through `samples`.
 *
 * Cached for ten minutes: the number moves slowly, and the Cob screen polls.
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';

/** What a full run takes on the current model, before any runs are measured. */
export const DEFAULT_TYPICAL_MS = 5 * 60 * 1000;

const MIN_SANE_MS = 60 * 1000;
const MAX_SANE_MS = 30 * 60 * 1000;
const SAMPLE_RUNS = 20;
const MIN_SAMPLES = 3;
const CACHE_MS = 10 * 60 * 1000;

let _cache = { at: 0, value: null };

/** A completed run's duration in ms, or null when it cannot be measured. */
export function runDurationMs(bp) {
  const started = bp?.createdAt ? new Date(bp.createdAt).getTime() : 0;
  if (!started) return null;
  let last = 0;
  for (const d of bp.domains || []) {
    for (const c of d.capabilities || []) {
      const t = c?.completedAt ? new Date(c.completedAt).getTime() : 0;
      if (t > last) last = t;
    }
  }
  if (!last) return null;
  const ms = last - started;
  return ms >= MIN_SANE_MS && ms <= MAX_SANE_MS ? ms : null;
}

/** The average over a list of blueprints, or the default with samples: 0. */
export function typicalFrom(blueprints) {
  const durations = (blueprints || []).map(runDurationMs).filter(ms => ms !== null);
  if (durations.length < MIN_SAMPLES) return { typicalMs: DEFAULT_TYPICAL_MS, samples: durations.length };
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  return { typicalMs: Math.round(mean), samples: durations.length };
}

// ── The build ──────────────────────────────────────────────────────────────
//
// An Eame build is the same shape every time -- one generation, the gates,
// a repair or two at most -- so the last passed builds say how long the next
// one will take. Measured from progress.startedAt (set when the build is
// claimed) to updatedAt (the final write). Repairs are included: a build that
// needed two attempts is a normal build.

export const DEFAULT_BUILD_MS = 3 * 60 * 1000;
const MIN_BUILD_MS = 20 * 1000;
const MAX_BUILD_MS = 20 * 60 * 1000;

let _buildCache = { at: 0, value: null };

/** A passed build's duration in ms, or null when it cannot be measured. */
export function buildDurationMs(app) {
  const started = app?.startedAt ? new Date(app.startedAt).getTime() : 0;
  const ended = app?.updatedAt ? new Date(app.updatedAt).getTime() : 0;
  if (!started || !ended) return null;
  const ms = ended - started;
  return ms >= MIN_BUILD_MS && ms <= MAX_BUILD_MS ? ms : null;
}

export function typicalBuildFrom(apps) {
  const durations = (apps || []).map(buildDurationMs).filter(ms => ms !== null);
  if (durations.length < MIN_SAMPLES) return { typicalMs: DEFAULT_BUILD_MS, samples: durations.length };
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  return { typicalMs: Math.round(mean), samples: durations.length };
}

/**
 * @returns {Promise<{typicalMs:number, samples:number}>}
 */
export async function typicalBuildTime() {
  if (_buildCache.value && Date.now() - _buildCache.at < CACHE_MS) return _buildCache.value;
  try {
    // startedAt is cleared on the final write (progress is reset), so the
    // start is taken from createdAt: the build is claimed and started in
    // the same request.
    const recent = await GeneratedApplication
      .find({ status: 'passed' })
      .sort({ createdAt: -1 })
      .limit(SAMPLE_RUNS)
      .select('createdAt updatedAt')
      .lean();
    _buildCache = { at: Date.now(), value: typicalBuildFrom(recent.map(a => ({ startedAt: a.createdAt, updatedAt: a.updatedAt }))) };
  } catch {
    _buildCache = { at: Date.now(), value: { typicalMs: DEFAULT_BUILD_MS, samples: 0 } };
  }
  return _buildCache.value;
}

/**
 * @returns {Promise<{typicalMs:number, samples:number}>}
 */
export async function typicalGenerationTime() {
  if (_cache.value && Date.now() - _cache.at < CACHE_MS) return _cache.value;
  try {
    const recent = await TransformationBlueprint
      .find({ status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(SAMPLE_RUNS)
      .select('createdAt domains.capabilities.completedAt')
      .lean();
    _cache = { at: Date.now(), value: typicalFrom(recent) };
  } catch {
    // A read that fails is not a reason to show nothing; the default is
    // honest about being a default through samples: 0.
    _cache = { at: Date.now(), value: { typicalMs: DEFAULT_TYPICAL_MS, samples: 0 } };
  }
  return _cache.value;
}
