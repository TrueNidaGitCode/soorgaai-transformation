/**
 * Seed one published benchmark table into the model catalog.
 *
 * Every table has the same shape — rank, model, score, cost per task — so this
 * holds the mechanics and each table script holds only its numbers. Two copies
 * of this logic would drift, and a seeder that drifts writes scores that look
 * measured and are not.
 *
 * ── Why score and cost are both per category ───────────────────────────────
 *
 * A benchmark is a workload, so the same model bills differently on each one:
 * Claude Opus 5 (max) is $3.01 on Strategy & Ops and $2.25 on Engineering.
 * Both are written under the category key, and the flat `indexCost` is cleared
 * for any row this seeds — leaving it set would give the row two costs, one of
 * which was measured on a different benchmark.
 *
 * ── What it will not do ────────────────────────────────────────────────────
 *
 * It never touches another category's numbers, so seeding Engineering cannot
 * disturb Strategy & Ops. It never overwrites a row an admin has edited unless
 * forced, because a corrected score that silently comes back on the next run is
 * worse than a stale one — the admin has no way to see it happen.
 */
import ModelCatalogEntry from '../../models/ModelCatalogEntry.js';

export const slug = (s) => s.toLowerCase()
  .replace(/[()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * @param {object}  opts
 * @param {string}  opts.category  A key of ModelCatalogEntry.scores
 * @param {string}  opts.label     How the table is named in output and provenance
 * @param {Array}   opts.rows      [rank, displayName, vendor, score, costPerTask]
 * @param {boolean} opts.force     Overwrite rows an admin has edited
 */
export async function seedBenchmarkTable({ category, label, rows, force = false }) {
  const source = `${label} — proprietary`;
  const keep = new Set(rows.map(([, name]) => slug(name)));
  let created = 0, updated = 0, skipped = 0;

  for (const [rank, name, vendor, score, cost] of rows) {
    const modelId = slug(name);
    const existing = await ModelCatalogEntry.findOne({ modelId }).lean();
    if (existing?.updatedBy && !force) { skipped++; continue; }

    await ModelCatalogEntry.updateOne(
      { modelId },
      {
        // Dotted paths, so a model that appears in several tables keeps the
        // scores and costs the other tables gave it.
        $set: {
          modelId,
          displayName: name,
          vendor,
          type: 'frontier',
          providers: [vendor],
          [`scores.${category}`]: score,
          [`indexCosts.${category}`]: cost,
          source: `${source} · rank ${rank}`,
        },
        $unset: { indexCost: '' },
      },
      { upsert: true }
    );
    existing ? updated++ : created++;
  }

  // Rows from a previous version of THIS table that the current one does not
  // contain. Left behind they sit in the ranking looking current, and a stale
  // row is indistinguishable from a fresh one once it is in the table.
  //
  // Scoped to this category twice over — by having a score in it, and by
  // provenance — so a model that only ever appeared in a different table is
  // never caught by it.
  const stale = (await ModelCatalogEntry.find({
    [`scores.${category}`]: { $ne: null },
    modelId: { $nin: [...keep] },
    updatedBy: { $in: ['', null] },
  }).select('modelId displayName source').lean())
    .filter(m => String(m.source || '').startsWith(label));

  if (stale.length) {
    // Only this category's numbers are removed. The model itself stays if
    // another table scored it — dropping the row would take that table's
    // measurements with it.
    for (const m of stale) {
      const doc = await ModelCatalogEntry.findOne({ modelId: m.modelId }).lean();
      const others = Object.entries(doc.scores || {})
        .filter(([k, v]) => k !== category && v != null);
      if (others.length) {
        await ModelCatalogEntry.updateOne({ modelId: m.modelId },
          { $unset: { [`scores.${category}`]: '', [`indexCosts.${category}`]: '' } });
      } else {
        await ModelCatalogEntry.deleteOne({ modelId: m.modelId });
      }
    }
  }

  const total = await ModelCatalogEntry.countDocuments({ [`scores.${category}`]: { $ne: null } });
  return { created, updated, skipped, stale, total };
}

export function report(label, { created, updated, skipped, stale, total }) {
  console.log(`created ${created}, updated ${updated}, skipped ${skipped} (edited by an admin)`);
  if (stale.length) {
    console.log(`removed ${stale.length} row(s) from the superseded list:`);
    stale.forEach(m => console.log(`   ${m.displayName}`));
  }
  console.log(`${total} models carry a ${label} score`);
}
