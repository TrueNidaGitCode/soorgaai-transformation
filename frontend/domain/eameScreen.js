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

async function renderManifest() {
  const tree = document.getElementById('eame-tree');
  tree.innerHTML = `<li class="eg-tree__loading">Loading project files…</li>`;
  try {
    const { files, fileCount, totalBytes } = await api('/github/personal/project-manifest');
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
    tree.innerHTML = `<li class="eg-tree__loading">Couldn't load the project manifest.</li>`;
    updateEameGate(false);
    showError(err.message);
  }
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

  updateEameGate(false);   // reopened by renderManifest once files come back

  const useCase = renderBreadcrumb(bp);

  // Seed the name field. Falls back to the use case, so the field is never
  // empty and the placeholder is never the thing that ships.
  const nameInput = document.getElementById('eame-app-name');
  if (nameInput) {
    nameInput.value = bp.appName || useCase || bp.businessObjective || '';
    document.getElementById('eame-name-saved').classList.remove('eg-name__saved--on');
  }

  renderManifest();
  renderBadges(bp);
});
