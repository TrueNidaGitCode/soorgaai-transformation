/**
 * Svarg — Yusu screen (go live and hand over)
 *
 * The last stage. Arth prepared the environment, Eame wrote the application;
 * Yusu attaches the two, turns it on, and states plainly what the customer
 * now owns and what Svarg runs for them.
 *
 * Going live is POST .../deploy — the same endpoint Eame used to call. It
 * moved here rather than being rewritten, because the split was drawn along
 * the line that actually constrains it: Railway cannot create a service until
 * a repository exists, so preparing and attaching were always two acts.
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
 * The three things that must hold before this can go live. Each carries the
 * stage that fixes it, so an unmet one is a direction rather than a dead end.
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
      ok: !!bp.eameDelivery?.repoName,
      title: 'The application is built',
      done: bp.eameDelivery?.repoName
        ? `${bp.eameDelivery.repoOwner}/${bp.eameDelivery.repoName} — ${bp.eameDelivery.fileCount || 0} files`
        : '',
      todo: 'Build and push it on Eame.',
      goto: 'eame',
    },
  ];
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
      ${c.ok ? '' : `<button type="button" class="yusu-check__go" data-goto="${c.goto}">Go to ${c.goto[0].toUpperCase() + c.goto.slice(1)}</button>`}
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
  btn.style.display = '';
  btn.disabled = blocked.length > 0;
  hint.textContent = blocked.length
    ? `Waiting on: ${blocked.map(c => c.title.toLowerCase()).join(', ')}.`
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

async function goLive() {
  const btn = document.getElementById('yusu-golive-btn');
  btn.disabled = true;
  btn.textContent = 'Going live…';
  document.getElementById('yusu-error').style.display = 'none';
  try {
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
    showError(err.message);
    btn.disabled = false;
  } finally {
    btn.textContent = 'Go Live';
  }
}

let _wired = false;

function wire() {
  if (_wired) return;
  _wired = true;
  document.getElementById('yusu-golive-btn').addEventListener('click', goLive);
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
  render(bp, null);
  load();
});
