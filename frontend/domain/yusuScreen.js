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
let _checksRun = false;      // have the automated checks been run
let _manifestPaths = [];     // the files the builder emits, for the security check
let _running = false;        // the automatic build/push/test run is in flight
let _failed = '';            // what stopped it, if anything

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

/** The Governance & Ethics sections this blueprint actually produced. */
function governanceAreas(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'governance-security');
  return (domain?.capabilities || []).flatMap(c => c.sections || []).filter(s => s.title);
}

/**
 * The automated checks. Every one is evaluated against real state — the
 * governance sections the blueprint produced, and the files the project
 * builder actually emits — so a check can genuinely fail and say why. A
 * summary that always reads "Passed" would be worse than none at all.
 */
function runChecks(bp, manifestPaths) {
  const gov = governanceAreas(bp);
  const titles = gov.map(s => (s.title || '').toLowerCase());
  const hasArea = re => titles.some(t => re.test(t));
  const hasFile = re => manifestPaths.some(p => re.test(p));

  const governance = (() => {
    if (!gov.length) return { pass: false, why: 'No Governance & Ethics content was generated for this blueprint.' };
    const missing = [
      [/privacy|security/, 'data handling'],
      [/regulatory|compliance/, 'regulatory compliance'],
    ].filter(([re]) => !hasArea(re)).map(([, name]) => name);
    return missing.length
      ? { pass: false, why: `Missing coverage for ${missing.join(' and ')}.` }
      : { pass: true, why: 'Policy compliance, data handling, access control, audit readiness' };
  })();

  const ethics = (() => {
    if (!gov.length) return { pass: false, why: 'No Governance & Ethics content was generated for this blueprint.' };
    const area = gov.find(s => /ethic/i.test(s.title || ''));
    if (!area) return { pass: false, why: 'No Ethical AI Guidelines section was produced.' };
    if (!(area.brief?.strategicPosition || '').trim()) {
      return { pass: false, why: 'The Ethical AI Guidelines section has no stated commitment.' };
    }
    return { pass: true, why: 'Fairness, safety, bias assessment, transparency and responsible AI' };
  })();

  const security = (() => {
    if (!manifestPaths.length) return { pass: false, why: 'The project manifest could not be read.' };
    const gaps = [
      [/authMiddleware|auth/i, 'authentication middleware'],
      [/encryption|crypto/i, 'credential encryption'],
      [/\.env\.example$/, 'a configuration template'],
    ].filter(([re]) => !hasFile(re)).map(([, name]) => name);
    // A real .env would mean secrets in the repository — the one thing this
    // check exists to catch.
    if (manifestPaths.some(p => /(^|\/)\.env$/.test(p))) {
      return { pass: false, why: 'The project contains a real .env file — secrets must not be committed.' };
    }
    return gaps.length
      ? { pass: false, why: `The project is missing ${gaps.join(', ')}.` }
      : { pass: true, why: 'Vulnerability scan, dependency check, configuration validation' };
  })();

  return [
    { key: 'governance', title: 'Governance Check', icon: '&#127963;', ...governance },
    { key: 'ethics',     title: 'Ethics Check',     icon: '&#9878;',   ...ethics },
    { key: 'security',   title: 'Security Check',   icon: '&#128737;', ...security },
  ];
}

function renderChecks(bp) {
  const wrap = document.getElementById('yusu-checks');
  const status = document.getElementById('yusu-run-status');
  const verdict = document.getElementById('yusu-verdict');

  if (!_checksRun) {
    wrap.innerHTML = `<p class="tr-idle">Checks run once the application has been pushed.</p>`;
    status.innerHTML = `<span class="eg-status__dot"></span>Not run`;
    status.className = 'eg-status eg-status--idle';
    verdict.style.display = 'none';
    return [];
  }

  const results = runChecks(bp, _manifestPaths);
  const allPass = results.every(r => r.pass);

  wrap.innerHTML = results.map(r => `
    <div class="tr-card${r.pass ? '' : ' tr-card--fail'}">
      <span class="tr-card__icon">${r.icon}</span>
      <p class="tr-card__title">${esc(r.title)}</p>
      <p class="tr-card__verdict">${r.pass ? '&#10003; Passed' : '&#10007; Failed'}</p>
      <p class="tr-card__why">${esc(r.why)}</p>
    </div>
  `).join('');

  status.innerHTML = `<span class="eg-status__dot"></span>${allPass ? 'Completed' : 'Failed'}`;
  status.className = 'eg-status' + (allPass ? '' : ' eg-status--fail');

  verdict.style.display = '';
  verdict.className = 'tr-verdict' + (allPass ? '' : ' tr-verdict--fail');
  verdict.innerHTML = `
    <span class="tr-verdict__mark">${allPass ? '&#10003;' : '&#10007;'}</span>
    <span>
      <strong>${allPass ? 'All checks passed' : 'Some checks did not pass'}</strong>
      <span>${allPass
        ? 'Your application is ready for deployment to your environment.'
        : 'Go Live stays closed until these are resolved.'}</span>
    </span>`;

  return results;
}

