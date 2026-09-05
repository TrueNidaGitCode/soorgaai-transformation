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
    return res.json({
      models,
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
      priorities:     req.body?.priorities     ?? derived.priorities,
      requirements:   req.body?.requirements   ?? derived.requirements,
      sizePreference: req.body?.sizePreference ?? derived.sizePreference,
      providers:      req.body?.providers      ?? derived.providers,
      band:           req.body?.band,
    };

    const settings = await CatalogSettings.findOne({ key: 'default' }).lean();
    const ranges = settings?.acceptableRanges || {};
    // Map or plain object depending on how it was read back.
    const range = typeof ranges.get === 'function' ? ranges.get(input.focus) : ranges[input.focus];
    if (range) input.acceptableRange = range;

    const catalog = await ModelCatalogEntry.find({ active: true }).lean();
    const result = recommendModels(catalog, input);

    return res.json({
      ...result,
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
