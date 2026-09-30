/**
 * Svarg admin — the finance board
 *
 * Reads GET /api/admin/finance and draws three things: what each account
 * consumed, what tier it sits on, and the figures somebody had to type. It
 * computes nothing the server has not already computed — a second arithmetic
 * here is a second answer, and the one on screen would be the one nobody
 * tested.
 *
 * ── The one rule this file keeps ───────────────────────────────────────────
 *
 * Measured and entered never share a column. The server hands them over on
 * separate fields for that reason, and every place they are drawn here says
 * which is which. A reader deciding a price has to be able to point at a
 * number and ask where it came from.
 */

const API_BASE = window.CONFIG.API_BASE;

/** Everything the last fetch returned, so a redraw needs no round trip. */
let board = null;
/** Accounts whose stage breakdown is open. */
const opened = new Set();

const el = {};
function bind() {
  const ids = [
    'fi-period', 'fi-refresh', 'fi-loading', 'fi-error',
    'fi-caveats', 'fi-caveats-list', 'fi-summary',
    'fi-sum-metered', 'fi-sum-metered-n', 'fi-sum-assumed', 'fi-sum-assumed-n',
    'fi-sum-cost', 'fi-sum-cost-n', 'fi-sum-revenue', 'fi-sum-revenue-n',
    'fi-accounts-body', 'fi-accounts-sub', 'fi-guest',
    'fi-plans-body', 'fi-fixed-block', 'fi-fixed-body', 'fi-fixed-sub',
    'fi-assum', 'fa-said', 'fa-integrations', 'fa-add-integration',
    'fa-rate', 'fa-dev-total', 'fa-dev-months', 'fa-dev-note',
    'fa-atlas', 'fa-control', 'fa-brevo', 'fa-other', 'fa-other-note',
    'fa-hosting', 'fa-hosting-note', 'fa-transcribe', 'fa-email',
  ];
  for (const id of ids) el[id] = document.getElementById(id);
}

// ── Saying numbers ───────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Rupees, grouped the Indian way because that is how the pricing page reads.
 *
 * Rounded to whole rupees above ten, and to paise below — a cost of ₹0 against
 * an account that genuinely spent something is the reading this page can least
 * afford, and several of these accounts cost less than a rupee.
 */
function inr(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '&mdash;';
  const v = Number(n);
  const digits = Math.abs(v) >= 10 || v === 0 ? 0 : 2;
  // The sign goes outside the symbol. toLocaleString puts it inside — "₹-1,204"
  // — which reads as a strange currency rather than as money owed, and on a
  // margin column the sign is the first thing being looked for.
  const body = Math.abs(v).toLocaleString('en-IN', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
  return (v < 0 ? '-' : '') + '&#8377;' + body;
}

/** Dollars, to four places: the metered figures are genuinely this small. */
function usd(n) {
  const v = Number(n) || 0;
  return '$' + v.toFixed(v && Math.abs(v) < 0.01 ? 4 : 2);
}

const num = (n) => Number(n || 0).toLocaleString('en-IN');

/** null means unlimited everywhere in the plan table, as it does in PLANS. */
const cap = (v) => (v === null || v === undefined ? 'Unlimited' : num(v));

// ── Fetching ─────────────────────────────────────────────────────────────────

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}/admin/finance${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let said = `The server answered ${res.status}.`;
    try { said = (await res.json()).message || said; } catch { /* keep the status */ }
    throw new Error(said);
  }
  return res.json();
}