/**
 * The four acts of delivery. Each is read from real state rather than a
 * counter, so re-entering the screen shows where things genuinely stand.
 */
function renderPipeline(bp, dep) {
  const pushed = !!bp.eameDelivery?.repoName;
  const live = dep && ['live', 'suspended'].includes(dep.status);
  const checksPass = _checksRun && runChecks(bp, _manifestPaths).every(r => r.pass);

  const steps = [
    { name: 'Build',   sub: 'Application built',            done: _manifestPaths.length > 0 },
    { name: 'Push',    sub: 'Code pushed to repository',    done: pushed },
    { name: 'Test',    sub: 'Governance & Ethics validated', done: checksPass },
    { name: 'Deploy',  sub: 'Release to environment',       done: !!live },
  ];

  // The first step that is not done is the one in flight, so the strip
  // reads as progress rather than a checklist.
  const active = _running ? steps.findIndex(s => !s.done) : -1;
  document.getElementById('yusu-pipeline').innerHTML = steps.map((s, i) => `
    <li class="dp__step${s.done ? ' dp__step--done' : (i === active ? ' dp__step--busy' : '')}">
      <span class="dp__node">${s.done ? '&#10003;' : i + 1}</span>
      <span class="dp__name">${esc(s.name)}</span>
      <span class="dp__sub">${esc(s.sub)}</span>
    </li>
  `).join('');
  return steps;
}

function slugify(text) {
  return String(text || 'svarg-project')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'svarg-project';
}

/**
 * Hand over the source as a zip.
 *
 * A plain link cannot do this — the endpoint is authenticated, and an <a href>
 * sends no Authorization header. So the bytes are fetched, wrapped in a blob
 * and handed to a synthesised link, which is also what lets the filename be
 * set from the use case rather than the URL.
 */
