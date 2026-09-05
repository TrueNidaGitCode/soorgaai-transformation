/**
 * Svarg — Model Catalog (platform admin)
 *
 * The evidence behind Arth's recommendations, and the one control that decides
 * what it may choose from.
 *
 * Read-only. Scores and costs come from the seed scripts, which transcribe the
 * published comparisons and are the only place they are written:
 *
 *   scripts/seed_strategy_ops_models.mjs
 *   scripts/seed_engineering_models.mjs
 *
 * That is a deliberate trade. This page used to carry a per-model editor so a
 * score could be corrected without a deploy — the cost is that correcting one
 * now takes a script change and a release. What it buys is that every figure
 * on the page has a transcribed table behind it, rather than a number somebody
 * typed once and nobody can trace.
 *
 * Nothing here is editable. The acceptable range used to be, and it is gone: it
 * was one hand-set min/max applied to every use case, where the confidence
 * bands pick a band per use case out of the same numbers. Keeping both would
 * let a stale range silently override the choice.
 *
 * Client-side convenience only; the backend enforces auth on every
 * /api/admin/model-catalog route independently.
 */

const API_BASE = window.CONFIG.API_BASE;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}/admin/model-catalog${path}`, { ...opts, headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function banner(message, isError = true) {
  const el = document.getElementById('mc-banner');
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
  el.style.color = isError ? '' : '#5CC5A7';
}

const esc = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`);

/**
 * The maintained benchmark tables, and what each measures.
 *
 * Two, and everything on this page follows from that — the band legend and the
 * ranking panels both come from here. The model still has fields for eight
 * other categories, so restoring one is this list, a line in FOCUS_INDICES, and
 * a seed script; but a category with no published scores can only ever produce
 * an empty ranking.
 */
const INDICES = [
  ['strategyOps', 'Strategy & Ops', 'Business and management, accounting, corporate and markets, strategy and planning, customer support, records management'],
  ['engineering', 'Engineering',    'Building and changing software'],
];

let _models = [];
let _bands = {};   // focus -> the three bands, computed by the server

// ── Coverage ────────────────────────────────────────────────────────────────

function renderSummary(summary) {
  const el = document.getElementById('mc-summary');
  if (!summary) { el.textContent = ''; return; }
  const { total, scored, unscored } = summary;

  // Stated plainly. An unscored catalog produces an empty Arth screen, and the
  // cause should not have to be inferred from that emptiness.
  el.innerHTML = unscored
    ? `<span class="mc-summary--warn"><strong>${scored} of ${total}</strong> models carry at least one score. `
      + `The other ${unscored} cannot be ranked and are excluded with a reason.</span>`
    : `<strong>All ${total}</strong> models carry a score.`;
}

// ── The rankings ────────────────────────────────────────────────────────────

/**
 * Cost, read per category.
 *
 * The same model bills differently on each benchmark — Claude Opus 5 (max) is
 * $3.01 on Strategy & Ops and $2.25 on Engineering — so showing one cost
 * against both scores would misprice whichever table it did not come from.
 * The flat figure is the fallback for rows that predate the split.
 */
function bandFor(category, score) {
  const bands = _bands[category] || [];
  // Boundaries belong to the higher band, matching the service — a model that
  // sat in two bands, or none, would make the counts on this page a lie.
  for (const b of bands) if (score >= b.min) return b;
  return bands[bands.length - 1] || null;
}

const BAND_CLASS = { 'very-high': 'mc-band--vh', high: 'mc-band--h', medium: 'mc-band--m' };

/** The three bands per table, with how many models are in each. This is the
 *  whole selection rule on one screen: a use case picks a band, Arth takes the
 *  cheapest model in it. */
function renderBands() {
  const el = document.getElementById('mc-bands');
  if (!el) return;
  const sections = INDICES.map(([key, label]) => {
    const bands = _bands[key];
    if (!bands || !bands.length) return '';
    const rows = bands.map(b => {
      const n = _models.filter(m => m.scores?.[key] != null
        && bandFor(key, m.scores[key])?.id === b.id).length;
      return `<div class="mc-band ${BAND_CLASS[b.id] || ''}">
        <span class="mc-band__label">${esc(b.label)}</span>
        <span class="mc-band__range">${b.min.toFixed(1)} – ${b.max.toFixed(1)}</span>
        <span class="mc-band__count">${n} model${n === 1 ? '' : 's'}</span>
      </div>`;
    }).join('');
    return `<div class="mc-bandset"><p class="mc-bandset__title">${esc(label)}</p>${rows}</div>`;
  }).filter(Boolean).join('');
  el.innerHTML = sections || '<p class="mc-summary">No scores yet, so there is nothing to split.</p>';
}

