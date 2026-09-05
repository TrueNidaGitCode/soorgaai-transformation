/**
 * Svarg — Model Catalog (platform admin)
 *
 * Where the evidence behind Arth's recommendations is entered and kept
 * current. Benchmarks are republished constantly, so this had to be editable
 * without a deploy.
 *
 * Three things, in the order they matter:
 *   - the acceptable score range, which decides what Arth may choose from
 *   - the ranking, so the range can be set while looking at what it selects
 *   - the per-model editor, for getting the published numbers in
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
 * Each score category, with what it measures. The source sits next to the
 * input on purpose: someone typing a number should be able to see which
 * published figure it is supposed to be.
 */
const INDICES = [
  ['strategyOps',             'Strategy & Ops',         'Business and management, accounting, corporate and markets, strategy and planning, customer support, records management'],
  ['intelligence',            'General Intelligence',   'AA Intelligence Index'],
  ['agentic',                 'Agentic Capabilities',   'AA Agentic Index'],
  ['coding',                  'Coding',                 'Terminal-Bench'],
  ['math',                    'Math & Reasoning',       'AA Math Index'],
  ['instructionFollowing',    'Instruction Following',  'IFBench'],
  ['longContext',             'Long Context Reasoning', 'AA-LCR'],
  ['documentCreation',        'Document Creation',      'GDPval-AA'],
  ['knowledge',               'Embedded Knowledge',     'AA-Omniscience'],
  ['hallucinationResistance', 'Low Hallucination',      'AA-Omniscience'],
];

const NUMERIC = [
  ['indexCost', 'Cost per task ($)'],
  ['priceIn',  'Price in ($/M tokens)'],
  ['priceOut', 'Price out ($/M tokens)'],
  ['medianTokensPerSecond', 'Median tokens/sec'],
  ['paramsB', 'Parameters (B)'],
  ['contextTokens', 'Context (tokens)'],
];

