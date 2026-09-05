/**
 * Svarg — Model Catalog admin, and Arth's recommendations
 *
 * The catalog is the evidence Arth recommends from, so it has to be editable
 * without a deploy: benchmarks are republished constantly and models appear
 * weekly. A catalog that needs a release to record a new score is one that is
 * quietly wrong most of the time.
 *
 * GET    /api/admin/model-catalog          → every entry
 * POST   /api/admin/model-catalog          → add one
 * PATCH  /api/admin/model-catalog/:modelId → edit one
 * DELETE /api/admin/model-catalog/:modelId → remove one
 *
 * POST   /api/strategy-canvas/transformation-blueprint/:id/recommend-models
 *        → the five picks, plus what was excluded and why
 */

import ModelCatalogEntry from '../models/ModelCatalogEntry.js';
import CatalogSettings from '../models/CatalogSettings.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import {
  recommendModels,
  deriveRecommendationInputs,
  confidenceBands,
  FOCUS_INDICES,
  SIZE_BANDS,
} from '../services/modelRecommenderService.js';

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listCatalog(req, res) {
  try {
    const models = await ModelCatalogEntry.find({}).sort({ type: 1, displayName: 1 }).lean();
    // Counted across ANY category: a catalog scored only on Strategy & Ops
    // is a usable catalog, and reporting it as empty would be wrong.
    const scored = models.filter(m => Object.values(m.scores || {}).some(v => v != null)).length;
    const bands = {};
    for (const focus of FOCUS_INDICES) {
      const b = confidenceBands(models.filter(m => m.active !== false), focus);
      if (b) bands[focus] = b.map(x => ({ id: x.id, label: x.label, min: x.min, max: x.max }));
    }

    return res.json({
      models,
      // Computed here rather than on the page: a second implementation of the
      // same split would drift from the one Arth actually uses, and the page
      // is where people go to check what Arth will do.
      bands,
      // Surfaced rather than left to be discovered: an unscored catalog
      // recommends nothing, and the reason should not be a mystery.
      summary: { total: models.length, scored, unscored: models.length - scored },
      focusIndices: FOCUS_INDICES,
      sizeBands: Object.keys(SIZE_BANDS),
    });
  } catch (err) {
    console.error('listCatalog error:', err);
    return res.status(500).json({ error: 'Failed to load the model catalog.' });
  }
}

export async function getSettings(req, res) {
  try {
    const doc = await CatalogSettings.findOne({ key: 'default' }).lean();
    return res.json({ acceptableRanges: doc?.acceptableRanges || {}, updatedBy: doc?.updatedBy || '' });
  } catch (err) {
    console.error('getSettings error:', err);
    return res.status(500).json({ error: 'Failed to load settings.' });
  }
}

export async function saveSettings(req, res) {
  try {
    const { category, min, max } = req.body || {};
    if (!category) return res.status(400).json({ error: 'category is required.' });

    // Empty clears the range rather than storing a zero. A minimum of 0 and
    // no minimum at all are different instructions.
    const n = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
    const lo = n(min), hi = n(max);
    if (lo !== null && hi !== null && lo > hi) {
      return res.status(400).json({ error: 'Minimum cannot be above maximum.' });
    }

    const doc = await CatalogSettings.findOneAndUpdate(
      { key: 'default' },
      { $set: {
        [`acceptableRanges.${category}`]: { min: lo, max: hi },
        updatedBy: req.user?.email || String(req.user?._id || ''),
      } },
      { upsert: true, new: true }
    ).lean();
    return res.json({ acceptableRanges: doc.acceptableRanges || {} });
  } catch (err) {
    console.error('saveSettings error:', err);
    return res.status(500).json({ error: 'Failed to save the range.' });
  }
}

export async function createCatalogEntry(req, res) {
  try {
    const { modelId, displayName } = req.body || {};
    if (!modelId || !displayName) {
      return res.status(400).json({ error: 'modelId and displayName are required.' });
    }
    if (await ModelCatalogEntry.findOne({ modelId }).lean()) {
      return res.status(409).json({ error: `A model with id "${modelId}" already exists.` });
    }
    const entry = await ModelCatalogEntry.create({
      ...req.body,
      updatedBy: req.user?.email || String(req.user?._id || ''),
    });
    return res.status(201).json(entry);
  } catch (err) {
    console.error('createCatalogEntry error:', err);
    return res.status(500).json({ error: 'Failed to add that model.' });
  }
}

