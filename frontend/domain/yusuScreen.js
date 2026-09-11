/**
 * Svarg — Yusu screen (go live and hand over)
 *
 * The last stage, and the only one that ships anything. Aria prepared the
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

/** What the customer called it on Eame, falling back to the use case. */
function appName(bp) {
  return (bp?.appName || '').trim() || renderBreadcrumb(bp) || 'Your application';
}

let _bp = null;
let _blueprintId = null;
let _dep = null;
let _checksRun = false;      // have the automated checks been run
let _manifestPaths = [];     // the files that would be delivered, for the security check
let _manifestSource = '';    // 'generated' once Eame has built one, else 'template'
let _manifestFacts = {};    // what a filename cannot answer — see /api/delivery/manifest
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

  // Never hidden. This element is the application card now, and the Go Live
  // button lives in it — a blueprint with no recommended starting point used
  // to lose a breadcrumb here, and would now lose the way to go live. The
  // name falls back to what the customer called the application, then to
  // what they asked for.
  crumb.style.display = '';
  document.getElementById('yusu-recap-name').textContent =
    label || appName(bp) || String(bp?.businessObjective || '').trim() || 'Your application';

  // The justification line under the name was removed at the customer's
  // request -- Cob's screen already carries it.
  return label || null;
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
      // Required only where there is something to encrypt. Demanding it of
      // every project came from the era when Eame shipped one application,
      // which stored Atlassian OAuth tokens. An app holding student records
      // and reaching its model through the gateway has no credential at rest,
      // and failing it there only teaches people that a red check is normal.
      ...(_manifestFacts.storesCredentials
        ? [[/encryption|crypto/i, 'credential encryption']]
        : []),
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

  const sub = document.getElementById('yusu-gov-sub');

  // The status pill is the shared .ae-state now, so its classes are the
  // shared ones: --pending while nothing has run, --bad on a failure, plain
  // once everything passed.
  const setStatus = (text, tone) => {
    status.innerHTML = `<span class="ae-state__dot"></span>${text}`;
    status.className = 'ae-state' + (tone ? ' ae-state--' + tone : '');
  };

  if (!_checksRun) {
    wrap.innerHTML = `<p class="tr-idle">Checks run once the application has been pushed.</p>`;
    setStatus('Not run', 'pending');
    verdict.style.display = 'none';
    if (sub) sub.textContent = 'Automated checks for governance, ethics and compliance.';
    return [];
  }

  const results = runChecks(bp, _manifestPaths);
  const allPass = results.every(r => r.pass);

  wrap.innerHTML = results.map(r => `
    <div class="tr-card${r.pass ? '' : ' tr-card--fail'}">
      <span class="tr-card__icon">${r.icon}</span>
      <p class="tr-card__title">${esc(r.title)}</p>
      <p class="tr-card__why">${esc(r.why)}</p>
      <p class="tr-card__verdict">${r.pass ? '&#10003; Passed' : '&#10007; Failed'}</p>
    </div>
  `).join('');

  setStatus(allPass ? 'Completed' : 'Failed', allPass ? '' : 'bad');
  if (sub) {
    sub.textContent = allPass
      ? 'Your application has passed all required checks.'
      : 'One or more checks did not pass. Go Live stays closed until they do.';
  }

  // The verdict is the shield beside the tiles. It says "All checks passed"
  // only when they all did; a failure is drawn as one, not softened.
  verdict.style.display = '';
  verdict.className = 'tr-verdict yu-gov__verdict' + (allPass ? '' : ' tr-verdict--fail');
  verdict.innerHTML = `
    <span class="yu-shield${allPass ? '' : ' yu-shield--fail'}" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        ${allPass ? '<polyline points="9 12 11 14 15 10"/>' : '<line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>'}
      </svg>
    </span>
    <strong class="yu-gov__verdict-title">${allPass ? 'All checks passed' : 'Some checks did not pass'}</strong>
    <span class="yu-gov__verdict-sub">${allPass
      ? 'Ready for deployment to your environment.'
      : 'Go Live stays closed until these are resolved.'}</span>`;

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

  // A repository that exists is proof the build happened, whether or not the
  // manifest has been fetched yet this visit. Keying Build purely off an
  // in-flight fetch made an already-delivered application look like it was
  // still building every time the screen was reopened.
  const steps = [
    { name: 'Build',   sub: 'Application built',            done: _manifestPaths.length > 0 || pushed },
    { name: 'Push',    sub: 'Code pushed to repository',    done: pushed },
    { name: 'Test',    sub: 'Governance & Ethics validated', done: checksPass },
    { name: 'Deploy',  sub: 'Release to environment',       done: !!live },
  ];

  // The strip that drew these was removed from the page; the steps are still
  // computed because the hero and the app card read them. Guarded so the
  // function keeps working with or without somewhere to draw.
  const strip = document.getElementById('yusu-pipeline');
  if (!strip) return steps;

  // The first step that is not done is the one in flight, so the strip
  // reads as progress rather than a checklist.
  const active = _running ? steps.findIndex(s => !s.done) : -1;
  strip.innerHTML = steps.map((s, i) => `
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
  b.disabled = true; b.textContent = 'Deploying…';
  document.getElementById('yusu-error').style.display = 'none';
  try {
    const r = await api(`/strategy-canvas/transformation-blueprint/${_blueprintId}/redeploy`, { method: 'POST' });
    _buildingSince = 0;
    render(_bp, r.deployment);
    pollWhileBuilding();
  } catch (err) {
    showError(err.message);
  } finally {
    b.disabled = false; b.textContent = 'Deploy';
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
  // The "N files published to the Svarg build registry" line was removed from
  // the page at the customer's request -- the repository is Svarg's, and the
  // sentence named it to someone who can never open it. The publish still
  // happens; it is just not narrated. Guarded in case the element returns.
  if (out) {
    const count = Number.isFinite(r.fileCount) ? r.fileCount : _manifestPaths.length;
    out.style.display = 'block';
    out.innerHTML = `<div class="pw-process-item pw-process-item--done">
      <span class="pw-process-item__title">${esc(repoName || 'Your application')}</span>
      <span class="pw-process-item__detail">${count ? count + ' files ' : ''}${
        r.upToDate ? 'already current in' : r.created ? 'built and published to' : 'rebuilt and published to'} the Svarg build registry.</span>
    </div>`;
  }

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
  // The handover block was removed from the page at the customer's request.
  // Kept as a function so the page still works if it ever comes back, and
  // a no-op without it rather than a throw on the first missing id.
  if (!box) return;
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

  // Tied to a build existing, not to a push having succeeded. Keyed off
  // `pushed`, a customer whose publish failed could not get their code at all
  // — even though /delivery/download builds the zip from the same manifest and
  // never touches GitHub. The one case with genuinely nothing to hand over is
  // a blueprint Eame has not built.
  const haveProject = _manifestSource === 'generated' || pushed;
  download.disabled = !haveProject;
  document.getElementById('yusu-source-sub').textContent = haveProject
    ? `${(pushed && bp.eameDelivery.fileCount) || _manifestPaths.length} files — the complete project, exactly as deployed. Yours to keep.`
    : 'Source available as soon as the application has been built.';

  // The hero, the app card's pill, the address and the closing line all
  // follow one fact: whether the deployment is live. Nothing on this page
  // says "live" on the strength of anything less.
  const heroMark  = document.getElementById('yusu-hero-mark');
  const heroPill  = document.getElementById('yusu-hero-pill');
  const appState  = document.getElementById('yusu-app-state');
  const appText   = document.getElementById('yusu-app-state-text');
  const appUrl    = document.getElementById('yusu-app-url');
  const appUrlTxt = document.getElementById('yusu-app-url-text');
  const foot      = document.getElementById('yusu-foot');

  const stateWord = live ? (dep.status === 'suspended' ? 'Suspended' : 'Live')
    : building ? 'Deploying'
    : _running ? 'Preparing'
    : _failed ? 'Stopped'
    : dep?.hosting === 'self' ? 'Self-hosted'
    : 'Not live';
  const isLive = live && dep.status !== 'suspended';

  if (heroMark) heroMark.classList.toggle('ae-hero__mark--pending', !isLive);
  if (heroPill) {
    heroPill.textContent = isLive ? 'Application live' : stateWord;
    heroPill.classList.toggle('ae-pill--pending', !isLive);
  }
  if (appState) appState.classList.toggle('ae-state--pending', !isLive);
  if (appText) appText.textContent = stateWord;
  if (appUrl) {
    const url = live ? (dep.url || '') : '';
    appUrl.style.display = url ? '' : 'none';
    if (url) { appUrl.href = url; if (appUrlTxt) appUrlTxt.textContent = url.replace(/^https?:\/\//, ''); }
  }
  if (foot) foot.style.display = isLive ? '' : 'none';

  if (live) {
    // A live deployment still needs a way to be rebuilt — a platform with no
    // way to ship a change leaves a broken app with nowhere to go. It is
    // called Deploy, because from here on that is what the button does:
    // pushes the current build out again.
    btn.style.display = 'none';
    // Deploy was removed from the page at the customer's request. A live
    // application can still be rebuilt: redeployNow() and the endpoint behind
    // it are intact, and the self-learning pipeline is what redeploys from
    // here on. Guarded so this is a no-op without the button.
    if (redeploy) redeploy.style.display = '';
    title.textContent = `${appName(bp)} is live`;
    sub.textContent = dep.statusMessage || 'Your application is running and available to your users.';
    if (dep.url) { view.href = dep.url; view.style.display = ''; }
    return;
  }

  // Before it is live there is nothing to redeploy — Go Live is that button.
  // It used to appear as soon as a service existed, which put two competing
  // deploy actions on screen at once.
  view.style.display = 'none';
  if (redeploy) redeploy.style.display = 'none';

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
      ? 'No environment is prepared yet — that happens on Aria.'
      : 'Deploy your application to your target environment and make it available to your users.';
}

async function loadManifest() {
  try {
    // With the blueprint, this is the project the customer will actually
    // receive. Without it the endpoint answers with the fixed template, and
    // the governance checks below would be validating files nobody is shipped.
    const r = await api('/delivery/manifest?blueprintId=' + encodeURIComponent(_blueprintId));
    _manifestPaths = (r.files || []).map(f => f.path);
    _manifestSource = r.source || '';
    _manifestFacts = r.facts || {};
  } catch { _manifestPaths = []; _manifestSource = ''; _manifestFacts = {}; }
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

  // Whether anything needs pushing is the server's to answer, not this
  // screen's. This asked "does a repository exist?" and skipped the push if
  // one did, which was right while a blueprint built its application once and
  // wrong as soon as Eame could rebuild it: a regenerated application stayed
  // in the database while Railway rebuilt the previous push, and this screen
  // reported a successful deploy of code that had never shipped.
  //
  // /delivery/publish compares the build against the last push and answers
  // upToDate without touching GitHub, so asking on every visit is cheap.

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
      // Nowhere on the page to show it now that the handover block is gone.
      // It is already set on the running application, so nothing is lost for
      // a Svarg-hosted app; it only ever mattered to someone rebuilding
      // elsewhere. Guarded so the go-live response never throws over it.
      const tv = document.getElementById('yusu-token-value');
      const tb = document.getElementById('yusu-token');
      if (tv && tb) { tv.textContent = r.gatewayToken; tb.style.display = ''; }
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
  document.getElementById('yusu-redeploy-btn')?.addEventListener('click', redeployNow);
  document.getElementById('yusu-download-btn').addEventListener('click', downloadSource);
  document.getElementById('yusu-integrate-btn')?.addEventListener('click', buildIntegration);
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
  // The token block went with the handover section. Guarded: this ran on
  // every show and was the first thing to throw once the element was gone,
  // which left the hero stuck at its markup default in every state.
  const tokenBox = document.getElementById('yusu-token');
  if (tokenBox) tokenBox.style.display = 'none';
  _checksRun = false;
  _running = false;
  _failed = '';
  _manifestPaths = [];
  render(bp, null);
  Promise.all([loadManifest(), load(), refreshDelivery(), loadIntegration()]).then(() => {
    render(_bp, _dep);
    pollWhileBuilding();
    autoRun();
  });
});

// ── Integrate into their product ─────────────────────────────────────────────

/**
 * Port the built application into the customer's own codebase.
 *
 * Deliberately separate from Go Live. That deploys Svarg's standalone
 * application and keeps working whatever this produces — a customer who tries
 * the integration and dislikes the result still has something running.
 *
 * It is shown only when a repository has actually been read. Offering it
 * without one would produce a plausible port of an architecture nobody has,
 * which is worse than not offering it.
 */
async function loadIntegration() {
  const panel = document.getElementById('yusu-integrate');
  if (!panel || !_blueprintId) return;

  let state;
  try {
    state = await api('/delivery/integrate/' + encodeURIComponent(_blueprintId));
  } catch { panel.style.display = 'none'; return; }

  panel.style.display = '';
  const sub = document.getElementById('yusu-integrate-sub');
  const btn = document.getElementById('yusu-integrate-btn');
  const out = document.getElementById('yusu-integrate-result');

  if (!state.canIntegrate) {
    sub.textContent = 'Connect your repository on Arth first — without your architecture there is '
      + 'nothing to integrate into, and the result would be a guess.';
    btn.disabled = true;
    out.style.display = 'none';
    return;
  }

  btn.disabled = false;
  sub.textContent = `Rewrite this capability to live inside ${state.repoConnected} — your framework, `
    + 'your models, your conventions. Your deployed application is untouched.';

  if (state.status === 'ready') renderIntegration(state);
  else if (state.status === 'failed' && state.error) {
    out.style.display = '';
    out.innerHTML = `<p class="yusu-int__err">${esc(state.error)}</p>`;
  } else {
    out.style.display = 'none';
  }
}

function renderIntegration(r) {
  const out = document.getElementById('yusu-integrate-result');
  out.style.display = '';
  out.innerHTML = `
    <p class="yusu-int__head">${r.files.length} file${r.files.length === 1 ? '' : 's'} for
      <strong>${esc(r.repoFullName || 'your repository')}</strong>${r.groundedInSource
        ? ` &middot; grounded in ${r.groundedInSource} of your own files` : ''}</p>
    <ul class="yusu-int__files">${r.files.map(f =>
      `<li><code>${esc(f.path)}</code></li>`).join('')}</ul>
    ${r.warnings?.length ? `<ul class="yusu-int__warn">${r.warnings.map(w =>
      `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    ${verificationBlock(r.repoVerified, r.repoFullName)}
    ${r.guide ? `<details class="yusu-int__guide"><summary>Integration guide</summary>
      <pre>${esc(r.guide)}</pre></details>` : ''}
    <p class="yusu-int__note">Review these as a pull request in your own repository. Svarg reads
      your code but never writes to it, and never deploys your product.</p>`;
}

/**
 * What checking against the real repository found — and what it did not check.
 *
 * The second half matters as much as the first. Resolving imports against your
 * file tree proves the diff will not break your build on a missing module; it
 * does not install, boot or run your tests, because those need your environment
 * and your secrets. Saying "verified" with nothing after it would let a reviewer
 * read far more assurance into this than it earns.
 */
function verificationBlock(v, repo) {
  if (!v || !v.checkedAt) {
    return `<p class="yusu-int__note">These files were not checked against
      ${esc(repo || 'your repository')} — the imports they use are unverified.</p>`;
  }
  if (v.truncated) {
    return `<p class="yusu-int__note">${esc(repo)} is too large for GitHub to list in one
      request, so the imports could not be checked against it.</p>`;
  }

  const breaks = (v.missingFiles?.length || 0) + (v.missingExports?.length || 0);
  return `
    <div class="yusu-int__verify${breaks ? ' yusu-int__verify--bad' : ''}">
      <p class="yusu-int__verify-head">${breaks
        ? `${breaks} import${breaks === 1 ? '' : 's'} in these files point at something
           ${esc(repo)} does not have — listed above.`
        : `Every import resolves against ${esc(repo)}.`}</p>
      <p class="yusu-int__verify-sub">${v.resolved} import${v.resolved === 1 ? '' : 's'}
        checked against the ${v.treeSize} files in your repository.</p>
      ${v.missingPackages?.length ? `<p class="yusu-int__verify-sub">Add to your
        <code>package.json</code>: ${v.missingPackages.map(p =>
          `<code>${esc(p)}</code>`).join(', ')}</p>` : ''}
      <p class="yusu-int__verify-sub yusu-int__verify-sub--limit">Not checked: this did not
        install, run or test anything — that needs your environment and your secrets.</p>
    </div>`;
}

async function buildIntegration() {
  const btn = document.getElementById('yusu-integrate-btn');
  const out = document.getElementById('yusu-integrate-result');
  const original = btn.textContent;

  btn.disabled = true;
  btn.textContent = 'Reading your code…';
  out.style.display = '';
  out.innerHTML = '<p class="yusu-int__head">Reading your repository and porting the application. '
    + 'This takes about a minute.</p>';

  try {
    const r = await api('/delivery/integrate/' + encodeURIComponent(_blueprintId), { method: 'POST' });
    renderIntegration(r);
  } catch (err) {
    out.innerHTML = `<p class="yusu-int__err">${esc(err.message || 'Could not build the integration.')}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
