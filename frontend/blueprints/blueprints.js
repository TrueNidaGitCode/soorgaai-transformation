/**
 * Your AI Roadmap — every objective, and what became of it.
 *
 * Two tabs over one numbered list: what is BUILT and running, and what is in
 * the PIPELINE. A row is one thing the customer can name — the opportunity
 * Cob picked and built, a capability the Learner added from how the team
 * actually uses the application, or an opportunity Cob found that nobody has
 * built yet. Each row says what it is, what it does, where it has got to, and
 * carries the way into the application it lives in.
 *
 * Before this page, answering "what do I actually have?" meant opening the
 * blueprint for the opportunity, walking on to Yusu for the address the
 * application runs at, and having nowhere at all to see what was built from
 * how the team uses it.
 *
 * Everything comes from GET /strategy-canvas/blueprints-overview in one
 * request; this file only draws it.
 */

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';

/** blueprintGenerate.js reads this to know which blueprint was picked. */
const OPEN_BLUEPRINT_KEY = 'soorgaai_open_blueprint_id';

const el = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function when(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

/** A sentence for a row's Description cell: the first sentence, at most. */
function short(text, max = 150) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' — '));
  return (stop > 60 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '…');
}

// ── Icons ───────────────────────────────────────────────────────────────────
// Chosen from what the feature is about, the same way the application's own
// sidebar chooses one. A row with a recognisable mark is scanned; a row with
// the same grey square on every line is read.

const ICONS = {
  person:   '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check:    '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  chat:     '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z"/>',
  doc:      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  bars:     '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  money:    '<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-3-1.5"/>',
  alert:    '<path d="M12 3l9.5 16.5H2.5z"/><path d="M12 10v4M12 17.5v.01"/>',
  dot:      '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/>',
};

