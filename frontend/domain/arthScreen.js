/**
 * Svarg — Aria screen (model & infrastructure)
 *
 * Reached from Cob once an opportunity is approved (dispatches 'arth:show').
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

import { findAiUseCasesPrioritizationSection } from './blueprintSections.js';

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
let _advice = [];            // what is recommended but cannot be run yet
let _recommendation = null;  // Aria's pick, kept so its reasoning is saved
let _hosting = null;         // svarg | self — where the application runs
let _env = null;             // the prepared environment, once there is one
let _savedModelId = null;    // what is actually persisted, vs what is merely picked

// The three classes the catalog actually distinguishes. Descriptions state
// the trade honestly rather than selling each one.
//
// Open Weight is shown but not selectable. Hiding it would be the easier
// change and the worse one: running on your own hardware is the reason a
// regulated buyer looks at this screen at all, and a customer who cannot see
// the option concludes the platform does not have it. Shown-and-locked says
// what is true — it exists, and it is not on your plan yet.
const OPTIONS = [
  { id: 'frontier',    title: 'Frontier',    blurb: 'Best quality, per-call cloud pricing. Data leaves your environment.' },
  { id: 'open-weight', title: 'Open Weight', blurb: 'Runs on your own hardware. Fixed cost, full data control, some quality traded away.',
    locked: 'Available to large enterprise customers once a contract is in place. Talk to us and we will enable it for your account.' },
  { id: 'auto',        title: 'Auto',        blurb: 'Aria reads this use case and picks the model that fits it, weighing cost, quality and performance.' },
];

const optionById = (id) => OPTIONS.find(o => o.id === id) || null;


// Where the application itself runs — a separate question from which model
// answers its requests. Svarg's environment is the one Aria can prepare
// today; preparing a customer's own target environment comes later, the way
// GPUNet does for open-weight models.
const HOSTING = [
  { id: 'svarg', title: 'Svarg environment',
    blurb: 'We prepare and run it: a dedicated container, database and model gateway. Nothing to install.' },
  { id: 'self',  title: 'Your own environment',
    blurb: 'You run it on your own infrastructure. Eame includes the deployment files and Svarg prepares nothing.' },
];

// The Target Architecture table describes what the customer would build in
// their OWN environment. A startup on Svarg hosting never builds any of it,
// so it is off by default. The rendering below is unchanged and still runs,
// so flipping this to true is the only step needed to bring it back — and the
// obvious rule when it returns is to show it only for self-hosted customers.
const SHOW_TARGET_ARCHITECTURE = false;

function showError(msg) {
  const el = document.getElementById('arth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

/**
 * The use case, which is now the summary card's heading rather than a
 * breadcrumb above the controls.
 *
 * The old #arth-breadcrumb wrapper is gone; the lookup is kept optional so
 * this works either way rather than throwing on a screen that no longer has
 * the element it used to hide.
 */
function renderBreadcrumb(bp) {
  const crumb = document.getElementById('arth-breadcrumb');
  const nameEl = document.getElementById('arth-recap-name');
  const section = findAiUseCasesPrioritizationSection(bp);
  const brief = section?.brief || {};
  const all = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
  const rec = brief.recommendedStartingPoint || '';
  const label = all.find(n => n && rec.includes(n)) || rec;

  if (!label) {
    if (crumb) crumb.style.display = 'none';
    // Never leave the card headless: without an approved use case the
    // application is still being built for the objective they typed.
    if (nameEl) nameEl.textContent = String(bp?.businessObjective || '').trim() || 'Your application';
    return;
  }
  if (crumb) crumb.style.display = '';
  if (nameEl) nameEl.textContent = label;
}

function renderOptions() {
  const wrap = document.getElementById('arth-options');
  wrap.innerHTML = OPTIONS.map(o => {
    // A locked option stays focusable and keeps its click handler: it has to
    // be able to explain itself. A disabled button swallows the click, and the
    // customer is left with a greyed card and no reason for it.
    const cls = ['arth-option',
      _chosen === o.id ? 'arth-option--on' : '',
      o.locked ? 'arth-option--locked' : ''].filter(Boolean).join(' ');
    return `
    <button type="button" class="${cls}" data-pref="${o.id}"${o.locked ? ' aria-disabled="true"' : ''}>
      <span class="arth-option__title">${esc(o.title)}${
        o.locked ? '<span class="arth-option__lock">Enterprise</span>' : ''}</span>
      <span class="arth-option__blurb">${esc(o.blurb)}</span>
    </button>`;
  }).join('');
}

