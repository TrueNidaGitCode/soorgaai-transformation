/**
 * Svarg — Blueprint Generate Module
 *
 * Manages Screen 1 (Generate form) and Screen 2 (Generation Progress).
 *
 * Flow:
 *   1. On page load: check for existing TransformationBlueprint.
 *      - If completed  → dispatch 'blueprint:ready' (workspace takes over Screen 3)
 *      - If generating → show Screen 2 and reconnect to SSE stream
 *      - If none       → show Screen 1
 *
 *   2. Screen 1: user enters objective, clicks Generate.
 *      POST /api/strategy-canvas/generate-transformation → { transformationId }
 *      Then show Screen 2 and open SSE stream.
 *
 *   3. Screen 2: SSE updates domain/capability status cards in real time.
 *      When done → dispatch 'blueprint:ready' with full blueprint data.
 *
 * Events dispatched:
 *   'blueprint:ready' — { blueprint } — tells workspace module to take over
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

// ── Screen helpers ────────────────────────────────────────────────────────────

function showScreen(id) {
  ['screen-generate', 'screen-progress', 'screen-opportunities', 'screen-workspace', 'domain-loading'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? '' : 'none';
  });
}

// ── Nav / logout ──────────────────────────────────────────────────────────────

function initNav() {
  const usernameEl = document.getElementById('domain-username');
  if (usernameEl) usernameEl.textContent = localStorage.getItem('userEmail') || '';

  const logoutBtn = document.getElementById('domain-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      window.location.href = '/login/login.html';
    });
  }
}

// ── Knowledge Sources nav link ──────────────────────────────────────────────
// Permanent, blueprint-scoped entry point back to the per-project linking
// page. Unlike the not-grounded banner (which only shows once, before any
// connection exists), this is always available — a connected user still
// needs a way to link documents to a *different* or *new* blueprint.

function initKnowledgeSourcesLink(blueprintId) {
  const link = document.getElementById('domain-knowledge-link');
  if (!link || !blueprintId) return;
  link.href = `/knowledge-sources/knowledge-sources.html?blueprintId=${encodeURIComponent(blueprintId)}`;
  link.style.display = '';
}

// ── Enterprise Blueprint nav link ───────────────────────────────────────────
// CTO only — this points at the caller's OWN org's Enterprise Blueprint
// (resolveOrg() in enterpriseBlueprintController.js), never a chosen org, so
// a platform admin's JWT role never surfaces anything useful here — it just
// shows whatever placeholder org their own admin account happens to have.
// The backend enforces the same gating independently — this is purely a UI
// convenience so other org members never see a link to a page they'd
// immediately get a 403 from.

async function initEnterpriseBlueprintLink() {
  const link = document.getElementById('domain-enterprise-blueprint-link');
  const token = getToken();
  if (!link || !token) return;

  try {
    const resp = await fetch(`${API_BASE}/profile/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data?.profile?.role === 'CTO') {
      link.style.display = '';
    }
  } catch {
    // Non-fatal — link simply stays hidden.
  }
}

// ── Not-grounded notice ────────────────────────────────────────────────────
// Shown to logged-in users viewing an existing blueprint who have neither a
// personal nor an org-wide Confluence connection — covers users who were
// already mid-session before this feature shipped and never passed through
// profile-setup or any other connect prompt.

function groundingDismissedKey(blueprintId) {
  return `soorgaai_grounding_dismissed_${blueprintId}`;
}

async function initGroundingBanner(blueprintId) {
  const banner = document.getElementById('domain-grounding-banner');
  if (!banner || !blueprintId) return;

  if (localStorage.getItem(groundingDismissedKey(blueprintId))) return;

  const token = getToken();
  try {
    const [personal, org] = await Promise.all([
      fetch(`${API_BASE}/confluence/personal/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : { connected: false })).catch(() => ({ connected: false })),
      fetch(`${API_BASE}/confluence/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : { status: 'not_connected' })).catch(() => ({ status: 'not_connected' })),
    ]);

    if (personal.connected || org.status === 'active') return; // already grounded one way or another
  } catch {
    return; // status check failed — don't nag on uncertain information
  }

  const linkBtn = document.getElementById('domain-grounding-banner-yes');
  if (linkBtn) linkBtn.href = `/knowledge-sources/knowledge-sources.html?blueprintId=${encodeURIComponent(blueprintId)}`;

  document.getElementById('domain-grounding-banner-dismiss')?.addEventListener('click', () => {
    localStorage.setItem(groundingDismissedKey(blueprintId), '1');
    banner.style.display = 'none';
  });

  banner.style.display = 'flex';
}

// ── Screen 2: Domain-grouped progress rendering ───────────────────────────────

const STATUS_ICON  = { pending: '○', 'in-progress': '⟳', generating: '⟳', completed: '✓', error: '✕' };
const STATUS_CLASS = {
  pending:       'pending',
  'in-progress': 'progress',
  generating:    'progress',
  completed:     'completed',
  error:         'error',
};

function capStatusLabel(status) {
  if (status === 'in-progress' || status === 'generating') return 'In Progress';
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderProgressDomains(domains) {
  const container = document.getElementById('prog-domains');
  if (!container) return;
  container.innerHTML = '';

  for (const domain of domains) {
    const section = document.createElement('div');
    section.className = 'prog-domain';
    section.dataset.domainId = domain.domainId;

    const header = document.createElement('div');
    header.className = 'prog-domain__header';
    const nameEl = document.createElement('h3');
    nameEl.className = 'prog-domain__name';
    nameEl.textContent = domain.domainName;
    header.appendChild(nameEl);
    section.appendChild(header);

    const capsGrid = document.createElement('div');
    capsGrid.className = 'prog-domain__caps';

    for (const cap of (domain.capabilities || [])) {
      const cls  = STATUS_CLASS[cap.status] || 'pending';
      const icon = STATUS_ICON[cap.status]  || '○';
      const card = document.createElement('div');
      card.className = `prog-cap prog-cap--${cls}`;
      card.dataset.domainId = domain.domainId;
      card.dataset.capId    = cap.id || cap.capabilityId;
      card.innerHTML = `
        <span class="prog-cap__icon prog-cap__icon--${cls}" aria-hidden="true">${icon}</span>
        <span class="prog-cap__name">${cap.name || cap.capabilityName}</span>
        <span class="prog-cap__status-label prog-cap__status-label--${cls}">${capStatusLabel(cap.status)}</span>
      `;
      capsGrid.appendChild(card);
    }

    section.appendChild(capsGrid);
    container.appendChild(section);
  }
}

function updateProgressCard(domainId, capId, status) {
  const selector = `.prog-cap[data-domain-id="${CSS.escape(domainId)}"][data-cap-id="${CSS.escape(capId)}"]`;
  const card = document.querySelector(selector);
  if (!card) return;

  const cls   = STATUS_CLASS[status] || 'pending';
  const icon  = STATUS_ICON[status]  || '○';
  const label = capStatusLabel(status);

  card.className = `prog-cap prog-cap--${cls}`;
  const iconEl  = card.querySelector('.prog-cap__icon');
  const labelEl = card.querySelector('.prog-cap__status-label');
  if (iconEl)  { iconEl.textContent  = icon;  iconEl.className  = `prog-cap__icon prog-cap__icon--${cls}`; }
  if (labelEl) { labelEl.textContent = label; labelEl.className = `prog-cap__status-label prog-cap__status-label--${cls}`; }
}

// ── SSE: stream generation progress ──────────────────────────────────────────

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
      console.error('[blueprintGenerate] SSE connection failed');
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
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const msg = JSON.parse(line.slice(6));
          handleProgressMessage(msg, transformationId);
          if (msg.done) return;
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    console.error('[blueprintGenerate] SSE error:', err);
  }
}

function handleProgressMessage(msg, transformationId) {
  if (msg.error) {
    console.error('[blueprintGenerate] Server error:', msg.error);
    return;
  }

  // Update individual capability cards within their domains
  if (msg.domains) {
    for (const domain of msg.domains) {
      for (const cap of (domain.capabilities || [])) {
        updateProgressCard(domain.domainId, cap.id || cap.capabilityId, cap.status);
      }
    }
  }

  if (msg.done) {
    loadBlueprintAndTransition(transformationId);
  }
}

// ── Screen 2.5: AI Use Cases & Prioritization (gated on full completion) ──────
// Shown once the ai-use-cases domain finishes, ahead of the rest of the
// blueprint — View Blueprint / Approve stay disabled until bp.status is
// 'completed'. Reuses the same blueprint:update polling snapshots
// startLiveUpdates() already dispatches (full content each tick, no
// separate fetch needed to read the recommended starting point).

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let _opportunitiesContentShown = false;

function findAiUseCasesPrioritizationSection(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'ai-use-cases');
  if (!domain || domain.status !== 'completed') return null;
  for (const cap of (domain.capabilities || [])) {
    for (const section of (cap.sections || [])) {
      if (section.title === 'AI Implementation Prioritization' || section.title === 'AI Use Case Prioritization') {
        return section;
      }
    }
  }
  return null;
}

// recommendedStartingPoint is a full justification sentence (e.g.
// "X should be implemented first because…"), not just the initiative's
// short name — it embeds the matching priorityQuadrants initiative name
// as a leading substring, which is how the winner/others split works.
function renderOpportunitiesContent(section, bp) {
  const brief = section.brief || {};
  const allInitiatives = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
  const recommended = brief.recommendedStartingPoint || '';
  const winnerInitiative = allInitiatives.find(name => name && recommended.includes(name));

  const winnerNameEl = document.getElementById('opp-winner-name');
  const winnerWhyEl  = document.getElementById('opp-winner-why');
  if (winnerNameEl) winnerNameEl.textContent = winnerInitiative || recommended;
  if (winnerWhyEl)  winnerWhyEl.textContent  = winnerInitiative ? recommended : '';

  const projectNameEl = document.getElementById('rp-project-name');
  if (projectNameEl) projectNameEl.textContent = bp?.companyName || 'Untitled Project';

  const others = allInitiatives.filter(name => name && name !== winnerInitiative);

  const othersList = document.getElementById('opp-others');
  if (othersList) {
    othersList.innerHTML = others
      .map((name, i) => `
        <li class="rp-others-item pw-reveal" style="--i:${i + 1}">
          <span class="rp-others-item__name">${escapeHtml(name)}</span>
          <span class="rp-others-item__arrow">&rarr;</span>
        </li>
      `)
      .join('');
  }

  const loadingEl = document.getElementById('opp-loading');
  const contentEl = document.getElementById('opp-content');
  if (loadingEl) loadingEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';

  _opportunitiesContentShown = true;
}

// Cob is real (this screen IS Cob's own opportunity discovery, not a
// separate step); Aria/Arth/Eame/Yusu render locked in the HTML by
// default (see domain.html/.rp-journey__locked) since they're not built
// yet — this just marks Cob active (we're still inside it, not past it).
function renderJourneyIndicator() {
  document.getElementById('rp-step-1')?.classList.add('pw-step--active');
}

function updateOpportunitiesGate(bp) {
  const done = bp.status === 'completed';
  const approveBtn = document.getElementById('opp-approve-btn');
  const viewBtn    = document.getElementById('opp-view-blueprint-btn');
  if (approveBtn) approveBtn.disabled = !done;
  if (viewBtn)    viewBtn.disabled    = !done;

  const badge = document.getElementById('opp-live-badge');
  if (badge) {
    badge.textContent = done ? '● Live' : 'Generating…';
    badge.classList.toggle('pd-badge--live', done);
    badge.classList.toggle('pd-badge--simulated', !done);
  }
}

// Only acts while the opportunities screen is the active one — once the
// user has moved on to the workspace, this becomes a no-op rather than
// fighting with blueprintWorkspace.js's own rendering of the same data.
function handleOpportunitiesUpdate(bp) {
  const screen = document.getElementById('screen-opportunities');
  if (!screen || screen.style.display === 'none') return;

  if (!_opportunitiesContentShown) {
    const section = findAiUseCasesPrioritizationSection(bp);
    if (section) renderOpportunitiesContent(section, bp);
  }

  updateOpportunitiesGate(bp);
}

async function transitionToWorkspace(guestId) {
  const errEl = document.getElementById('opp-error');
  try {
    const bp = await fetchCurrentBlueprint(guestId);
    if (!bp) throw new Error('Could not load your blueprint. Please refresh and try again.');
    document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
  } catch (err) {
    console.error('[blueprintGenerate] Failed to load blueprint for workspace transition:', err);
    if (errEl) { errEl.textContent = err.message || 'Could not load your blueprint. Please refresh and try again.'; errEl.style.display = 'block'; }
  }
}

let _opportunitiesButtonsWired = false;

function wireOpportunitiesButtons(guestId) {
  if (_opportunitiesButtonsWired) return;
  _opportunitiesButtonsWired = true;

  const approveBtn = document.getElementById('opp-approve-btn');
  const viewBtn    = document.getElementById('opp-view-blueprint-btn');
  const errEl      = document.getElementById('opp-error');

  viewBtn?.addEventListener('click', async () => {
    if (errEl) errEl.style.display = 'none';
    viewBtn.disabled = true;
    await transitionToWorkspace(guestId);
    viewBtn.disabled = false; // no-op if the transition succeeded and this screen is now hidden
  });

  approveBtn?.addEventListener('click', async () => {
    const token = getToken();
    if (!token) {
      localStorage.setItem('redirectAfterLogin', '/domain/domain.html');
      window.location.href = '/login/login.html';
      return;
    }
    if (errEl) errEl.style.display = 'none';
    approveBtn.disabled = true;
    try {
      const bp = await fetchTransformationBlueprint();
      const resp = await fetch(`${API_BASE}/strategy-canvas/transformation-blueprint/${bp._id}/approve-opportunity`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.status === 401) { window.handleSessionExpired(); return; }
      if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({}));
        throw new Error(error || 'Failed to approve. Please try again.');
      }
      await transitionToWorkspace(guestId);
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      approveBtn.disabled = false;
    }
  });
}

document.addEventListener('blueprint:update', (e) => {
  const { blueprint } = e.detail || {};
  if (blueprint) handleOpportunitiesUpdate(blueprint);
});

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchTransformationBlueprint() {
  // Honor a specific blueprint picked from the landing-page sidebar
  const openId = sessionStorage.getItem('soorgaai_open_blueprint_id');
  const url = openId
    ? `${API_BASE}/strategy-canvas/transformation-blueprint?id=${encodeURIComponent(openId)}`
    : `${API_BASE}/strategy-canvas/transformation-blueprint`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  // Must be checked before the generic !resp.ok fallthrough — otherwise an
  // expired session gets silently treated as "no blueprint yet" and the user
  // is dropped into the generate-a-new-blueprint screen instead of being
  // told they've been logged out.
  if (resp.status === 401) { window.handleSessionExpired(); throw new Error('SESSION_EXPIRED'); }
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('Failed to load blueprint');
  return resp.json();
}

async function loadBlueprintAndTransition(transformationId) {
  try {
    const bp = await fetchTransformationBlueprint();
    if (bp) {
      document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    }
  } catch (err) {
    console.error('[blueprintGenerate] Failed to load blueprint after generation:', err);
  }
}

// ── Screen 1: form logic ──────────────────────────────────────────────────────

// Must match backend/trunida-backend/config/objectiveLimits.js
const MAX_OBJECTIVE_LENGTH = 8000;
const OBJECTIVE_COUNTER_THRESHOLD = 0.85;

function updateGenObjectiveCounter(input, counterEl) {
  if (!counterEl) return;
  const len = input.value.length;
  if (len < MAX_OBJECTIVE_LENGTH * OBJECTIVE_COUNTER_THRESHOLD) {
    counterEl.style.display = 'none';
    return;
  }
  counterEl.style.display = '';
  counterEl.textContent = `${len.toLocaleString()} / ${MAX_OBJECTIVE_LENGTH.toLocaleString()} characters`;
  counterEl.classList.toggle('gen-objective-counter--over', len > MAX_OBJECTIVE_LENGTH);
}

function initGenerateForm() {
  const form         = document.getElementById('generate-form');
  const input        = document.getElementById('gen-objective');
  const errEl        = document.getElementById('gen-error');
  const counterEl    = document.getElementById('gen-objective-counter');
  const submitBtn    = document.getElementById('gen-submit');
  const submitText   = document.getElementById('gen-submit-text');
  const submitLoader = document.getElementById('gen-submit-loader');

  // Example chips fill the textarea
  document.querySelectorAll('.gen-example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (input) input.value = chip.dataset.text;
      updateGenObjectiveCounter(input, counterEl);
      input?.focus();
    });
  });

  input?.addEventListener('input', () => updateGenObjectiveCounter(input, counterEl));

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const objective = input?.value?.trim();

    if (!objective) {
      showError(errEl, 'Please enter your business objective.');
      return;
    }
    if (objective.length > MAX_OBJECTIVE_LENGTH) {
      showError(errEl, `Your objective is ${objective.length.toLocaleString()} characters — please trim it to ${MAX_OBJECTIVE_LENGTH.toLocaleString()} or fewer. Nothing you typed has been lost; edit and resubmit.`);
      return;
    }

    if (errEl) errEl.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.style.display = 'none';
    if (submitLoader) submitLoader.style.display = '';

    try {
      const resp = await fetch(`${API_BASE}/strategy-canvas/generate-transformation`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ businessObjective: objective }),
      });

      if (resp.status === 401) { window.handleSessionExpired(); return; }
      if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({}));
        throw new Error(error || 'Failed to start blueprint generation.');
      }

      await resp.json().catch(() => ({}));

      // Reload into the live blueprint view — capabilities appear as they complete
      window.location.reload();

    } catch (err) {
      showError(errEl, err.message || 'Something went wrong. Please try again.');
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.style.display = '';
      if (submitLoader) submitLoader.style.display = 'none';
    }
  });
}

async function initProgressFromBlueprint() {
  try {
    const bp = await fetchTransformationBlueprint();
    if (bp?.domains) renderProgressDomains(bp.domains);
  } catch { /* non-critical */ }
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Live updates while generating ─────────────────────────────────────────────
// The workspace view renders immediately and fills in as capabilities complete.
// This poller refetches the blueprint and hands each snapshot to
// blueprintWorkspace via 'blueprint:update' until generation finishes.

