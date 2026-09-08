/**
 * Svarg — Sales Signals (platform admin only)
 *
 * Renders the board built by services/salesSignalsService.js. The same service
 * backs scripts/sales_agent.mjs, so this screen and the terminal can never show
 * different numbers.
 *
 * The ask box does NOT send the board up with the question — the server rebuilds
 * it. A client that could supply the board could supply the facts, and the whole
 * value of this screen is that a row can be trusted while dialling.
 *
 * Client-side role guard only — the backend independently enforces adminOnly on
 * every /api/admin/sales-signals/* route.
 */

const API_BASE = window.CONFIG.API_BASE;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}/admin/sales-signals${path}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function banner(message, isError = true) {
  const el = document.getElementById('sg-banner');
  if (!message) { el.style.display = 'none'; return; }
  el.textContent = message;
  el.className = `cl-banner ${isError ? 'error' : 'success'}`;
  el.style.display = 'block';
}

// ── Formatting ───────────────────────────────────────────────────────────────

function age(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return d < 1 ? `${d.toFixed(1)}d` : `${Math.round(d)}d`;
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function stat(value, label, tone = '') {
  return `<div class="sg-stat ${tone}">
    <div class="sg-stat__value">${value}</div>
    <div class="sg-stat__label">${esc(label)}</div>
  </div>`;
}

function renderSummary(s) {
  document.getElementById('sg-summary').innerHTML = [
    stat(s.outreach.length, 'Unclaimed blueprints'),
    stat(s.conversion.length, 'Approved, not built'),
    stat(s.onboarding.length, 'Built, not live'),
    stat(s.quiet.length, 'Live but quiet', s.quiet.length ? 'sg-stat--risk' : ''),
    stat(s.active.length, 'Live and used', 'sg-stat--good'),
  ].join('');
  document.getElementById('sg-summary').style.display = 'grid';
}

/**
 * One section. `cols` are header labels; `row` returns the <td> cells.
 */
function section(title, stage, rows, cols, row) {
  const body = rows.length
    ? `<table class="cl-table">
         <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
         <tbody>${rows.map(row).join('')}</tbody>
       </table>`
    : '<div class="sg-empty">Nothing here right now.</div>';

  return `<div class="admin-panel sg-section">
    <div class="panel-header">
      <h2>${esc(title)} <span class="sg-section__count">· ${rows.length}</span></h2>
      <div class="sg-section__stage">${esc(stage)}</div>
    </div>
    ${body}
  </div>`;
}

function renderBoard(s) {
  const html = [
    section('Unclaimed blueprints', 'Outreach — proven demand, no way to contact them',
      s.outreach, ['Visits', 'Last seen', 'Who', 'Objective', 'What happened'],
      r => `<tr>
        <td><span class="sg-visits ${r.visits > 1 ? 'sg-visits--repeat' : ''}">${r.visits}×</span></td>
        <td class="sg-age">${age(r.at)}</td>
        <td class="sg-who">${esc(r.who)}</td>
        <td>${esc(clip(r.objective, 90))}</td>
        <td class="sg-note">${esc(r.note)}</td>
      </tr>`),

    section('Approved, not built', 'Conversion — the decision is made, something after it stopped them',
      s.conversion, ['Age', 'Who', 'Objective', 'What happened'],
      r => `<tr>
        <td class="sg-age">${age(r.at)}</td>
        <td class="sg-who">${esc(r.who)}</td>
        <td>${esc(clip(r.objective, 90))}</td>
        <td class="sg-note">${esc(r.note)}</td>
      </tr>`),

    section('Built, not live', 'Onboarding — the work is done and delivering nothing',
      s.onboarding, ['Age', 'Who', 'Application', 'What happened'],
      r => `<tr>
        <td class="sg-age">${age(r.at)}</td>
        <td class="sg-who">${esc(r.who)}</td>
        <td>${esc(clip(r.objective, 90))}</td>
        <td class="sg-note">${esc(r.note)}</td>
      </tr>`),

    section('Live but quiet', 'Post-sales — the earliest churn evidence you get',
      s.quiet, ['Age', 'Who', 'Objective', 'What happened'],
      r => `<tr>
        <td class="sg-age">${age(r.at)}</td>
        <td class="sg-who">${esc(r.who)}</td>
        <td>${esc(clip(r.objective, 90))}</td>
        <td class="sg-note">${esc(r.note)}</td>
      </tr>`),

    section('Live and used', 'Post-sales — value realised',
      s.active, ['Last query', 'Who', 'Objective', 'Usage'],
      r => `<tr>
        <td class="sg-age">${age(r.at)}</td>
        <td class="sg-who">${esc(r.who)}</td>
        <td>${esc(clip(r.objective, 90))}</td>
        <td class="sg-note">${esc(r.note)}</td>
      </tr>`),

    section('Depth of use', 'Expansion — where the spend actually goes',
      s.expansion, ['Spend', 'Who', 'Calls', 'By stage'],
      r => `<tr>
        <td>$${(r.costUsd || 0).toFixed(4)}</td>
        <td class="sg-who">${esc(r.who)}</td>
        <td>${r.calls}</td>
        <td class="sg-note">${esc(r.note)}</td>
      </tr>`),
  ].join('');

  const board = document.getElementById('sg-board');
  board.innerHTML = html;
  board.style.display = 'block';
}

// ── Loading ──────────────────────────────────────────────────────────────────

async function load() {
  document.getElementById('sg-loading').style.display = 'block';
  document.getElementById('sg-board').style.display = 'none';
  banner('');

  try {
    const { signals } = await api('');
    renderSummary(signals);
    renderBoard(signals);
    document.getElementById('sg-generated').textContent =
      `Read at ${new Date(signals.generatedAt).toLocaleTimeString()}`;
  } catch (err) {
    banner(`Could not load the board: ${err.message}`);
  } finally {
    document.getElementById('sg-loading').style.display = 'none';
  }
}

async function handleAsk() {
  const input = document.getElementById('sg-question');
  const btn = document.getElementById('sg-ask-btn');
  const out = document.getElementById('sg-answer');
  const question = input.value.trim();
  if (!question) return;

  btn.disabled = true;
  out.style.display = 'block';
  out.className = 'sg-answer sg-answer--waiting';
  out.textContent = 'Reading the board…';

  try {
    const { answer } = await api('/ask', { method: 'POST', body: JSON.stringify({ question }) });
    out.className = 'sg-answer';
    out.textContent = answer;
  } catch (err) {
    out.className = 'sg-answer';
    out.textContent = `Could not answer: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    localStorage.setItem('redirectAfterLogin', '/admin/sales.html');
    window.location.href = '/admin/login.html';
    return;
  }

  document.getElementById('sg-ask-btn').addEventListener('click', handleAsk);
  document.getElementById('sg-question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAsk();
  });
  document.getElementById('sg-refresh-btn').addEventListener('click', load);

  load();
});
