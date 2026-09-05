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
 * The acceptable range stays editable, because it is not a measurement. It is a
 * judgement about what quality the product can ship, arrived at by testing, and
 * only the person who ran those tests knows it.
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
 * Two, and everything on this page follows from that — the ranking panels and
 * the range dropdown both come from here. The model still has fields for eight
 * other categories, so restoring one is this list, a line in FOCUS_INDICES, and
 * a seed script; but a category with no published scores can only ever produce
 * an empty ranking.
 */
const INDICES = [
  ['strategyOps', 'Strategy & Ops', 'Business and management, accounting, corporate and markets, strategy and planning, customer support, records management'],
  ['engineering', 'Engineering',    'Building and changing software'],
];

let _models = [];
let _ranges = {};

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
function costFor(m, category) {
  return m.indexCosts?.[category] ?? m.indexCost ?? null;
}

/**
 * One panel per benchmark table: every model scored on that category, highest
 * first, in the same shape as the published comparison so a row can be checked
 * against its source without translating between layouts.
 *
 * The acceptable range is shaded and the cheapest row inside it is marked,
 * because that row is the recommendation and it is almost never the top one.
 * Seeing those two facts together is the entire argument for setting a range.
 */
function rankingPanel(category, label) {
  const rows = _models
    .filter(m => m.scores?.[category] != null)
    .sort((a, b) => (b.scores[category] - a.scores[category])
                 || ((costFor(a, category) ?? Infinity) - (costFor(b, category) ?? Infinity)));
  if (!rows.length) return '';

  const r = _ranges?.[category] || {};
  // With no range set, -Infinity..Infinity would make every row "inside", and
  // the table would shade all twenty and tag a pick — which reads as a band
  // someone chose. Nothing has been chosen, and Arth does not use this rule
  // until it is.
  const set = r.min != null || r.max != null;
  const lo = r.min ?? -Infinity;
  const hi = r.max ?? Infinity;
  const inside = (m) => set && m.scores[category] >= lo && m.scores[category] <= hi;
  const cheapest = rows.filter(inside)
    .sort((a, b) => (costFor(a, category) ?? Infinity) - (costFor(b, category) ?? Infinity))[0];

  const head = '<thead><tr><th>S.No</th><th>Model</th><th>Company</th>'
    + '<th class="mc-rank__num">Score</th><th class="mc-rank__num">Cost</th></tr></thead>';

  const body = rows.map((m, i) => {
    const pick = cheapest && m.modelId === cheapest.modelId;
    const cls = [inside(m) ? 'mc-rank__row--in' : '', pick ? 'mc-rank__row--pick' : ''].join(' ').trim();
    const tag = pick ? '<span class="mc-rank__tag">Arth picks this</span>' : '';
    return `<tr class="${cls}">`
      + `<td class="mc-rank__sno">${i + 1}</td>`
      + `<td>${esc(m.displayName)}${tag}</td>`
      + `<td>${esc(m.vendor || '—')}</td>`
      + `<td class="mc-rank__num mc-rank__score">${m.scores[category]}</td>`
      + `<td class="mc-rank__num mc-rank__cost">${money(costFor(m, category))}</td>`
      + '</tr>';
  }).join('');

  return `<div class="admin-panel">
    <div class="panel-header"><h2>${esc(label)} — proprietary models</h2></div>
    <p class="mc-summary">
      Every model scored on ${esc(label)}, highest first, with the cost measured on that
      benchmark. ${set
        ? 'Shaded rows are inside the acceptable range — the only ones Arth can choose from — and within those it takes the cheapest, which is rarely the one at the top.'
        : 'No acceptable range is set for this category yet, so Arth ranks on balance instead of taking the cheapest that clears a band.'}
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
    const { models, summary } = await api('');
    _models = models;
    renderSummary(summary);
    renderRanking();
    banner('');
  } catch (err) {
    banner(err.message);
  }
}

// ── The acceptable range ────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const { acceptableRanges } = await api('/settings');
    _ranges = acceptableRanges || {};
  } catch {
    _ranges = {};
  }

  const sel = document.getElementById('mc-range-category');
  if (sel && !sel.options.length) {
    sel.innerHTML = INDICES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  }
  showRange();
  renderRanking();
}

function showRange() {
  const cat = document.getElementById('mc-range-category')?.value;
  const r = _ranges?.[cat] || {};
  const min = document.getElementById('mc-range-min');
  const max = document.getElementById('mc-range-max');
  // Blank means no range, which is a different instruction from zero.
  if (min) min.value = r.min ?? '';
  if (max) max.value = r.max ?? '';
}

// ── Wiring ──────────────────────────────────────────────────────────────────

document.getElementById('mc-range-category')?.addEventListener('change', showRange);

document.getElementById('mc-range-save')?.addEventListener('click', async () => {
  const saved = document.getElementById('mc-range-saved');
  try {
    const { acceptableRanges } = await api('/settings', { method: 'POST', body: JSON.stringify({
      category: document.getElementById('mc-range-category').value,
      min: document.getElementById('mc-range-min').value,
      max: document.getElementById('mc-range-max').value,
    }) });
    _ranges = acceptableRanges || {};
    renderRanking();
    if (saved) { saved.textContent = 'Saved'; setTimeout(() => { saved.textContent = ''; }, 2000); }
    banner('');
  } catch (err) {
    banner(err.message);
  }
});

load();
loadSettings();
