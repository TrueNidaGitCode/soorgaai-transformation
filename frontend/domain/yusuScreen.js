/**
 * Svarg — Yusu screen (go live and hand over)
 *
 * The last stage, and the only one that ships anything. Arth prepared the
 * environment and Eame described the application; Yusu builds it, pushes it
 * to the customer's own repository, puts it live, and states plainly what
 * they now own and what Svarg runs for them.
 *
 * Two steps behind one button: push, then go live. Sequenced rather than
 * combined because a failed deploy must not mean pushing the repository
 * again — GitHub refuses a duplicate name, and the repo either exists or it
 * does not. It is also the line Railway itself draws: a service cannot be
 * created until a repository exists.
 *
 * Every precondition is read from real state — a prepared environment, a
 * pushed repository, a chosen model — and each unmet one names the stage that
 * satisfies it rather than just refusing.
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
let _dep = null;
let _connected = false;   // GitHub
let _githubUser = '';

function showError(msg) {
  const el = document.getElementById('yusu-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function renderBreadcrumb(bp) {
  const crumb = document.getElementById('yusu-breadcrumb');
  const section = findAiUseCasesPrioritizationSection(bp);
  const brief = section?.brief || {};
  const all = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
  const rec = brief.recommendedStartingPoint || '';
  const label = all.find(n => n && rec.includes(n)) || rec;
  if (!label) { crumb.style.display = 'none'; return null; }
  crumb.style.display = '';
  document.getElementById('yusu-recap-name').textContent = label;
  return label;
}

/**
 * What must hold before Yusu can act. Each carries the stage that fixes it,
 * so an unmet one is a direction rather than a dead end — except GitHub,
 * which Yusu resolves itself because Yusu is what pushes.
 */
function checks(bp, dep) {
  return [
    {
      ok: !!bp.arthSelection?.modelId,
      title: 'A model is chosen',
      done: bp.arthSelection?.displayName ? `Running on ${bp.arthSelection.displayName}` : '',
      todo: 'Choose one on Arth.',
      goto: 'arth',
    },
    {
      ok: dep?.status === 'prepared' || dep?.status === 'live' || dep?.hosting === 'self',
      title: 'An environment is ready',
      done: dep?.hosting === 'self'
        ? 'You are running this in your own environment'
        : (dep?.environmentName ? `${dep.environmentName} is prepared` : ''),
      todo: 'Prepare it on Arth.',
      goto: 'arth',
    },
    {
      ok: _connected,
      title: 'GitHub is connected',
      done: _githubUser ? `Connected as ${_githubUser}` : 'Connected',
      todo: 'Connect it below — the project needs a repository to live in.',
      goto: '',
    },
    // A failed generation must not block a deployment, so a blueprint with no
    // governance content passes rather than trapping the user. When there IS
    // content, it has to be accepted — that is the whole point of the gate.
    {
      ok: governanceAreas(bp).length === 0 || !!bp.governanceReview?.acknowledged,
      title: 'Governance is accepted',
      done: governanceAreas(bp).length
        ? `${governanceAreas(bp).length} areas accepted`
        : 'No governance content was generated for this blueprint',
      todo: 'Read the governance areas below and accept them.',
      goto: '',
    },
  ];
}

/** The Governance & Ethics sections this blueprint actually produced. */
function governanceAreas(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'governance-security');
  return (domain?.capabilities || []).flatMap(c => c.sections || []).filter(s => s.title);
}

