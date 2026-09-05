/**
 * Svarg — Model Recommender
 *
 * "Which is the best model?" is the wrong question. The one a startup has to
 * answer is "which model delivers acceptable quality at the lowest cost?", and
 * the difference between those two questions is the difference between $4.23
 * and a few cents for the same task.
 *
 * Arth used to answer neither. It ran a four-way switch on a word, over a
 * catalog that graded models with adjectives.
 *
 * ── How a recommendation is made ───────────────────────────────────────────
 *
 *   1. Hard requirements exclude. Image input, a size band, a provider a
 *      customer is not allowed to buy from — these are not preferences to be
 *      outweighed by a good score, and nothing here lets them be.
 *
 *   2. What is left is ranked on three axes: the benchmark index the use case
 *      actually calls for, throughput, and price. Importance levels become
 *      weights over those.
 *
 *   3. Unless cost is CRITICAL. Then a weighted blend is the wrong instrument:
 *      it lands in the middle of the field, which is exactly the mistake of
 *      buying more intelligence than the job needs. So it switches to the
 *      other method — take everything clearing an acceptable quality band, and
 *      return the cheapest.
 *
 * Every exclusion is returned with its reason. A recommender that shows only
 * survivors cannot be argued with, and "why is my model not in this list" is
 * the first question anyone asks it.
 */

import { resolveUseCase, useCaseText } from './blueprintUseCase.js';

/**
 * The indices a recommendation can be ranked on.
 *
 * Two, because two are measured. The schema still has fields for the other
 * eight, so adding one back is a line here and a table in the admin — but an
 * index nobody has published scores for cannot rank anything, and offering it
 * only produces an empty result whose cause is invisible.
 */
export const FOCUS_INDICES = ['strategyOps', 'engineering'];

/** Ranked on when nothing more specific applies. Has data, unlike the eight
 *  categories that were previously reachable by default. */
const DEFAULT_FOCUS = 'strategyOps';

/**
 * How much confidence a task needs, as three bands over a benchmark's scores.
 *
 * A raw score answers nothing on its own: 48 on Strategy & Ops means nothing
 * until you know the table runs 48 to 58. Splitting each table into thirds
 * turns the number into a statement — top third, middle third, bottom third of
 * what is actually available — and lets a use case ask for a band instead of a
 * number nobody can calibrate.
 *
 * Ordered strongest first; the order is relied on when a band comes back empty.
 */
export const CONFIDENCE_TIERS = [
  { id: 'very-high', label: 'Very High Confidence' },
  { id: 'high',      label: 'High Confidence' },
  { id: 'medium',    label: 'Medium Confidence' },
];

/**
 * The three bands for one benchmark, measured from the scores actually
 * published for it.
 *
 * Deliberately relative, not fixed thresholds. "Very high" means the best this
 * table offers, and a fixed cut would call every Strategy & Ops model medium
 * (they run 48-58) while calling most Engineering models high (58-65) — an
 * artefact of two benchmarks being scaled differently, not a real difference in
 * what they can do.
 *
 * The trade is that adding a model can move a boundary. That is the honest
 * behaviour: confidence here is relative to the field, and the field changed.
 */
export function confidenceBands(catalog, focusKey) {
  const scores = catalog
    .filter(m => m.active !== false && num(m.scores?.[focusKey]) !== null)
    .map(m => m.scores[focusKey]);
  if (!scores.length) return null;

  const min = Math.min(...scores);
  const max = Math.max(...scores);

  // One distinct score is not a spread to divide. Reporting three bands over it
  // would invent a distinction the data does not contain.
  if (max === min) {
    return [{ ...CONFIDENCE_TIERS[0], min, max, single: true }];
  }

  const third = (max - min) / 3;
  return [
    { ...CONFIDENCE_TIERS[0], min: min + third * 2, max },
    { ...CONFIDENCE_TIERS[1], min: min + third,     max: min + third * 2 },
    { ...CONFIDENCE_TIERS[2], min,                  max: min + third },
  ];
}

/** Which band a score falls in. Boundaries belong to the HIGHER band, so a
 *  model is never counted twice and never falls between two. */
export function bandOf(bands, score) {
  if (!bands || score == null) return null;
  for (const b of bands) if (score >= b.min) return b;
  return bands[bands.length - 1];
}

/**
 * Importance → weight. Deliberately not linear: 'critical' is meant to
 * dominate rather than merely outvote, because a critical constraint that can
 * be outweighed by two moderate ones was not critical.
 */
export const IMPORTANCE_WEIGHT = {
  low: 0,
  moderate: 1,
  'very-important': 2,
  critical: 4,
};

