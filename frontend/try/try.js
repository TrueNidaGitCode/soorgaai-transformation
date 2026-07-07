/**
 * SoorgaAI — Try (guest preview) page
 *
 * Try-before-login flow:
 *   1. Landing page saves the objective to sessionStorage and sends the
 *      visitor here — no account needed.
 *   2. We start a guest generation (AI Use Cases domain only) and stream
 *      progress, then render the preview with the other domains locked.
 *   3. "Sign in to unlock" routes through the normal login (email or OAuth)
 *      with redirectAfterLogin pointing back here; on return we claim the
 *      blueprint into the new account and forward to the real workspace.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

const GUEST_ID_KEY   = 'soorgaai_guest_id';
const OBJECTIVE_KEY  = 'soorgaai_pending_objective';
const PREVIEW_DOMAIN = 'ai-use-cases';

const LOCKED_DOMAIN_INFO = [
  { id: 'ai-strategy',               name: 'AI Strategy',               desc: 'Vision, leadership alignment, operating model, and ROI for your AI initiative.' },
  { id: 'data-readiness',            name: 'Data Readiness',            desc: 'Critical datasets, preparation work packages, and data architecture enablement.' },
  { id: 'technology-infrastructure', name: 'Technology Infrastructure', desc: 'System integration, platform readiness, and compute & deployment strategy.' },
  { id: 'skills-workforce',          name: 'Skills & Workforce',        desc: 'AI roles, capability planning, and a learning & adoption roadmap for your team.' },
  { id: 'governance-security',       name: 'Governance & Ethics',       desc: 'Security pillars, compliance controls, and responsible-AI adoption stages.' },
];

// ── Small helpers ─────────────────────────────────────────────────────────────

function getGuestId()  { return localStorage.getItem(GUEST_ID_KEY); }
function getToken()    { return localStorage.getItem('token'); }

function showState(id) {
  ['try-loading', 'try-progress', 'try-preview', 'try-error'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? '' : 'none';
  });
  const bar = document.getElementById('try-unlock-bar');
  if (bar) bar.style.display = (id === 'try-preview') ? '' : 'none';
}

function showError(msg) {
  const el = document.getElementById('try-error-msg');
  if (el && msg) el.textContent = msg;
  showState('try-error');
}

function goToLogin() {
  localStorage.setItem('redirectAfterLogin', '/try/try.html');
  window.location.href = '/login/login.html';
}

// ── Claim (post-login return path) ────────────────────────────────────────────

async function claimAndEnterWorkspace(guestId) {
  try {
    await fetch(`${API_BASE}/strategy-canvas/claim-guest-blueprint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ guestId }),
    });
  } catch { /* claim is best-effort — workspace still works without it */ }

  localStorage.removeItem(GUEST_ID_KEY);
  sessionStorage.removeItem(OBJECTIVE_KEY);
  window.location.href = '/workspace/workspace.html';
}

// ── Guest generation ──────────────────────────────────────────────────────────

