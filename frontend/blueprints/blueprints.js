/**
 * The Blueprints page — every objective, and what became of it.
 *
 * One card per objective, and everything about it in that card: the
 * opportunity Cob picked and whether it is running, a link that opens the
 * application itself, the capabilities the Learner has added since the
 * customer started using it, and the opportunities still to build with the
 * reason they are not.
 *
 * Before this page, answering "what do I actually have?" meant opening the
 * blueprint, walking to Yusu for the address, and having nowhere at all to
 * see what was built from how the team uses it. The card is the answer.
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

/**
 * How a capability the Learner built reads to the person who asked for it.
 * `ready` is deliberately not "Live": it is built and deployed but the
 * customer may still have to connect something before it does anything.
 */
const FEATURE_STATE = {
  planned:  { label: 'Planned',  cls: 'bp-dot--wait' },
  building: { label: 'Building', cls: 'bp-dot--work' },
  ready:    { label: 'Ready',    cls: 'bp-dot--on' },
  live:     { label: 'Live',     cls: 'bp-dot--on' },
  failed:   { label: 'Failed',   cls: 'bp-dot--bad' },
};

const STATE_CLASS = {
  live: 'bp-state--on', launching: 'bp-state--work', built: 'bp-state--on',
  planning: 'bp-state--work', approved: 'bp-state--wait', planned: 'bp-state--wait',
  failed: 'bp-state--bad', paused: 'bp-state--wait',
};

/** The application itself, when there is one to open, and the blueprint behind it. */
function actions(bp) {
  const open = bp.app
    ? `<a class="bp-btn bp-btn--go" href="${esc(bp.app.url)}" target="_blank" rel="noopener">Open application &rarr;</a>`
    // No address yet. Saying why beats a dead button: a launch that is still
    // running will have one shortly, and one that never ran needs Yusu.
    : `<span class="bp-btn bp-btn--off" aria-disabled="true" title="${esc(bp.deployment
        ? bp.deployment.message || 'The application is not live yet.'
        : 'This objective has not been launched yet.')}">Not running yet</span>`;
  return `${open}<button type="button" class="bp-btn bp-btn--quiet" data-open-bp="${esc(bp.id)}">Open blueprint &rarr;</button>`;
}

/** The opportunity being built, in the customer's words. */
function built(bp) {
  if (!bp.built) {
    return `<p class="bp-none">${bp.status === 'generating'
      ? 'Cob is still working out where AI would help most.'
      : 'No opportunity has been settled on yet.'}</p>`;
  }
  return `
    <p class="bp-built__name">${esc(bp.built.plain)}</p>
    ${bp.built.plain !== bp.built.name ? `<p class="bp-built__tech">${esc(bp.built.name)}</p>` : ''}
    ${bp.why ? `<p class="bp-built__why">${esc(bp.why)}</p>` : ''}`;
}

/** What the Learner added from how the team actually uses the application. */
function features(list) {
  if (!list.length) return '';
  return `
    <section class="bp-block">
      <h3 class="bp-block__title">Built from how your team uses it</h3>
      <p class="bp-block__note">Svarg watches what people ask for inside the application and builds what keeps coming up.</p>
      <ul class="bp-feats">
        ${list.map(f => {
          const s = FEATURE_STATE[f.status] || FEATURE_STATE.planned;
          return `<li class="bp-feat">
            <span class="bp-dot ${s.cls}" aria-hidden="true"></span>
            <span class="bp-feat__text">
              <strong>${esc(f.title)}</strong>
              ${f.summary ? `<em>${esc(f.summary)}</em>` : ''}
              ${f.connectorsNeeded?.length
                ? `<em class="bp-feat__needs">Needs ${esc(f.connectorsNeeded.join(', '))} connected</em>` : ''}
            </span>
            <span class="bp-feat__state">${esc(s.label)}${f.at ? ` &middot; ${esc(when(f.at))}` : ''}</span>
          </li>`;
        }).join('')}
      </ul>
    </section>`;
}