export const SIZE_BANDS = {
  any:    [0, Infinity],
  tiny:   [0, 4],
  small:  [4, 40],
  medium: [40, 150],
  large:  [150, Infinity],
};

/**
 * How far below the best available score still counts as acceptable, when the
 * band rule runs.
 *
 * Ten points on a 0-100 index. Not a universal truth — it is the assumption
 * that makes "acceptable" mean something, and it is exposed so a caller who
 * has measured their own tolerance can pass theirs instead. The method this
 * implements works precisely because the band is chosen by testing, not
 * assumed.
 */
const DEFAULT_BAND = 10;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * What a model costs, as one comparable number.
 *
 * Prefers Artificial Analysis's cost to run the Intelligence Index: one figure
 * over one identical workload. Two token prices only become a cost once you
 * assume an input/output mix, and an assumed mix is how a comparison quietly
 * stops being a comparison.
 *
 * Falls back to a blend when the index cost is not published, weighted toward
 * output because generation dominates the bill on the workloads Svarg builds.
 *
 * Read PER CATEGORY first. A benchmark is a workload, so the same model bills
 * differently on each one — Claude Opus 5 (max) is $3.01 on Strategy & Ops and
 * $2.25 on Engineering. Ranking Engineering on the Strategy & Ops price would
 * compare models on a bill none of them would send.
 */
function costOf(m, focusKey) {
  const perCategory = m.indexCosts;
  const own = num(
    perCategory && typeof perCategory.get === 'function'
      ? perCategory.get(focusKey)          // hydrated document: a Map
      : perCategory?.[focusKey]            // .lean(): a plain object
  );
  if (own !== null) return own;

  const idx = num(m.indexCost);
  if (idx !== null) return idx;
  const i = num(m.priceIn), o = num(m.priceOut);
  if (i === null && o === null) return null;
  return (i ?? o) * 0.35 + (o ?? i) * 0.65;
}

/** 0–1 across the CANDIDATES, not against an absolute maximum. Weighting a
 *  price against a global ceiling would make every weight meaningless once
 *  filtering has narrowed the field to four models. */
function normalise(values, invert = false) {
  const real = values.filter(v => v !== null);
  if (!real.length) return values.map(() => 0);
  const min = Math.min(...real), max = Math.max(...real);
  if (max === min) return values.map(v => (v === null ? 0 : 0.5));
  return values.map(v => {
    if (v === null) return 0;
    const n = (v - min) / (max - min);
    return invert ? 1 - n : n;
  });
}

/**
 * @param {Array} catalog                Candidate entries.
 * @param {Object} input
 * @param {Object} input.requirements    { reasoning, imageInput, audioInput, videoInput, ultraLongContext }
 * @param {Object} input.priorities      { intelligence, speed, cost } as importance words
 * @param {string} input.focus           One of FOCUS_INDICES
 * @param {string} input.sizePreference  A key of SIZE_BANDS
 * @param {string[]} input.providers     Empty means "no provider constraint"
 * @param {number} [input.band]          Overrides DEFAULT_BAND
 * @param {number} [input.limit]
 */