async function startGeneration(objective) {
  const resp = await fetch(`${API_BASE}/guest/generate-blueprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessObjective: objective }),
  });

  if (resp.status === 429) {
    const { error } = await resp.json().catch(() => ({}));
    throw new Error(error || 'Preview limit reached for today. Sign in to keep generating.');
  }
  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({}));
    throw new Error(error || 'Failed to start preview generation.');
  }

  const { guestId } = await resp.json();
  localStorage.setItem(GUEST_ID_KEY, guestId);
  sessionStorage.removeItem(OBJECTIVE_KEY);
  return guestId;
}

async function fetchBlueprint(guestId) {
  const resp = await fetch(`${API_BASE}/guest/blueprint/${encodeURIComponent(guestId)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('Failed to load your preview.');
  return resp.json();
}

// ── Progress rendering (SSE) ──────────────────────────────────────────────────

function renderProgressCaps(domains) {
  const wrap = document.getElementById('try-progress-caps');
  if (!wrap) return;
  const preview = (domains || []).find(d => d.domainId === PREVIEW_DOMAIN);
  if (!preview) return;

  wrap.innerHTML = '';
  (preview.capabilities || []).forEach(cap => {
    const el = document.createElement('div');
    el.className = `try-cap try-cap--${cap.status || 'pending'}`;
    el.innerHTML = `<span class="try-cap__dot"></span><span>${cap.name}</span>`;
    wrap.appendChild(el);
  });
}

function watchProgress(guestId, objective) {
  const objEl = document.getElementById('try-objective');
  if (objEl && objective) objEl.textContent = `"${objective}"`;
  showState('try-progress');

  const es = new EventSource(`${API_BASE}/guest/blueprint/${encodeURIComponent(guestId)}/stream`);

  es.onmessage = async (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }

    if (msg.error) { es.close(); showError(msg.error); return; }
    if (msg.domains) renderProgressCaps(msg.domains);

    if (msg.done || msg.overallStatus === 'completed' || msg.overallStatus === 'error') {
      es.close();
      const bp = await fetchBlueprint(guestId).catch(() => null);
      if (bp && bp.status !== 'error') renderPreview(bp);
      else showError('Generation failed. Please try again from the home page.');
    }
  };

  es.onerror = async () => {
    // SSE can drop on flaky networks — fall back to polling the blueprint
    es.close();
    const poll = setInterval(async () => {
      const bp = await fetchBlueprint(guestId).catch(() => null);
      if (!bp) { clearInterval(poll); showError(); return; }
      renderProgressCaps(bp.domains?.map(d => ({
        domainId: d.domainId,
        capabilities: (d.capabilities || []).map(c => ({ name: c.capabilityName, status: c.status })),
      })));
      if (bp.status === 'completed') { clearInterval(poll); renderPreview(bp); }
      if (bp.status === 'error')     { clearInterval(poll); showError('Generation failed. Please try again from the home page.'); }
    }, 3000);
  };
}

// ── Preview rendering ─────────────────────────────────────────────────────────

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function listBlock(label, items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `
    <p class="try-section__list-label">${esc(label)}</p>
    <ul class="try-section__list">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
  `;
}

function renderSection(section) {
  const brief = section.brief || {};
  const parts = [];

  if (brief.strategicPosition) parts.push(`<p class="try-section__position">${esc(brief.strategicPosition)}</p>`);
  parts.push(listBlock('Business problems',   brief.businessProblems));
  parts.push(listBlock('AI opportunities',    brief.aiOpportunities));
  parts.push(listBlock('Priority actions',    brief.priorityActions));
  parts.push(listBlock('Success metrics',     brief.successMetrics));
  if (brief.recommendedStartingPoint) {
    parts.push(`<p class="try-section__list-label">Recommended starting point</p>
                <p class="try-section__position">${esc(brief.recommendedStartingPoint)}</p>`);
  }

  const body = parts.filter(Boolean).join('');
  if (!body) return '';

  return `
    <div class="try-section">
      <h4 class="try-section__title">${esc(section.title)}</h4>
      ${body}
    </div>
  `;
}

function renderPreview(bp) {
  const objEl = document.getElementById('try-preview-objective');
  if (objEl) objEl.textContent = `"${bp.businessObjective || ''}"`;

  const domain = (bp.domains || []).find(d => d.domainId === PREVIEW_DOMAIN);
  const contentEl = document.getElementById('try-domain-content');

  if (contentEl && domain) {
    contentEl.innerHTML = (domain.capabilities || [])
      .filter(cap => cap.status === 'completed' && (cap.sections || []).length)
      .map(cap => `
        <div class="try-cap-block">
          <h3 class="try-cap-block__name">
            ${esc(cap.capabilityName)}
            <span class="try-cap-block__badge">Generated</span>
          </h3>
          ${(cap.sections || []).map(renderSection).join('')}
        </div>
      `).join('')
      || '<p class="try-objective">No preview content was generated. Please try again.</p>';
  }

  const lockedEl = document.getElementById('try-locked-domains');
  if (lockedEl) {
    lockedEl.innerHTML = LOCKED_DOMAIN_INFO.map(d => `
      <div class="try-locked-card" role="button" tabindex="0" data-domain="${d.id}">
        <div class="try-locked-card__lock" aria-hidden="true">🔒</div>
        <p class="try-locked-card__name">${d.name}</p>
        <p class="try-locked-card__desc">${d.desc}</p>
      </div>
    `).join('');
    lockedEl.querySelectorAll('.try-locked-card').forEach(card => {
      card.addEventListener('click', goToLogin);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') goToLogin(); });
    });
  }

  showState('try-preview');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('try-nav-signin')?.addEventListener('click', goToLogin);
  document.getElementById('try-unlock-btn')?.addEventListener('click', goToLogin);

  const guestId   = getGuestId();
  const token     = getToken();
  const objective = sessionStorage.getItem(OBJECTIVE_KEY);

  // Post-login return: attach the preview to the account and enter the product
  if (token && guestId) { await claimAndEnterWorkspace(guestId); return; }

  // Signed in with no guest preview — nothing to do here
  if (token) { window.location.href = '/workspace/workspace.html'; return; }

  try {
    if (guestId) {
      const bp = await fetchBlueprint(guestId);
      if (bp) {
        if (bp.status === 'generating')      watchProgress(guestId, bp.businessObjective);
        else if (bp.status === 'completed')  renderPreview(bp);
        else showError('Generation failed. Please try again from the home page.');
        return;
      }
      // Stale guestId (doc gone/claimed elsewhere) — fall through
      localStorage.removeItem(GUEST_ID_KEY);
    }

    if (objective) {
      const newGuestId = await startGeneration(objective);
      watchProgress(newGuestId, objective);
      return;
    }

    // Nothing to show — back to the landing page prompt
    window.location.href = '/';

  } catch (err) {
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