async function load(period) {
  el['fi-error'].hidden = true;
  el['fi-loading'].hidden = false;
  try {
    const q = period ? `?period=${encodeURIComponent(period)}` : '';
    board = await api(`/${q}`);
    render();
  } catch (err) {
    el['fi-error'].textContent = err.message;
    el['fi-error'].hidden = false;
  } finally {
    el['fi-loading'].hidden = true;
  }
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function drawCaveats() {
  const list = board.caveats || [];
  el['fi-caveats'].hidden = !list.length;
  el['fi-caveats-list'].innerHTML = list.map((c) => `<li>${esc(c)}</li>`).join('');
}

function drawSummary() {
  const t = board.totals;
  el['fi-summary'].hidden = false;

  el['fi-sum-metered'].innerHTML = inr(t.meteredInr);
  el['fi-sum-metered-n'].textContent = `${usd(t.meteredUsd)} metered across ${t.activeAccounts} of ${t.accounts} accounts`;

  el['fi-sum-assumed'].innerHTML = inr(t.assumedInr);
  el['fi-sum-assumed-n'].textContent = t.assumedInr
    ? `${inr(t.fixedInr).replace('&#8377;', '₹')} of fixed cost, spread`
    : 'Nothing entered yet';

  el['fi-sum-cost'].innerHTML = inr(t.costInr);
  el['fi-sum-cost-n'].textContent = 'Measured plus entered';

  el['fi-sum-revenue'].innerHTML = inr(t.revenueInr);
  el['fi-sum-revenue-n'].textContent = t.payingAccounts
    ? `${t.payingAccounts} on a paid plan`
    : 'Nobody is on a paid plan yet';
}

/** The stage breakdown for one account — the bill of materials itself. */
function stageRow(r) {
  const stages = Object.entries(r.metered.byStage || {})
    .sort((a, b) => b[1].costUsd - a[1].costUsd);
  if (!stages.length) {
    return `<tr class="fi-sub"><td colspan="9">No model calls recorded for this account this month.</td></tr>`;
  }
  const items = stages.map(([name, v]) => `
    <li class="fi-stage">
      <span class="fi-stage__n">${esc(name)}</span>
      <span class="fi-stage__c">${esc(num(v.calls))} calls</span>
      <span class="fi-stage__v">${esc(usd(v.costUsd))}</span>
    </li>`).join('');

  const apps = r.deployments
    ? `<p class="fi-sub__note">${num(r.deployments)} delivered application${r.deployments === 1 ? '' : 's'},
        ${num(r.metered.gatewayRequests)} gateway requests. App spend is the total since each
        deployment started, not this month alone.</p>`
    : '';

  return `<tr class="fi-sub"><td colspan="9">
      <ul class="fi-stages">${items}</ul>${apps}
    </td></tr>`;
}

function drawAccounts() {
  const rows = board.accounts || [];
  el['fi-accounts-sub'].textContent = rows.length
    ? `${rows.length} account${rows.length === 1 ? '' : 's'}, most expensive first. Click one to see which part of the product spent it.`
    : 'Nothing was consumed in this month.';

  if (!rows.length) {
    el['fi-accounts-body'].innerHTML = `<tr><td colspan="9" class="fi-empty">No consumption recorded for ${esc(board.period)}.</td></tr>`;
  } else {
    el['fi-accounts-body'].innerHTML = rows.map((r) => {
      const open = opened.has(r.userId);
      const margin = r.marginInr === null
        ? '<span class="fi-na" title="Hobby earns nothing by design; Enterprise is negotiated">n/a</span>'
        : `<span class="${r.marginInr < 0 ? 'fi-neg' : 'fi-pos'}">${inr(r.marginInr)}</span>`;

      return `
        <tr class="fi-acc ${open ? 'fi-acc--open' : ''}" data-user="${esc(r.userId)}" tabindex="0">
          <td>
            <span class="fi-caret" aria-hidden="true">${open ? '&#9660;' : '&#9654;'}</span>
            <span class="fi-acc__name">${esc(r.name || '(no name)')}</span>
            <span class="fi-acc__mail">${esc(r.email)}</span>
          </td>
          <td>
            ${esc(r.planLabel)}${r.planImplicit ? '<span class="fi-default" title="No billing record, so the free default applies">default</span>' : ''}
          </td>
          <td class="fi-num">${esc(num(r.metered.calls))}</td>
          <td class="fi-num">${esc(usd(r.metered.svargUsd))}</td>
          <td class="fi-num">${esc(usd(r.metered.gatewayUsd))}</td>
          <td class="fi-num fi-assumed">${inr(r.assumed.totalInr)}</td>
          <td class="fi-num fi-cost">${inr(r.costInr)}</td>
          <td class="fi-num">${r.priceInrMonthly === null ? '<span class="fi-na">negotiated</span>' : inr(r.priceInrMonthly)}</td>
          <td class="fi-num">${margin}</td>
        </tr>
        ${open ? stageRow(r) : ''}`;
    }).join('');
  }

  const g = board.guest;
  el['fi-guest'].innerHTML = g && g.costUsd
    ? `Guest previews, which have no account by design, cost a further
       <strong>${esc(usd(g.costUsd))}</strong> (${inr(g.costInr)}) over ${esc(num(g.calls))} calls.
       That is what the free preview costs, and it is counted in the totals above.`
    : '';
}

function drawPlans() {
  el['fi-plans-body'].innerHTML = (board.plans || []).map((p) => `
    <tr>
      <td>${esc(p.label)}</td>
      <td class="fi-num">${esc(num(p.accounts))}</td>
      <td class="fi-num">${p.priceInrMonthly === null ? '<span class="fi-na">negotiated</span>' : inr(p.priceInrMonthly)}</td>
      <td class="fi-num">${p.priceInrYearly === null ? '<span class="fi-na">negotiated</span>' : inr(p.priceInrYearly)}</td>
      <td class="fi-num">${esc(cap(p.businessCategories))}</td>
      <td class="fi-num">${esc(cap(p.dataConnections))}</td>
      <td>${esc(p.monitoringFrequency)}</td>
      <td class="fi-num">${esc(cap(p.seats))}</td>
      <td class="fi-num">${esc(usd(p.deploymentCostUsd))}</td>
    </tr>`).join('');
}

function drawFixed() {
  const f = board.fixed || {};
  const lines = f.lines || [];
  el['fi-fixed-block'].hidden = !lines.length;
  if (!lines.length) return;

  el['fi-fixed-sub'].textContent = `${'₹' + Number(f.totalInr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} a month, `
    + `divided across ${f.basisCount} ${f.basis} — ${'₹' + Number(f.perAccountInr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} each. `
    + 'There is no correct divisor, so the one used is named here.';

  el['fi-fixed-body'].innerHTML = lines.map((l) => {
    const how = l.kind === 'amortised'
      ? `${'₹' + Number(l.totalInr).toLocaleString('en-IN')} over ${l.overMonths || 1} month${l.overMonths === 1 ? '' : 's'}`
      : 'Recurring';
    return `<tr>
        <td>${esc(l.label)}</td>
        <td class="fi-num">${inr(l.monthlyInr)}</td>
        <td class="fi-how">${esc(how)}${l.note ? ` &middot; ${esc(l.note)}` : ''}</td>
      </tr>`;
  }).join('');
}

function render() {
  drawCaveats();
  drawSummary();
  drawAccounts();
  drawPlans();
  drawFixed();
  fillForm();
}

// ── The assumptions form ─────────────────────────────────────────────────────

/** One integration line. Index only names the field, never the record. */
function integrationRow(i, item = {}) {
  return `
    <div class="fi-row fi-int" data-i="${i}">
      <label class="fi-f">
        <span>What it is</span>
        <input type="text" class="fa-int-label" maxlength="80" value="${esc(item.label || '')}"
               placeholder="Zoho CRM">
      </label>
      <label class="fi-f">
        <span>Total spent (&#8377;)</span>
        <input type="number" class="fa-int-total" min="0" step="1" value="${Number(item.totalInr) || 0}">
      </label>
      <label class="fi-f">
        <span>Over (months)</span>
        <input type="number" class="fa-int-months" min="0" step="1" value="${Number(item.overMonths) || 0}">
      </label>
      <label class="fi-f fi-f--wide">
        <span>Note</span>
        <input type="text" class="fa-int-note" maxlength="300" value="${esc(item.note || '')}">
      </label>
      <button type="button" class="fi-int__x" aria-label="Remove this integration">Remove</button>
    </div>`;
}

function fillForm() {
  const a = board.assumptions || {};
  el['fa-rate'].value = a.inrPerUsd ?? '';
  el['fa-dev-total'].value = a.platformDevelopment?.totalInr ?? 0;
  el['fa-dev-months'].value = a.platformDevelopment?.overMonths ?? 0;
  el['fa-dev-note'].value = a.platformDevelopment?.note ?? '';

  el['fa-atlas'].value = a.monthly?.atlasInr ?? 0;
  el['fa-control'].value = a.monthly?.controlPlaneInr ?? 0;
  el['fa-brevo'].value = a.monthly?.brevoInr ?? 0;
  el['fa-other'].value = a.monthly?.otherInr ?? 0;
  el['fa-other-note'].value = a.monthly?.otherNote ?? '';

  el['fa-hosting'].value = a.perAccount?.tenantHostingInr ?? 0;
  el['fa-hosting-note'].value = a.perAccount?.tenantHostingNote ?? '';

  el['fa-transcribe'].value = a.perUnit?.transcriptionInrPerCall ?? 0;
  el['fa-email'].value = a.perUnit?.emailInr ?? 0;

  const list = a.integrations || [];
  el['fa-integrations'].innerHTML = list.length
    ? list.map((item, i) => integrationRow(i, item)).join('')
    : integrationRow(0);

  if (a.updatedBy || a.updatedAt) {
    const when = a.updatedAt ? new Date(a.updatedAt).toLocaleString('en-IN') : '';
    document.getElementById('fi-assum-sub').textContent =
      `Figures this system cannot measure. Last changed${a.updatedBy ? ` by ${a.updatedBy}` : ''}${when ? ` on ${when}` : ''}.`;
  }
}

function readForm() {
  const ints = [...el['fa-integrations'].querySelectorAll('.fi-int')]
    .map((row) => ({
      label: row.querySelector('.fa-int-label').value.trim(),
      totalInr: Number(row.querySelector('.fa-int-total').value) || 0,
      overMonths: Number(row.querySelector('.fa-int-months').value) || 0,
      note: row.querySelector('.fa-int-note').value.trim(),
    }))
    // An empty line is somebody who clicked Add and changed their mind, not a
    // free integration.
    .filter((i) => i.label || i.totalInr);

  return {
    period: board?.period,
    inrPerUsd: Number(el['fa-rate'].value) || 0,
    platformDevelopment: {
      label: 'Platform development',
      totalInr: Number(el['fa-dev-total'].value) || 0,
      overMonths: Number(el['fa-dev-months'].value) || 0,
      note: el['fa-dev-note'].value.trim(),
    },
    integrations: ints,
    monthly: {
      atlasInr: Number(el['fa-atlas'].value) || 0,
      controlPlaneInr: Number(el['fa-control'].value) || 0,
      brevoInr: Number(el['fa-brevo'].value) || 0,
      otherInr: Number(el['fa-other'].value) || 0,
      otherNote: el['fa-other-note'].value.trim(),
    },
    perAccount: {
      tenantHostingInr: Number(el['fa-hosting'].value) || 0,
      tenantHostingNote: el['fa-hosting-note'].value.trim(),
    },
    perUnit: {
      transcriptionInrPerCall: Number(el['fa-transcribe'].value) || 0,
      emailInr: Number(el['fa-email'].value) || 0,
    },
  };
}

async function save(e) {
  e.preventDefault();
  const btn = document.getElementById('fa-save');
  btn.disabled = true;
  el['fa-said'].textContent = 'Saving…';
  try {
    // The server answers with the recomputed board, so what appears is what it
    // now holds rather than what this page hoped it saved.
    board = await api('/assumptions', { method: 'PUT', body: JSON.stringify(readForm()) });
    render();
    el['fa-said'].textContent = 'Saved, and the figures above are recalculated.';
  } catch (err) {
    el['fa-said'].textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    localStorage.setItem('redirectAfterLogin', '/admin/finance.html');
    window.location.href = '/admin/login.html';
    return;
  }

  bind();

  el['fi-refresh'].addEventListener('click', () => load(el['fi-period'].value));
  el['fi-period'].addEventListener('change', () => load(el['fi-period'].value));
  el['fi-assum'].addEventListener('submit', save);

  el['fa-add-integration'].addEventListener('click', () => {
    const n = el['fa-integrations'].querySelectorAll('.fi-int').length;
    el['fa-integrations'].insertAdjacentHTML('beforeend', integrationRow(n));
  });

  el['fa-integrations'].addEventListener('click', (e) => {
    if (!e.target.classList.contains('fi-int__x')) return;
    const rows = el['fa-integrations'].querySelectorAll('.fi-int');
    // The last one is emptied rather than removed, so the fieldset never
    // becomes a legend with nothing under it.
    if (rows.length === 1) {
      rows[0].querySelectorAll('input').forEach((i) => { i.value = i.type === 'number' ? 0 : ''; });
    } else {
      e.target.closest('.fi-int').remove();
    }
  });

  /* Open an account's breakdown. Delegated, so a redraw keeps working. */
  const toggle = (tr) => {
    const id = tr?.dataset?.user;
    if (!id) return;
    if (opened.has(id)) opened.delete(id); else opened.add(id);
    drawAccounts();
  };
  el['fi-accounts-body'].addEventListener('click', (e) => toggle(e.target.closest('.fi-acc')));
  el['fi-accounts-body'].addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const tr = e.target.closest('.fi-acc');
      if (tr) { e.preventDefault(); toggle(tr); }
    }
  });

  try {
    const { periods } = await api('/periods');
    el['fi-period'].innerHTML = (periods || []).map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  } catch {
    // A picker that could not be filled must not stop the board loading; the
    // server defaults to this month.
    el['fi-period'].innerHTML = '';
  }

  await load(el['fi-period'].value);
});