export function recommendModels(catalog, {
  requirements = {},
  priorities = {},
  focus = DEFAULT_FOCUS,
  sizePreference = 'any',
  providers = [],
  band = DEFAULT_BAND,
  confidence = null,        // 'very-high' | 'high' | 'medium' — how much the task needs
  acceptableRange = null,   // { min, max } set by an admin for this category
  limit = 5,
} = {}) {
  const focusKey = FOCUS_INDICES.includes(focus) ? focus : DEFAULT_FOCUS;
  const [minB, maxB] = SIZE_BANDS[sizePreference] || SIZE_BANDS.any;
  const excluded = [];

  const candidates = catalog.filter(m => {
    if (m.active === false) return false;

    // Hard requirements. Each carries its reason out, because being told a
    // model was dropped is useless without being told what for.
    // Open weights is a deployment constraint, not a quality one: it decides
    // whether the customer's data can stay on their own infrastructure.
    if (requirements.openWeightsOnly && m.type !== 'open-weight') {
      excluded.push({ modelId: m.modelId, reason: 'not open weight' }); return false;
    }
    if (requirements.reasoning && !m.reasoning)   { excluded.push({ modelId: m.modelId, reason: 'does not support reasoning' }); return false; }
    // Asked for explicitly rather than inferred from the absence of the other:
    // a reasoning model costs more and answers slower, and some workloads
    // genuinely want neither.
    if (requirements.nonReasoning && m.reasoning) {
      excluded.push({ modelId: m.modelId, reason: 'is a reasoning model' }); return false;
    }
    if (requirements.imageInput && !m.imageInput) { excluded.push({ modelId: m.modelId, reason: 'no image input' }); return false; }
    if (requirements.audioInput && !m.audioInput) { excluded.push({ modelId: m.modelId, reason: 'no audio input' }); return false; }
    if (requirements.videoInput && !m.videoInput) { excluded.push({ modelId: m.modelId, reason: 'no video input' }); return false; }
    if (requirements.ultraLongContext && (num(m.contextTokens) ?? 0) < 200_000) {
      excluded.push({ modelId: m.modelId, reason: `context is ${m.contextTokens || 'unknown'}, under 200k` });
      return false;
    }

    // Size is judged on parameters, not on a name. A frontier model with no
    // published parameter count cannot be placed in a band, so it survives
    // only when no band was asked for.
    if (sizePreference !== 'any') {
      const p = num(m.paramsB);
      if (p === null) { excluded.push({ modelId: m.modelId, reason: 'parameter count unknown, cannot match a size band' }); return false; }
      if (p < minB || p > maxB) { excluded.push({ modelId: m.modelId, reason: `${p}B is outside the ${sizePreference} band` }); return false; }
    }

    if (providers.length && !providers.some(p => (m.providers || []).includes(p))) {
      excluded.push({ modelId: m.modelId, reason: 'not served by any selected provider' });
      return false;
    }

    // A model with no score on the axis being ranked cannot be placed against
    // the others. Ranking it as zero would bury a possibly excellent model;
    // guessing would be the fabrication this service exists to avoid.
    if (num(m.scores?.[focusKey]) === null) {
      excluded.push({ modelId: m.modelId, reason: `no ${focusKey} score published` });
      return false;
    }

    return true;
  });

  if (!candidates.length) {
    return { picks: [], considered: catalog.length, excluded, rule: 'none', focus: focusKey };
  }

  const scores = candidates.map(m => num(m.scores[focusKey]));
  const prices = candidates.map(m => costOf(m, focusKey));
  const speeds = candidates.map(m => num(m.medianTokensPerSecond));

  // ── The band rule ────────────────────────────────────────────────────────
  // Cost critical means the job is to buy the least intelligence that still
  // does the work. A weighted blend cannot express that: it settles in the
  // middle of the field, which is how a task that could cost cents ends up
  // costing dollars.
  // An explicit acceptable range set by an admin beats every heuristic here:
  // it is a judgement about what quality the product can ship, arrived at by
  // testing, and nothing in a leaderboard can infer it. Within the range, the
  // cheapest wins — which is the whole point of setting one.
  // ── The confidence band ──────────────────────────────────────────────────
  // What the task needs, expressed as a third of what the benchmark offers,
  // and within that the cheapest. This is the whole rule: a use case that
  // needs the best available gets the top third, one that does not gets the
  // band that matches, and paying frontier prices for extraction work stops
  // being the default.
  if (confidence) {
    const bands = confidenceBands(candidates, focusKey);
    if (bands) {
      const wanted = bands.findIndex(b => b.id === confidence);
      const idx = wanted === -1 ? 0 : wanted;

      // A band can come out empty when scores cluster. Dropping to the next one
      // down is right — the task asked for at least this much confidence, and
      // the band below is where the next-best models are — but it must be
      // reported, not silently substituted.
      //
      // The band is also usually smaller than the number of options the screen
      // wants to offer: Strategy & Ops Very High holds two models, and a picker
      // showing two is a picker with almost no choice in it. So the band is
      // filled out from the bands BELOW, never above — downwards is cheaper,
      // and the whole point of banding is to stop paying for more than the work
      // needs. Anything past the requested band is flagged, so the screen can
      // tell an in-band option from a cheaper alternative to it.
      const rowsIn = (b) => candidates
        .map((m, j) => ({ m, score: scores[j], price: prices[j] }))
        .filter(x => bandOf(bands, x.score)?.id === b.id)
        .sort((a2, b2) => (a2.price ?? Infinity) - (b2.price ?? Infinity));

      const ordered = [];
      for (let i = idx; i < bands.length; i++) {
        for (const row of rowsIn(bands[i])) ordered.push({ ...row, band: bands[i], inBand: i === idx });
      }

      // Which band the answer actually came from: the requested one when it has
      // anything in it, otherwise the first one below that does.
      const chosen = ordered.length ? ordered[0].band : bands[idx];
      const picks = ordered.slice(0, limit);

      return {
        picks: picks.map(x => ({
          ...plain(x.m),
          focusScore: x.score,
          cost: x.price,
          confidence: x.band.id,
          confidenceLabel: x.band.label,
          inBand: x.inBand,
          why: `${x.band.label} on ${focusKey} (${x.band.min.toFixed(0)}-${x.band.max.toFixed(0)}), at the lowest cost in that band.`,
        })),
        considered: catalog.length,
        excluded,
        rule: 'cheapest-in-confidence-band',
        confidence: chosen.id,
        requestedConfidence: confidence,
        // True when the requested band could not supply the answer at all —
        // distinct from merely padding the list out with cheaper alternatives.
        widened: chosen.id !== confidence,
        filled: picks.some(p => !p.inBand),
        bands: bands.map(b => ({ id: b.id, label: b.label, min: b.min, max: b.max })),
        band: { focus: focusKey, min: chosen.min, max: chosen.max, label: chosen.label },
        focus: focusKey,
      };
    }
  }

  if (acceptableRange && (acceptableRange.min != null || acceptableRange.max != null)) {
    const lo = acceptableRange.min ?? -Infinity;
    const hi = acceptableRange.max ?? Infinity;
    const inRange = candidates
      .map((m, i) => ({ m, score: scores[i], price: prices[i] }))
      .filter(x => x.score >= lo && x.score <= hi)
      .sort((a2, b2) => (a2.price ?? Infinity) - (b2.price ?? Infinity));

    return {
      picks: inRange.slice(0, limit).map(x => ({
        ...plain(x.m),
        focusScore: x.score,
        cost: x.price,
        why: `Inside the acceptable range (${lo === -Infinity ? "any" : lo}–${hi === Infinity ? "any" : hi}) at the lowest cost of those that are.`,
      })),
      considered: catalog.length,
      excluded,
      rule: 'cheapest-in-range',
      band: { focus: focusKey, min: acceptableRange.min, max: acceptableRange.max },
      focus: focusKey,
    };
  }

  if (priorities.cost === 'critical') {
    const best = Math.max(...scores);
    const floor = best - band;
    const acceptable = candidates
      .map((m, i) => ({ m, score: scores[i], price: prices[i] }))
      .filter(x => x.score >= floor);

    // Unpriced models cannot win a contest decided on price.
    const priced = acceptable.filter(x => x.price !== null);
    const ordered = (priced.length ? priced : acceptable)
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

    return {
      picks: ordered.slice(0, limit).map(x => ({
        ...plain(x.m),
        focusScore: x.score,
        cost: x.price,
        why: `Clears the acceptable band (${floor.toFixed(0)}+ on ${focusKey}) at the lowest price of those that do.`,
      })),
      considered: catalog.length,
      excluded,
      rule: 'cheapest-clearing-band',
      band: { focus: focusKey, best, floor },
      focus: focusKey,
    };
  }

  // ── Weighted rank ────────────────────────────────────────────────────────
  const wQuality = IMPORTANCE_WEIGHT[priorities.intelligence] ?? 2;
  const wSpeed   = IMPORTANCE_WEIGHT[priorities.speed]        ?? 1;
  const wCost    = IMPORTANCE_WEIGHT[priorities.cost]         ?? 1;

  const nScore = normalise(scores);
  const nSpeed = normalise(speeds);
  const nPrice = normalise(prices, true);   // cheaper is better

  const total = wQuality + wSpeed + wCost || 1;
  const ranked = candidates.map((m, i) => ({
    m,
    score: scores[i],
    price: prices[i],
    value: (nScore[i] * wQuality + nSpeed[i] * wSpeed + nPrice[i] * wCost) / total,
  })).sort((a, b) => b.value - a.value);

  return {
    picks: ranked.slice(0, limit).map(x => ({
      ...plain(x.m),
      focusScore: x.score,
      cost: x.price,
      value: Number(x.value.toFixed(4)),
      why: `Best balance of ${focusKey}, speed and price at the importance you set.`,
    })),
    considered: catalog.length,
    excluded,
    rule: 'weighted',
    weights: { intelligence: wQuality, speed: wSpeed, cost: wCost },
    focus: focusKey,
  };
}

