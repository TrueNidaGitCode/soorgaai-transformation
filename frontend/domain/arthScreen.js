/**
 * Svarg — Arth screen (model & infrastructure)
 *
 * Reached from Aria once data has been linked (dispatches 'arth:show').
 *
 * Both halves are real, not illustrative:
 *  - the model options come from the actual catalog, resolved server-side
 *    by modelSelectionService via GET /defect-matching/model-selection,
 *    so quality/cost/performance and the rationale are the same values
 *    the engine would route on;
 *  - the infrastructure rows come from this blueprint's own
 *    technology-infrastructure domain, so they describe this engagement
 *    rather than a generic stack.
 *
 * The choice is persisted through PATCH .../arth-selection, which
 * recomputes the pick server-side — the client only ever sends a
 * preference, never a model name.
 */

import { findAiUseCasesPrioritizationSection } from './blueprintGenerate.js';

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

async function api(path, opts = {}) {
  if (!path.startsWith('/')) path = '/' + path;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let _bp = null;
let _blueprintId = null;
let _chosen = null;          // the class: frontier | open-weight | auto
let _model = null;           // the specific model id — this is the decision
let _models = [];            // candidates currently on screen
let _priority = null;        // what matters most, for the auto flow
let _recommendation = null;  // Arth's pick, kept so its reasoning is saved

// The three classes the catalog actually distinguishes. Descriptions state
// the trade honestly rather than selling each one.
const OPTIONS = [
  { id: 'frontier',    title: 'Frontier',    blurb: 'Best quality, per-call cloud pricing. Data leaves your environment.' },
  { id: 'open-weight', title: 'Open Weight', blurb: 'Runs on your own hardware. Fixed cost, full data control, some quality traded away.' },
  { id: 'auto',        title: 'Auto',        blurb: 'Arth reads this use case and picks the model that fits it, weighing cost, quality and performance.' },
];

const PRIORITIES = [
  { id: 'quality',     title: 'Quality',     blurb: 'Get the best answer, accept the price.' },
  { id: 'cost',        title: 'Cost',        blurb: 'Keep the running bill down.' },
  { id: 'performance', title: 'Speed',       blurb: 'Low latency and high throughput.' },
  { id: 'privacy',     title: 'Data control',blurb: 'Nothing leaves our environment.' },
];

function showError(msg) {
  const el = document.getElementById('arth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function renderBreadcrumb(bp) {
  const crumb = document.getElementById('arth-breadcrumb');
  const section = findAiUseCasesPrioritizationSection(bp);
  const brief = section?.brief || {};
  const all = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
  const rec = brief.recommendedStartingPoint || '';
  const label = all.find(n => n && rec.includes(n)) || rec;
  if (!label) { crumb.style.display = 'none'; return; }
  crumb.style.display = '';
  document.getElementById('arth-recap-name').textContent = label;
}

function renderOptions() {
  const wrap = document.getElementById('arth-options');
  wrap.innerHTML = OPTIONS.map(o => `
    <button type="button" class="arth-option${_chosen === o.id ? ' arth-option--on' : ''}" data-pref="${o.id}">
      <span class="arth-option__title">${esc(o.title)}</span>
      <span class="arth-option__blurb">${esc(o.blurb)}</span>
    </button>
  `).join('');
}

function tags(m) {
  return [['Quality', m.quality], ['Cost', m.cost], ['Speed', m.performance]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<span class="arth-tag"><span class="arth-tag__k">${k}</span>${esc(v)}</span>`)
    .join('');
}

// The compute line is the whole point of choosing open weight with open eyes,
// so it is stated on the card rather than hidden behind the selection.
function computeLine(m) {
  if (!m.compute) return '';
  const c = m.compute;
  return `<span class="arth-compute">
      <strong>${c.vramGb}GB VRAM</strong> · ${c.gpuCount}x ${esc(c.gpu)}
      <span class="arth-compute__note">${esc(c.note)}</span>
    </span>`;
}

function renderModels(models) {
  const wrap = document.getElementById('arth-models');
  if (!models.length) {
    wrap.innerHTML = `<p class="ks-card-body">No models of this class in the catalog.</p>`;
    return;
  }
  wrap.innerHTML = models.map(m => `
    <button type="button" class="arth-model${_model === m.id ? ' arth-model--on' : ''}" data-model="${esc(m.id)}">
      <span class="arth-model__head">
        <span class="arth-model__name">${esc(m.displayName)}</span>
        <span class="arth-model__vendor">${esc(m.vendor)}</span>
      </span>
      <span class="arth-model__tags">${tags(m)}</span>
      <span class="arth-model__strengths">${esc(m.strengths || '')}</span>
      ${computeLine(m)}
      ${m.license ? `<span class="arth-model__license">${esc(m.license)}</span>` : ''}
    </button>
  `).join('');
}

function renderRecommendation(rec) {
  const box = document.getElementById('arth-recommendation');
  box.style.display = 'block';
  box.innerHTML = `
    <p class="arth-rec__label">Arth recommends</p>
    <p class="arth-rec__name">${esc(rec.displayName)}
      <span class="arth-model__vendor">${esc(rec.vendor || '')}</span></p>
    <div class="arth-model__tags">${tags(rec)}</div>
    <p class="arth-rec__why">${esc(rec.why || '')}</p>
    ${rec.compute ? `<p class="arth-rec__compute">${computeLine(rec)}</p>` : ''}
  `;
}

// Infrastructure comes from whichever technology capability actually
// carries it — the generator puts infraItems/techStack on different
// capabilities depending on what it produced, so search rather than assume.
function findInfra(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'technology-infrastructure');
  if (!domain) return [];
  const rows = [];
  for (const cap of domain.capabilities || []) {
    for (const section of cap.sections || []) {
      const b = section.brief || {};
      // Field names come from infraItemSchema {item, recommendation} and
      // techStackItemSchema {layer, recommendation} in TransformationBlueprint.
      // The alternates are kept only for blueprints written before those
      // schemas settled.
      (b.infraItems || []).forEach(i => rows.push({
        label: i.item || i.label || i.name || i.component || '',
        value: i.recommendation || i.value || i.detail || i.description || '',
      }));
      (b.techStack || []).forEach(t => rows.push({
        label: t.layer || t.category || t.name || '',
        value: t.recommendation || t.technology || t.value || t.tools || t.description || '',
      }));
    }
  }
  return rows.filter(r => r.label && r.value);
}

function renderInfra(bp) {
  const body = document.getElementById('arth-infra-body');
  const note = document.getElementById('arth-infra-note');
  const noteText = document.getElementById('arth-infra-note-text');
  const rows = findInfra(bp);

  if (!rows.length) {
    // "Hasn't finished yet" was shown for every empty case, including the
    // common one where generation ran and failed. The domain rolls up to
    // 'completed' even when every capability under it errored, so the
    // capabilities are what has to be read to tell the two apart.
    const domain = (bp.domains || []).find(d => d.domainId === 'technology-infrastructure');
    const caps = domain?.capabilities || [];
    const failed = caps.filter(c => c.status === 'error');
    const pending = caps.filter(c => c.status !== 'error' && c.status !== 'completed');

    let msg;
    if (failed.length && !pending.length) {
      const raw = String(failed[0].errorMessage || '');
      msg = /no credits remaining|credit balance|quota|billing/i.test(raw)
        ? 'Technology &amp; Infrastructure could not be generated — the AI provider rejected the request for lack of credits. Top up the provider and regenerate.'
        : 'Technology &amp; Infrastructure could not be generated. Regenerate this domain to try again.';
    } else if (pending.length) {
      msg = 'Technology &amp; Infrastructure is still generating.';
    } else {
      msg = 'This blueprint has no Technology &amp; Infrastructure content.';
    }

    body.innerHTML = `<tr><td colspan="2" class="ks-card-body">${msg}</td></tr>`;
    note.style.display = 'none';
    return;
  }

  body.innerHTML = rows.map(r => `
    <tr>
      <td><span class="aria-row-name__title">${esc(r.label)}</span></td>
      <td class="aria-row-tools">${esc(r.value)}</td>
    </tr>
  `).join('');

  noteText.textContent = 'Taken from this blueprint’s Technology & Infrastructure domain, not a generic stack.';
  note.style.display = '';
}

function renderPriorities() {
  document.getElementById('arth-priorities').innerHTML = PRIORITIES.map(p => `
    <button type="button" class="arth-option arth-option--sm${_priority === p.id ? ' arth-option--on' : ''}" data-priority="${p.id}">
      <span class="arth-option__title">${esc(p.title)}</span>
      <span class="arth-option__blurb">${esc(p.blurb)}</span>
    </button>
  `).join('');
}

// Only a specific model counts as a decision. Picking a class narrows the
// question; it does not answer it.
function refreshConfirm() {
  const btn  = document.getElementById('arth-confirm-btn');
  const hint = document.getElementById('arth-hint');
  const picked = _models.find(m => m.id === _model);
  btn.disabled = !_model;
  hint.textContent = picked ? `Selected: ${picked.displayName}`
    : _chosen ? 'Choose a model to continue'
    : 'Choose a model class to continue';
}

async function loadModels() {
  const wrap = document.getElementById('arth-models');
  wrap.innerHTML = `<p class="ks-card-body">Loading models…</p>`;
  try {
    const q = document.getElementById('arth-quant').value;
    const data = await api(`/strategy-canvas/arth/models?type=${_chosen}&quantization=${q}`);
    _models = data.models || [];
    renderModels(_models);
  } catch (err) {
    wrap.innerHTML = '';
    showError(err.message);
  }
}

function choose(pref) {
  if (_chosen !== pref) { _model = null; _models = []; }
  _chosen = pref;
  renderOptions();

  const picker = document.getElementById('arth-picker');
  const auto   = document.getElementById('arth-auto');
  picker.style.display = pref === 'auto' ? 'none' : '';
  auto.style.display   = pref === 'auto' ? '' : 'none';

  if (pref === 'auto') {
    renderPriorities();
  } else {
    document.getElementById('arth-picker-label').textContent =
      pref === 'frontier' ? 'Choose a frontier model' : 'Choose an open-weight model';
    // Precision only changes anything for models you host yourself.
    document.getElementById('arth-quant-wrap').style.display = pref === 'open-weight' ? '' : 'none';
    loadModels();
  }
  refreshConfirm();
}

let _wired = false;

function wire() {
  if (_wired) return;
  _wired = true;

  document.getElementById('arth-options').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref]');
    if (b) choose(b.dataset.pref);
  });

  document.getElementById('arth-models').addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    _model = b.dataset.model;
    renderModels(_models);
    refreshConfirm();
  });

  document.getElementById('arth-quant').addEventListener('change', () => {
    if (_chosen === 'open-weight') loadModels();
  });

  document.getElementById('arth-priorities').addEventListener('click', (e) => {
    const b = e.target.closest('[data-priority]');
    if (!b) return;
    _priority = b.dataset.priority;
    renderPriorities();
  });

  document.getElementById('arth-recommend-btn').addEventListener('click', async () => {
    const btn  = document.getElementById('arth-recommend-btn');
    const hint = document.getElementById('arth-auto-hint');
    btn.disabled = true;
    btn.textContent = 'Arth is thinking…';
    hint.textContent = '';
    try {
      const rec = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/arth-recommend`, {
        method: 'POST',
        body: JSON.stringify({
          priority: _priority || 'quality',
          constraints: document.getElementById('arth-constraints').value.trim(),
        }),
      });
      // The recommendation IS the selection once it comes back — the user
      // still confirms it, and can ask again with different priorities.
      _recommendation = rec;
      _model = rec.id;
      _models = [rec];
      renderRecommendation(rec);
      refreshConfirm();
      hint.textContent = 'Not what you expected? Change what matters and ask again.';
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = _recommendation ? 'Ask again' : 'Ask Arth to choose';
    }
  });

  // Chat with Arth can propose a model class; accepting it only moves the
  // selection here, exactly as clicking the card would. Committing it stays
  // behind Confirm & Continue so there is still one way to make the choice.
  document.addEventListener('arth:choose', (e) => {
    const pref = e.detail?.preference;
    if (OPTIONS.some(o => o.id === pref)) choose(pref);
  });

  document.getElementById('arth-confirm-btn').addEventListener('click', async () => {
    if (!_chosen || !_blueprintId) return;
    const btn = document.getElementById('arth-confirm-btn');
    const hint = document.getElementById('arth-hint');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const saved = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/arth-selection`, {
        method: 'PATCH',
        body: JSON.stringify({
          preference: _chosen,
          modelId: _model,
          priority: _chosen === 'auto' ? (_priority || 'quality') : '',
          rationale: _recommendation?.why || '',
        }),
      });
      btn.textContent = '✓ Model Selected';
      hint.textContent = `Saved: ${saved.selection?.displayName || _model}.`;
      document.getElementById('arth-next-stage').style.display = 'flex';
      // Forward progress, same pattern Aria uses to reach this screen.
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('eame:show', { detail: { blueprint: _bp } }));
      }, 900);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Confirm & Continue';
      showError(err.message);
    }
  });
}

document.addEventListener('arth:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  _bp = bp;
  _blueprintId = bp._id;
  wire();

  renderBreadcrumb(bp);
  renderInfra(bp);

  // Re-entering the screen should show the decision already on record, down
  // to which model — not just which class it belonged to.
  const prev = bp.arthSelection || {};
  _priority = prev.priority || null;
  _model = null;
  _models = [];
  _recommendation = null;
  _chosen = null;
  renderOptions();
  refreshConfirm();

  if (prev.preference) {
    choose(prev.preference);
    if (prev.modelId) {
      _model = prev.modelId;
      if (prev.preference === 'auto') {
        // Nothing to re-fetch: what was saved is the recommendation.
        _recommendation = { ...prev, id: prev.modelId, why: prev.rationale };
        _models = [_recommendation];
        renderRecommendation(_recommendation);
      }
      refreshConfirm();
      document.getElementById('arth-hint').textContent =
        `Previously selected: ${prev.displayName || prev.modelId}`;
    }
  }
});
