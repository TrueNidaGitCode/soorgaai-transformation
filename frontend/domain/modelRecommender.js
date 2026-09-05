/**
 * Svarg — Arth's model recommendation (screen)
 *
 * Three models for this use case, from the catalog an admin maintains, ranked
 * on the score category that fits the application and on what they cost.
 *
 * Deliberately small. "Which is the best model" has no answer; "which of these
 * gives acceptable quality at the lowest cost" does, and answering it needs a
 * score, a price and a rule — not a control panel.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

const esc = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Column heading per score category, so the table names what it ranked on. */
/** What each category actually measures, shown under the table so a score is
 *  not a bare number someone has to take on faith. */
const FOCUS_ABOUT = {
  strategyOps: 'Domain knowledge across business and management, accounting, corporate and markets, plus strategy and planning, customer support and records management.',
};

const FOCUS_LABEL = {
  strategyOps:             'Strategy & Ops',
  intelligence:            'Intelligence',
  agentic:                 'Agentic',
  coding:                  'Coding',
  math:                    'Math',
  instructionFollowing:    'Instruction following',
  longContext:             'Long context',
  documentCreation:        'Document creation',
  knowledge:               'Knowledge',
  hallucinationResistance: 'Low hallucination',
};

let _blueprintId = null;

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const money = (v) => (v === null || v === undefined ? '—' : (v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`));

function render(state) {
  const el = document.getElementById('mr-result');
  const note = document.getElementById('mr-derived');
  if (!el) return;

  const { picks = [], rule, excluded = [], catalogSize = 0, focus = 'intelligence', derived } = state;
  if (note) note.textContent = (derived?.reasons || []).join(' ');

  if (!picks.length) {
    // Three different problems that all look like an empty table, so they are
    // told apart: nothing in the catalog, nothing scored on this category, or
    // nothing that fits.
    const unscored = excluded.filter(e => /score published/.test(e.reason)).length;
    el.innerHTML = `<p class="mr__empty">${
      !catalogSize ? 'The model catalog is empty.'
        : unscored ? `No model has a ${esc(FOCUS_LABEL[focus] || focus)} score yet. Add scores in the admin model catalog.`
        : 'No model in the catalog fits this use case.'
    }</p>`;
    return;
  }

  el.innerHTML = `
    <p class="mr__rule">Ranked on <strong>${esc(FOCUS_LABEL[focus] || focus)}</strong>${
      rule === 'cheapest-clearing-band'
        ? ' — cheapest model clearing the acceptable band, not the highest score.'
        : ' and cost.'}</p>
    ${FOCUS_ABOUT[focus] ? `<p class=\"mr__about\">${esc(FOCUS_ABOUT[focus])}</p>` : ''}
    <div class="mr__table-wrap">
      <table class="mr__table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Model</th>
            <th class="mr__num">${esc(FOCUS_LABEL[focus] || focus)}</th>
            <th class="mr__num">Cost / task</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${picks.map(p => `
            <tr data-model="${esc(p.modelId)}">
              <td>${esc(p.vendor || '—')}</td>
              <td>
                <span class="mr__model">${esc(p.displayName)}</span>
                <span class="mr__tags">${p.type === 'open-weight' ? 'open weight' : 'frontier'}</span>
              </td>
              <td class="mr__num">${p.focusScore ?? '—'}</td>
              <td class="mr__num mr__cost">${money(p.indexCost ?? p.cost)}</td>
              <td><button type="button" class="aria-action-btn aria-action-btn--primary" data-choose>Choose</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function run() {
  const el = document.getElementById('mr-result');
  if (el) el.innerHTML = '<p class="mr__empty">Finding models for this use case…</p>';
  try {
    render(await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/recommend-models`, {
      method: 'POST',
      body: '{}',
    }));
  } catch (err) {
    if (el) el.innerHTML = `<p class="mr__empty">${esc(err.message)}</p>`;
  }
}

document.addEventListener('arth:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp?._id) return;
  _blueprintId = bp._id;

  const root = document.getElementById('arth-recommender');
  if (root && !root.dataset.wired) {
    root.dataset.wired = '1';
    root.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-choose]');
      if (!btn) return;
      const modelId = btn.closest('[data-model]')?.dataset.model;
      document.dispatchEvent(new CustomEvent('arth:model-chosen', { detail: { modelId } }));
      btn.textContent = 'Chosen ✓';
    });
  }
  run();
});
