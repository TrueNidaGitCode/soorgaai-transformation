/**
 * Svarg — Sales Funnel (platform admin only)
 *
 * Five tabs in funnel order. The board comes from
 * services/salesSignalsService.js, which also backs scripts/sales_agent.mjs,
 * so this screen and the terminal can never show different numbers.
 *
 * The ask box does NOT send the board up with the question — the server
 * rebuilds it. A client that could supply the board could supply the facts.
 *
 * Client-side role guard only — the backend independently enforces adminOnly
 * on every /api/admin/sales-signals/* route.
 */

const API_BASE = window.CONFIG.API_BASE;

/** Order matters: this is the funnel. */
const TABS = [
  { key: 'outreach',   label: 'Outreach',   hint: 'Cold emails you are working — the only stage typed in by hand.' },
  { key: 'discovery',  label: 'Discovery',  hint: 'Anonymous guests who generated a blueprint. No email exists for these — the IP is the only way to tell one company returning from several visitors.' },
  { key: 'conversion', label: 'Conversion', hint: 'Signed up, nothing live yet. The blocker is the useful part.' },
  { key: 'onboarding', label: 'Onboarding', hint: 'Running a live application.' },
  { key: 'sales',      label: 'Sales',      hint: 'On a paid plan.' },
];

let state = { signals: null, tab: 'outreach' };

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

