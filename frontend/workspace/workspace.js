/**
 * SoorgaAI — Workspace Shell (v2)
 *
 * Three states, determined by blueprint status on load:
 *   prompt     — no blueprint; user enters objective to generate
 *   generating — SSE in progress; shows domain/capability progress cards
 *   done       — blueprint complete; summary + "Open Full Blueprint" CTA → domain.html
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }
function authHeaders() { return { Authorization: `Bearer ${getToken()}` }; }

// All enabled domains from workspace state — set during DOMContentLoaded
let _enabledDomains = [];

function logout() {
  [
    'token', 'username', 'userId', 'role', 'redirectAfterLogin',
    'soorgaai_blueprint_v1', 'soorgaai_blueprint_activity_v1',
    'soorgaai_executive_memory_v1', 'soorgaai_company_context_v1',
    'da_score', 'soorga_assessment_progress',
  ].forEach(k => localStorage.removeItem(k));
  window.location.href = '/index.html';
}

// ── State switching ───────────────────────────────────────────────────────────

function showState(id) {
  ['ws-prompt', 'ws-progress', 'ws-done'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = (s === id) ? '' : 'none';
  });
}

// ── Profile ───────────────────────────────────────────────────────────────────

function renderProfile(state) {
  const username = localStorage.getItem('username') || state.profile?.orgName || '';
  const role     = state.profile?.role     || '';
  const industry = state.profile?.industryDomain || '';

  const el = document.getElementById('ws-username');
  if (el) el.textContent = username;

  const nameEl = document.getElementById('ws-welcome-name');
  if (nameEl) nameEl.textContent = username;

  const ctxEl = document.getElementById('ws-user-context');
  if (ctxEl) {
    const parts = [role, industry].filter(Boolean);
    ctxEl.textContent = parts.join(' | ');
  }
}

// ── Domain badges (prompt state) ──────────────────────────────────────────────

function renderDomainBadges(domains) {
  const container = document.getElementById('ws-domain-badge-list');
  if (!container) return;
  container.innerHTML = '';
  domains.filter(d => d.enabled).forEach(d => {
    const badge = document.createElement('span');
    badge.className = 'ws-domain-badge';
    badge.textContent = d.title;
    container.appendChild(badge);
  });
}

// ── Progress cards (generating state) ────────────────────────────────────────

const STATUS_ICON = {
  pending:       '○',
  'in-progress': '⟳',
  generating:    '⟳',
  completed:     '✓',
  error:         '✕',
};
const STATUS_CLASS = {
  pending:       'pending',
  'in-progress': 'progress',
  generating:    'progress',
  completed:     'completed',
  error:         'error',
};

function capLabel(status) {
  if (status === 'in-progress' || status === 'generating') return 'In Progress';
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderProgressDomains(domains) {
  const container = document.getElementById('ws-prog-domains');
  if (!container) return;
  container.innerHTML = '';

  for (const domain of domains) {
    const section = document.createElement('div');
    section.className = 'ws-prog-domain';
    section.dataset.domainId = domain.domainId;

    const header = document.createElement('h3');
    header.className = 'ws-prog-domain__name';
    header.textContent = domain.domainName;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'ws-prog-domain__caps';

    for (const cap of (domain.capabilities || [])) {
      const cls  = STATUS_CLASS[cap.status] || 'pending';
      const icon = STATUS_ICON[cap.status]  || '○';
      const card = document.createElement('div');
      card.className = `ws-prog-cap ws-prog-cap--${cls}`;
      card.dataset.domainId = domain.domainId;
      card.dataset.capId    = cap.id || cap.capabilityId;
      card.innerHTML = `
        <span class="ws-prog-cap__icon ws-prog-cap__icon--${cls}" aria-hidden="true">${icon}</span>
        <span class="ws-prog-cap__name">${cap.name || cap.capabilityName}</span>
        <span class="ws-prog-cap__label ws-prog-cap__label--${cls}">${capLabel(cap.status)}</span>
      `;
      grid.appendChild(card);
    }

    section.appendChild(grid);
    container.appendChild(section);
  }
}

function updateProgressCard(domainId, capId, status) {
  const card = document.querySelector(
    `.ws-prog-cap[data-domain-id="${CSS.escape(domainId)}"][data-cap-id="${CSS.escape(capId)}"]`
  );
  if (!card) return;
  const cls   = STATUS_CLASS[status] || 'pending';
  const icon  = STATUS_ICON[status]  || '○';
  const label = capLabel(status);
  card.className = `ws-prog-cap ws-prog-cap--${cls}`;
  const iconEl  = card.querySelector('.ws-prog-cap__icon');
  const labelEl = card.querySelector('.ws-prog-cap__label');
  if (iconEl)  { iconEl.textContent  = icon;  iconEl.className  = `ws-prog-cap__icon ws-prog-cap__icon--${cls}`; }
  if (labelEl) { labelEl.textContent = label; labelEl.className = `ws-prog-cap__label ws-prog-cap__label--${cls}`; }
}

// ── Done state ────────────────────────────────────────────────────────────────

const DOMAIN_COLORS = {
  'ai-strategy':               '#5CC5A7',
  'ai-use-cases':              '#818cf8',
  'skills-workforce':          '#f59e0b',
  'data-readiness':            '#38bdf8',
  'technology-infrastructure': '#34d399',
  'governance-security':       '#f87171',
};

const DOMAIN_ICONS = {
  'ai-strategy':               `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#5CC5A7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  'ai-use-cases':              `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  'skills-workforce':          `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'data-readiness':            `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  'technology-infrastructure': `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M9 2v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/></svg>`,
  'governance-security':       `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
};

function domainStatusFromCaps(caps) {
  const total      = caps.length;
  if (!total) return { label: 'Not Started', cls: 'not-started', pct: 0 };
  const complete   = caps.filter(c => c.status === 'completed').length;
  const inProgress = caps.filter(c => c.status === 'in-progress' || c.status === 'generating').length;
  const pct        = Math.round((complete / total) * 100);
  if (complete === total)              return { label: 'Complete',    cls: 'complete',    pct };
  if (complete > 0 || inProgress > 0) return { label: 'In Progress', cls: 'in-progress', pct };
  return { label: 'Not Started', cls: 'not-started', pct: 0 };
}

function buildMergedDomains(blueprint) {
  const bpMap  = Object.fromEntries((blueprint.domains || []).map(d => [d.domainId, d]));
  const ORDER  = ['ai-strategy','ai-use-cases','skills-workforce','data-readiness','technology-infrastructure','governance-security'];
  const source = _enabledDomains.length ? _enabledDomains : (blueprint.domains || []).map(d => ({ domainId: d.domainId, title: d.domainName }));
  return source
    .map(ed => bpMap[ed.domainId] || { domainId: ed.domainId, domainName: ed.title, capabilities: [], status: 'pending' })
    .sort((a, b) => ORDER.indexOf(a.domainId) - ORDER.indexOf(b.domainId));
}

function renderDoneState(blueprint) {
  const domains = buildMergedDomains(blueprint);

  // Aggregate stats across all domains
  let totalCaps = 0, complete = 0, inProgress = 0, notStarted = 0;
  for (const d of domains) {
    for (const c of (d.capabilities || [])) {
      totalCaps++;
      const s = c.status || 'pending';
      if (s === 'completed')                          complete++;
      else if (s === 'in-progress' || s === 'generating') inProgress++;
      else                                            notStarted++;
    }
  }
  const started = inProgress + complete;
  const pct = totalCaps ? Math.round((complete / totalCaps) * 100) : 0;

  // Sidebar — summary
  const summaryEl = document.getElementById('ws-done-caps-summary');
  if (summaryEl) summaryEl.textContent = `${started} of ${totalCaps} Capabilities Started`;

  // Sidebar — ring
  const r = 46, circ = +(2 * Math.PI * r).toFixed(2);
  const ringFillEl = document.getElementById('ws-done-ring-fill');
  if (ringFillEl) {
    ringFillEl.style.strokeDasharray  = circ;
    ringFillEl.style.strokeDashoffset = (circ - (pct / 100) * circ).toFixed(2);
  }
  const ringPctEl = document.getElementById('ws-done-ring-pct');
  if (ringPctEl) ringPctEl.textContent = `${pct}%`;

  // Sidebar — progress bar
  const progFillEl = document.getElementById('ws-done-prog-fill');
  if (progFillEl) progFillEl.style.width = `${pct}%`;
  const progPctEl = document.getElementById('ws-done-prog-pct');
  if (progPctEl) progPctEl.textContent = `${pct}%`;

  // Sidebar — status breakdown
  const statusList = document.getElementById('ws-done-status-list');
  if (statusList) {
    statusList.innerHTML = '';
    [
      { label: 'Complete',    count: complete,    color: '#5CC5A7' },
      { label: 'In Progress', count: inProgress,  color: '#f59e0b' },
      { label: 'Not Started', count: notStarted,  color: 'rgba(255,255,255,0.2)' },
    ].forEach(({ label, count, color }) => {
      const li = document.createElement('li');
      li.className = 'ws-done-status-item';
      li.innerHTML = `
        <span class="ws-done-status-dot" style="background:${color}"></span>
        <span class="ws-done-status-label">${label}</span>
        <span class="ws-done-status-count">${count}</span>
      `;
      statusList.appendChild(li);
    });
  }

  // Right panel — one card per domain
  const capsEl = document.getElementById('ws-done-caps');
  if (!capsEl) return;
  capsEl.innerHTML = '';

  for (const domain of domains) {
    const caps  = domain.capabilities || [];
    const color = DOMAIN_COLORS[domain.domainId] || '#5CC5A7';
    const icon  = DOMAIN_ICONS[domain.domainId]  || '●';
    const { label, cls, pct } = domainStatusFromCaps(caps);
    const isNotStarted = cls === 'not-started';

    const card = document.createElement('div');
    card.className = 'ws-done-cap-card';
    card.innerHTML = `
      <div class="ws-done-cap-icon ws-done-cap-icon--domain" style="background:${color}1a;border:1.5px solid ${color}44">${icon}</div>
      <div class="ws-done-cap-body">
        <p class="ws-done-cap-name">${domain.domainName}</p>
        <div class="ws-done-cap-footer">
          <span class="ws-done-cap-badge ws-done-cap-badge--${cls}">${label}</span>
          <div class="ws-done-cap-prog">
            <span class="ws-done-cap-pct">${pct}%</span>
            <div class="ws-done-cap-bar"><div class="ws-done-cap-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          </div>
        </div>
      </div>
      ${isNotStarted
        ? `<button class="ws-done-cap-generate-btn" data-domain-id="${domain.domainId}" data-blueprint-id="${blueprint._id}">Generate</button>`
        : '<span class="ws-done-cap-arrow">→</span>'}
    `;
    capsEl.appendChild(card);
  }

  // Bind "Generate" buttons on not-started domain cards
  capsEl.querySelectorAll('.ws-done-cap-generate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { domainId, blueprintId: bpId } = btn.dataset;
      triggerDomainRegeneration(bpId, domainId);
    });
  });
}

// ── Domain regeneration ───────────────────────────────────────────────────────

async function triggerDomainRegeneration(blueprintId, domainId) {
  try {
    const resp = await fetch(
      `${API_BASE}/strategy-canvas/transformation-blueprint/${blueprintId}/regenerate-domains`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body:    JSON.stringify({ domainIds: [domainId] }),
      }
    );
    if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
    if (!resp.ok) throw new Error('Failed to start regeneration');
    const { transformationId } = await resp.json();

    // Reload blueprint so progress cards reflect updated domain statuses
    try {
      const bpResp = await fetch(`${API_BASE}/strategy-canvas/transformation-blueprint`, {
        headers: authHeaders(),
      });
      if (bpResp.ok) {
        const bp = await bpResp.json();
        renderProgressDomains(bp.domains || []);
      }
    } catch { /* non-critical */ }

    showState('ws-progress');
    connectProgressStream(transformationId);
  } catch (err) {
    console.error('[workspace] domain regen error:', err);
    alert('Could not start generation. Please try again.');
  }
}

