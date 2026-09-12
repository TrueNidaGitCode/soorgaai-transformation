/**
 * Svarg — Eame screen (build the application)
 *
 * Reached from Arth (dispatches 'eame:show').
 *
 * This stage shows the application that will be built — every file and what
 * each is for. The list comes from the same builder the push uses
 * (GET /delivery/manifest), so what is shown here cannot
 * drift from what Yusu later delivers.
 *
 * Building and pushing moved to Yusu: Eame is the application, Yusu ships it.
 */

import { findAiUseCasesPrioritizationSection } from './blueprintSections.js';
import { press } from './autopilot.js';

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


function showError(msg) {
  const el = document.getElementById('eame-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function renderBreadcrumb(bp) {
  const crumb = document.getElementById('eame-breadcrumb');
  const section = findAiUseCasesPrioritizationSection(bp);
  const brief = section?.brief || {};
  const all = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
  const rec = brief.recommendedStartingPoint || '';
  const label = all.find(n => n && rec.includes(n)) || rec;
  // The card this used to fill is gone from the screen. The label is still
  // resolved because the app-name fallback reads it; the DOM writes below are
  // guarded so they are no-ops without the elements.
  if (!label) { if (crumb) crumb.style.display = 'none'; return null; }
  if (crumb) crumb.style.display = '';
  const nameEl = document.getElementById('eame-recap-name');
  if (nameEl) nameEl.textContent = label;

  // The line under the name is Cob's justification for choosing it — the
  // recommended-starting-point sentence with the name itself taken out, so
  // the card does not say the same thing twice. Empty when there is nothing
  // beyond the name, rather than a placeholder pretending to be a reason.
  const descEl = document.getElementById('eame-recap-desc');
  if (descEl) {
    // Strip the lead-in and any punctuation left stranded once the name is
    // gone — "Start with X." minus X is "Start with .", which rendered as a
    // lone full stop under the heading.
    const rest = rec.replace(label, '')
      .replace(/^[\s:—–-]*(start with|begin with)?[\s:—–-]*/i, '')
      .replace(/^[\s.,;:!?—–-]+|[\s.,;:!?—–-]+$/g, '')
      .trim();
    descEl.textContent = rest.length > 3 && rest !== rec ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
    descEl.style.display = descEl.textContent ? '' : 'none';
  }
  return label;
}

// A short, honest description per file group. Anything unrecognised is
// described by its folder rather than guessed at.
function describe(path) {
  if (/^README/i.test(path)) return 'How to run and deploy the project';
  if (/JIRA/i.test(path)) return 'Jira integration and setup notes';
  if (/^src\/.*jira/i.test(path)) return 'Pulls issues from Jira';
  if (/package\.json$/.test(path)) return 'Dependencies and scripts';
  if (/\.env/.test(path)) return 'Configuration template';
  if (/^src\//.test(path)) return 'Application source';
  if (/^docs?\//i.test(path)) return 'Documentation';
  if (/^tests?\//i.test(path)) return 'Tests';
  const folder = path.includes('/') ? path.split('/')[0] : '';
  return folder ? `Part of ${folder}/` : 'Project file';
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  return (n / 1024).toFixed(1) + ' KB';
}

/**
 * Group the manifest the way a person reads a project: by directory, with
 * root files split into documentation and everything else. Order is fixed
 * rather than alphabetical, so it reads models-outward like the codebase.
 */
const DIR_ORDER = ['models', 'services', 'controllers', 'routes', 'middleware',
                   'frontend', 'config', 'utils', 'scripts', 'documentation', 'project root'];

/**
 * What each top-level directory is for, in the customer's terms.
 *
 * describe() names individual files and falls back to "Part of models/" for
 * anything it does not recognise — which, used as the description OF models/,
 * says nothing at all. These are the directories the runtime fixes (see
 * AUTHORED_DIRS and FIXED_PATHS in eameSpec.js), so their purpose is known.
 */
const DIR_PURPOSE = {
  models:          'What the application stores',
  services:        'The logic, and the calls to the model',
  controllers:     'What happens when a request arrives',
  routes:          'The endpoints the application exposes',
  middleware:      'Sign-in and request checks',
  frontend:        'The page your users open',
  config:          'Settings and environment',
  utils:           'Shared helpers',
  scripts:         'Seeding and maintenance',
  documentation:   'How to run and deploy the project',
  'project root':  'Dependencies and the entry point',
};

function describeDir(dir) {
  return DIR_PURPOSE[dir] || `Files under ${dir}/`;
}

function groupByDirectory(files) {
  const groups = new Map();
  for (const f of files) {
    const dir = f.path.includes('/')
      ? f.path.split('/')[0]
      : (/\.(md|txt)$/i.test(f.path) ? 'documentation' : 'project root');
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(f);
  }
  const known = DIR_ORDER.filter(d => groups.has(d));
  const rest = [...groups.keys()].filter(d => !DIR_ORDER.includes(d)).sort();
  return [...known, ...rest].map(dir => ({ dir, files: groups.get(dir) }));
}

/**
 * What the build actually produced. Each line is a claim about the manifest,
 * so it is checked against the manifest rather than asserted — a project
 * built without Jira really does lose its data-connection line.
 */
function buildSummary(paths) {
  const has = re => paths.some(p => re.test(p));
  return [
    { ok: paths.length > 0,                      text: 'Core application structure generated' },
    { ok: has(/llmService|embeddingService/i),   text: 'AI services integrated' },
    { ok: has(/jira|confluence/i),               text: 'Engineering data connections configured' },
    { ok: has(/^frontend\//i),                   text: 'Frontend interface built' },
    { ok: has(/authMiddleware|encryption/i),     text: 'Security and authentication setup' },
    { ok: has(/\.md$/i),                         text: 'Project documentation included' },
  ];
}

/** Read off the files that prove it, never a fixed list. */
function techStack(paths) {
  const has = re => paths.some(p => re.test(p));
  return [
    ['Node.js',       has(/package\.json$/)],
    ['Express.js',    has(/^server\.js$|^routes\//)],
    ['MongoDB',       has(/^models\//)],
    ['Jira API',      has(/jira/i)],
    ['Confluence API',has(/confluence/i)],
    ['Vanilla JS',    has(/^frontend\/.*\.js$/)],
    ['CSS',           has(/\.css$/)],
  ].filter(([, ok]) => ok).map(([name]) => name);
}

const TILE_ICONS = {
  files:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  runtime:   '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  framework: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>',
  model:     '<path d="M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V6a3 3 0 0 0-3-3z"/>',
};

function tile({ icon, label, value, tag }) {
  return `
    <div class="ae-tile">
      <span class="ae-tile__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
             stroke-linecap="round" stroke-linejoin="round">${TILE_ICONS[icon] || ''}</svg>
      </span>
      <span class="ae-tile__label">${esc(label)}</span>
      <span class="ae-tile__value">${esc(value)}</span>
      ${tag ? `<span class="ae-tile__tag">${esc(tag)}</span>` : ''}
    </div>`;
}

/**
 * The four figures the Build Summary leads with.
 *
 * Runtime and framework are read off the manifest, not asserted: a project
 * with no routes/ is not described as Express. The model is the one Aria
 * chose, from the blueprint, because that is what the delivered code calls.
 * The mockup's "Python / FastAPI / scikit-learn" is what a build LIKE this
 * might say; this says what THIS build is.
 */
function renderStats(fileCount, totalBytes, paths = []) {
  const el = document.getElementById('eame-stats');
  if (!el) return;
  const has = re => paths.some(p => re.test(p));

  const runtime   = has(/package\.json$/) ? 'Node.js' : '';
  const framework = has(/^server\.js$|^routes\//) ? 'Express' : '';
  const model     = _bp?.arthSelection?.displayName || '';

  el.innerHTML = [
    tile({ icon: 'files',     label: 'Total Files',  value: String(fileCount), tag: fmtBytes(totalBytes) }),
    tile({ icon: 'runtime',   label: 'Project Type', value: runtime   || 'Unknown', tag: runtime ? 'Full stack' : '' }),
    tile({ icon: 'framework', label: 'Framework',    value: framework || 'Unknown', tag: has(/^models\//) ? 'MongoDB' : '' }),
    tile({ icon: 'model',     label: 'Model',        value: model     || 'Not chosen', tag: model ? 'Via Svarg gateway' : '' }),
  ].join('');
}

/**
 * The six gates, in the order the verifier runs them.
 *
 * Named on screen because "building…" says nothing about whether the code was
 * merely written or actually started. A customer reading "the server booted"
 * knows something a spinner cannot tell them.
 */
const GATES = [
  ['syntax',        'Every file parses'],
  ['local-imports', 'Imports resolve inside the project'],
  ['dependencies',  'Every package is declared'],
  ['install',       'npm install succeeds'],
  ['boot',          'The server starts'],
  ['smoke',         'An endpoint answers'],
];

let _pollTimer = null;

// ── The run stage ───────────────────────────────────────────────────────────
//
// Six steps, the way Cob and Aria show theirs. The server reports a phase
// (generating, verifying) and, inside verifying, which gate it is on
// (static, install, boot, smoke); stepFromBuild turns that into the index of
// the step in progress. Reading the blueprint is done the moment generation
// starts -- the brief was assembled before the model was called.

const EAME_STEPS = [
  { title: 'Reading the blueprint',    sub: 'What to build, from the approved plan',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="m13.5 16.5 2 2"/></svg>' },
  { title: 'Writing the code',         sub: 'Models, services, routes and the chat page',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' },
  { title: 'Checking the files',       sub: 'Every file parses, every import resolves',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
  { title: 'Installing dependencies',  sub: 'npm install, in a sandbox of its own',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' },
  { title: 'Starting the server',      sub: 'Booted against a throwaway database',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>' },
  { title: 'Proving it answers',       sub: 'A real request, a real reply',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
];

/** The index of the step in progress (6 = all done), from the build's progress. */
function stepFromBuild(build) {
  if (build.status === 'passed') return EAME_STEPS.length;
  const phase = build.progress?.phase || '';
  const detail = String(build.progress?.detail || '');
  if (phase === 'generating') return 1;
  if (phase === 'verifying') {
    if (/^install/.test(detail)) return 3;
    if (/^boot/.test(detail)) return 4;
    if (/^smoke/.test(detail)) return 5;
    return 2;
  }
  return 0;
}

/** "4 min 12 sec", floored at ten seconds while work remains. */
function etaText(ms) {
  const s = Math.max(10, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} sec` : `${s} sec`;
}
function aboutText(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return `about ${m} minute${m === 1 ? '' : 's'}`;
}

// How long a build usually takes, measured from the last passed builds on the
// server, so the estimate is honest from the first second. Same endpoint as
// Cob's, which carries the build figure under `build`.
let _typicalBuildMs = null;
let _typicalAsked = false;
function askTypicalBuildTime() {
  if (_typicalAsked) return;
  _typicalAsked = true;
  fetch(`${API_BASE}/guest/generation-time`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d?.build?.typicalMs) return;
      _typicalBuildMs = d.build.typicalMs;
      const typical = document.getElementById('eame-run-typical');
      if (typical) typical.textContent = `Usually ${aboutText(_typicalBuildMs)} in total`;
      renderEameEta(_lastBuild);
    })
    .catch(() => { /* the estimate stays "Estimating…" until a pace shows */ });
}

let _lastBuild = null;
let _etaTimer = null;

function renderEameEta(build) {
  const eta = document.getElementById('eame-run-eta');
  if (!eta || !build) return;
  const reached = stepFromBuild(build);
  if (reached >= EAME_STEPS.length) { eta.textContent = 'Done'; return; }
  const startedAt = build.progress?.startedAt || build.createdAt;
  const elapsed = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
  // The typical build less what has elapsed. A repair attempt starts the
  // steps over but not the clock, so the estimate keeps shrinking honestly
  // toward "a little longer than usual" rather than resetting.
  eta.textContent = _typicalBuildMs ? etaText(_typicalBuildMs - elapsed) : 'Estimating…';
}

function renderEameRun(build) {
  _lastBuild = build;
  askTypicalBuildTime();
  const reached = stepFromBuild(build);
  const total = EAME_STEPS.length;
  const done = Math.min(reached, total);
  const share = Math.round((done / total) * 100);
  const fill = document.getElementById('eame-run-fill');
  const count = document.getElementById('eame-run-count');
  const label = document.getElementById('eame-run-label');
  const sub = document.getElementById('eame-run-sub');
  const steps = document.getElementById('eame-run-steps');
  if (fill) fill.style.width = share + '%';
  if (count) count.textContent = `${done} of ${total} steps`;

  const attempt = build.progress?.attempt || 1;
  const current = EAME_STEPS[reached];
  if (label) label.textContent = current ? current.title + '…' : 'Built';
  if (sub) {
    sub.textContent = attempt > 1 && reached <= 1
      ? `Attempt ${attempt} of 3 — fixing what failed in attempt ${attempt - 1}, then writing again.`
      : (current ? current.sub : 'Every gate passed.');
  }
  if (steps) {
    steps.innerHTML = EAME_STEPS.map((st, i) => {
      const state = i < reached ? 'done' : i === reached ? 'active' : 'waiting';
      const word = state === 'done' ? 'Completed' : state === 'active' ? 'In progress' : 'Pending';
      return `<li class="eb-step eb-step--${state}">
        <span class="eb-step__icon" aria-hidden="true">${st.icon}</span>
        <span class="eb-step__row"><span class="eb-step__mark" aria-hidden="true"></span><span class="eb-step__title">${i + 1}. ${esc(st.title)}</span></span>
        <span class="eb-step__state">${word}</span>
      </li>`;
    }).join('');
  }
  renderEameEta(build);
  if (!_etaTimer) _etaTimer = setInterval(() => renderEameEta(_lastBuild), 1000);
}

function stopEameEta() {
  if (_etaTimer) clearInterval(_etaTimer);
  _etaTimer = null;
}

function renderGates(build) {
  const el = document.getElementById('eame-gates');
  if (!el) return;

  const reached = GATES.findIndex(([id]) => id === build.verifiedTo);
  const failedAt = build.status === 'failed'
    ? GATES.findIndex(([id]) => id === (build.progress?.detail || '').split(':')[0].trim())
    : -1;
  const skipped = new Set(build.skipped || []);

  el.innerHTML = GATES.map(([id, label], i) => {
    // Passed, skipped, failed or not yet reached — four states, because
    // "skipped" and "passed" must never look the same. A gate that did not
    // run has proved nothing.
    let mark = '&middot;', cls = '';
    if (skipped.has(id))                      { mark = '&ndash;'; cls = ' eg-gate--skip'; }
    else if (build.status === 'passed' && reached >= i) { mark = '&#10003;'; cls = ' eg-gate--ok'; }
    else if (failedAt === i)                  { mark = '&#10007;'; cls = ' eg-gate--bad'; }
    else if (build.status === 'building')     { cls = ' eg-gate--wait'; }
    return `<li class="eg-gate${cls}"><span class="eg-gate__mark">${mark}</span>${label}${
      skipped.has(id) ? '<span class="eg-gate__note">not run</span>' : ''}</li>`;
  }).join('');
}

function renderBuildState(build) {
  const sub = document.getElementById('eame-build-sub');
  const note = document.getElementById('eame-build-note');
  const badge = document.getElementById('eame-gen-status');
  const progress = document.getElementById('eame-progress');
  const retry = document.getElementById('eame-retry-btn');
  const heroTitle = document.getElementById('eame-hero-title');
  const heroSub = document.getElementById('eame-hero-sub');
  const heroMark = document.getElementById('eame-hero-mark');

  renderGates(build);

  const building = build.status === 'building';
  const passed = build.status === 'passed';
  const failed = build.status === 'failed';

  // The progress block exists for a build in flight or one that did not make
  // it. Before anything has started there is nothing to report, and after a
  // pass the report below leads.
  if (progress) progress.style.display = building || failed ? '' : 'none';
  // While it runs, the run stage is the block: the steps, the time left. The
  // gate list is the failed build's -- it says where each attempt stopped.
  const runEl = document.getElementById('eame-run');
  if (runEl) runEl.style.display = building ? '' : 'none';
  if (building) renderEameRun(build); else stopEameEta();
  const gatesEl = document.getElementById('eame-gates');
  if (gatesEl) gatesEl.style.display = passed || building ? 'none' : '';

  // The only button on the screen, and it appears only once Eame has already
  // tried three times -- each attempt sending the failing files and the
  // errors back to the model. A fourth attempt on every page load would be a
  // cost trap; a fourth attempt when a person decides to is a decision.
  if (retry) retry.style.display = failed ? '' : 'none';

  // The hero is the state. A build costs a minute or more of a customer's
  // attention, and "Generate the Application" tells them nothing about
  // whether it is happening.
  if (heroTitle && heroSub) {
    if (passed) {
      heroTitle.textContent = 'Your application is built';
      heroSub.textContent = 'Written, installed and started to prove it runs. Review it below, then move on to Yusu.';
    } else if (building) {
      heroTitle.textContent = 'Building your application';
      heroSub.textContent = 'Eame is writing the code, then installing and starting it to prove it runs.';
    } else if (failed) {
      heroTitle.textContent = 'The application could not be built';
      heroSub.textContent = 'Eame tried three times, fixing what failed each time, and it still did not run. The details are below.';
    } else {
      heroTitle.textContent = 'Generate the Application';
      heroSub.textContent = 'Turn the approved architecture into a production-ready application.';
    }
  }
  if (heroMark) heroMark.classList.toggle('ae-hero__mark--pending', !passed);
  // The state, as a pill beside the role -- and the run stage has no Move
  // button: it moves on by itself once the build passes.
  const heroPill = document.getElementById('eame-hero-pill');
  if (heroPill) {
    heroPill.style.display = building || failed ? '' : 'none';
    heroPill.textContent = building ? 'Running' : 'Failed';
  }
  const nav = document.querySelector('#screen-eame .stage-nav');
  if (nav) nav.style.display = building ? 'none' : '';

  if (badge) {
    badge.innerHTML = '<span class="eg-status__dot"></span>' + (
      build.status === 'passed' ? 'Verified — ' + (build.verifiedTo === 'smoke' ? 'it runs' : 'reached ' + build.verifiedTo)
      : build.status === 'failed' ? 'Build failed'
      : building ? 'Building…' : 'Not built yet');
    badge.classList.toggle('eg-status--bad', build.status === 'failed');
  }

  if (sub) {
    // Elapsed time while building. A clean build is about a minute, so a
    // "generating" that has been going ten is the only signal that something
    // upstream has stalled — a rate-limited model call writes no progress at
    // all, and the screen said "Building…" indefinitely with nothing to
    // distinguish it from work in flight.
    const startedAt = build.progress?.startedAt;
    const mins = startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000) : 0;
    const elapsed = building && mins >= 2
      ? ` — ${mins} min so far${mins >= 5 ? ', longer than usual' : ''}`
      : '';

    // Attempt two onwards is a repair: the previous attempt's failures went
    // back to the model with the files they named. Saying so is the
    // difference between "it is trying again" and "it is fixing what broke".
    const attempt = build.progress?.attempt || 1;
    const repairing = building && attempt > 1
      ? `Fixing what failed in attempt ${attempt - 1}, then `
      : '';

    sub.textContent = building
      ? `${repairing}attempt ${attempt} of 3: ${build.progress?.phase || 'working'}${
          build.progress?.detail ? ' — ' + build.progress.detail : ''}${elapsed}`
      : passed
        ? `Written for "${build.useCase || 'this use case'}" and verified by running it.`
        : failed
          // The repair history, not the reason -- the note below already
          // carries the reason. This is the part the customer cannot see
          // anywhere else: that each attempt fixed the previous one's
          // failure and got further, or did not.
          ? ((build.history || []).length
              ? 'Where each attempt stopped: '
                + build.history.map(h => `${h.attempt} — ${h.stage}`).join(', ') + '.'
              : (build.reason || 'The application did not pass verification.'))
          : '';
    if (repairing) sub.textContent = sub.textContent.charAt(0).toUpperCase() + sub.textContent.slice(1);
    // While building, the run stage above says what is happening; this line
    // comes back only when there is something it alone can say -- a build
    // that has run long, or a repair attempt.
    sub.style.display = building && !elapsed && !repairing ? 'none' : '';
  }

  // "Application generated successfully — your running project is ready for
  // delivery and deployment." That sat in the markup with no display:none and
  // nothing toggling it, so it greeted every visitor to this screen including
  // one whose blueprint had never been built. It is the strongest claim the
  // page makes and it was the only one nothing checked.
  const onward = document.getElementById('eame-onward');
  if (onward) onward.style.display = build.status === 'passed' ? '' : 'none';

  if (note) {
    // Failures and caveats, never hidden. A build that stopped at install is a
    // different claim from one that booted, and the screen has to say which.
    //
    // The two are also not the same KIND of thing, and this block used to run
    // them together unlabelled: a build that PASSED showed a bare list of
    // bullets — "backed only by generated sample data", "no repository was
    // read" — which reads as a list of errors. It was reported as one. A
    // heading is what separates "this went wrong" from "this is worth knowing".
    const failed = build.status === 'failed';
    const lines = [];

    if (failed) {
      lines.push(build.reason || 'The build did not pass verification.');
      (build.failures || []).slice(0, 4).forEach(f => lines.push('· ' + f));
    }

    const caveats = [...(build.warnings || [])];
    if (build.status === 'passed' && (build.skipped || []).length) {
      caveats.push('Not every gate ran: ' + build.skipped.join(', ') + '.');
    }
    if (caveats.length) {
      if (lines.length) lines.push('');
      lines.push(failed
        ? 'Also worth knowing:'
        : 'The build passed. Worth knowing about what it was built from:');
      caveats.forEach(c => lines.push('· ' + c));
    }

    note.textContent = lines.join('\n');
    note.classList.toggle('eg-build__note--bad', failed);
    note.style.display = lines.length ? '' : 'none';
  }
}

/**
 * Which blueprint this visit has already started a build for.
 *
 * Arriving at Eame with nothing built starts the build -- there is no button.
 * But "nothing built" is also the state after a start request that has not
 * been written yet, and pollBuild runs every 2.5 seconds, so without this a
 * slow first response would start a second build behind the first. One start
 * per blueprint per visit; the server's own one-at-a-time lock is the backstop.
 */
let _autoStartedFor = null;

/**
 * Which blueprint this visit started a build for, by any route -- on
 * arrival, or from Try again. A build that passes having been started here
 * is this visit's work, and the journey moves on to Yusu by itself. A build
 * found already passed on arrival is not: that visit is someone coming back
 * to look, and stays.
 */
let _startedHereFor = null;
let _movedOnFor = null;

async function pollBuild() {
  if (!_bp?._id) return;
  try {
    const build = await api(`/strategy-canvas/transformation-blueprint/${_bp._id}/eame-build`);
    renderBuildState(build);

    if (build.status === 'building') {
      clearTimeout(_pollTimer);
      _pollTimer = setTimeout(pollBuild, 2500);
      return;
    }
    clearTimeout(_pollTimer);

    // Nothing built and nothing started: start it. A build that has FAILED is
    // deliberately not restarted here -- Eame already made three attempts,
    // fixing what failed between each, and a fourth on every page load would
    // spend a generation per visit on a project that does not work. That one
    // is the customer's call, and it is the only button on the screen.
    if (build.status === 'none' && _autoStartedFor !== _bp._id) {
      _autoStartedFor = _bp._id;
      await startBuild();
      return;
    }

    if (build.status === 'passed') {
      renderFiles(build);
      if (_startedHereFor === _bp._id && _movedOnFor !== _bp._id) {
        _movedOnFor = _bp._id;
        press('eame-nav-btn');
      }
    }
    else updateEameGate(false);
  } catch (err) {
    showError(err.message);
  }
}

async function startBuild() {
  const retry = document.getElementById('eame-retry-btn');
  if (retry) { retry.disabled = true; retry.textContent = 'Starting…'; }
  document.getElementById('eame-error').style.display = 'none';
  try {
    await api(`/strategy-canvas/transformation-blueprint/${_bp._id}/eame-build`, { method: 'POST', body: '{}' });
    _startedHereFor = _bp._id;
    pollBuild();
  } catch (err) {
    // Entitlement, a build already running, a server fault: each comes with
    // its own sentence from the server, and none of them should be retried
    // automatically. Shown, and the poll stops here until the customer acts.
    if (retry) { retry.disabled = false; retry.textContent = 'Try again'; }
    showError(err.message);
  }
}

/**
 * Render a file list, wherever it came from.
 *
 * Two callers: a build Eame verified, and the fixed template manifest for a
 * blueprint that has not been built yet. Splitting this out is what lets the
 * build result reuse the tree, the stats and the summary instead of fetching
 * a different project to display.
 */
function renderFiles({ files, fileCount, totalBytes }) {
  const tree = document.getElementById('eame-tree');
  const card = document.getElementById('eame-summary-card');
  if (card) card.style.display = '';
  try {
    if (!files?.length) {
      tree.innerHTML = `<li class="eg-tree__loading">The project builder returned no files.</li>`;
      updateEameGate(false);
      return;
    }
    updateEameGate(true);
    const paths = files.map(f => f.path);

    renderStats(fileCount, totalBytes, paths);

    // One row per top-level directory, with what it is for.
    tree.innerHTML = groupByDirectory(files).map(g => {
      const name = g.dir + (g.dir.includes(' ') ? '' : '/');
      return `
      <li class="eg-tree__row">
        <span class="eg-tree__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </span>
        <span class="eg-tree__meta">
          <span class="eg-tree__name">${esc(name)}</span>
          <span class="eg-tree__desc">${esc(describeDir(g.dir))}</span>
        </span>
        <span class="eg-tree__count">${g.files.length} file${g.files.length === 1 ? '' : 's'}</span>
      </li>`;
    }).join('');

    // The checklist and the chip row were retired with the panel that held
    // them; the same facts now live in the tiles. Guarded so a page that still
    // carries the old elements keeps working and one that does not does not
    // throw.
    const summaryEl = document.getElementById('eame-summary');
    if (summaryEl) {
      summaryEl.innerHTML = buildSummary(paths).map(s => `
        <li class="eg-summary__item${s.ok ? '' : ' eg-summary__item--no'}">
          <span class="eg-summary__mark">${s.ok ? '&#10003;' : '&middot;'}</span>${esc(s.text)}
        </li>
      `).join('');
    }
    const stackEl = document.getElementById('eame-stack');
    if (stackEl) {
      stackEl.innerHTML = techStack(paths).map(t => `<span class="eg-chip">${esc(t)}</span>`).join('');
    }

    const sub = document.getElementById('eame-summary-sub');
    if (sub) sub.textContent = 'Application has been generated and verified by running it.';

    // The full list stays available behind "View Source Structure".
    document.getElementById('eame-manifest-body').innerHTML = files.map(f => `
      <tr>
        <td>
          <span class="aria-row-name__title">${esc(f.path)}</span>
          <span class="aria-row-name__desc">${esc(fmtBytes(f.bytes))}</span>
        </td>
        <td class="aria-row-tools">${esc(describe(f.path))}</td>
      </tr>
    `).join('');
  } catch (err) {
    tree.innerHTML = `<li class="eg-tree__loading">Couldn't render the project files.</li>`;
    updateEameGate(false);
    showError(err.message);
  }
}

/**
 * The template project, for a blueprint nobody has built yet.
 *
 * Shown so the screen is not empty before the first build, and labelled as
 * what it is by the build panel above it — this is not their application.
 */
/**
 * Before the first build there is nothing to show, so nothing is shown.
 *
 * This used to fall back to the template manifest — the defect-matching
 * project — which rendered "32 Files · Full-stack application" and a Build
 * Summary of green ticks under a badge reading "Not built yet". A customer
 * would reasonably conclude their application already existed. It is not their
 * application, and there is no honest way to display it as one.
 */
function renderEmptyProject() {
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('eame-tree', `<li class="eg-tree__loading">No application yet — press Build.</li>`);
  set('eame-stats', '');
  set('eame-summary', '');
  set('eame-stack', '');
  set('eame-manifest-body', '');
  // Hidden rather than left as two empty headings. A "Build Summary" with
  // nothing under it reads as a panel that failed to load, not as one that
  // has nothing to summarise yet.
  const card = document.getElementById('eame-summary-card');
  if (card) card.style.display = 'none';
  updateEameGate(false);
}

/** Both badges are real state, so neither can claim something untrue. */
async function renderBadges(bp) {
  const approved = !!bp.opportunityApproval?.approved;
  let linked = 0;
  try {
    const r = await api(`/confluence/personal/linked/${bp._id}`);
    linked = (r.documents || []).length;
  } catch { /* not connected is a valid answer, not an error */ }

  document.getElementById('eame-badges').innerHTML = [
    { ok: approved, on: 'Blueprint Approved', off: 'Not Yet Approved' },
    { ok: linked > 0, on: `Data Connected`, off: 'No Data Connected' },
  ].map(b => `
    <span class="eg-badge${b.ok ? ' eg-badge--on' : ''}">
      <span class="eg-badge__dot"></span>${esc(b.ok ? b.on : b.off)}
    </span>
  `).join('');
}

let _wired = false;

function wire() {
  // The one button, shown only after three failed attempts.
  const retryBtn = document.getElementById('eame-retry-btn');
  if (retryBtn && !retryBtn.dataset.wired) {
    retryBtn.dataset.wired = '1';
    retryBtn.addEventListener('click', startBuild);
  }

  if (_wired) return;
  _wired = true;

  // The file list is the detail behind the summary, not a replacement for it.
  const sourceBtn = document.getElementById('eame-source-btn');
  sourceBtn?.addEventListener('click', () => {
    const box = document.getElementById('eame-files');
    const open = box.style.display !== 'none';
    box.style.display = open ? 'none' : '';
    // Only the label changes; the icons in the button stay where they are.
    // Rewriting the whole innerHTML here used to reintroduce a folder emoji
    // the markup had stopped using.
    const label = sourceBtn.querySelector('span');
    if (label) label.textContent = open ? 'View complete structure' : 'Hide complete structure';
    sourceBtn.setAttribute('aria-expanded', String(!open));
    if (!open) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // The use-case card and its View Details link are gone from this screen;
  // Cob's screen names the use case. Guarded rather than deleted so a page
  // that still has the element keeps working.
  document.getElementById('eame-view-details')?.addEventListener('click', () => {
    window.open('/domain/domain.html?openBlueprint=1', '_blank', 'noopener');
  });

  // Saved as they type, debounced. A separate Save button for one field is
  // friction, and a name lost by navigating away is worse than either.
  const nameInput = document.getElementById('eame-app-name');
  let saveTimer = null;
  nameInput?.addEventListener('input', () => {
    clearTimeout(saveTimer);
    document.getElementById('eame-name-saved').classList.remove('eg-name__saved--on');
    saveTimer = setTimeout(saveAppName, 700);
  });
  // Leaving the field commits immediately rather than waiting out the timer.
  nameInput?.addEventListener('blur', () => { clearTimeout(saveTimer); saveAppName(); });
}

async function saveAppName() {
  const input = document.getElementById('eame-app-name');
  const mark  = document.getElementById('eame-name-saved');
  if (!input || !_bp?._id) return;

  const appName = input.value.trim();
  if (appName === (_bp.appName || '')) return;   // nothing changed

  try {
    const r = await api(`/strategy-canvas/transformation-blueprint/${_bp._id}/app-name`, {
      method: 'PATCH',
      body: JSON.stringify({ appName }),
    });
    _bp.appName = r.appName;
    if (mark) {
      mark.textContent = 'Saved';
      mark.classList.add('eg-name__saved--on');
    }
  } catch (err) {
    if (mark) {
      mark.textContent = err.message || 'Could not save';
      mark.classList.add('eg-name__saved--on');
    }
  }
}

/**
 * Eame is done once the project has actually been built — the manifest is
 * the evidence, so the gate reads from it rather than from a flag set by
 * whatever rendered last.
 */
function updateEameGate(built) {
  const btn  = document.getElementById('eame-nav-btn');
  const hint = document.getElementById('eame-nav-hint');
  if (btn) btn.disabled = !built;
  if (hint) {
    hint.textContent = built
      ? 'Application generated — Yusu can take it live.'
      : 'Generate the application to continue';
  }
}

document.addEventListener('eame:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  _bp = bp;
  wire();

  // No longer shown from here. revealStage() in blueprintGenerate.js shows
  // this screen once it reports ready below -- showing it first meant the
  // customer saw "Generate the Application" and no cards, then a round trip
  // later, the built application. Rendering into a hidden screen is fine.

  updateEameGate(false);   // reopened by renderFiles once a build has passed

  const useCase = renderBreadcrumb(bp);

  // Seed the name field. Falls back to the use case, so the field is never
  // empty and the placeholder is never the thing that ships.
  const nameInput = document.getElementById('eame-app-name');
  if (nameInput) {
    nameInput.value = bp.appName || useCase || bp.businessObjective || '';
    document.getElementById('eame-name-saved').classList.remove('eg-name__saved--on');
  }

  // The build is the only source of files. No build, no project — there is no
  // second list to fall back to that would be true.
  renderEmptyProject();

  // Ready once the first build response has been drawn and the badges are
  // in. pollBuild() resolves after its first response (later polls schedule
  // themselves), so this is "the screen shows its real state", not "the
  // build is finished". Settled, not all: a badge that fails to load must not
  // hold the whole screen back.
  Promise.allSettled([pollBuild(), renderBadges(bp)]).then(() => {
    document.dispatchEvent(new CustomEvent('stage:ready', { detail: { stage: 'eame' } }));
  });
});