export async function patchCatalogEntry(req, res) {
  try {
    const { modelId } = req.params;
    // modelId identifies the row; changing it would orphan any blueprint that
    // recorded a decision against it.
    const { modelId: _ignored, ...changes } = req.body || {};

    const entry = await ModelCatalogEntry.findOneAndUpdate(
      { modelId },
      { $set: { ...changes, updatedBy: req.user?.email || String(req.user?._id || '') } },
      { new: true }
    ).lean();
    if (!entry) return res.status(404).json({ error: 'Model not found.' });
    return res.json(entry);
  } catch (err) {
    console.error('patchCatalogEntry error:', err);
    return res.status(500).json({ error: 'Failed to save that change.' });
  }
}

export async function deleteCatalogEntry(req, res) {
  try {
    const result = await ModelCatalogEntry.deleteOne({ modelId: req.params.modelId });
    if (!result.deletedCount) return res.status(404).json({ error: 'Model not found.' });
    return res.json({ deleted: true });
  } catch (err) {
    console.error('deleteCatalogEntry error:', err);
    return res.status(500).json({ error: 'Failed to remove that model.' });
  }
}

// ── Recommendations ──────────────────────────────────────────────────────────

/**
 * Five picks for this blueprint.
 *
 * Inputs are derived from what Svarg already knows, then overridden by whatever
 * the caller sends — the screen starts from the derivation and re-runs this on
 * every change, so a wrong inference is one click from being corrected rather
 * than something the customer has to live with.
 */
export async function recommendForBlueprint(req, res) {
  try {
    const { blueprintId } = req.params;
    const blueprint = await TransformationBlueprint
      .findOne({ _id: blueprintId, userId: req.user._id })
      .select('engagement codebaseProfile businessObjective domains')
      .lean();
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found.' });

    const derived = deriveRecommendationInputs(blueprint);
    const input = {
      focus:          req.body?.focus          ?? derived.focus,
      confidence:     req.body?.confidence     ?? derived.confidence,
      priorities:     req.body?.priorities     ?? derived.priorities,
      requirements:   req.body?.requirements   ?? derived.requirements,
      sizePreference: req.body?.sizePreference ?? derived.sizePreference,
      providers:      req.body?.providers      ?? derived.providers,
      band:           req.body?.band,
      // How many to return. Auto asks for one because Auto means Svarg decides;
      // the picker asks for five. Clamped rather than trusted: it comes from a
      // request body, and an unbounded limit is a way to ask for the whole
      // catalog through an endpoint that is meant to narrow it.
      limit: Math.min(Math.max(Number(req.body?.limit) || 5, 1), 10),
    };

    // The stored min/max is deliberately NOT read here any more. It was a
    // single band applied to every use case, and the confidence band replaces
    // it with one chosen per use case — leaving both in would let a hand-set
    // range silently override the choice this endpoint exists to make.
    const catalog = await ModelCatalogEntry.find({ active: true }).lean();
    const result = recommendModels(catalog, input);

    // Every recommendation should be a model that can actually be run. Now that
    // the catalog rows carry a provider and an apiModel, they are — so the
    // fallback below comes back empty, which is the point: the model Arth
    // recommends and the model you deploy on should be the same one.
    //
    // The fallback is kept for when that stops being true. A picker with
    // nothing selectable is worse than one offering a second-best model that
    // works, and a new benchmark table will arrive before its endpoints do.
    const { runnableModels, pickRunnable, hasEndpoint } = await import('../services/selectableModelService.js');
    const picks = (result.picks || []).map(p => ({ ...p, adviceOnly: !hasEndpoint(p) }));
    const allRunnable = picks.length > 0 && picks.every(p => !p.adviceOnly);

    const runnable = allRunnable ? [] : runnableModels();
    const autoPick = allRunnable ? (picks[0]?.modelId || '')
                                 : (pickRunnable(input.confidence)?.id || '');

    return res.json({
      ...result,
      picks,
      runnable,
      autoPick,
      input,
      derived,
      // Without this, an empty result looks like a broken feature rather than
      // an empty catalog.
      catalogSize: catalog.length,
    });
  } catch (err) {
    console.error('recommendForBlueprint error:', err);
    return res.status(500).json({ error: 'Failed to produce recommendations.' });
  }
}
