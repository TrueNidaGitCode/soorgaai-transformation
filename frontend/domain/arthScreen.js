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
let _chosen = null;
const _resolved = {};   // preference -> the server's resolved pick

// The three classes the catalog actually distinguishes. Descriptions state
// the trade honestly rather than selling each one.
const OPTIONS = [
  { id: 'frontier',    title: 'Frontier',    blurb: 'Best quality, per-call cloud pricing. Data leaves your environment.' },
  { id: 'open-weight', title: 'Open Weight', blurb: 'Runs on your own hardware. Fixed cost, full data control, some quality traded away.' },
  { id: 'auto',        title: 'Auto',        blurb: 'Uses the resilient provider chain rather than pinning one model, so an outage never blocks a request.' },
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
      <span class="arth-option__pick" data-pick="${o.id}"></span>
    </button>
  `).join('');

  // Fill in each option's resolved model name as it arrives, so the card
  // names the actual model rather than only the category.
  OPTIONS.forEach(o => {
    const el = wrap.querySelector(`[data-pick="${o.id}"]`);
    if (el && _resolved[o.id]) el.textContent = _resolved[o.id].displayName;
  });
}

function renderDetail(pick) {
  const box = document.getElementById('arth-detail');
  if (!pick) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  document.getElementById('arth-detail-name').textContent = pick.displayName;
  document.getElementById('arth-detail-tags').innerHTML = [
    ['Quality', pick.quality], ['Cost', pick.cost], ['Performance', pick.performance],
  ].map(([k, v]) => `<span class="arth-tag"><span class="arth-tag__k">${k}</span>${esc(v)}</span>`).join('');
  document.getElementById('arth-detail-rationale').textContent = pick.rationale;
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
      (b.infraItems || []).forEach(i => rows.push({
        label: i.label || i.name || i.component || '',
        value: i.value || i.detail || i.description || '',
      }));
      (b.techStack || []).forEach(t => rows.push({
        label: t.layer || t.category || t.name || '',
        value: t.technology || t.value || t.tools || t.description || '',
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
    body.innerHTML = `<tr><td colspan="2" class="ks-card-body">Technology &amp; Infrastructure hasn't finished generating yet.</td></tr>`;
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

async function loadResolved() {
  // One call per class so each card can name its actual model. Cheap and
  // deterministic — selectModel is rule-based, not an LLM call.
  await Promise.all(OPTIONS.map(async o => {
    try {
      _resolved[o.id] = await api(`/defect-matching/model-selection?preference=${o.id}`);
    } catch (err) {
      showError(err.message);
    }
  }));
  renderOptions();
  if (_chosen && _resolved[_chosen]) renderDetail(_resolved[_chosen]);
}

function choose(pref) {
  _chosen = pref;
  renderOptions();
  renderDetail(_resolved[pref]);
  const btn = document.getElementById('arth-confirm-btn');
  btn.disabled = false;
  document.getElementById('arth-hint').textContent =
    _resolved[pref] ? `Selected: ${_resolved[pref].displayName}` : '';
}

let _wired = false;

function wire() {
  if (_wired) return;
  _wired = true;

  document.getElementById('arth-options').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref]');
    if (b) choose(b.dataset.pref);
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
      await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/arth-selection`, {
        method: 'PATCH',
        body: JSON.stringify({ preference: _chosen }),
      });
      btn.textContent = '✓ Model Selected';
      hint.textContent = `Saved: ${_resolved[_chosen]?.displayName || _chosen}.`;
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

  // Re-entering the screen should show the decision already on record.
  _chosen = bp.arthSelection?.preference || null;
  renderOptions();
  if (_chosen) {
    document.getElementById('arth-confirm-btn').disabled = false;
    document.getElementById('arth-hint').textContent = `Previously selected: ${bp.arthSelection.displayName}`;
  }

  loadResolved();
});