/** Why a locked option cannot be picked, shown under the row rather than in an
 *  alert, so it stays on screen while the customer reads it. */
function showLockedNote(message) {
  const el = document.getElementById('arth-locked-note');
  if (!el) return;
  el.textContent = message || '';
  el.style.display = message ? '' : 'none';
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

const money = (v) => (v === null || v === undefined ? '—' : '$' + Number(v).toFixed(2));

/** One card. Advice cards carry no data-model, so the click handler cannot
 *  select them — the thing that makes them advice is enforced, not styled. */
function modelCard(m, advice) {
  return `
    <button type="button" class="arth-model${advice ? ' arth-model--advice' : ''}${
      !advice && _model === m.id ? ' arth-model--on' : ''}"${advice ? '' : ` data-model="${esc(m.id)}"`}>
      <span class="arth-model__head">
        <span class="arth-model__name">${esc(m.displayName)}${
          advice ? '<span class="arth-model__advice">Advice only</span>' : ''}</span>
        <span class="arth-model__vendor">${esc(m.vendor)}</span>
      </span>
      ${m.focusScore != null ? `<span class="arth-model__tags">
        <span class="arth-tag"><span class="arth-tag__k">Score</span>${m.focusScore}</span>
        <span class="arth-tag"><span class="arth-tag__k">Cost / task</span>${money(m.cost)}</span>
      </span>` : `<span class="arth-model__tags">${tags(m)}</span>`}
      ${m.strengths ? `<span class="arth-model__strengths">${esc(m.strengths)}</span>` : ''}
      ${computeLine(m)}
      ${m.license ? `<span class="arth-model__license">${esc(m.license)}</span>` : ''}
    </button>`;
}

/**
 * The shortlist, in two halves, because the honest answer has two halves.
 *
 * The benchmark tables say which model is worth wanting for this kind of work
 * and what it would cost. They do not say which endpoint serves it, and none of
 * their rows carries a provider — so they are advice, and shown as advice.
 * Presenting them as choices is what produced a picker whose every option
 * failed the moment it was confirmed.
 *
 * Underneath is what can actually be run today. Fewer models, graded more
 * coarsely, and real.
 *
 * Score and cost, and nothing else. An earlier version printed Svarg's own
 * derivation above this — which benchmark it ranked on, why it picked that
 * band, what the band measures — three paragraphs of internal reasoning shown
 * to the customer as if it were product copy. How the shortlist was arrived at
 * is Svarg's business; what is on it is the customer's.
 */
function renderModels(models, runnable) {
  const wrap = document.getElementById('arth-models');
  const advice = (models || []).filter(m => m.adviceOnly);
  const pickable = (runnable && runnable.length ? runnable : (models || []).filter(m => !m.adviceOnly));

  if (!advice.length && !pickable.length) {
    wrap.innerHTML = `<p class="ks-card-body">No models of this class in the catalog.</p>`;
    return;
  }

  // Headings only when there is something to tell apart. With every
  // recommendation runnable — which is the normal case now that catalog rows
  // carry endpoints — two group labels over one group is furniture.
  wrap.innerHTML = advice.length
    ? `<p class="arth-group">Recommended for this use case</p>
       <p class="arth-group__note">Benchmark guidance. Svarg does not run these yet.</p>
       ${advice.map(m => modelCard(m, true)).join('')}
       ${pickable.length ? `<p class="arth-group">Available to run</p>
         ${pickable.map(m => modelCard(m, false)).join('')}` : ''}`
    : pickable.map(m => modelCard(m, false)).join('');
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
  const section = document.getElementById('arth-target-arch');
  if (section) section.style.display = SHOW_TARGET_ARCHITECTURE ? '' : 'none';
  if (!SHOW_TARGET_ARCHITECTURE) return;

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

  noteText.textContent = 'The architecture this blueprint recommends for your own environment — taken from its Technology & Infrastructure domain, not a generic stack. Separate from the Svarg environment above.';
  note.style.display = '';
}

// ── Where the application runs ──────────────────────────────────────────────

function renderHostingOptions() {
  document.getElementById('arth-hosting').innerHTML = HOSTING.map(h => `
    <button type="button" class="arth-option${_hosting === h.id ? ' arth-option--on' : ''}" data-hosting="${h.id}">
      <span class="arth-option__title">${esc(h.title)}</span>
      <span class="arth-option__blurb">${esc(h.blurb)}</span>
    </button>
  `).join('');
}

function fact(label, value) {
  return value ? `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>` : '';
}

/**
 * What a project manager needs to know about the environment. Deliberately
 * complete rather than minimal — this is what they are accepting, and what
 * they will be asked about internally.
 */
function renderPrepared(dep) {
  _env = dep;
  // The summary reads from _env, so it repaints wherever _env changes.
  renderEnvironment();
  const prep  = document.getElementById('arth-prep');
  const offer = document.getElementById('arth-prep-offer');
  const ready = document.getElementById('arth-prep-ready');

  if (!_hosting) { prep.style.display = 'none'; return; }
  prep.style.display = '';

  const done = dep && ['prepared', 'attaching', 'live', 'suspended'].includes(dep.status);
  offer.style.display = done ? 'none' : '';
  ready.style.display = done ? '' : 'none';

  // The environment is built around the model and hosting choice — the
  // gateway is wired to that model, the container sized for it. Leaving the
  // pickers live afterwards invited a change that the running environment
  // would silently not reflect.
  freezeSelection(done);

  if (!done) {
    const svarg = _hosting === 'svarg';
    document.getElementById('arth-prep-title').textContent = svarg
      ? 'Prepare the Svarg environment'
      : 'Nothing for Svarg to prepare';
    document.getElementById('arth-prep-body').textContent = svarg
      ? 'Creates a dedicated container, a database with vector search, and a model gateway wired to the model above. The application itself is attached later, once Eame has built it.'
      : 'You are running this yourself. Recording the choice so Eame ships the deployment files with the project.';
    document.getElementById('arth-prep-btn').textContent = svarg ? 'Prepare' : 'Confirm';
    return;
  }

  const model = dep.model?.displayName || '';
  const cap   = dep.limits?.maxCostUsd || 0;
  const spent = dep.usage?.costUsd || 0;

  document.getElementById('arth-prep-state').textContent =
    dep.hosting === 'self' ? 'Running in your environment' : 'Environment ready';
  document.getElementById('arth-prep-name').textContent =
    dep.hosting === 'self' ? 'Your own infrastructure' : (dep.environmentName || 'Svarg environment');

  const facts = dep.hosting === 'self'
    ? [
        fact('Runs on', 'Your own infrastructure'),
        fact('Model', model ? `${model} — you supply the API key` : ''),
        fact('Svarg provides', 'The application source and its deployment files'),
        fact('You provide', 'Hosting, database, and the model API key'),
      ]
    : [
        fact('Runs on', `Svarg${dep.region ? ` · ${dep.region}` : ''}`),
        fact('Environment', dep.environmentName),
        fact('Database', dep.dbName ? `${dep.dbName} — dedicated, with vector search` : ''),
        fact('Model', model ? `${model} — reached through Svarg's gateway` : ''),
        fact('Spend limit', cap ? `$${cap.toFixed(2)} per month` : 'No limit set'),
        fact('Used so far', `$${spent.toFixed(2)} · ${(dep.usage?.requests || 0).toLocaleString()} requests`),
        fact('Application', dep.appAttached
          ? (dep.url || 'Attached')
          : 'Not attached yet — Eame builds it, then it is deployed here'),
        fact('Prepared', dep.preparedAt ? new Date(dep.preparedAt).toLocaleString() : ''),
      ];

  document.getElementById('arth-prep-facts').innerHTML = facts.filter(Boolean).join('');
}

async function loadEnvironment() {
  if (!_blueprintId) return;
  try {
    const { deployment } = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/deployment`);
    if (deployment?.hosting) _hosting = deployment.hosting;
    renderHostingOptions();
    renderPrepared(deployment);
  } catch {
    renderPrepared(null);
  }
}

/**
 * Persist the model chosen on screen. Preparing an environment needs a saved
 * selection, and until this existed the only way to save one was Confirm &
 * Continue — which sits below this section and leaves for Eame, so there was
 * no way to save without abandoning the screen that needed it.
 */
async function saveModelSelection() {
  if (_savedModelId === _model) return;
  const saved = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/arth-selection`, {
    method: 'PATCH',
    body: JSON.stringify({
      preference: _chosen,
      modelId: _model,
      priority: '',
      rationale: _recommendation?.why || '',
    }),
  });
  _savedModelId = _model;
  document.getElementById('arth-hint').textContent =
    `Saved: ${saved.selection?.displayName || _model}.`;
}

async function prepareEnvironment() {
  // Caught here rather than as a 400, so the reason names the step that
  // fixes it instead of arriving as a bare failure from the server.
  if (!_model) {
    showError('Choose a model first — the environment is prepared around it.');
    return;
  }

  const btn = document.getElementById('arth-prep-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = _hosting === 'svarg' ? 'Preparing…' : 'Saving…';
  document.getElementById('arth-error').style.display = 'none';
  try {
    await saveModelSelection();
    const r = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/infrastructure`, {
      method: 'POST',
      body: JSON.stringify({ hosting: _hosting }),
    });
    renderPrepared(r.deployment);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function removeEnvironment() {
  if (!confirm('Remove this environment? Its container and database are deleted and the gateway token stops working. Your blueprint and repository are untouched.')) return;
  const btn = document.getElementById('arth-prep-remove');
  btn.disabled = true;
  btn.textContent = 'Removing…';
  try {
    await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/deployment`, { method: 'DELETE' });
    renderPrepared(null);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Remove';
  }
}


// ── The environment summary ───────────────────────────────────────────────
//
// What the screen leads with. Every value is read from the deployment record
// or the selection on file — nothing is written into the markup, because a
// tile that hard-codes "Secure" keeps saying it after the thing it describes
// has stopped being true.

const TILE_ICONS = {
  cloud:  '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  db:     '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
  model:  '<path d="M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V6a3 3 0 0 0-3-3z"/>',
  spend:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2.5-5 1.5-5 4a2.5 2.5 0 0 0 5 0"/>',
  usage:  '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};

function tile({ icon, label, value, tag, over = false }) {
  return `
    <div class="ae-tile${over ? ' ae-tile--over' : ''}">
      <span class="ae-tile__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
             stroke-linecap="round" stroke-linejoin="round">${TILE_ICONS[icon] || ''}</svg>
      </span>
      <span class="ae-tile__label">${esc(label)}</span>
      <span class="ae-tile__value">${esc(value)}</span>
      ${tag ? `<span class="ae-tile__tag">${esc(tag)}</span>` : ''}
    </div>`;
}

/** Distinct from `money` above, which is for model pricing and always shows
 *  two decimals. A spend limit reads better as "$2 / month" than "$2.00". */
const usd = (v) => '$' + (Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace(/\.00$/, '');

/**
 * Paint the hero and the five tiles.
 *
 * The headline is the part worth being careful about. It claims a ready
 * environment only when one has actually been prepared; otherwise it says
 * what has been chosen and leaves the claim unmade. A screen that announces
 * an environment the customer does not have is the single mistake here that
 * would cost trust rather than a click.
 */
function renderEnvironment() {
  const tiles = document.getElementById('arth-tiles');
  if (!tiles) return;

  const prepared = _env?.status && _env.status !== 'destroyed' && !!_env?.preparedAt;
  const picked   = _models.find(m => m.id === _model) || null;
  const modelName = picked?.displayName || _env?.model?.displayName || _bp?.arthSelection?.displayName || '';
  const hosting  = _hosting || _env?.hosting || '';
  const selfHosted = hosting === 'self';

  const capUsd  = Number(_env?.limits?.maxCostUsd) || 0;
  const costUsd = Number(_env?.usage?.costUsd) || 0;
  const requests = Number(_env?.usage?.requests) || 0;
  const over = capUsd > 0 && costUsd >= capUsd;

  tiles.innerHTML = [
    tile({
      icon: 'cloud', label: 'Runs on',
      value: selfHosted ? 'Your own environment' : 'Svarg Environment',
      tag: selfHosted ? 'Self-managed' : 'Managed',
    }),
    tile({
      icon: 'db', label: 'Database',
      // Only true of an environment Svarg prepared; a customer running it
      // themselves brings their own, and we should not describe theirs.
      value: selfHosted ? 'Yours to provide' : 'Dedicated + Vector Search',
      tag: selfHosted ? 'Your control' : 'Secure',
    }),
    tile({
      icon: 'model', label: 'AI Model',
      value: modelName || 'Not chosen yet',
      tag: modelName ? (_chosen === 'auto' ? 'Optimal' : 'Your choice') : '',
    }),
    tile({
      icon: 'spend', label: 'Spend Limit',
      value: capUsd > 0 ? `${usd(capUsd)} / month` : 'No limit set',
      tag: capUsd > 0 ? 'Cost Controlled' : '',
    }),
    tile({
      icon: 'usage', label: 'Used So Far',
      value: `${usd(costUsd)} · ${requests} request${requests === 1 ? '' : 's'}`,
      tag: over ? 'Limit reached' : 'Within Limit',
      over,
    }),
  ].join('');

  const mark  = document.getElementById('arth-hero-mark');
  const pill  = document.getElementById('arth-hero-pill');
  const title = document.getElementById('arth-hero-title');
  const sub   = document.getElementById('arth-hero-sub');
  const state = document.getElementById('arth-card-state');
  const stateText = document.getElementById('arth-card-state-text');

  if (mark)  mark.classList.toggle('ae-hero__mark--pending', !prepared);
  if (pill)  pill.classList.toggle('ae-pill--pending', !prepared);
  if (state) state.classList.toggle('ae-state--pending', !prepared);

  if (prepared) {
    if (pill)  pill.textContent = 'Environment ready';
    if (title) title.textContent = 'Your environment is ready!';
    if (sub)   sub.textContent = 'Aria has prepared everything required for this use case.';
    if (stateText) stateText.textContent = 'Ready';
  } else if (modelName) {
    if (pill)  pill.textContent = 'Ready to prepare';
    if (title) title.textContent = 'Your environment is ready to build.';
    if (sub)   sub.textContent = selfHosted
      ? 'Aria has chosen what this runs on. You are hosting it yourself, so there is nothing for us to prepare.'
      : 'Aria has chosen the model and sized the infrastructure. Prepare it under technical details, or continue.';
    if (stateText) stateText.textContent = selfHosted ? 'Self-hosted' : 'Not prepared';
  } else {
    if (pill)  pill.textContent = 'Choosing';
    if (title) title.textContent = 'Aria is choosing what this runs on.';
    if (sub)   sub.textContent = 'One moment — reading the use case against the model catalog.';
    if (stateText) stateText.textContent = 'Working';
  }
}

// True once the environment exists, after which the model and hosting
// choices are settled and the stage button becomes plain navigation.
let _frozen = false;

/**
 * Lock every control that feeds the environment's shape.
 *
 * Buttons get `disabled`; the whole region also gets a class so the cards
 * read as settled rather than merely unresponsive — a card that looks
 * clickable and silently does nothing is worse than one that looks spent.
 */
function freezeSelection(on) {
  _frozen = !!on;
  const regions = ['arth-options', 'arth-picker', 'arth-hosting']
    .map(id => document.getElementById(id)).filter(Boolean);

  for (const region of regions) {
    region.classList.toggle('arth-frozen', _frozen);
    region.querySelectorAll('button, input, select').forEach(el => { el.disabled = _frozen; });
  }
  refreshConfirm();
}

// Only a specific model counts as a decision. Picking a class narrows the
// question; it does not answer it.
function refreshConfirm() {
  renderEnvironment();
  const btn  = document.getElementById('arth-confirm-btn');
  const hint = document.getElementById('arth-hint');
  if (!btn || !hint) return;

  // Frozen: the decision is made and the environment is built on it, so the
  // one control left is the move to Arth.
  if (_frozen) {
    btn.disabled = false;
    btn.textContent = 'Move to Arth →';
    btn.dataset.goto = 'aria';
    const picked = _models.find(m => m.id === _model);
    const name = picked?.displayName || _env?.model?.displayName || '';
    hint.textContent = name
      ? `${name} — locked in, and the environment is built around it.`
      : 'Environment ready — the model and infrastructure are locked in.';
    return;
  }

  delete btn.dataset.goto;
  const picked = _models.find(m => m.id === _model);
  btn.disabled = !_model;
  btn.textContent = 'Confirm & Continue';
  hint.textContent = picked ? `Selected: ${picked.displayName}`
    : _chosen ? 'Choose a model to continue'
    : 'Choose a model class to continue';
}

/**
 * The models on offer: from the catalog, through the band the use case needs.
 *
 * Five recommendations for Frontier, one for Auto. Both are advice: the
 * benchmark tables have no provider behind them, so nothing on that list can be
 * run. The runnable models come back alongside, and those are what is
 * selectable.
 *
 * Open Weight still reads the advisory catalog, which carries the compute and
 * licence figures the model catalog has no equivalent for. It is locked, so
 * that path only runs if it is ever unlocked.
 */
/** The in-flight catalog load, so arrival can wait for it. choose() starts
 *  this from two different branches; neither returns the promise, and the
 *  show handler needs it to know when the model tile has a real name. */
let _modelsLoading = Promise.resolve();

async function loadModels() {
  const p = loadModelsInner();
  _modelsLoading = p.catch(() => {});
  return p;
}

async function loadModelsInner() {
  const wrap = document.getElementById('arth-models');
  wrap.innerHTML = `<p class="ks-card-body">Loading models…</p>`;
  try {
    if (_chosen === 'open-weight') {
      const q = document.getElementById('arth-quant').value;
      const data = await api(`/strategy-canvas/arth/models?type=${_chosen}&quantization=${q}`);
      _models = data.models || [];
      renderModels(_models, []);
      return;
    }

    const auto = _chosen === 'auto';
    const data = await api(
      `/strategy-canvas/transformation-blueprint/${_blueprintId}/recommend-models`,
      { method: 'POST', body: JSON.stringify({ limit: auto ? 1 : 5 }) });

    // modelId is the catalog's key; this screen has always keyed on id, and so
    // has everything it saves. Renaming here keeps that one name throughout.
    const advice = (data.picks || []).map(m => ({ ...m, id: m.modelId }));
    const runnable = data.runnable || [];

    // _models is what a selection is looked up in, so it holds only what can
    // actually be selected. Advice that leaked into it would let the confirm
    // hint name a model the customer was never able to choose.
    _models = runnable;
    _advice = advice;
    _recommendation = auto ? (advice[0] || null) : null;

    // Auto decides, and must decide on something runnable — the server works
    // out which, from the same band the advice came from. Leaving it
    // unselected would make the customer confirm a choice they were just told
    // they did not have to make.
    if (auto) _model = data.autoPick || (runnable[0] || {}).id || null;

    renderModels(advice, runnable);
    refreshConfirm();
  } catch (err) {
    wrap.innerHTML = '';
    showError(err.message);
  }
}

function choose(pref, { restoring = false } = {}) {
  const opt = optionById(pref);

  // Restoring is not choosing. A blueprint that recorded Open Weight before it
  // was locked keeps showing it — the alternative is a screen that silently
  // disagrees with the decision on file.
  if (opt?.locked && !restoring) {
    showLockedNote(opt.locked);
    return false;
  }
  showLockedNote(opt?.locked && restoring ? opt.locked : '');

  if (_chosen !== pref) { _model = null; _models = []; }
  _chosen = pref;
  renderOptions();

  // One picker for all three classes. Auto is not a separate flow any more —
  // it is the same shortlist, cut to its first row.
  document.getElementById('arth-picker').style.display = '';
  document.getElementById('arth-picker-label').textContent =
    pref === 'auto'       ? 'Aria chose this'
    : pref === 'frontier' ? 'Choose a frontier model'
    : 'Choose an open-weight model';

  // Precision only changes anything for models you host yourself.
  document.getElementById('arth-quant-wrap').style.display = pref === 'open-weight' ? '' : 'none';
  loadModels();
  refreshConfirm();
  return true;
}

let _wired = false;

function wire() {
  if (_wired) return;
  _wired = true;

  // Choosing did not go away, it moved. What opens here is the whole original
  // screen — model class, picker, hosting, target architecture — Open Weight
  // and self-hosting included, because this is still the only place a
  // regulated buyer can see that we have them.
  const toggle = document.getElementById('arth-details-toggle');
  const details = document.getElementById('arth-details');
  if (toggle && details) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      details.hidden = open;
      const label = toggle.querySelector('span:last-child');
      if (label) label.textContent = open ? 'View technical details' : 'Hide technical details';
      if (!open) details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  document.getElementById('arth-options').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref]');
    if (b) choose(b.dataset.pref);
  });

  document.getElementById('arth-models').addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    _model = b.dataset.model;
    // Re-rendered with both halves, or the advice group would vanish the
    // moment anything was selected.
    renderModels(_advice, _models);
    refreshConfirm();
  });

  document.getElementById('arth-quant').addEventListener('change', () => {
    if (_chosen === 'open-weight') loadModels();
  });

  document.getElementById('arth-hosting').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hosting]');
    if (!b) return;
    _hosting = b.dataset.hosting;
    renderHostingOptions();
    renderPrepared(_env);
  });
  document.getElementById('arth-prep-btn').addEventListener('click', prepareEnvironment);
  document.getElementById('arth-prep-remove').addEventListener('click', removeEnvironment);


  // Chat with Aria can propose a model class; accepting it only moves the
  // selection here, exactly as clicking the card would. Committing it stays
  // behind Confirm & Continue so there is still one way to make the choice.
  document.addEventListener('arth:choose', (e) => {
    const pref = e.detail?.preference;
    if (!optionById(pref)) return;
    // dispatchEvent is synchronous, so the caller can read the outcome back off
    // the detail — the chat needs it to avoid reporting "Selected" for a choice
    // the screen refused.
    if (!choose(pref)) e.detail.rejected = optionById(pref).locked;
  });

  document.getElementById('arth-confirm-btn').addEventListener('click', async () => {
    // Frozen, the button is pure navigation and carries data-goto — the
    // delegated stage-nav handler owns the click. Saving again here would
    // re-write a selection the built environment is already based on.
    if (_frozen) return;
    if (!_chosen || !_blueprintId) return;
    const btn = document.getElementById('arth-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      // Force a write even when Prepare already saved it, so Confirm is
      // never a no-op that looks like one.
      _savedModelId = null;
      await saveModelSelection();
      btn.textContent = '✓ Model Selected';
      document.getElementById('arth-next-stage').style.display = 'flex';
      // Forward progress, same pattern Cob uses to reach this screen.
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
  _model = null;
  _models = [];
  _recommendation = null;
  _chosen = null;
  _savedModelId = prev.modelId || null;
  renderOptions();
  refreshConfirm();

  if (prev.preference) {
    choose(prev.preference, { restoring: true });
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
  } else {
    // Nothing on record, so Aria decides rather than presenting a form. This
    // costs no model call: 'auto' posts to recommend-models, which reads the
    // catalog and ranks it with recommendModels() — rule-based server-side.
    // The LLM path is arth-recommend, and nothing here touches it.
    //
    // The decision is not persisted here. Saving is what Confirm & Continue
    // does, and writing a selection nobody looked at would make an untouched
    // screen indistinguishable from a considered one.
    choose('auto');
  }

  // An environment prepared in an earlier session should show as prepared,
  // not offer to prepare a second one.
  _hosting = null;
  _env = null;
  renderHostingOptions();
  renderPrepared(null);

  // Ready once the deployment record and the model catalog are both in: the
  // tiles read from both, and a screen shown before either arrives says
  // "No limit set" and "Not chosen yet" for a round trip, then the truth.
  // Settled, not all -- a catalog that fails still leaves an honest screen.
  Promise.allSettled([loadEnvironment(), _modelsLoading]).then(() => {
    document.dispatchEvent(new CustomEvent('stage:ready', { detail: { stage: 'arth' } }));
  });
});