function renderGovernance(bp) {
  const wrap = document.getElementById('yusu-gov-wrap');
  const areas = governanceAreas(bp);
  if (!areas.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  document.getElementById('yusu-gov').innerHTML = areas.map(a => {
    const b = a.brief || {};
    const validation = b.leadershipValidation?.status || '';
    return `
      <div class="gov-card">
        <p class="gov-card__title">${esc(a.title)}
          ${validation ? `<span class="gov-card__val">${esc(validation)}</span>` : ''}</p>
        <p class="gov-card__body">${esc(b.strategicPosition || 'No commitment recorded for this area.')}</p>
        <p class="gov-card__meta">${(b.priorityActions || []).length} actions &middot;
          ${(b.successMetrics || []).length} measures</p>
      </div>`;
  }).join('');

  const box = document.getElementById('yusu-gov-ack');
  const done = !!bp.governanceReview?.acknowledged;
  box.checked = done;
  box.disabled = done;
  document.getElementById('yusu-gov-ack-wrap').classList.toggle('gov-ack--done', done);
}

async function acknowledgeGovernance() {
  const box = document.getElementById('yusu-gov-ack');
  if (!box.checked) return;
  box.disabled = true;
  try {
    await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/governance-review`, { method: 'PATCH' });
    _bp.governanceReview = { acknowledged: true, acknowledgedAt: new Date().toISOString() };
    render(_bp, _dep);
  } catch (err) {
    box.checked = false;
    box.disabled = false;
    showError(err.message);
  }
}

function slugify(text) {
  return String(text || 'svarg-project')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'svarg-project';
}

async function refreshGithubStatus() {
  const notConn = document.getElementById('yusu-not-connected');
  const conn = document.getElementById('yusu-connected');
  try {
    const status = await api('/github/personal/status');
    _connected = !!status.connected;
    _githubUser = status.githubLogin || '';
    notConn.style.display = _connected ? 'none' : '';
    conn.style.display = _connected ? '' : 'none';
    if (_connected) document.getElementById('yusu-github-user').textContent = _githubUser || 'your account';
  } catch {
    _connected = false;
    notConn.style.display = '';
    conn.style.display = 'none';
  }
}

function goConnectGithub() {
  sessionStorage.setItem('svarg_returning_to_yusu', '1');
  api('/github/personal/connect?returnTo=domain')
    .then(({ url }) => { window.location.href = url; })
    .catch(err => showError(err.message));
}

/**
 * Build the project and push it to the customer's own repository. Separate
 * from going live so a failed deploy does not mean pushing again — the repo
 * either exists or it does not, and GitHub refuses a duplicate name.
 */
async function buildAndPush() {
  const repoName = (document.getElementById('yusu-repo-name').value || '').trim();
  if (!repoName) { showError('Give the repository a name first.'); return false; }

  const out = document.getElementById('yusu-push-result');
  const r = await api('/github/personal/push-project', {
    method: 'POST',
    body: JSON.stringify({
      repoName,
      isPrivate: document.getElementById('yusu-repo-private').checked,
      blueprintId: _blueprintId,
    }),
  });

  out.style.display = 'block';
  out.innerHTML = `<div class="pw-process-item pw-process-item--done">
    <span class="pw-process-item__title">${esc(repoName)}</span>
    <span class="pw-process-item__detail">${r.fileCount} files pushed &middot;
      <a href="${esc(r.repoUrl)}" target="_blank" rel="noopener" class="aria-configure-link">Open repository &rarr;</a></span>
  </div>`;

  // Keep the in-memory blueprint in step so the checks below re-render as met
  // without a round trip.
  _bp.eameDelivery = {
    repoOwner: r.owner, repoName, repoUrl: r.repoUrl, fileCount: r.fileCount,
  };
  return true;
}

function renderChecks(bp, dep) {
  const rows = checks(bp, dep);
  document.getElementById('yusu-checks').innerHTML = rows.map(c => `
    <div class="yusu-check${c.ok ? ' yusu-check--ok' : ''}">
      <span class="yusu-check__mark">${c.ok ? '&check;' : '&middot;'}</span>
      <span class="yusu-check__body">
        <span class="yusu-check__title">${esc(c.title)}</span>
        <span class="yusu-check__detail">${esc(c.ok ? c.done : c.todo)}</span>
      </span>
      ${(!c.ok && c.goto) ? `<button type="button" class="yusu-check__go" data-goto="${c.goto}">Go to ${c.goto[0].toUpperCase() + c.goto.slice(1)}</button>` : ''}
    </div>
  `).join('');
  return rows;
}

function fact(label, value) {
  return value ? `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>` : '';
}

function renderHandover(bp, dep) {
  const box = document.getElementById('yusu-handover');
  const live = dep && ['live', 'suspended'].includes(dep.status);
  box.style.display = live ? '' : 'none';
  if (!live) return;

  document.getElementById('yusu-dot').className = 'host-dot host-dot--' + dep.status;
  document.getElementById('yusu-state').textContent = dep.status === 'live' ? 'Live' : 'Suspended';

  const link = document.getElementById('yusu-url');
  if (dep.url) {
    link.href = dep.url;
    link.textContent = dep.url.replace(/^https?:\/\//, '');
  } else {
    link.removeAttribute('href');
    link.textContent = 'Running — no web address yet';
  }
  document.getElementById('yusu-sub').textContent =
    `Handed over ${dep.liveAt ? new Date(dep.liveAt).toLocaleString() : 'just now'}.`;

  const cap = dep.limits?.maxCostUsd || 0;
  const spent = dep.usage?.costUsd || 0;

  document.getElementById('yusu-facts').innerHTML = [
    fact('Application', bp.eameDelivery?.repoName ? `${bp.eameDelivery.repoOwner}/${bp.eameDelivery.repoName}` : ''),
    fact('Model', dep.model?.displayName ? `${dep.model.displayName} — through Svarg's gateway` : ''),
    fact('Environment', dep.environmentName),
    fact('Database', dep.dbName ? `${dep.dbName} — dedicated, with vector search` : ''),
    fact('Region', dep.region),
  ].filter(Boolean).join('');

  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  document.getElementById('yusu-usage-label').textContent =
    `${(dep.usage?.requests || 0).toLocaleString()} requests this month`;
  document.getElementById('yusu-usage-num').textContent =
    cap > 0 ? `$${spent.toFixed(2)} of $${cap.toFixed(2)}` : `$${spent.toFixed(2)}`;
  const fill = document.getElementById('yusu-usage-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('host-meter__fill--near', pct >= 80);

  // The point of a handover is that both sides know where the line is.
  const owns = [
    'The source code, in your own GitHub repository',
    'The data in the database — your documents, and what the application produces',
    'The decision to move it elsewhere at any time; nothing here is locked in',
  ];
  const runs = [
    'The container and the database it runs on',
    'The model gateway, and the provider account behind it',
    'The spend limit — requests are refused past it rather than billed on',
  ];
  document.getElementById('yusu-owns').innerHTML = owns.map(t => `<li>${esc(t)}</li>`).join('');
  document.getElementById('yusu-runs').innerHTML = runs.map(t => `<li>${esc(t)}</li>`).join('');
}

function render(bp, dep) {
  _dep = dep;
  renderBreadcrumb(bp);
  const rows = renderChecks(bp, dep);
  renderGovernance(bp);
  renderHandover(bp, dep);

  const btn = document.getElementById('yusu-golive-btn');
  const hint = document.getElementById('yusu-hint');
  const live = dep && ['live', 'suspended'].includes(dep.status);
  const selfHosted = dep?.hosting === 'self';
  const blocked = rows.filter(c => !c.ok);

  if (live) {
    btn.style.display = 'none';
    hint.textContent = 'Live and handed over.';
    return;
  }
  if (selfHosted) {
    // Nothing for Svarg to turn on — saying so is the honest end of the
    // journey, not a disabled button with no explanation.
    btn.style.display = 'none';
    hint.textContent = 'This runs in your own environment, so there is nothing for Svarg to turn on. The repository from Eame is the handover.';
    return;
  }
  // One button, two steps: build and push, then go live. Sequenced rather
  // than combined so a failed deploy does not mean pushing the repo again.
  const pushed = !!bp.eameDelivery?.repoName;
  btn.style.display = '';
  btn.textContent = pushed ? 'Go Live' : 'Build & Push';
  btn.disabled = blocked.length > 0;
  hint.textContent = blocked.length
    ? `Waiting on: ${blocked.map(c => c.title.toLowerCase()).join(', ')}.`
    : pushed
      ? 'Pushed. Ready to go live.'
      : 'Everything is ready.';
}

async function load() {
  if (!_blueprintId) return;
  try {
    const { deployment } = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/deployment`);
    render(_bp, deployment);
  } catch {
    render(_bp, null);
  }
}

/** The primary action: push if it has not been pushed, otherwise go live. */
async function act() {
  const btn = document.getElementById('yusu-golive-btn');
  const pushed = !!_bp.eameDelivery?.repoName;
  btn.disabled = true;
  document.getElementById('yusu-error').style.display = 'none';

  try {
    if (!pushed) {
      btn.textContent = 'Building…';
      if (await buildAndPush()) render(_bp, _dep);
      return;
    }

    btn.textContent = 'Going live…';
    const r = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    render(_bp, r.deployment);
    if (r.gatewayToken) {
      document.getElementById('yusu-token-value').textContent = r.gatewayToken;
      document.getElementById('yusu-token').style.display = '';
    }
  } catch (err) {
    // GitHub's own message ("name already exists") is the useful part.
    showError(err.message);
    render(_bp, _dep);
  }
}

let _wired = false;

function wire() {
  if (_wired) return;
  _wired = true;
  document.getElementById('yusu-golive-btn').addEventListener('click', act);
  document.getElementById('yusu-gov-ack').addEventListener('change', acknowledgeGovernance);
  document.getElementById('yusu-connect-btn').addEventListener('click', (e) => {
    e.preventDefault();
    goConnectGithub();
  });
  // The "Go to Arth/Eame" buttons on unmet checks reuse the journey router
  // in blueprintGenerate.js, which already listens for [data-goto].
  document.getElementById('yusu-checks').addEventListener('click', (e) => {
    const b = e.target.closest('.yusu-check__go');
    if (b) document.dispatchEvent(new CustomEvent(b.dataset.goto + ':show', { detail: { blueprint: _bp } }));
  });
}

document.addEventListener('yusu:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  _bp = bp;
  _blueprintId = bp._id;
  wire();

  document.dispatchEvent(new CustomEvent('screen:show', { detail: { id: 'screen-yusu' } }));
  document.getElementById('yusu-token').style.display = 'none';
  const name = document.getElementById('yusu-repo-name');
  if (name && !name.value) name.value = slugify(renderBreadcrumb(bp) || bp.businessObjective);
  render(bp, null);
  refreshGithubStatus().then(() => render(_bp, _dep));
  load();
});
