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
  if (advisory) return { ...advisory, source: 'advisory', servable: !!advisory.providerId };

  const row = await ModelCatalogEntry.findOne({ modelId, active: true }).lean();
  if (!row) return null;

  return {
    id: row.modelId,
    displayName: row.displayName,
    vendor: row.vendor || '',
    type: row.type || 'frontier',
    // Empty today for every benchmark row: those tables say how good a model is
    // and what it costs, not which endpoint serves it. Carried through as-is
    // rather than guessed at — inventing a provider mapping would produce a
    // deployment that looks configured and fails on its first request.
    providerId: row.providerId || '',
    source: 'benchmark',
    servable: !!row.providerId,
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
