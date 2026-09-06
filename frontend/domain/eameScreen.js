/**
 * Svarg — Eame screen (build the application)
 *
 * Reached from Arth (dispatches 'eame:show').
 *
 * This stage shows the application that will be built — every file and what
 * each is for. The list comes from the same builder the push uses
 * (GET /github/personal/project-manifest), so what is shown here cannot
 * drift from what Yusu later delivers.
 *
 * Building and pushing moved to Yusu: Eame is the application, Yusu ships it.
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
  if (!label) { crumb.style.display = 'none'; return null; }
  crumb.style.display = '';
  document.getElementById('eame-recap-name').textContent = label;
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

function renderStats(fileCount, totalBytes) {
  const stats = [
    { icon: '&#128193;', value: `${fileCount} Files`,          label: 'Full-stack application' },
    { icon: '&#128190;', value: fmtBytes(totalBytes),          label: 'Optimised codebase' },
    { icon: '&#9881;',   value: 'Node.js',                     label: 'Modern, scalable stack' },
  ];
  document.getElementById('eame-stats').innerHTML = stats.map(s => `
    <div class="eg-stat">
      <span class="eg-stat__icon">${s.icon}</span>
      <span class="eg-stat__text">
        <span class="eg-stat__value">${esc(s.value)}</span>
        <span class="eg-stat__label">${esc(s.label)}</span>
      </span>
    </div>
  `).join('');
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
  const btn = document.getElementById('eame-build-btn');
  const sub = document.getElementById('eame-build-sub');
  const note = document.getElementById('eame-build-note');
  const badge = document.getElementById('eame-gen-status');
  if (!btn) return;

  renderGates(build);

  const building = build.status === 'building';
  btn.disabled = building;
  btn.textContent = building ? 'Building…' : (build.status === 'none' ? 'Build' : 'Rebuild');

  if (badge) {
    badge.innerHTML = '<span class="eg-status__dot"></span>' + (
      build.status === 'passed' ? 'Verified — ' + (build.verifiedTo === 'smoke' ? 'it runs' : 'reached ' + build.verifiedTo)
      : build.status === 'failed' ? 'Build failed'
      : building ? 'Building…' : 'Not built yet');
    badge.classList.toggle('eg-status--bad', build.status === 'failed');
  }

  if (sub) {
    sub.textContent = building
      ? `Attempt ${build.progress?.attempt || 1}: ${build.progress?.phase || 'working'}${
          build.progress?.detail ? ' — ' + build.progress.detail : ''}`
      : build.status === 'passed'
        ? `Written for "${build.useCase || 'this use case'}" and verified by running it.`
        : 'Eame writes the code for this use case, then installs and starts it to prove it runs.';
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
    if (build.status === 'passed') renderFiles(build);
    else updateEameGate(false);
  } catch (err) {
    showError(err.message);
  }
}

async function startBuild() {
  const btn = document.getElementById('eame-build-btn');
  btn.disabled = true;
  btn.textContent = 'Building…';
  document.getElementById('eame-error').style.display = 'none';
  try {
    await api(`/strategy-canvas/transformation-blueprint/${_bp._id}/eame-build`, { method: 'POST', body: '{}' });
    pollBuild();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Build';
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

    renderStats(fileCount, totalBytes);

    tree.innerHTML = groupByDirectory(files).map(g => `
      <li class="eg-tree__row">
        <span class="eg-tree__name"><span class="eg-folder-ico">&#128193;</span>${esc(g.dir)}${g.dir.includes(' ') ? '' : '/'}</span>
        <span class="eg-tree__count">${g.files.length} file${g.files.length === 1 ? '' : 's'}</span>
      </li>
    `).join('');

    document.getElementById('eame-summary').innerHTML = buildSummary(paths).map(s => `
      <li class="eg-summary__item${s.ok ? '' : ' eg-summary__item--no'}">
        <span class="eg-summary__mark">${s.ok ? '&#10003;' : '&middot;'}</span>${esc(s.text)}
      </li>
    `).join('');

    document.getElementById('eame-stack').innerHTML =
      techStack(paths).map(t => `<span class="eg-chip">${esc(t)}</span>`).join('');

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
  document.getElementById('eame-tree').innerHTML =
    `<li class="eg-tree__loading">No application yet — press Build.</li>`;
  document.getElementById('eame-stats').innerHTML = '';
  document.getElementById('eame-summary').innerHTML = '';
  document.getElementById('eame-stack').innerHTML = '';
  document.getElementById('eame-manifest-body').innerHTML = '';
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
  const buildBtn = document.getElementById('eame-build-btn');
  if (buildBtn && !buildBtn.dataset.wired) {
    buildBtn.dataset.wired = '1';
    buildBtn.addEventListener('click', startBuild);
  }

  if (_wired) return;
  _wired = true;

  // The file list is the detail behind the summary, not a replacement for it.
  document.getElementById('eame-source-btn').addEventListener('click', () => {
    const box = document.getElementById('eame-files');
    const open = box.style.display !== 'none';
    box.style.display = open ? 'none' : '';
    document.getElementById('eame-source-btn').innerHTML = open
      ? '<span class=eg-folder-ico>&#128193;</span> View Source Structure &rarr;'
      : '<span class=eg-folder-ico>&#128193;</span> Hide Source Structure';
  });

  document.getElementById('eame-view-details').addEventListener('click', () => {
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

  // Screen switching lives in blueprintGenerate.js's showScreen list.
  document.dispatchEvent(new CustomEvent('screen:show', { detail: { id: 'screen-eame' } }));

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
  pollBuild();
  renderBadges(bp);
});