function plain(m) {
  return {
    modelId: m.modelId, displayName: m.displayName, vendor: m.vendor, type: m.type,
    providers: m.providers || [], providerId: m.providerId || '',
    // Carried through because servability is decided on it downstream: a
    // provider with nothing to ask for is not a model anyone can call.
    apiModel: m.apiModel || '',
    priceIn: m.priceIn, priceOut: m.priceOut,
    indexCost: m.indexCost, indexCosts: m.indexCosts,
    reasoning: !!m.reasoning,
    medianTokensPerSecond: m.medianTokensPerSecond,
    paramsB: m.paramsB, contextTokens: m.contextTokens,
    scores: m.scores, source: m.source, sourceVersion: m.sourceVersion,
  };
}

/**
 * What Svarg already knows, expressed as recommendation inputs.
 *
 * Every derivation carries a reason, and every one is meant to be overridden
 * on screen. This is the part most likely to be wrong — an inference about
 * what someone is building, from a use case written by another model — so it
 * has to be the part easiest to disagree with.
 */
export function deriveRecommendationInputs(blueprint) {
  const reasons = [];
  const engagement = blueprint?.engagement || {};
  // recommendedUseCase was never a field on the blueprint, so this read
  // undefined and fell through to businessObjective — the sentence typed before
  // Cob had analysed anything. Every benchmark and confidence band below was
  // being derived from that, not from the use case anyone approved.
  const resolved = resolveUseCase(blueprint);
  const useCase = useCaseText(blueprint).toLowerCase();

  // Stems, so no trailing word boundary. /\bcomplian\b/ cannot match
  // "compliance" — the boundary demands the word END at the stem. An earlier
  // version wrote every pattern that way, so none of them ever fired.
  //
  // Two outcomes, because two benchmarks are maintained. Routing anything to
  // a third would name an index with no published scores behind it, and the
  // recommendation would come back empty for a reason nobody can see.
  let focus = DEFAULT_FOCUS;

  if (/\b(code|coding|engineer|refactor|repositor|developer|sdk|program|api|migrat|debug|test|deploy|integrat)/.test(useCase)) {
    focus = 'engineering';
    reasons.push('The use case is about building or changing software, so ranking is on the Engineering score.');
  } else {
    reasons.push('The use case is business or operations work, so ranking is on the Strategy & Ops score.');
  }
  // How much confidence the work needs. Three outcomes, matched to the three
  // bands, because the question "how good does this have to be" has roughly
  // three useful answers and no more.
  //
  // Checked strongest first: work that carries a real cost for being wrong
  // outranks work that merely looks technical.
  let confidence = 'high';
  if (/\b(strateg|architect|roadmap|plan|design|advis|recommend|decision|risk|complian|regulat|legal|medical|clinical|safety|audit|forecast|diagnos|root cause|negotiat|research)/.test(useCase)) {
    confidence = 'very-high';
    reasons.push('The work is judgement-led and carries a cost for being wrong, so it needs the top band of what the benchmark offers.');
  } else if (/\b(extract|classif|tag|label|rout|triage|summar|transcri|format|lookup|data entry|categor|parse|validat)/.test(useCase)) {
    confidence = 'medium';
    reasons.push('The work is extraction or classification against a fixed contract, so a mid-band model is enough — paying for the top band buys nothing here.');
  } else {
    reasons.push('No signal that the work is either judgement-led or purely mechanical, so it takes the middle band.');
  }

  // Cost importance no longer decides the rule — the confidence band does, and
  // within a band the cheapest always wins. It is still derived, because a
  // caller that asks for no band falls back to the weighted rank, and because
  // the maturity signal is worth carrying either way.
  //
  // The reason below used to claim this drove the choice. It did not any more,
  // and a reason that describes a rule which did not run is worse than no
  // reason at all — it is checkable, and wrong.
  const cost = engagement.maturity === 'startup' ? 'critical' : 'very-important';
  reasons.push('Within that band the cheapest model wins: the band settles how good it has to be, and price settles which one of those you get.');

  // No requirements are inferred. An earlier version turned "a repository was
  // read" into a 200k-context requirement, which excluded every model in a
  // catalog that simply had no context figures — an inference of mine silently
  // overruling the data an admin had actually entered.
  //
  // Requirements are hard filters. They should come from someone who knows the
  // constraint, not from a guess about what a use case might need.
  const requirements = {};

  // Which text the inference was made from. Deriving a benchmark from an
  // unanalysed objective is a weaker claim than deriving it from an approved
  // initiative, and that difference should not be invisible on the screen.
  if (resolved.source !== 'approved-use-case') {
    reasons.push('No use case has been approved yet, so this is derived from the original business objective.');
  }

  return {
    focus,
    confidence,
    useCase: resolved,
    priorities: { intelligence: 'very-important', speed: 'moderate', cost },
    requirements,
    sizePreference: 'any',
    providers: [],
    reasons,
  };
}