function costFor(m, category) {
  return m.indexCosts?.[category] ?? m.indexCost ?? null;
}

/**
 * One panel per benchmark table: every model scored on that category, highest
 * first, in the same shape as the published comparison so a row can be checked
 * against its source without translating between layouts.
 *
 * Rows are shaded by confidence band, and the cheapest row in each band is
 * marked — because that row is what Arth returns for a use case asking for that
 * band, and it is almost never the top one. Three marks rather than one, since
 * the table has to answer three different kinds of work.
 */
function rankingPanel(category, label) {
  const rows = _models
    .filter(m => m.scores?.[category] != null)
    .sort((a, b) => (b.scores[category] - a.scores[category])
                 || ((costFor(a, category) ?? Infinity) - (costFor(b, category) ?? Infinity)));
  if (!rows.length) return '';

  // One answer per band, not one winner per table: a use case asks for a band,
  // and Arth returns the cheapest model in it. Marking all three shows what
  // each kind of work would actually get.
  const cheapestIn = {};
  for (const m of rows) {
    const b = bandFor(category, m.scores[category]);
    if (!b) continue;
    const c = costFor(m, category) ?? Infinity;
    if (!cheapestIn[b.id] || c < (costFor(cheapestIn[b.id], category) ?? Infinity)) cheapestIn[b.id] = m;
  }

  const head = '<thead><tr><th>S.No</th><th>Model</th><th>Company</th><th>Band</th>'
    + '<th class="mc-rank__num">Score</th><th class="mc-rank__num">Cost</th></tr></thead>';

  const body = rows.map((m, i) => {
    const b = bandFor(category, m.scores[category]);
    const pick = b && cheapestIn[b.id] && cheapestIn[b.id].modelId === m.modelId;
    const cls = [b ? BAND_CLASS[b.id] + '-row' : '', pick ? 'mc-rank__row--pick' : ''].join(' ').trim();
    const tag = pick ? '<span class="mc-rank__tag">Arth picks this</span>' : '';
    return `<tr class="${cls}">`
      + `<td class="mc-rank__sno">${i + 1}</td>`
      + `<td>${esc(m.displayName)}${tag}</td>`
      + `<td>${esc(m.vendor || '—')}</td>`
      + `<td class="mc-rank__band">${b ? esc(b.label.replace(' Confidence', '')) : '—'}</td>`
      + `<td class="mc-rank__num mc-rank__score">${m.scores[category]}</td>`
      + `<td class="mc-rank__num mc-rank__cost">${money(costFor(m, category))}</td>`
      + '</tr>';
  }).join('');

  return `<div class="admin-panel">
    <div class="panel-header"><h2>${esc(label)} — proprietary models</h2></div>
    <p class="mc-summary">
      Every model scored on ${esc(label)}, highest first, with the cost measured on that
      benchmark. Rows are shaded by confidence band, and the cheapest in each band is
      marked — that is the model Arth returns when a use case asks for that band.
    </p>
    <div class="mc-rank-wrap"><table class="mc-rank">${head}<tbody>${body}</tbody></table></div>
  </div>`;
}

function renderRanking() {
  const el = document.getElementById('mc-rankings');
  if (!el) return;
  const panels = INDICES.map(([key, label]) => rankingPanel(key, label)).filter(Boolean).join('');
  // An empty catalog and a failed load look identical otherwise, and the fix
  // for one is nothing like the fix for the other.
  el.innerHTML = panels || '<div class="admin-panel"><p class="mc-summary">'
    + 'No model carries a score yet, so there is nothing to rank. Run the seed scripts.</p></div>';
}

// ── Loading ─────────────────────────────────────────────────────────────────

async function load() {
  try {
    const { models, summary, bands } = await api('');
    _models = models;
    _bands = bands || {};
    renderSummary(summary);
    renderBands();
    renderRanking();
    banner('');
  } catch (err) {
    banner(err.message);
  }
}

load();
