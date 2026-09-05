/**
 * Svarg — Catalog settings
 *
 * The acceptable score range, per category, set once by an admin and applied
 * to every customer.
 *
 * This replaces a heuristic. The recommender used to derive its own band as
 * "within ten points of the best available score", which is a guess dressed as
 * arithmetic. An acceptable range is not a property of the leaderboard — it is
 * a judgement about what quality a product can ship, arrived at by testing,
 * and only the person who ran those tests knows it.
 *
 * One document. There is one platform and one set of ranges.
 */

import mongoose from 'mongoose';

const rangeSchema = new mongoose.Schema({
  min: { type: Number, default: null },
  max: { type: Number, default: null },
}, { _id: false });

const catalogSettingsSchema = new mongoose.Schema({
  // A fixed key so findOneAndUpdate always addresses the same row.
  key: { type: String, default: 'default', unique: true, index: true },

  // category -> { min, max }. Absent means "no range set", and the recommender
  // then falls back to ranking rather than pretending a band exists.
  acceptableRanges: {
    type: Map,
    of: rangeSchema,
    default: () => new Map(),
  },

  updatedBy: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('CatalogSettings', catalogSettingsSchema);
