/**
 * Svarg — resolving a chosen model
 *
 * There are two catalogs, and they answer different questions:
 *
 *   ADVISORY_CATALOG (config/modelCatalog.js)
 *     Ten models Svarg can actually call. Each carries a providerId, which is
 *     what the gateway routes on and what makes a model servable.
 *
 *   ModelCatalogEntry (the database)
 *     The benchmark tables — Strategy & Ops and Engineering — transcribed from
 *     published comparisons. Scores and cost per task. This is what Arth ranks
 *     and what the picker shows.
 *
 * Both are legitimate. A model can be worth recommending before Svarg has
 * wired a provider for it, and a model can be servable without appearing in a
 * published comparison. What is not legitimate is code that knows about one
 * and assumes it is the whole world — which is how the picker came to offer
 * twenty-four models that the save path rejected one by one with "That model
 * is not in the catalog", about a catalog page listing exactly those models.
 *
 * So resolution happens here, once, and servability is reported rather than
 * assumed. A selection is a decision on record; being able to route traffic to
 * it is a separate fact, and conflating the two is what hid this.
 */

import { ADVISORY_CATALOG } from '../config/modelCatalog.js';
import ModelCatalogEntry from '../models/ModelCatalogEntry.js';

// Which provider needs which key. A providerId with no key behind it is a
// model that looks available and fails on its first request, which is the
// same lie as an unmapped benchmark row wearing a provider name.
const PROVIDER_KEY = {
  claude:     () => process.env.ANTHROPIC_API_KEY,
  gemini:     () => process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
  openai:     () => process.env.OPENAI_API_KEY,
  selfhosted: () => process.env.SELFHOSTED_BASE_URL,
};

/**
 * The model behind an id, from whichever catalog holds it.
 *
 * The advisory catalog is checked first: when an id is in both, the row that
 * can actually be served is the more useful one, because it carries the
 * providerId and the token prices the cost ceiling is enforced from.
 *
 * @returns {Promise<object|null>} null when no catalog knows the id — the only
 *   case that should ever be rejected.
 */
export async function resolveSelectableModel(modelId) {
  if (!modelId) return null;

  const advisory = ADVISORY_CATALOG.find(m => m.id === modelId);
  // Same three-part test as a benchmark row. Judging an advisory row on
  // providerId alone would call it servable with no key present.
  if (advisory) return { ...advisory, source: 'advisory', servable: hasEndpoint(advisory) };

  const row = await ModelCatalogEntry.findOne({ modelId, active: true }).lean();
  if (!row) return null;

  return {
    id: row.modelId,
    displayName: row.displayName,
    vendor: row.vendor || '',
    type: row.type || 'frontier',
    providerId: row.providerId || '',
    apiModel: row.apiModel || '',
    source: 'benchmark',
    // Three things, all required. A providerId with no apiModel is somewhere
    // to send a request and nothing to ask for; either with no key is a model
    // that looks available and fails on its first call.
    servable: hasEndpoint(row),
  };
}

/**
 * Whether the gateway can route to this model today.
 *
 * Separate from resolution on purpose. Arth recommending a model Svarg cannot
 * yet serve is a gap worth showing; it is not a reason to refuse to record the
 * decision, and it must not be discovered as a 501 after an environment has
 * been prepared around it.
 */
export async function isServable(modelId) {
  const m = await resolveSelectableModel(modelId);
  return !!m?.servable;
}

/** A row is callable only with all three: a provider, the identifier that
 *  provider expects, and a key for it in this environment. */
export function hasEndpoint(row) {
  return !!(row?.providerId && row?.apiModel && PROVIDER_KEY[row.providerId]?.());
}


/**
 * The models a customer can actually be put onto today.
 *
 * The benchmark tables are advice: they say which model is worth wanting for
 * this kind of work and what it would cost. They are not a list of things
 * Svarg can run, and treating them as one is what produced a picker whose
 * every option failed.
 *
 * This is the fallback list — the original ten, for the case where a
 * recommendation cannot be run. Now that the benchmark rows carry endpoints of
 * their own it is usually empty, and that is the point: the recommendation and
 * the thing you can run should be the same model.
 */
export function runnableModels() {
  return ADVISORY_CATALOG
    .filter(m => m.type === 'frontier' && hasEndpoint(m))
    .map(m => ({ ...m, servable: true, source: 'advisory' }));
}

/** Blended price per million tokens, weighted toward output because generation
 *  dominates the bill on the workloads Svarg builds. */
const blended = (m) => (m.priceIn ?? m.priceOut ?? 0) * 0.35 + (m.priceOut ?? m.priceIn ?? 0) * 0.65;

/**
 * What Auto should run on, given how much confidence the work needs.
 *
 * A bridge, and worth naming as one. The confidence band is measured on the
 * benchmark tables; the runnable models are graded by the adjectives the
 * advisory catalog has always carried. There is no shared scale between them,
 * so this maps band to a quality floor and takes the cheapest model clearing
 * it — the same rule as everywhere else, applied to the only data these five
 * models actually have.
 *
 * It is honest about being coarse. Scoring these five on the same benchmarks
 * as the tables would replace the judgement with a measurement, and that is
 * the real fix whenever those numbers exist.
 */
export function pickRunnable(confidence) {
  const runnable = runnableModels();
  if (!runnable.length) return null;

  const floors = {
    'very-high': ['best'],
    high:        ['best', 'good'],
    medium:      ['best', 'good', 'fair'],
  };
  const allowed = floors[confidence] || floors.high;

  const clearing = runnable.filter(m => allowed.includes(m.quality));
  // Nothing clears the floor: return the best available rather than nothing,
  // and let the caller say that the floor was not met.
  const pool = clearing.length ? clearing : runnable;
  return pool.slice().sort((a, b) => blended(a) - blended(b))[0];
}