function iconFor(label) {
  const l = String(label).toLowerCase();
  if (/student|player|member|people|customer|learner|athlete|coach|staff|employee|user|team|roster|enrol|parent/.test(l)) return 'person';
  if (/session|schedule|calendar|timetable|batch|class|booking|shift|workload|availability/.test(l)) return 'calendar';
  if (/attend|roll|presence|check/.test(l)) return 'check';
  if (/message|whatsapp|chat|notice|announce|remind|communication/.test(l)) return 'chat';
  if (/invoice|fee|payment|billing|finance|ledger|subscription|default/.test(l)) return 'money';
  if (/report|insight|analytic|trend|stat|dashboard/.test(l)) return 'bars';
  if (/document|file|sheet|record|classif|search/.test(l)) return 'doc';
  if (/risk|warning|predict|churn|drop/.test(l)) return 'alert';
  return 'dot';
}

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`;
}

// ── Rows ────────────────────────────────────────────────────────────────────

const STATUS = {
  live:       { label: 'Live',        cls: 'bp-pill--on' },
  ready:      { label: 'Ready',       cls: 'bp-pill--on' },
  built:      { label: 'Built',       cls: 'bp-pill--on' },
  progress:   { label: 'In Progress', cls: 'bp-pill--work' },
  notstarted: { label: 'Not Started', cls: 'bp-pill--wait' },
  failed:     { label: 'Failed',      cls: 'bp-pill--bad' },
};

/** What the Learner's own statuses mean on this page. */
const FEATURE_STATUS = {
  live: 'live', ready: 'ready', building: 'progress', planned: 'notstarted', failed: 'failed',
};

/**
 * The two lists, from one objective.
 *
 * Built is what exists: the opportunity the application was built for, and
 * the capabilities added since that have actually shipped. Pipeline is what
 * does not exist yet: capabilities being built or waiting, and the
 * opportunities Cob found that nobody has taken.
 */
function rowsFor(bp) {
  const builtRows = [];
  const pipeRows = [];

  if (bp.built) {
    const shipped = bp.state.key === 'live' || bp.state.key === 'built' || bp.state.key === 'paused';
    const row = {
      title: bp.built.plain,
      tech: bp.built.plain !== bp.built.name ? bp.built.name : '',
      desc: short(bp.why) || 'The opportunity this application was built for.',
      status: shipped ? (bp.app ? STATUS.live : STATUS.built) : (bp.status === 'generating' ? STATUS.progress : STATUS.notstarted),
      first: true,
    };
    (shipped ? builtRows : pipeRows).push(row);
  }

  for (const f of bp.features || []) {
    const key = FEATURE_STATUS[f.status] || 'notstarted';
    const row = {
      title: f.title,
      desc: short(f.summary) || 'Added from what your team kept asking for.',
      status: STATUS[key],
      note: f.connectorsNeeded?.length ? `Needs ${f.connectorsNeeded.join(', ')} connected` : '',
      at: f.at,
    };
    (key === 'live' || key === 'ready' ? builtRows : pipeRows).push(row);
  }

  // Opportunities Cob found and nobody has built. Greyed, because they are
  // real and unavailable — which is a different thing from absent.
  for (const o of bp.others || []) {
    pipeRows.push({
      title: o.plain,
      tech: o.plain !== o.name ? o.name : '',
      desc: 'Found by Cob when it read your objective. Not started.',
      status: STATUS.notstarted,
      locked: true,
    });
  }

  return { builtRows, pipeRows };
}

/** The Open Application cell: the way in, or why there is not one. */
function action(row, bp, plan) {
  if (row.locked) {
    return plan.opportunitiesLocked && plan.upgradeTo
      ? `<a class="bp-open bp-open--up" href="/pricing/pricing.html">Upgrade to ${esc(plan.upgradeLabel)}</a>`
      : `<span class="bp-open bp-open--off">Not started</span>`;
  }
  if (bp.app) {
    return `<a class="bp-open" href="${esc(bp.app.url)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
      Open Application <span aria-hidden="true">&rsaquo;</span></a>`;
  }
  const why = bp.deployment ? (bp.deployment.message || 'The application is not live yet.')
    : 'This objective has not been launched yet.';
  return `<span class="bp-open bp-open--off" title="${esc(why)}">Not running yet</span>`;
}

function table(rows, bp, plan, empty) {
  if (!rows.length) return `<tbody><tr><td class="bp-empty-row" colspan="5">${esc(empty)}</td></tr></tbody>`;
  return `
    <thead>
      <tr>
        <th class="bp-th-n">#</th>
        <th>Feature / Improvement</th>
        <th>Description</th>
        <th>Status</th>
        <th class="bp-th-open">Open Application</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r, i) => `
        <tr${r.locked ? ' class="bp-row--locked"' : ''}>
          <td class="bp-td-n">${i + 1}</td>
          <td class="bp-td-name">
            <span class="bp-ico" aria-hidden="true">${icon(iconFor(r.title + ' ' + r.desc))}</span>
            <span class="bp-name">
              <strong>${esc(r.title)}</strong>
              ${r.tech ? `<em>${esc(r.tech)}</em>` : ''}
              ${r.note ? `<em class="bp-name__needs">${esc(r.note)}</em>` : ''}
            </span>
          </td>
          <td class="bp-td-desc">${esc(r.desc)}</td>
          <td class="bp-td-status">
            <span class="bp-pill ${r.status.cls}"><span class="bp-dot" aria-hidden="true"></span>${esc(r.status.label)}</span>
            ${r.at ? `<span class="bp-when">${esc(when(r.at))}</span>` : ''}
          </td>
          <td class="bp-td-open">${action(r, bp, plan)}</td>
        </tr>`).join('')}
    </tbody>`;
}

// ── The page ────────────────────────────────────────────────────────────────

let DATA = null;
let picked = 0;

function renderObjective() {
  const bp = DATA.blueprints[picked];
  const plan = DATA.plan || {};
  const { builtRows, pipeRows } = rowsFor(bp);

  el('bp-obj-name').textContent = bp.appName || bp.objective || 'Untitled objective';
  el('bp-obj-meta').textContent = [
    bp.appName && bp.objective ? bp.objective : '',
    bp.industry,
    bp.state?.label ? `${bp.state.label}` : '',
    bp.createdAt ? `Started ${when(bp.createdAt)}` : '',
  ].filter(Boolean).join(' · ');

  el('bp-count-built').textContent = builtRows.length;
  el('bp-count-pipe').textContent = pipeRows.length;

  el('bp-table-built').innerHTML = table(builtRows, bp, plan,
    bp.status === 'generating'
      ? 'Cob is still working out where AI would help most.'
      : 'Nothing is running yet. The first feature appears here once your application goes live.');
  el('bp-table-pipe').innerHTML = table(pipeRows, bp, plan,
    'Nothing waiting. Svarg adds to this as your team uses the application.');

  // The plan's limit, said once under the pipeline rather than on every
  // locked row. Only when something is actually held back by it.
  const up = el('bp-upgrade');
  const anyLocked = pipeRows.some(r => r.locked);
  if (anyLocked && plan.opportunitiesLocked && plan.upgradeTo) {
    up.innerHTML = `<span class="bp-lock" aria-hidden="true">&#128274;</span>
      Your ${esc(plan.label)} plan builds one opportunity per objective.
      <a href="/pricing/pricing.html">Upgrade to ${esc(plan.upgradeLabel)}</a> to build the rest.`;
    up.hidden = false;
  } else {
    up.hidden = true;
  }

  document.querySelectorAll('#bp-objs .bp-obj__chip').forEach((c, i) => {
    c.classList.toggle('bp-obj__chip--on', i === picked);
    c.setAttribute('aria-selected', String(i === picked));
  });
}

function renderObjectivePicker() {
  const wrap = el('bp-objs');
  if (DATA.blueprints.length < 2) return;
  wrap.innerHTML = DATA.blueprints.map((bp, i) => `
    <button type="button" role="tab" class="bp-obj__chip${i === picked ? ' bp-obj__chip--on' : ''}"
            aria-selected="${i === picked}" data-obj="${i}">
      ${esc(bp.appName || bp.objective || 'Untitled')}
    </button>`).join('');
  wrap.hidden = false;
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-obj]');
    if (!b) return;
    picked = Number(b.dataset.obj);
    renderObjective();
  });
}

function wireTabs() {
  const pairs = [['bp-tab-built', 'bp-panel-built'], ['bp-tab-pipe', 'bp-panel-pipe']];
  pairs.forEach(([tabId]) => {
    el(tabId).addEventListener('click', () => {
      pairs.forEach(([t, p]) => {
        const on = t === tabId;
        el(t).classList.toggle('bp-tab--on', on);
        el(t).setAttribute('aria-selected', String(on));
        el(p).hidden = !on;
      });
    });
  });
}

/** Opening a blueprint: remember which one, then land on the Cob stage
 *  rather than jumping past it. */
function wireOpenBlueprint() {
  el('bp-open-bp').addEventListener('click', () => {
    sessionStorage.setItem(OPEN_BLUEPRINT_KEY, DATA.blueprints[picked].id);
    window.location.href = '/domain/domain.html?view=cob';
  });
}

function renderPlan(plan) {
  el('bp-plan-name').textContent = plan.viaAdmin ? 'Enterprise (admin)' : (plan.label || '');
  const up = el('bp-plan-upgrade');
  if (plan.upgradeTo && !plan.viaAdmin) {
    up.textContent = `Upgrade to ${plan.upgradeLabel}`;
    up.hidden = false;
  }
  el('bp-plan').hidden = false;
}

async function load() {
  const token = localStorage.getItem('token');
  const fail = (msg) => {
    el('bp-loading').hidden = true;
    const e = el('bp-error');
    e.textContent = msg;
    e.hidden = false;
  };

  if (!token) { window.location.href = '/login/login.html?redirect=/blueprints/blueprints.html'; return; }

  try {
    const resp = await fetch(`${API_BASE()}/strategy-canvas/blueprints-overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) return fail('Your session has expired — sign in again to see your roadmap.');
    if (!resp.ok) return fail('Could not load your roadmap. Please try again.');
    DATA = await resp.json();
  } catch {
    // fetch() rejects only when the request never completed at all.
    return fail('Could not reach the server — check that the backend is running.');
  }

  el('bp-loading').hidden = true;
  renderPlan(DATA.plan || {});

  if (!DATA.blueprints?.length) { el('bp-empty').hidden = false; return; }

  el('bp-body').hidden = false;
  renderObjectivePicker();
  wireTabs();
  wireOpenBlueprint();
  renderObjective();
}

function wireNav() {
  const nameEl = el('bp-username');
  if (nameEl) nameEl.textContent = localStorage.getItem('username') || '';
  // The same keys every other page clears: a logout that leaves the role
  // behind is a logout that half works.
  el('bp-logout')?.addEventListener('click', () => {
    ['token', 'username', 'userId', 'role'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/index.html';
  });
}

wireNav();
load();