let _livePoll = null;

async function fetchCurrentBlueprint(guestId) {
  if (guestId) {
    const resp = await fetch(`${API_BASE}/guest/blueprint/${encodeURIComponent(guestId)}`);
    if (!resp.ok) return null;
    return resp.json();
  }
  return fetchTransformationBlueprint().catch(() => null);
}

function startLiveUpdates(guestId) {
  if (_livePoll) return;
  _livePoll = setInterval(async () => {
    const bp = await fetchCurrentBlueprint(guestId);
    if (!bp) return;

    document.dispatchEvent(new CustomEvent('blueprint:update', { detail: { blueprint: bp } }));

    if (bp.status !== 'generating') {
      clearInterval(_livePoll);
      _livePoll = null;
    }
  }, 4000);
}

// ── Guest preview mode ────────────────────────────────────────────────────────

function guestGoToLogin() {
  localStorage.setItem('redirectAfterLogin', '/domain/domain.html');
  window.location.href = '/login/login.html';
}

async function initGuest(guestId) {
  window.SOORGA_GUEST = true;

  // Navbar: no session — offer login instead of logout
  const usernameEl = document.getElementById('domain-username');
  if (usernameEl) usernameEl.textContent = 'Guest preview';
  const logoutBtn = document.getElementById('domain-logout');
  if (logoutBtn) {
    logoutBtn.textContent = 'Log in';
    logoutBtn.addEventListener('click', guestGoToLogin);
  }

  const banner = document.getElementById('domain-guest-banner');
  if (banner) {
    banner.style.display = '';
    document.getElementById('domain-guest-banner-login')?.addEventListener('click', guestGoToLogin);
  }

  try {
    const resp = await fetch(`${API_BASE}/guest/blueprint/${encodeURIComponent(guestId)}`);
    if (resp.status === 404) {
      localStorage.removeItem('soorgaai_guest_id');
      window.location.href = '/cob.html';
      return;
    }
    if (!resp.ok) throw new Error('Failed to load preview blueprint');
    const bp = await resp.json();

    if (bp.opportunityApproval?.approved) {
      // Already approved (this session or a previous one) — straight to
      // the workspace, no need to re-gate.
      document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    } else {
      // Not yet approved — gate on Screen 2.5, whether generation is
      // still running or this is a pre-existing blueprint from before
      // this screen existed (opportunityApproval defaults to unapproved
      // either way, so both cases are handled identically here).
      wireOpportunitiesButtons(guestId);
      showScreen('screen-opportunities');
      renderJourneyIndicator();
      handleOpportunitiesUpdate(bp);
      if (bp.status === 'generating') startLiveUpdates(guestId);
    }
  } catch (err) {
    console.error('[blueprintGenerate] guest init error:', err);
    window.location.href = '/cob.html';
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  const token   = getToken();
  const guestId = localStorage.getItem('soorgaai_guest_id');

  if (!token && guestId) { await initGuest(guestId); return; }

  if (!token) {
    window.location.href = `/login/login.html?redirect=/domain/domain.html`;
    return;
  }

  // Fresh login with a guest preview waiting — claim it into this account
  if (guestId) {
    try {
      await fetch(`${API_BASE}/strategy-canvas/claim-guest-blueprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ guestId }),
      });
    } catch { /* best-effort */ }
    localStorage.removeItem('soorgaai_guest_id');
  }

  initNav();

  try {
    const bp = await fetchTransformationBlueprint();

    if (!bp) {
      // No blueprint yet — the landing page owns the prompt box
      window.location.href = '/cob.html';
      return;
    }

    if (bp.opportunityApproval?.approved) {
      // Already approved (this session or a previous one) — straight to
      // the workspace, no need to re-gate.
      document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    } else {
      // Not yet approved — gate on Screen 2.5, whether generation is
      // still running or this is a pre-existing blueprint from before
      // this screen existed (opportunityApproval defaults to unapproved
      // either way, so both cases are handled identically here).
      wireOpportunitiesButtons(null);
      showScreen('screen-opportunities');
      renderJourneyIndicator();
      handleOpportunitiesUpdate(bp);
      if (bp.status === 'generating') startLiveUpdates(null);
    }
    initGenerateForm(); // keep form initialised in case user clicks New Blueprint
    initGroundingBanner(bp._id);
    initKnowledgeSourcesLink(bp._id);
    initEnterpriseBlueprintLink();

  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') return; // already redirecting home
    console.error('[blueprintGenerate] init error:', err);
    showScreen('screen-generate');
    initGenerateForm();
  }
}

document.addEventListener('DOMContentLoaded', init);
