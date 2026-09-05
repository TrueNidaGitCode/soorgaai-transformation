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

/** The indices a recommendation can be ranked on. */
export const FOCUS_INDICES = [
  'strategyOps', 'intelligence', 'agentic', 'coding', 'math', 'instructionFollowing',
  'longContext', 'documentCreation', 'knowledge', 'hallucinationResistance',
];

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
 */
function costOf(m) {
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
  focus = 'intelligence',
  sizePreference = 'any',
  providers = [],
  band = DEFAULT_BAND,
  acceptableRange = null,   // { min, max } set by an admin for this category
  limit = 5,
} = {}) {
  const focusKey = FOCUS_INDICES.includes(focus) ? focus : 'intelligence';
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
  const prices = candidates.map(costOf);
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
    priceIn: m.priceIn, priceOut: m.priceOut, indexCost: m.indexCost,
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
  const useCase = String(blueprint?.recommendedUseCase || blueprint?.businessObjective || '').toLowerCase();

  // Stems, so no trailing word boundary. /\bcomplian\b/ cannot match
  // "compliance" — the boundary demands the word END at the stem. Every
  // pattern here was written that way, so none of them ever fired.
  let focus = 'intelligence';

  // Checked FIRST, and ahead of agentic on purpose. "Automate regulatory
  // compliance reporting" is both, and where a wrong answer carries a
  // regulatory cost, resistance to confident invention outranks tool use.
  // Strategy and operations work ranks on the Strategy & Ops score. Checked
  // first because it is the category with measured data behind it.
  if (/\b(strateg|operations|ops |planning|roadmap|prioriti|business|management|accounting|corporate|market|customer support|records|administrat|invoic|billing|schedul)/.test(useCase)) {
    focus = 'strategyOps'; reasons.push('The use case is strategy or operations work, so ranking is on the Strategy & Ops score.');
  } else if (/\b(complian|governance|audit|regulat|legal|medical|clinical|safety)/.test(useCase)) {
    focus = 'hallucinationResistance'; reasons.push('The use case carries a cost for being confidently wrong, so ranking is on hallucination resistance.');
  } else if (/\b(code|coding|refactor|repositor|developer|sdk|program)/.test(useCase)) {
    focus = 'coding'; reasons.push('The use case is about writing or changing code, so ranking is on the coding benchmark.');
  } else if (/\b(report|document|proposal|summar|memo|contract)/.test(useCase)) {
    focus = 'documentCreation'; reasons.push('The use case produces documents, so ranking is on document creation.');
  } else if (/\b(agent|workflow|tool use|automat|orchestrat)/.test(useCase)) {
    focus = 'agentic'; reasons.push('The use case is agentic, so ranking is on tool-use capability.');
  } else if (/\b(extract|classif|triage|route|tag|label)/.test(useCase)) {
    focus = 'instructionFollowing'; reasons.push('The use case is extraction or classification, where following the output contract matters more than raw intelligence.');
  } else {
    reasons.push('No clearer signal in the use case, so ranking is on general intelligence.');
  }

  // A young company is buying with its own money and has no procurement
  // cushion. That is the case the band rule exists for.
  const cost = engagement.maturity === 'startup' ? 'critical' : 'very-important';
  if (cost === 'critical') reasons.push('The company reads as early-stage, so cost is treated as critical — the cheapest model clearing the quality band wins.');

  // No requirements are inferred. An earlier version turned "a repository was
  // read" into a 200k-context requirement, which excluded every model in a
  // catalog that simply had no context figures — an inference of mine silently
  // overruling the data an admin had actually entered.
  //
  // Requirements are hard filters. They should come from someone who knows the
  // constraint, not from a guess about what a use case might need.
  const requirements = {};

  return {
    focus,
    priorities: { intelligence: 'very-important', speed: 'moderate', cost },
    requirements,
    sizePreference: 'any',
    providers: [],
    reasons,
  };
}