const CAPS = [
  ['reasoning',  'Reasoning'],
  ['imageInput', 'Image input'],
  ['audioInput', 'Audio input'],
  ['videoInput', 'Video input'],
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

// ── The ranking ─────────────────────────────────────────────────────────────

/**
 * Every scored model, highest first — the same shape as the published
 * comparison, so a row can be checked against the source without translating
 * between layouts.
 *
 * The acceptable range is shaded and the cheapest row inside it is marked,
 * because that row is the recommendation and it is almost never the top one.
 * Seeing those two facts together is the entire argument for setting a range.
 */
function renderRanking() {
  const el = document.getElementById('mc-rank');
  if (!el) return;

  const rows = _models
    .filter(m => m.scores?.strategyOps != null)
    .sort((a, b) => (b.scores.strategyOps - a.scores.strategyOps)
                 || ((a.indexCost ?? Infinity) - (b.indexCost ?? Infinity)));

  if (!rows.length) {
    el.innerHTML = '<tbody><tr><td class="mc-summary">No model has a Strategy &amp; Ops score yet.</td></tr></tbody>';
    return;
  }

  const r = _ranges?.strategyOps || {};
  const lo = r.min ?? -Infinity;
  const hi = r.max ?? Infinity;
  const inRange = rows.filter(m => m.scores.strategyOps >= lo && m.scores.strategyOps <= hi);
  const cheapest = inRange.slice()
    .sort((a, b) => (a.indexCost ?? Infinity) - (b.indexCost ?? Infinity))[0];

  const head = '<thead><tr><th>S.No</th><th>Model</th><th>Company</th>'
    + '<th class="mc-rank__num">Score</th><th class="mc-rank__num">Cost</th></tr></thead>';

  el.innerHTML = head + '<tbody>' + rows.map((m, i) => {
    const inside = m.scores.strategyOps >= lo && m.scores.strategyOps <= hi;
    const pick = cheapest && m.modelId === cheapest.modelId;
    const cls = [inside ? 'mc-rank__row--in' : '', pick ? 'mc-rank__row--pick' : ''].join(' ').trim();
    const tag = pick ? '<span class="mc-rank__tag">Arth picks this</span>' : '';
    return `<tr class="${cls}">`
      + `<td class="mc-rank__sno">${i + 1}</td>`
      + `<td>${esc(m.displayName)}${tag}</td>`
      + `<td>${esc(m.vendor || '—')}</td>`
      + `<td class="mc-rank__num mc-rank__score">${m.scores.strategyOps}</td>`
      + `<td class="mc-rank__num mc-rank__cost">${money(m.indexCost)}</td>`
      + '</tr>';
  }).join('') + '</tbody>';
}

// ── The per-model editor ────────────────────────────────────────────────────

function numberField(m, key, label) {
  return `<div class="form-group">
    <label>${esc(label)}</label>
    <input type="number" step="any" data-field="${key}" value="${m[key] ?? ''}" placeholder="not published">
  </div>`;
}

function renderModel(m) {
  const scored = Object.values(m.scores || {}).some(v => v != null);
  return `
  <div class="mc-model" data-model="${esc(m.modelId)}">
    <div class="mc-model__head" data-toggle>
      <span class="mc-model__name">${esc(m.displayName)}</span>
      <span class="mc-model__meta">${esc(m.vendor || '—')} · ${esc(m.type)}${m.paramsB ? ' · ' + m.paramsB + 'B' : ''}</span>
      <span class="mc-model__state mc-model__state--${scored ? 'scored' : 'unscored'}">${scored ? 'scored' : 'no scores'}</span>
    </div>
    <div class="mc-model__body" style="display:none">

      <p class="mc-section-label">Scores (0–100)</p>
      <div class="mc-grid">
        ${INDICES.map(([key, label, source]) => `
          <div class="form-group">
            <label>${esc(label)}<br><span class="mc-model__meta">${esc(source)}</span></label>
            <input type="number" step="any" min="0" max="100" data-score="${key}"
                   value="${m.scores?.[key] ?? ''}" placeholder="not published">
          </div>`).join('')}
      </div>

      <p class="mc-section-label">Cost and shape</p>
      <div class="mc-grid">${NUMERIC.map(([k, l]) => numberField(m, k, l)).join('')}</div>

      <p class="mc-section-label">Capabilities — these filter, they never trade off</p>
      <div class="mc-caps">
        ${CAPS.map(([k, l]) => `<label><input type="checkbox" data-cap="${k}" ${m[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
        <label><input type="checkbox" data-cap="active" ${m.active !== false ? 'checked' : ''}> Recommendable</label>
      </div>

      <p class="mc-section-label">Providers and provenance</p>
      <div class="mc-grid">
        <div class="form-group">
          <label>Served by (comma separated)</label>
          <input type="text" data-field="providers" value="${esc((m.providers || []).join(', '))}" placeholder="Anthropic, Amazon Bedrock">
        </div>
        <div class="form-group">
          <label>Benchmark release</label>
          <input type="text" data-field="sourceVersion" value="${esc(m.sourceVersion || '')}" placeholder="e.g. 2026-09">
        </div>
      </div>

      <div class="mc-actions">
        <button type="button" class="btn-primary" data-save>Save</button>
        <button type="button" class="btn-secondary" data-delete>Remove</button>
        <span class="mc-saved" data-saved></span>
      </div>
      <p class="mc-provenance">
        ${esc(m.source || '')}${m.updatedBy ? ` · last edited by ${esc(m.updatedBy)}` : ''}
        ${m.updatedAt ? ` · ${new Date(m.updatedAt).toLocaleString()}` : ''}
      </p>
    </div>
  </div>`;
}

function renderList(filter = '') {
  const q = filter.trim().toLowerCase();
  const shown = q
    ? _models.filter(m => [m.displayName, m.vendor, m.modelId, ...(m.providers || [])]
        .join(' ').toLowerCase().includes(q))
    : _models;

  document.getElementById('mc-list').innerHTML = shown.length
    ? shown.map(renderModel).join('')
    : '<p class="mc-summary">No models match that filter.</p>';
}

// ── Loading and saving ──────────────────────────────────────────────────────

async function load() {
  try {
    const { models, summary } = await api('');
    _models = models;
    renderSummary(summary);
    renderList(document.getElementById('mc-filter').value);
    renderRanking();
    banner('');
  } catch (err) {
    banner(err.message);
  }
}

/**
 * Empty means "not published", which is a different thing from zero and must
 * be sent as null — the recommender excludes an unscored model with a reason
 * rather than ranking it bottom, and a stray 0 would make a model look
 * terrible instead of unmeasured.
 */
function readNumber(input) {
  const raw = input.value.trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function save(card) {
  const modelId = card.dataset.model;
  const body = { scores: {} };

  card.querySelectorAll('[data-score]').forEach(i => { body.scores[i.dataset.score] = readNumber(i); });
  card.querySelectorAll('[data-field]').forEach(i => {
    const f = i.dataset.field;
    if (f === 'providers') body.providers = i.value.split(',').map(s => s.trim()).filter(Boolean);
    else if (f === 'sourceVersion') body.sourceVersion = i.value.trim();
    else body[f] = readNumber(i);
  });
  card.querySelectorAll('[data-cap]').forEach(i => { body[i.dataset.cap] = i.checked; });

  const saved = card.querySelector('[data-saved]');
  try {
    await api(`/${encodeURIComponent(modelId)}`, { method: 'PATCH', body: JSON.stringify(body) });
    saved.textContent = 'Saved';

    // Reloaded rather than patched in place, so the badges, the ranking and
    // the coverage line reflect what the server stored rather than what was
    // typed into the form.
    const wasOpen = card.querySelector('.mc-model__body').style.display !== 'none';
    await load();
    if (wasOpen) {
      const again = document.querySelector(`[data-model="${CSS.escape(modelId)}"] .mc-model__body`);
      if (again) again.style.display = '';
    }
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

document.getElementById('mc-list').addEventListener('click', async (e) => {
  const card = e.target.closest('.mc-model');
  if (!card) return;

  if (e.target.closest('[data-toggle]')) {
    const body = card.querySelector('.mc-model__body');
    body.style.display = body.style.display === 'none' ? '' : 'none';
    return;
  }
  if (e.target.closest('[data-save]')) return save(card);
  if (e.target.closest('[data-delete]')) {
    // Deleting a model a blueprint already chose leaves that decision
    // unreadable, so this asks first and points at the gentler option.
    const ok = confirm(`Remove ${card.dataset.model} from the catalog?\n\n`
      + 'Untick "Recommendable" instead if you only want to stop it being suggested — '
      + 'blueprints that already chose it keep working.');
    if (!ok) return;
    try { await api(`/${encodeURIComponent(card.dataset.model)}`, { method: 'DELETE' }); await load(); }
    catch (err) { banner(err.message); }
  }
});

document.getElementById('mc-filter').addEventListener('input', (e) => renderList(e.target.value));
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

document.getElementById('mc-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('', { method: 'POST', body: JSON.stringify({
      modelId:     document.getElementById('mc-modelId').value.trim(),
      displayName: document.getElementById('mc-displayName').value.trim(),
      vendor:      document.getElementById('mc-vendor').value.trim(),
      type:        document.getElementById('mc-type').value,
    }) });
    e.target.reset();
    await load();
    banner('Model added. Open it to enter scores.', false);
  } catch (err) {
    banner(err.message);
  }
});

load();
loadSettings();
