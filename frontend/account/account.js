/**
 * Svarg — Account page
 *
 * Two tabs. Billing & usage: the plan (what the customer is billed) and, per
 * application, how much of its AI allowance it has used — a percentage, never
 * the model cost behind it (decided 2026-10-07; the endpoint returns no cost,
 * see backend services/accountUsageService.js). Account info: who they are,
 * and an honest payment section — no provider is connected, so there is no
 * card to show and nothing pretends otherwise.
 */

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';
const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtInr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

async function api(path) {
  const r = await fetch(`${API_BASE()}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
  });
  if (r.status === 401) throw Object.assign(new Error('expired'), { expired: true });
  if (!r.ok) throw Object.assign(new Error(String(r.status)), { status: r.status });
  return r.json();
}

// ── Tabs ─────────────────────────────────────────────────────────────────
function wireTabs() {
  const tabs = [el('tab-billing'), el('tab-info')];
  const select = (t, focus) => {
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      el(x.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) t.focus();
    try { history.replaceState(null, '', t.id === 'tab-info' ? '#info' : '#billing'); } catch { /* sandboxed */ }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') select(tabs[(i + 1) % 2], true);
    });
  });
  if (location.hash === '#info') select(el('tab-info'));
}

// ── Billing & usage ──────────────────────────────────────────────────────
const COVER = [
  ['businessCategories', 'Business areas watched'],
  ['dataConnections', 'Data connections'],
  ['activeWatchers', 'Active AI agents'],
  ['evaluationsMonthly', 'Evaluations a month'],
];

function renderPlan(p) {
  el('ac-plan-name').textContent = p.planLabel || 'Hobby';
  const status = p.lapsed
    ? `Payment overdue — you have ${p.effectiveLabel} features until it is settled.`
    : p.status === 'cancelling' ? 'Cancelling — your plan runs until the end of this period.'
    : p.viaAdmin ? 'Svarg team account' : 'Active';
  el('ac-plan-status').textContent = status;

  el('ac-plan-price').textContent = p.priceInrMonthly == null ? 'Custom pricing'
    : p.priceInrMonthly === 0 ? 'Free' : `${fmtInr(p.priceInrMonthly)} / month`;
  el('ac-plan-renew').textContent = p.currentPeriodEnd ? `Renews ${fmtDate(p.currentPeriodEnd)}` : '';

  const c = p.coverage || {};
  const rows = COVER.map(([k, label]) => [label, c[k] == null ? 'Unlimited' : Number(c[k]).toLocaleString('en-IN')]);
  if (p.seats !== undefined) rows.push(['People', p.seats == null ? 'Unlimited' : String(p.seats)]);
  if (c.monitoringFrequency) rows.push(['Checks', c.monitoringFrequency[0].toUpperCase() + c.monitoringFrequency.slice(1)]);
  el('ac-cover').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}

const STATUS = {
  live: ['Live', 'ok'], degraded: ['Needs attention', 'warn'], failed: ['Failed', 'bad'],
  suspended: ['Suspended', 'bad'], prepared: ['Ready', 'muted'], preparing: ['Setting up', 'muted'],
  attaching: ['Setting up', 'muted'], queued: ['Queued', 'muted'],
};

function appRow(a) {
  const [label, tone] = STATUS[a.status] || [a.status, 'muted'];
  const level = a.paused ? 'bad' : a.usedPct >= 80 ? 'warn' : 'ok';
  const window = a.paused
    ? `Allowance reached — AI answers pause until ${fmtDate(a.resetsAt)}.`
    : a.resetsAt ? `Renews ${fmtDate(a.resetsAt)}` : 'Starts with the first request';
  const last = a.lastActivityAt ? `Last used ${fmtDate(a.lastActivityAt)}` : 'Not used yet';
  return `
    <article class="ac-app">
      <div class="ac-app__top">
        <div class="ac-app__id">
          <h3 class="ac-app__name">${esc(a.name)}</h3>
          <span class="ac-badge ac-badge--${tone}">${esc(label)}</span>
        </div>
        ${a.url ? `<a class="ac-link" href="${esc(a.url)}" target="_blank" rel="noopener">Open app ↗</a>` : ''}
      </div>
      <div class="ac-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${a.usedPct}" aria-label="Allowance used">
        <span class="ac-meter__fill ac-meter__fill--${level}" style="width:${a.usedPct}%"></span>
      </div>
      <div class="ac-app__facts">
        <span><strong>${a.usedPct}%</strong> of allowance used</span>
        <span>${Number(a.requests).toLocaleString('en-IN')} requests</span>
        <span>${esc(last)}</span>
        <span class="${a.paused ? 'ac-app__paused' : ''}">${esc(window)}</span>
      </div>
    </article>`;
}

function renderUsage(apps) {
  const state = el('ac-usage-state');
  if (!apps.length) {
    state.innerHTML = 'No applications yet. When Svarg builds one for you, its usage appears here. <a class="ac-link" href="/cob.html">Start from Home →</a>';
    return;
  }
  state.hidden = true;
  el('ac-apps').innerHTML = apps.map(appRow).join('');
}

// ── Account info ─────────────────────────────────────────────────────────
const PROVIDER = { google: 'Google', microsoft: 'Microsoft', local: 'Email' };

function renderUser(u, profile) {
  el('ac-name').textContent = u.name || '—';
  el('ac-email').textContent = u.email || '—';
  el('ac-provider').textContent = PROVIDER[u.authProvider] || 'Email';
  el('ac-since').textContent = fmtDate(u.createdAt) || '—';
  el('ac-org').textContent = profile?.orgName || '—';
  const site = profile?.websiteUrl;
  el('ac-site').innerHTML = site ? `<a class="ac-link" href="${esc(/^https?:/.test(site) ? site : `https://${site}`)}" target="_blank" rel="noopener">${esc(site)}</a>` : '—';
}

// ── Boot ─────────────────────────────────────────────────────────────────
function wireNav() {
  el('ac-username').textContent = localStorage.getItem('username') || '';
  el('ac-logout').addEventListener('click', () => {
    ['token', 'username', 'userId', 'role'].forEach((k) => localStorage.removeItem(k));
    window.location.href = '/index.html';
  });
}

async function load() {
  if (!localStorage.getItem('token')) {
    window.location.href = '/login/login.html?redirect=/account/account.html';
    return;
  }
  const failed = (err, what) => (err?.expired
    ? 'Your session has expired — sign in again.'
    : err?.status ? `Could not load ${what}. Please try again.` : 'Could not reach the server. Please try again.');

  const [plan, usage, user, profile] = await Promise.allSettled([
    api('/billing/plan'), api('/billing/usage'), api('/users/me'), api('/profile/me'),
  ]);

  if (plan.status === 'fulfilled') renderPlan(plan.value);
  else el('ac-plan-status').textContent = failed(plan.reason, 'your plan');

  if (usage.status === 'fulfilled') renderUsage(usage.value.applications || []);
  else el('ac-usage-state').textContent = failed(usage.reason, 'your usage');

  // A missing profile is a 404 and is normal for someone who skipped setup.
  if (user.status === 'fulfilled') renderUser(user.value, profile.status === 'fulfilled' ? profile.value.profile : null);
  else el('ac-name').textContent = failed(user.reason, 'your details');
}

wireNav();
wireTabs();
load();