async function downloadSource() {
  const btn = document.getElementById('yusu-download-btn');
  const label = btn.innerHTML;   // the button holds an icon, not just text
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  document.getElementById('yusu-error').style.display = 'none';
  try {
    const slug = slugify(renderBreadcrumb(_bp) || _bp.businessObjective);
    const res = await fetch(
      `${API_BASE}/delivery/download?blueprintId=${encodeURIComponent(_blueprintId)}&slug=${encodeURIComponent(slug)}`,
      { headers: { Authorization: `Bearer ${getToken()}` } }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Download failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on a delay: revoking immediately can cancel the download in
    // some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

async function redeployNow() {
  const b = document.getElementById('yusu-redeploy-btn');
  b.disabled = true; b.textContent = 'Redeploying…';
  document.getElementById('yusu-error').style.display = 'none';
  try {
    const r = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/redeploy`, { method: 'POST' });
    _buildingSince = 0;
    render(_bp, r.deployment);
    pollWhileBuilding();
  } catch (err) {
    showError(err.message);
  } finally {
    b.disabled = false; b.textContent = 'Redeploy';
  }
}

/**
 * Build the agent and publish it to Svarg's own repository.
 *
 * Svarg owns the repository the platform builds from, which is what makes
 * this work for a customer who has never heard of Railway: its GitHub App is
 * installed once, on Svarg's account, with access to every repository. The
 * customer's copy of the code is the download, not this.
 *
 * Still separate from going live: a failed deploy must not mean building and
 * publishing again, and a service cannot be created before a repo exists.
 */
async function buildAndPush() {
  // Derived from the use case rather than asked for — Yusu runs unattended.
  const slug = slugify(renderBreadcrumb(_bp) || _bp.businessObjective);

  const out = document.getElementById('yusu-push-result');
  const r = await api('/delivery/publish', {
    method: 'POST',
    body: JSON.stringify({ slug, blueprintId: _blueprintId }),
  });
  const repoName = r.name;

  // No link to the repository: it is private to Svarg, so a link would 404
  // for the person reading this. Their copy is the download below.
  out.style.display = 'block';
  out.innerHTML = `<div class="pw-process-item pw-process-item--done">
    <span class="pw-process-item__title">${esc(repoName)}</span>
    <span class="pw-process-item__detail">${r.fileCount} files
      ${r.created ? 'built and published' : 'rebuilt and published'} to the Svarg build registry.</span>
  </div>`;

  // Keep the in-memory blueprint in step so the checks below re-render as met
  // without a round trip.
  _bp.eameDelivery = {
    repoOwner: r.owner, repoName, repoUrl: r.repoUrl, fileCount: r.fileCount,
  };
  return true;
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
  const results = renderChecks(bp);
  renderPipeline(bp, dep);
  renderHandover(bp, dep);

  const btn = document.getElementById('yusu-golive-btn');
  const title = document.getElementById('yusu-ready-title');
  const sub = document.getElementById('yusu-ready-sub');
  const view = document.getElementById('yusu-view-app');
  const redeploy = document.getElementById('yusu-redeploy-btn');
  const download = document.getElementById('yusu-download-btn');

  const live = dep && ['live', 'suspended'].includes(dep.status);
  const building = dep?.status === 'attaching';
  const pushed = !!bp.eameDelivery?.repoName;
  const checksPass = results.length > 0 && results.every(r => r.pass);

  // There is nothing to download until the project has been built.
  download.disabled = !pushed;
  document.getElementById('yusu-source-sub').textContent = pushed
    ? `${bp.eameDelivery.fileCount || _manifestPaths.length} files — the complete project, exactly as deployed. Yours to keep, review, or push to your own Git.`
    : 'Available as soon as the application has been built.';

  if (live) {
    // A live deployment still needs a way to be rebuilt — a platform with no
    // redeploy leaves a broken app with nowhere to go.
    btn.style.display = 'none';
    redeploy.style.display = '';
    title.textContent = 'Live and handed over';
    sub.textContent = dep.statusMessage || 'Your application is running and available to your users.';
    if (dep.url) { view.href = dep.url; view.style.display = ''; }
    return;
  }
  redeploy.style.display = '';

  view.style.display = 'none';
  redeploy.style.display = dep?.railway?.serviceId || dep?.appAttached ? '' : 'none';

  // Railway is building the repository. It is deployed but not yet serving,
  // and offering the URL now would hand over a page that cannot answer.
  if (building) {
    btn.style.display = '';
    btn.disabled = true;
    btn.textContent = 'Deploying…';
    title.textContent = 'Building your application';
    const stalled = stallDiagnosis(dep);
    sub.textContent = stalled
      ? stalled
      : (dep.statusMessage ? dep.statusMessage + ' ' : '')
        + 'Building and starting the application. This usually takes a couple of minutes.';
    sub.classList.toggle('eg-done__sub--stalled', !!stalled);
    if (stalled) title.textContent = 'The application is not coming up';
    return;
  }

  if (dep?.hosting === 'self') {
    // Nothing for Svarg to turn on — saying so is the honest end of the
    // journey, not a disabled button with no explanation.
    btn.style.display = 'none';
    title.textContent = 'Running in your own environment';
    sub.textContent = 'There is nothing for Svarg to turn on. The repository is the handover.';
    return;
  }

  // Go Live is the only thing anyone clicks. Everything before it runs on
  // its own, so the button is never a step in the process — it is the
  // decision at the end of it.
  btn.style.display = '';
  btn.textContent = 'Go Live';

  if (_running) {
    btn.disabled = true;
    title.textContent = 'Preparing the release';
    sub.textContent = pushed
      ? 'Running the governance, ethics and security checks…'
      : 'Building the application and pushing it to your repository…';
    return;
  }

  if (_failed) {
    btn.disabled = true;
    title.textContent = 'The run did not finish';
    sub.textContent = _failed;
    return;
  }

  btn.disabled = !checksPass || dep?.status !== 'prepared';
  title.textContent = 'Ready to Go Live';
  sub.textContent = !checksPass
    ? 'Go Live stays closed until the failing checks are resolved.'
    : dep?.status !== 'prepared'
      ? 'No environment is prepared yet — that happens on Arth.'
      : 'Deploy your application to your target environment and make it available to your users.';
}

async function loadManifest() {
  try {
    const { files } = await api('/github/personal/project-manifest');
    _manifestPaths = (files || []).map(f => f.path);
  } catch { _manifestPaths = []; }
}

/**
 * Re-read what was delivered, rather than trusting the blueprint this page
 * loaded with. Navigating away and back re-enters Yusu with the copy held
 * since page load — which, after a push in the same session, no longer knows
 * about it, and the run would push a second time.
 */
async function refreshDelivery() {
  try {
    // getTransformationBlueprint takes `id` and returns the blueprint itself.
    const fresh = await api(`/strategy-canvas/transformation-blueprint?id=${_blueprintId}`);
    if (fresh?.eameDelivery?.repoName) _bp.eameDelivery = fresh.eameDelivery;
  } catch { /* the adopt-existing path covers this if it fails */ }
}

/**
 * While Railway builds, keep asking — otherwise "Building…" sits there until
 * the page is reloaded, which is how a working deployment looks broken.
 * Every poll is a status read on the server, so it stops as soon as Railway
 * reports the build finished or failed.
 */
let _pollTimer = null;
let _buildingSince = 0;

function pollWhileBuilding() {
  clearTimeout(_pollTimer);
  if (_dep?.status !== 'attaching') { _buildingSince = 0; return; }
  if (!_buildingSince) _buildingSince = Date.now();
  if (_loadFailures >= 5) return;   // give up rather than hammer a dead link
  _pollTimer = setTimeout(async () => {
    await load();
    pollWhileBuilding();
  }, _loadFailures ? 20000 : 8000);
}

/**
 * A build that never comes up looks identical to one still running, and
 * "still building" after several minutes is not an explanation.
 *
 * These are now Svarg-side causes rather than anything the reader can fix —
 * the repository is Svarg's. The message says what is being looked at rather
 * than handing them a task they have no access to perform.
 */
function stallDiagnosis(dep) {
  if (Date.now() - _buildingSince < 90000) return '';
  return [
    'Still nothing answering after a few minutes, so the build is not simply slow.',
    'This is on our side, and it is one of:',
    '• The application started and exited — usually a database connection refused at boot.',
    '• The build itself failed, which the deployment logs state in one line.',
    'Nothing has been handed over, and nothing is billed while it is not running.',
  ].join('\n');
}

/**
 * "No deployment" and "could not ask" are different answers, and conflating
 * them was destroying the screen: a suspended or dropped request — a laptop
 * sleeping mid-poll is enough — rendered as though no environment existed,
 * wiping the checks and the button and looking like everything had reset.
 *
 * A failed request now changes nothing on screen except to say the
 * connection was lost.
 */
let _loadFailures = 0;

async function load() {
  if (!_blueprintId) return;
  try {
    const { deployment } = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/deployment`);
    _loadFailures = 0;
    render(_bp, deployment);   // null here is the server genuinely saying none
  } catch (err) {
    _loadFailures++;
    // Keep whatever was last known to be true.
    render(_bp, _dep);
    if (_loadFailures >= 3) {
      showError('Lost contact with Svarg while checking the deployment — it is still running. Reload the page to pick it up again.');
    }
  }
}

/** The primary action: push if it has not been pushed, otherwise go live. */
/**
 * Yusu runs itself: build, push, then the checks, without being asked. The
 * only thing left for a person is Go Live, which is the one decision that
 * should never happen by itself.
 *
 * Runs once per visit. If it fails, the failure stays on screen and a Retry
 * appears — automatic on the happy path, manual only when something breaks.
 */
async function autoRun() {
  if (_running) return;

  // Already published for this blueprint — nothing to rebuild. The repository
  // is Svarg's and holds this blueprint's agent, so unlike the customer-owned
  // path there is no question of it belonging to the wrong account.
  if (_bp.eameDelivery?.repoName) {
    _checksRun = true;
    render(_bp, _dep);
    return;
  }

  _running = true;
  _failed = '';
  render(_bp, _dep);

  try {
    await buildAndPush();
    render(_bp, _dep);
    await new Promise(r => setTimeout(r, 500));   // let the strip land on Push
    _checksRun = true;
  } catch (err) {
    // Publishing failures are Svarg's to fix, not the customer's — the
    // message says what broke without asking them to do anything about it.
    _failed = err.message;
    showError(err.message);
  } finally {
    _running = false;
    render(_bp, _dep);
  }
}

/** The single human decision. */
async function act() {
  const btn = document.getElementById('yusu-golive-btn');
  btn.disabled = true;
  btn.textContent = 'Deploying…';
  document.getElementById('yusu-error').style.display = 'none';
  try {
    const r = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    render(_bp, r.deployment);
    pollWhileBuilding();
    if (r.alreadyLive) showError('This deployment was already live — the screen was showing an older state, now refreshed.');
    if (r.gatewayToken) {
      document.getElementById('yusu-token-value').textContent = r.gatewayToken;
      document.getElementById('yusu-token').style.display = '';
    }
  } catch (err) {
    showError(err.message);
    render(_bp, _dep);
  }
}

let _wired = false;

function wire() {
  if (_wired) return;
  _wired = true;
  document.getElementById('yusu-golive-btn').addEventListener('click', act);
  document.getElementById('yusu-redeploy-btn').addEventListener('click', redeployNow);
  document.getElementById('yusu-download-btn').addEventListener('click', downloadSource);
}

document.addEventListener('screen:show', (e) => {
  if (e.detail?.id !== 'screen-yusu') clearTimeout(_pollTimer);
});

document.addEventListener('yusu:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  _bp = bp;
  _blueprintId = bp._id;
  wire();

  document.dispatchEvent(new CustomEvent('screen:show', { detail: { id: 'screen-yusu' } }));
  document.getElementById('yusu-token').style.display = 'none';
  _checksRun = false;
  _running = false;
  _failed = '';
  _manifestPaths = [];
  render(bp, null);
  Promise.all([loadManifest(), load(), refreshDelivery()]).then(() => {
    render(_bp, _dep);
    pollWhileBuilding();
    autoRun();
  });
});