function age(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return d < 1 ? `${d.toFixed(1)}d` : `${Math.round(d)}d`;
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function table(cols, rows, row) {
  if (!rows.length) return '<div class="sg-empty">Nothing at this stage right now.</div>';
  return `<table class="cl-table">
    <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row).join('')}</tbody>
  </table>`;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function renderTabs() {
  const c = state.signals.counts;
  document.getElementById('sg-tabs').innerHTML = TABS.map((t, i) => `
    <button type="button" role="tab" data-tab="${t.key}"
            class="sg-tab ${state.tab === t.key ? 'sg-tab--active' : ''}"
            aria-selected="${state.tab === t.key}">
      <span class="sg-tab__n">${i + 1}</span>
      <span class="sg-tab__label">${esc(t.label)}</span>
      <span class="sg-tab__count">${c[t.key]}</span>
    </button>
  `).join('<span class="sg-tab__arrow">→</span>');

  document.querySelectorAll('.sg-tab').forEach(b => {
    b.addEventListener('click', () => { state.tab = b.dataset.tab; renderTabs(); renderStage(); });
  });
}

// ── Stages ───────────────────────────────────────────────────────────────────

/** When the next follow-up goes out, said in words rather than a raw date. */
function nextSendLabel(q) {
  if (q.stoppedReason) return q.stoppedReason;
  if (!q.enabled) return 'Paused';
  if (!q.nextSendAt) return 'Not scheduled';
  const ms = new Date(q.nextSendAt) - Date.now();
  if (ms <= 0) return 'Due now';
  const days = ms / 86400000;
  return days < 1 ? `in ${Math.round(ms / 3600000)}h` : `in ${Math.round(days)}d`;
}

function leadRow(r) {
  const q = r.sequence;
  const done = q.sentCount >= q.maxSends;
  return `<tr class="sg-leadrow">
    <td><span class="sg-pill sg-pill--${esc(r.status)}">${esc(r.status)}</span></td>
    <td class="sg-who">${esc(r.email)}${r.unsubscribedAt ? ' <span class="sg-unsub">unsubscribed</span>' : ''}</td>
    <td>${esc(r.company)}</td>
    <td class="sg-seq">
      <span class="sg-sent ${done ? 'sg-sent--done' : ''}">${q.sentCount}/${q.maxSends}</span>
      <span class="sg-note">every ${q.intervalDays}d</span>
    </td>
    <td class="sg-note ${q.stoppedReason || r.lastError ? 'sg-blocked' : ''}">
      ${esc(r.lastError ? `Failed: ${clip(r.lastError, 70)}` : nextSendLabel(q))}
    </td>
    <td class="sg-rowactions">
      <button type="button" class="sg-btn" data-compose="${esc(r.id)}">Compose</button>
      <button type="button" class="sg-btn sg-btn--go" data-send="${esc(r.id)}"
              ${r.unsubscribedAt ? 'disabled title="They unsubscribed"' : ''}>Send now</button>
      <select data-lead="${esc(r.id)}" class="sg-status-select">
        ${['to-contact', 'contacted', 'replied', 'dead'].map(v =>
          `<option value="${v}" ${v === r.status ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <button type="button" class="sg-del" data-del="${esc(r.id)}" title="Remove">×</button>
    </td>
  </tr>
  <tr class="sg-composer" id="compose-${esc(r.id)}" hidden><td colspan="6">
    <input type="text" class="sg-c-subject" placeholder="Subject" value="${esc(q.subject)}">
    <textarea class="sg-c-body" rows="7" placeholder="Your message. {{name}} and {{company}} are filled in; an unsubscribe line is appended automatically.">${esc(q.body)}</textarea>
    <div class="sg-c-controls">
      <label>Every <input type="number" class="sg-c-interval" min="2" max="90" value="${q.intervalDays}"> days</label>
      <label>Stop after <input type="number" class="sg-c-max" min="1" max="6" value="${q.maxSends}"> emails</label>
      <label class="sg-c-toggle"><input type="checkbox" class="sg-c-enabled" ${q.enabled ? 'checked' : ''}> Auto follow-up</label>
      <button type="button" class="cta-button sg-c-save" data-save="${esc(r.id)}">Save</button>
    </div>
  </td></tr>`;
}

function renderOutreach(s) {
  const form = `
    <div class="sg-addlead">
      <input type="email" id="sg-lead-email" placeholder="email@company.com" autocomplete="off">
      <input type="text"  id="sg-lead-company" placeholder="Company (optional)" autocomplete="off">
      <input type="text"  id="sg-lead-note" placeholder="Note (optional)" autocomplete="off">
      <button type="button" id="sg-lead-add" class="cta-button">Add</button>
    </div>
    <p class="field-hint">Add someone, press Compose to write the email, then Send now or switch on Auto follow-up. A lead leaves this stage automatically when they sign up — detected, never ticked off by hand. Follow-ups also stop on a reply, an unsubscribe, or when the count runs out.</p>`;

  const rows = table(
    ['Status', 'Email', 'Company', 'Sent', 'Next', ''],
    s.outreach, leadRow);

  const converted = s.converted.length
    ? `<div class="sg-converted"><strong>${s.converted.length} lead(s) have since signed up:</strong>
        ${s.converted.map(c => esc(c.email)).join(', ')}</div>`
    : '';

  return form + rows + converted;
}

function renderDiscovery(s) {
  return table(
    ['Visits', 'Last seen', 'Guest', 'Objective', 'IP', 'What happened'],
    s.discovery,
    r => `<tr>
      <td><span class="sg-visits ${r.visits > 1 ? 'sg-visits--repeat' : ''}">${r.visits}×</span></td>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-who">${esc(r.who)}</td>
      <td>${esc(clip(r.objective, 80))}</td>
      <td class="sg-who ${r.ips.length ? '' : 'sg-unknown'}">${esc(r.ipLabel)}</td>
      <td class="sg-note">${esc(r.note)}</td>
    </tr>`);
}

function renderConversion(s) {
  return table(
    ['Age', 'Email', 'Objective', 'Blueprints', 'Where they stopped'],
    s.conversion,
    r => `<tr>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-who">${esc(r.email)}</td>
      <td>${esc(clip(r.objective, 60))}</td>
      <td>${r.blueprints}</td>
      <td class="sg-note ${r.blocker ? 'sg-blocked' : ''}">${esc(r.note)}</td>
    </tr>`);
}

function renderOnboarding(s) {
  return table(
    ['Last query', 'Email', 'Objective', 'Live apps', 'Usage'],
    s.onboarding,
    r => `<tr>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-who">${esc(r.email)}</td>
      <td>${esc(clip(r.objective, 60))}</td>
      <td>${r.liveCount}</td>
      <td class="sg-note ${r.quiet ? 'sg-blocked' : ''}">${esc(r.note)}</td>
    </tr>`);
}

function renderSales(s) {
  return table(
    ['Since', 'Email', 'Plan', 'Blueprints', 'Spend'],
    s.sales,
    r => `<tr>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-who">${esc(r.email)}</td>
      <td><span class="sg-pill sg-pill--paid">${esc(r.note)}</span></td>
      <td>${r.blueprints}</td>
      <td>$${(r.spendUsd || 0).toFixed(4)}</td>
    </tr>`);
}

const RENDERERS = {
  outreach: renderOutreach, discovery: renderDiscovery, conversion: renderConversion,
  onboarding: renderOnboarding, sales: renderSales,
};

function renderStage() {
  const tab = TABS.find(t => t.key === state.tab);
  const el = document.getElementById('sg-stage');
  el.innerHTML = `<div class="admin-panel sg-section">
    <div class="panel-header"><h2>${esc(tab.label)}</h2></div>
    <p class="field-hint">${esc(tab.hint)}</p>
    ${RENDERERS[state.tab](state.signals)}
  </div>`;
  el.style.display = 'block';

  if (state.tab === 'outreach') wireOutreach();
}

// ── Outreach actions ─────────────────────────────────────────────────────────

function wireOutreach() {
  document.getElementById('sg-lead-add').addEventListener('click', addLead);
  document.getElementById('sg-lead-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') addLead();
  });

  document.querySelectorAll('.sg-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/leads/${sel.dataset.lead}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
        await load(state.tab);
      } catch (err) { banner(`Could not update: ${err.message}`); }
    });
  });

  document.querySelectorAll('.sg-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this lead?')) return;
      try {
        await api(`/leads/${btn.dataset.del}`, { method: 'DELETE' });
        await load(state.tab);
      } catch (err) { banner(`Could not remove: ${err.message}`); }
    });
  });

  document.querySelectorAll('[data-compose]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = document.getElementById(`compose-${btn.dataset.compose}`);
      row.hidden = !row.hidden;
    });
  });

  document.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.save;
      const box = document.getElementById(`compose-${id}`);
      btn.disabled = true;
      try {
        await api(`/leads/${id}/sequence`, {
          method: 'PUT',
          body: JSON.stringify({
            subject:      box.querySelector('.sg-c-subject').value,
            body:         box.querySelector('.sg-c-body').value,
            intervalDays: Number(box.querySelector('.sg-c-interval').value),
            maxSends:     Number(box.querySelector('.sg-c-max').value),
            enabled:      box.querySelector('.sg-c-enabled').checked,
          }),
        });
        banner('Saved.', false);
        await load('outreach');
      } catch (err) {
        banner(`Could not save: ${err.message}`);
      } finally { btn.disabled = false; }
    });
  });

  document.querySelectorAll('[data-send]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.send;
      const box = document.getElementById(`compose-${id}`);
      // Save whatever is on screen first, so Send never posts a stale draft.
      btn.disabled = true;
      try {
        if (box) {
          await api(`/leads/${id}/sequence`, {
            method: 'PUT',
            body: JSON.stringify({
              subject: box.querySelector('.sg-c-subject').value,
              body:    box.querySelector('.sg-c-body').value,
            }),
          });
        }
        const r = await api(`/leads/${id}/send`, { method: 'POST', body: JSON.stringify({}) });
        // A refusal comes back 200 with sent:false — it is the guard working,
        // not an error, and the reason is the useful part.
        banner(r.sent ? `Sent (${r.sentCount} of the sequence).` : `Not sent — ${r.reason}`, !r.sent);
        await load('outreach');
      } catch (err) {
        banner(`Could not send: ${err.message}`);
      } finally { btn.disabled = false; }
    });
  });
}

async function addLead() {
  const email   = document.getElementById('sg-lead-email').value.trim();
  const company = document.getElementById('sg-lead-company').value.trim();
  const note    = document.getElementById('sg-lead-note').value.trim();
  if (!email) return;

  const btn = document.getElementById('sg-lead-add');
  btn.disabled = true;
  try {
    await api('/leads', { method: 'POST', body: JSON.stringify({ email, company, note }) });
    banner('');
    await load('outreach');
  } catch (err) {
    banner(`Could not add the lead: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ── Ask ──────────────────────────────────────────────────────────────────────

async function handleAsk() {
  const input = document.getElementById('sg-question');
  const btn = document.getElementById('sg-ask-btn');
  const out = document.getElementById('sg-answer');
  const question = input.value.trim();
  if (!question) return;

  btn.disabled = true;
  out.style.display = 'block';
  out.className = 'sg-answer sg-answer--waiting';
  out.textContent = 'Reading the funnel…';

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

// ── Loading ──────────────────────────────────────────────────────────────────

async function load(keepTab) {
  document.getElementById('sg-loading').style.display = 'block';
  document.getElementById('sg-stage').style.display = 'none';

  try {
    const { signals } = await api('');
    state.signals = signals;
    if (keepTab) state.tab = keepTab;
    renderTabs();
    renderStage();
    document.getElementById('sg-generated').textContent =
      `Read at ${new Date(signals.generatedAt).toLocaleTimeString()}`;
  } catch (err) {
    banner(`Could not load the funnel: ${err.message}`);
  } finally {
    document.getElementById('sg-loading').style.display = 'none';
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
  document.getElementById('sg-refresh-btn').addEventListener('click', () => load(state.tab));

  load();
});