// ── SSE stream ────────────────────────────────────────────────────────────────

let _sseReader = null;

async function connectProgressStream(transformationId) {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch(
      `${API_BASE}/strategy-canvas/generate-transformation/${transformationId}/stream`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok || !response.body) {
      console.error('[workspace] SSE connection failed');
      return;
    }

    _sseReader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = '';
    while (true) {
      const { done, value } = await _sseReader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const msg = JSON.parse(line.slice(6));

          if (msg.domains) {
            for (const domain of msg.domains) {
              for (const cap of (domain.capabilities || [])) {
                updateProgressCard(domain.domainId, cap.id || cap.capabilityId, cap.status);
              }
            }
          }

          if (msg.done) {
            await transitionToDone();
            return;
          }
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    console.error('[workspace] SSE error:', err);
  }
}

async function transitionToDone() {
  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/transformation-blueprint`, {
      headers: authHeaders(),
    });
    if (!resp.ok) return;
    const bp = await resp.json();
    renderDoneState(bp);
    showState('ws-done');
    bindNewBlueprintBtn();
  } catch (err) {
    console.error('[workspace] transitionToDone error:', err);
  }
}

// ── Generate form ─────────────────────────────────────────────────────────────

let _formBound = false;

function initGenerateForm() {
  if (_formBound) return;
  _formBound = true;

  const form = document.getElementById('ws-gen-form');
  if (!form) return;

  // Example chips populate the textarea on click
  document.querySelectorAll('.ws-gen-example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = document.getElementById('ws-gen-objective');
      if (input) { input.value = chip.dataset.text; input.focus(); }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const input      = document.getElementById('ws-gen-objective');
    const errEl      = document.getElementById('ws-gen-error');
    const submitBtn  = document.getElementById('ws-gen-submit');
    const submitText = document.getElementById('ws-gen-submit-text');
    const loader     = document.getElementById('ws-gen-submit-loader');

    const objective = input?.value?.trim();
    if (!objective) {
      if (errEl) { errEl.textContent = 'Please enter your transformation objective.'; errEl.style.display = ''; }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    if (submitBtn)  submitBtn.disabled       = true;
    if (submitText) submitText.style.display = 'none';
    if (loader)     loader.style.display     = '';

    try {
      const resp = await fetch(`${API_BASE}/strategy-canvas/generate-transformation`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body:    JSON.stringify({ businessObjective: objective }),
      });

      if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
      if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({}));
        throw new Error(error || 'Failed to start generation.');
      }

      const { transformationId } = await resp.json();

      // Load blueprint shell so progress cards are pre-rendered as pending
      try {
        const bpResp = await fetch(`${API_BASE}/strategy-canvas/transformation-blueprint`, {
          headers: authHeaders(),
        });
        if (bpResp.ok) {
          const bp = await bpResp.json();
          renderProgressDomains(bp.domains || []);
          const objEl = document.getElementById('ws-prog-objective');
          if (objEl) objEl.textContent = `"${objective}"`;
        }
      } catch { /* non-critical */ }

      showState('ws-progress');
      connectProgressStream(transformationId);

    } catch (err) {
      if (errEl) { errEl.textContent = err.message || 'Something went wrong. Please try again.'; errEl.style.display = ''; }
      if (submitBtn)  submitBtn.disabled       = false;
      if (submitText) submitText.style.display = '';
      if (loader)     loader.style.display     = 'none';
    }
  });
}

// ── New Blueprint button ──────────────────────────────────────────────────────

function bindNewBlueprintBtn() {
  const btn = document.getElementById('ws-new-blueprint');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const input = document.getElementById('ws-gen-objective');
    if (input) input.value = '';
    _formBound = false;
    showState('ws-prompt');
    initGenerateForm();
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) {
    window.location.href = '/login/login.html?redirect=/workspace/workspace.html';
    return;
  }

  document.getElementById('ws-logout')?.addEventListener('click', logout);

  const loadingEl = document.getElementById('ws-loading');
  const mainEl    = document.getElementById('ws-main');

  try {
    // Auth guard + profile redirect
    const profileResp = await fetch(`${API_BASE}/profile/me`, { headers: authHeaders() });
    if (profileResp.status === 404) { window.location.href = '/profile-setup/profile.html'; return; }
    if (profileResp.status === 401) { logout(); return; }

    // Load workspace state (profile + domain list with enabled flags)
    const stateResp = await fetch(`${API_BASE}/workspace/state`, { headers: authHeaders() });
    if (!stateResp.ok) throw new Error('Failed to load workspace state');
    const state = await stateResp.json();

    _enabledDomains = (state.domains || []).filter(d => d.enabled);
    renderProfile(state);
    renderDomainBadges(state.domains || []);

    // Check blueprint status
    const bpResp = await fetch(`${API_BASE}/strategy-canvas/transformation-blueprint`, {
      headers: authHeaders(),
    });

    if (loadingEl) loadingEl.style.display = 'none';
    if (mainEl)    mainEl.style.display    = '';

    if (bpResp.status === 404) {
      showState('ws-prompt');
      initGenerateForm();
      return;
    }

    if (!bpResp.ok) throw new Error('Failed to check blueprint status');
    const bp = await bpResp.json();

    if (bp.status === 'generating') {
      const objEl = document.getElementById('ws-prog-objective');
      if (objEl) objEl.textContent = `"${bp.businessObjective || ''}"`;
      renderProgressDomains(bp.domains || []);
      showState('ws-progress');
      connectProgressStream(bp._id);
      return;
    }

    // Blueprint completed
    renderDoneState(bp);
    showState('ws-done');
    bindNewBlueprintBtn();

  } catch (err) {
    console.error('[workspace] load error:', err);
    if (loadingEl) loadingEl.innerHTML = '<p style="color:#ff6b6b">Failed to load workspace. Please refresh.</p>';
  }
});
