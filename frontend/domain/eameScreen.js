/**
 * Svarg — Eame screen (build the application)
 *
 * Reached from Arth (dispatches 'eame:show').
 *
 * This stage delivers a real, runnable project into a repository the user
 * owns — not a code sample on screen. The file list comes from the same
 * builder the push uses (GET /github/personal/project-manifest), so what
 * is shown cannot drift from what is delivered, and the push itself is the
 * existing POST /github/personal/push-project.
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
let _connected = false;
let _pushing = false;
let _githubUser = '';
let _repo = null;        // owner/name of the pushed repository
let _deployment = null;  // the hosted deployment, once there is one

function showError(msg) {
  const el = document.getElementById('eame-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function slugify(text) {
  return String(text || 'svarg-project')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'svarg-project';
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

async function renderManifest() {
  const body = document.getElementById('eame-manifest-body');
  body.innerHTML = `<tr><td colspan="2" class="ks-card-body">Loading project files…</td></tr>`;
  try {
    const { files, fileCount, totalBytes } = await api('/github/personal/project-manifest');
    if (!files?.length) {
      body.innerHTML = `<tr><td colspan="2" class="ks-card-body">The project builder returned no files.</td></tr>`;
      return;
    }
    body.innerHTML = files.map(f => `
      <tr>
        <td>
          <span class="aria-row-name__title">${esc(f.path)}</span>
          <span class="aria-row-name__desc">${esc(fmtBytes(f.bytes))}</span>
        </td>
        <td class="aria-row-tools">${esc(describe(f.path))}</td>
      </tr>
    `).join('');
    document.getElementById('eame-hint').textContent =
      `${fileCount} files · ${fmtBytes(totalBytes)}` + (_connected ? '' : ' · connect GitHub to deliver');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="2" class="ks-card-body">Couldn't load the project manifest.</td></tr>`;
    showError(err.message);
  }
}

async function refreshGithubStatus() {
  const notConn = document.getElementById('eame-not-connected');
  const conn = document.getElementById('eame-connected');
  const btn = document.getElementById('eame-build-btn');
  try {
    const status = await api('/github/personal/status');
    _connected = !!status.connected;
    notConn.style.display = _connected ? 'none' : '';
    conn.style.display = _connected ? '' : 'none';
    btn.disabled = !_connected;
    if (_connected) {
      _githubUser = status.githubLogin || status.username || status.login || '';
      document.getElementById('eame-github-user').textContent = _githubUser || 'your account';
    }
  } catch {
    // A status failure is not fatal — the connect path still works.
    _connected = false;
    notConn.style.display = '';
    conn.style.display = 'none';
    btn.disabled = true;
  }
}

function goConnectGithub() {
  sessionStorage.setItem('svarg_returning_to_eame', '1');
  api('/github/personal/connect?returnTo=domain')
    .then(({ url }) => { window.location.href = url; })
    .catch(err => showError(err.message));
}

async function push() {
  if (_pushing) return;
  const btn = document.getElementById('eame-build-btn');
  const hint = document.getElementById('eame-hint');
  const out = document.getElementById('eame-push-result');
  const repoName = (document.getElementById('eame-repo-name').value || '').trim();
  const isPrivate = document.getElementById('eame-repo-private').checked;

  if (!repoName) {
    showError('Give the repository a name first.');
    return;
  }

  _pushing = true;
  btn.disabled = true;
  btn.textContent = 'Building…';
  hint.textContent = 'Creating the repository and pushing files…';
  document.getElementById('eame-error').style.display = 'none';

  try {
    const r = await api('/github/personal/push-project', {
      method: 'POST',
      body: JSON.stringify({ repoName, isPrivate, blueprintId: _bp?._id }),
    });
    out.style.display = 'block';
    out.innerHTML = `<div class="pw-process-item pw-process-item--done">
      <span class="pw-process-item__title">${esc(repoName)}</span>
      <span class="pw-process-item__detail">${r.fileCount} files pushed &middot;
        <a href="${esc(r.repoUrl)}" target="_blank" rel="noopener" class="aria-configure-link">Open repository &rarr;</a></span>
    </div>`;
    btn.textContent = '✓ Project Delivered';
    hint.textContent = 'Delivered to your GitHub account.';
    document.getElementById('eame-next-stage').style.display = 'flex';
    // Hosting deploys from the repository, so it only becomes an option now.
    _repo = { owner: r.owner || _githubUser, name: repoName };
    renderHosting(null);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Build & Push Project';
    hint.textContent = '';
    // GitHub's own message (e.g. "name already exists") is the useful part.
    showError(err.message);
  } finally {
    _pushing = false;
  }
}

// ── Hosting ─────────────────────────────────────────────────────────────────
// Running the application Svarg just built, on Svarg's infrastructure. The
// repository is the deploy source, so this only appears once one exists.

function renderHosting(deployment) {
  _deployment = deployment;
  const wrap = document.getElementById('eame-hosting');
  const offer = document.getElementById('eame-host-offer');
  const live  = document.getElementById('eame-host-live');

  // Nothing to deploy until the project has been pushed somewhere.
  if (!_repo && !deployment) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  // Hosting is Arth's decision now; this screen only carries it out. Saying
  // otherwise would offer a choice that has already been made.
  const offerTitle = document.getElementById('eame-host-title');
  const offerBody  = document.getElementById('eame-host-body');
  const deployBtn  = document.getElementById('eame-deploy-btn');

  if (deployment?.hosting === 'self') {
    offer.style.display = ''; live.style.display = 'none';
    offerTitle.textContent = 'You are running this yourself';
    offerBody.textContent = 'Arth recorded that this runs in your own environment, so there is nothing for Svarg to deploy. The repository above has everything needed.';
    deployBtn.style.display = 'none';
    return;
  }

  const running = deployment && ['attaching', 'live', 'suspended'].includes(deployment.status);
  offer.style.display = running ? 'none' : '';
  live.style.display  = running ? '' : 'none';

  if (!running) {
    const prepared = deployment?.status === 'prepared';
    deployBtn.style.display = prepared ? '' : 'none';
    offerTitle.textContent = prepared
      ? 'Deploy to your prepared environment'
      : 'No environment prepared yet';
    offerBody.textContent = prepared
      ? `${deployment.environmentName || 'The Svarg environment'} is ready and waiting for this application.`
      : 'Prepare the environment on the Arth screen first — that is where hosting is decided.';
    return;
  }

  const dot   = document.getElementById('eame-host-dot');
  const state = document.getElementById('eame-host-state');
  dot.className = 'host-dot host-dot--' + deployment.status;
  state.textContent = deployment.status === 'live' ? 'Live'
    : deployment.status === 'provisioning' ? 'Starting up'
    : 'Suspended';

  const link = document.getElementById('eame-host-url');
  if (deployment.url) {
    link.href = deployment.url;
    link.textContent = deployment.url.replace(/^https?:\/\//, '');
  } else {
    link.removeAttribute('href');
    link.textContent = deployment.status === 'provisioning'
      ? 'Waiting for a web address…'
      : 'No web address yet';
  }

  document.getElementById('eame-host-model').textContent =
    deployment.model?.displayName
      ? `Running on ${deployment.model.displayName}, through Svarg's model gateway.`
      : '';

  // Spend against the cap is the number that decides when it stops working,
  // so it gets the bar rather than the request count.
  const spent = deployment.usage?.costUsd || 0;
  const cap   = deployment.limits?.maxCostUsd || 0;
  const pct   = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  document.getElementById('eame-host-usage-num').textContent = cap > 0
    ? `$${spent.toFixed(2)} of $${cap.toFixed(2)}`
    : `$${spent.toFixed(2)}`;
  document.getElementById('eame-host-usage-label').textContent =
    `${(deployment.usage?.requests || 0).toLocaleString()} requests this month`;
  const fill = document.getElementById('eame-host-usage-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('host-meter__fill--near', pct >= 80);
}

function showGatewayToken(token) {
  if (!token) return;
  const box = document.getElementById('eame-host-token');
  document.getElementById('eame-host-token-value').textContent = token;
  box.style.display = '';
}

async function loadDeployment() {
  if (!_bp?._id) return;
  try {
    const { deployment } = await api(`/strategy-canvas/transformation-blueprint/${_bp._id}/deployment`);
    renderHosting(deployment);
  } catch {
    // No deployment yet is the normal case, and not worth an error banner.
    renderHosting(null);
  }
}

async function deploy() {
  const btn = document.getElementById('eame-deploy-btn');
  btn.disabled = true;
  btn.textContent = 'Deploying…';
  document.getElementById('eame-error').style.display = 'none';
  try {
    const r = await api(`/strategy-canvas/transformation-blueprint/${_bp._id}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ repo: _repo }),
    });
    renderHosting(r.deployment);
    showGatewayToken(r.gatewayToken);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Deploy';
  }
}

async function removeDeployment() {
  if (!confirm('Remove this deployment? The container and its database are deleted, and the web address stops working. Your GitHub repository is untouched.')) return;
  const btn = document.getElementById('eame-host-remove');
  btn.disabled = true;
  btn.textContent = 'Removing…';
  try {
    await api(`/strategy-canvas/transformation-blueprint/${_bp._id}/deployment`, { method: 'DELETE' });
    document.getElementById('eame-host-token').style.display = 'none';
    renderHosting(null);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Remove';
  }
}

let _wired = false;

function wire() {
  if (_wired) return;
  _wired = true;
  document.getElementById('eame-deploy-btn').addEventListener('click', deploy);
  document.getElementById('eame-host-remove').addEventListener('click', removeDeployment);
  document.getElementById('eame-connect-btn').addEventListener('click', (e) => {
    e.preventDefault();
    goConnectGithub();
  });
  document.getElementById('eame-build-btn').addEventListener('click', push);
}

document.addEventListener('eame:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  _bp = bp;
  wire();

  // Screen switching lives in blueprintGenerate.js's showScreen list.
  document.dispatchEvent(new CustomEvent('screen:show', { detail: { id: 'screen-eame' } }));

  const useCase = renderBreadcrumb(bp);
  const nameField = document.getElementById('eame-repo-name');
  if (nameField && !nameField.value) nameField.value = slugify(useCase || bp.businessObjective);

  // A repository pushed in an earlier session still counts — hosting deploys
  // from what was delivered, not from what this page happens to remember.
  const delivered = bp.eameDelivery;
  if (delivered?.repoName) _repo = { owner: delivered.repoOwner, name: delivered.repoName };

  refreshGithubStatus().then(renderManifest);
  loadDeployment();
});