/**
 * The opportunities Cob found and nobody has built. Greyed because they are
 * real and unavailable, which is a different thing from absent — and the
 * line under them says what would make them available.
 */
function locked(bp, plan) {
  if (!bp.others?.length) return '';
  const upgrade = plan.opportunitiesLocked && plan.upgradeTo
    ? `<p class="bp-locked__ask">
         <span class="bp-lock" aria-hidden="true">&#128274;</span>
         Your ${esc(plan.label)} plan builds one opportunity per objective.
         <a href="/pricing/pricing.html">Upgrade to ${esc(plan.upgradeLabel)}</a> to build the rest.
       </p>`
    : `<p class="bp-locked__ask">Ask Cob to take one of these next.</p>`;
  return `
    <section class="bp-block">
      <h3 class="bp-block__title">Not built yet</h3>
      <ul class="bp-locked">
        ${bp.others.map(o => `<li class="bp-locked__item">
          <span class="bp-locked__name">${esc(o.plain)}</span>
          ${o.plain !== o.name ? `<span class="bp-locked__tech">${esc(o.name)}</span>` : ''}
        </li>`).join('')}
      </ul>
      ${upgrade}
    </section>`;
}

function card(bp, plan) {
  const cls = STATE_CLASS[bp.state.key] || 'bp-state--wait';
  const title = bp.appName || bp.objective || 'Untitled objective';
  return `
    <article class="bp-card">
      <header class="bp-card__head">
        <div class="bp-card__id">
          <h2 class="bp-card__title">${esc(title)}</h2>
          ${bp.appName && bp.objective ? `<p class="bp-card__obj">${esc(bp.objective)}</p>` : ''}
          <p class="bp-card__meta">
            ${bp.industry ? `${esc(bp.industry)} &middot; ` : ''}Started ${esc(when(bp.createdAt))}
          </p>
        </div>
        <span class="bp-state ${cls}"><span class="bp-dot" aria-hidden="true"></span>${esc(bp.state.label)}</span>
      </header>

      <section class="bp-block bp-block--built">
        <h3 class="bp-block__title">What it does</h3>
        ${built(bp)}
        <div class="bp-card__actions">${actions(bp)}</div>
      </section>

      ${features(bp.features)}
      ${locked(bp, plan)}
    </article>`;
}

/** Opening a blueprint is the same move the rail used to make: remember which
 *  one, then land on the Cob stage rather than jumping past it. */
function openBlueprint(id) {
  sessionStorage.setItem(OPEN_BLUEPRINT_KEY, id);
  window.location.href = '/domain/domain.html?view=cob';
}

function renderPlan(plan) {
  const wrap = el('bp-plan');
  if (!wrap) return;
  el('bp-plan-name').textContent = plan.viaAdmin ? 'Enterprise (admin)' : plan.label;
  const up = el('bp-plan-upgrade');
  if (plan.upgradeTo && !plan.viaAdmin) {
    up.textContent = `Upgrade to ${plan.upgradeLabel}`;
    up.hidden = false;
  }
  wrap.hidden = false;
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

  let data;
  try {
    const resp = await fetch(`${API_BASE()}/strategy-canvas/blueprints-overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) return fail('Your session has expired — sign in again to see your blueprints.');
    if (!resp.ok) return fail('Could not load your blueprints. Please try again.');
    data = await resp.json();
  } catch {
    // fetch() rejects only when the request never completed at all.
    return fail('Could not reach the server — check that the backend is running.');
  }

  el('bp-loading').hidden = true;
  renderPlan(data.plan || {});

  const list = data.blueprints || [];
  if (!list.length) { el('bp-empty').hidden = false; return; }

  const wrap = el('bp-list');
  wrap.innerHTML = list.map(bp => card(bp, data.plan || {})).join('');
  wrap.hidden = false;
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-bp]');
    if (btn) openBlueprint(btn.dataset.openBp);
  });
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
