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

import { press } from './autopilot.js';

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

// ── Screen helpers ────────────────────────────────────────────────────────────

// .pw-screen--enter comes from pipeline-demo.css (already linked in
// domain.html) — same fade+rise transition used between windows in the
// pipeline demo, reused here for the same effect between real screens.
function showScreen(id) {
  ['screen-generate', 'screen-progress', 'screen-opportunities', 'screen-aria', 'screen-arth', 'screen-eame', 'screen-yusu', 'screen-workspace', 'domain-loading'].forEach(sid => {
    const el = document.getElementById(sid);
    if (!el) return;
    if (sid === id) {
      el.style.display = '';
      el.classList.remove('pw-screen--enter');
      void el.offsetWidth; // force reflow so the animation restarts
      el.classList.add('pw-screen--enter');
    } else {
      el.style.display = 'none';
    }
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

// The workspace nav used to carry a "Data Architecture" link and a
// blueprint-scoped "Knowledge Sources" link. Both are gone: Arth is a step on
// the journey indicator that every screen already shows, and offering the same
// stage twice under two different names made them look like two places.
// Knowledge Sources is reached from the home sidebar and from the
// not-grounded notice on the blueprint itself.

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
    const [personal, org, site] = await Promise.all([
      fetch(`${API_BASE}/confluence/personal/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : { connected: false })).catch(() => ({ connected: false })),
      fetch(`${API_BASE}/confluence/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : { status: 'not_connected' })).catch(() => ({ status: 'not_connected' })),
      // A connected company website grounds the blueprint too. Counting only
      // Confluence meant a company that had given us their website was still
      // told they had connected nothing.
      fetch(`${API_BASE}/website/company`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : { pages: [] })).catch(() => ({ pages: [] })),
    ]);

    const grounded = personal.connected
      || org.status === 'active'
      || (site.pages || []).length > 0;
    if (grounded) return;
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

/**
 * Overall progress across every capability in every domain.
 *
 * The cards below say what is happening; someone waiting several minutes
 * wants to know how much is left. Counts errors as finished — a failed
 * capability is not coming back, and leaving the bar short of the end
 * implies work still in flight that never arrives.
 */
function renderProgressBar(domains) {
  const fill  = document.getElementById('prog-bar-fill');
  const label = document.getElementById('prog-bar-label');
  const count = document.getElementById('prog-bar-count');
  if (!fill) return;

  const caps = (domains || []).flatMap(d => d.capabilities || []);
  const total = caps.length;
  if (!total) return;

  const done   = caps.filter(c => c.status === 'completed').length;
  const failed = caps.filter(c => c.status === 'error').length;
  const active = caps.find(c => c.status === 'in-progress' || c.status === 'generating');
  const settled = done + failed;
  const pct = Math.round((settled / total) * 100);

  fill.style.width = pct + '%';
  fill.classList.toggle('prog-bar__fill--done', settled === total);
  count.textContent = `${settled} of ${total}`;

  if (settled === total) {
    label.textContent = failed
      ? `Finished — ${done} of ${total} generated, ${failed} could not be completed`
      : 'Blueprint complete';
    return;
  }
  // Naming the capability in flight turns a bar into an explanation.
  label.textContent = active
    ? `Generating ${active.capabilityName || active.name}…`
    : 'Analysing your objective…';
}

function renderProgressDomains(domains) {
  renderProgressBar(domains);

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

  // Streamed updates change one card at a time and never touch the blueprint
  // object, so the bar has to be recomputed from what is actually on screen.
  // Reading the DOM also guarantees the two can never disagree.
  refreshProgressBarFromDom();
}

/** Recount the bar from the rendered cards. */
function refreshProgressBarFromDom() {
  const fill  = document.getElementById('prog-bar-fill');
  const label = document.getElementById('prog-bar-label');
  const count = document.getElementById('prog-bar-count');
  if (!fill) return;

  const cards = document.querySelectorAll('#prog-domains .prog-cap');
  const total = cards.length;
  if (!total) return;

  let done = 0, failed = 0, activeName = '';
  cards.forEach(c => {
    if (c.classList.contains('prog-cap--completed')) done++;
    else if (c.classList.contains('prog-cap--error')) failed++;
    else if (c.classList.contains('prog-cap--progress') && !activeName) {
      activeName = c.querySelector('.prog-cap__name')?.textContent || '';
    }
  });

  const settled = done + failed;
  fill.style.width = Math.round((settled / total) * 100) + '%';
  fill.classList.toggle('prog-bar__fill--done', settled === total);
  count.textContent = `${settled} of ${total}`;
  label.textContent = settled === total
    ? (failed ? `Finished — ${done} of ${total} generated, ${failed} could not be completed` : 'Blueprint complete')
    : (activeName ? `Generating ${activeName}…` : 'Analysing your objective…');
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

// findAiUseCasesPrioritizationSection now lives in blueprintSections.js --
// see the note there for why importing it from HERE loaded this module twice.

/**
 * The opportunities to show on Cob, from whichever capability produced them.
 *
 * AI Use Cases runs four capabilities and any one of them can fail — the model
 * returns malformed JSON often enough that it happens in ordinary runs. When
 * the failure was Implementation Prioritization, this screen had nothing to
 * render, kept "Analyzing your objective…" on screen for ever, and a visitor
 * saw a finished run with no use cases in it. That is the whole value of the
 * preview, lost to one bad JSON response.
 *
 * So: prefer the ranked list, fall back to the unranked one Opportunity
 * Discovery produces, and say which is which. An unranked list of real
 * opportunities is worth incomparably more than an empty screen.
 *
 * @returns {{winner:string, why:string, others:string[], ranked:boolean}|null}
 */
function resolveOpportunities(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'ai-use-cases');
  if (!domain || domain.status !== 'completed') return null;
  const sections = (domain.capabilities || []).flatMap(c => c.sections || []);

  // The opportunity's name is its technique -- "Retrieval-Augmented Semantic
  // Matching for Defects" -- and it is the anchor every later capability is
  // keyed on, so it stays what it is. The customer reads the same
  // opportunity in their own words: the discovery section carries a plain
  // line for each ("Find past faults like this one in seconds"), and the
  // screen leads with that, with the technique as the caption. A blueprint
  // generated before the plain line existed shows the name.
  const discovery = sections.find(s => s.title === 'AI Opportunity Discovery');
  const found = (discovery?.brief?.aiOpportunities || []).filter(o => o && o.name);
  const plainOf = new Map(found.map(o => [o.name, o.plain || '']));
  const say = (name) => ({ name, plain: plainOf.get(name) || name });

  const ranked = sections.find(s =>
    s.title === 'AI Implementation Prioritization' || s.title === 'AI Use Case Prioritization');
  if (ranked) {
    const brief = ranked.brief || {};
    const all = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []).filter(Boolean);
    const why = brief.recommendedStartingPoint || '';
    // recommendedInitiativeName is the model naming its own pick. Preferred
    // over matching the name inside the justification sentence, which breaks
    // the moment the sentence paraphrases it.
    const winner = brief.recommendedInitiativeName
      || all.find(n => why.includes(n))
      || all[0] || '';
    if (winner) return { winner: say(winner), why, others: all.filter(n => n !== winner).map(say), ranked: true };
  }

  if (found.length) {
    return {
      winner: say(found[0].name),
      why: found[0].why || '',
      others: found.slice(1).map(o => say(o.name)),
      ranked: false,
    };
  }

  return null;
}

/** @param {{winner:{name:string,plain:string}, why:string, others:{name:string,plain:string}[], ranked:boolean}} view */
function renderOpportunitiesContent(view) {
  const winnerNameEl = document.getElementById('opp-winner-name');
  const winnerTechEl = document.getElementById('opp-winner-tech');
  const winnerWhyEl  = document.getElementById('opp-winner-why');
  const labelEl      = document.getElementById('opp-winner-label');
  if (winnerNameEl) winnerNameEl.textContent = view.winner.plain;
  // The technique under the headline, only when the headline is not already
  // the technique -- a caption that repeats the title is noise.
  if (winnerTechEl) {
    const show = view.winner.plain !== view.winner.name;
    winnerTechEl.textContent = show ? view.winner.name : '';
    winnerTechEl.style.display = show ? '' : 'none';
  }
  if (winnerWhyEl)  winnerWhyEl.textContent  = view.why;

  // Ranked and unranked are different claims, and saying "Recommended" over a
  // list nothing ranked would be the screen inventing a judgement.
  if (labelEl) labelEl.textContent = view.ranked ? '★ Recommended' : '★ Top opportunity';

  const othersList = document.getElementById('opp-others');
  if (othersList) {
    othersList.innerHTML = view.others
      .map((o, i) => `
        <li class="rp-others-item pw-reveal" style="--i:${i + 1}">
          <span class="rp-others-item__name">${escapeHtml(o.plain)}${o.plain !== o.name
            ? `<span class="rp-others-item__tech">${escapeHtml(o.name)}</span>` : ''}</span>
          <span class="rp-others-item__arrow">&rarr;</span>
        </li>
      `)
      .join('');
  }

  const loadingEl = document.getElementById('opp-loading');
  const contentEl = document.getElementById('opp-content');
  const othersWrap = document.getElementById('opp-others-wrap');
  if (loadingEl) loadingEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';
  // Only when there is something in it — an empty "Other opportunities"
  // heading under a single recommendation reads as a list that failed to load.
  if (othersWrap) othersWrap.style.display = view.others.length ? 'block' : 'none';

  _opportunitiesContentShown = true;
}

/**
 * The run finished and produced no usable opportunities.
 *
 * Rare, and it has to be said rather than left as a spinner. "Analyzing your
 * objective…" over a completed run is the screen lying about what it is doing,
 * and the visitor waits for something that already gave up.
 */
function renderNoOpportunities() {
  const loadingEl = document.getElementById('opp-loading');
  const errEl = document.getElementById('opp-error');
  if (loadingEl) loadingEl.style.display = 'none';
  if (errEl) {
    errEl.textContent = 'This run finished without producing a usable list of AI opportunities. '
      + 'That is a generation failure rather than a verdict on your objective — try again, '
      + 'and if it happens twice the objective is worth rewording.';
    errEl.style.display = 'block';
  }
  _opportunitiesContentShown = true;
}

// Cob is real (this screen IS Cob's own opportunity discovery, not a
// separate step); Aria/Arth/Eame/Yusu render locked in the HTML by
// default (see domain.html/.rp-journey__locked) since they're not built
// yet — this just marks Cob active (we're still inside it, not past it).
// The connector right after Cob gets the same flowing-gradient treatment
// the demo uses for a "done" segment — not claiming Aria is reached, just
// signaling that Cob's output is actively what feeds the next stage.
function renderJourneyIndicator() {
  document.getElementById('rp-step-1')?.classList.add('pw-step--active');
  document.getElementById('rp-line-1')?.classList.add('pw-step-line--done');
}

function updateOpportunitiesGate(bp) {
  const done = bp.status === 'completed';
  const approved = !!bp.opportunityApproval?.approved;
  const approveBtn = document.getElementById('opp-approve-btn');
  const viewBtn    = document.getElementById('opp-view-blueprint-btn');

  // Approving is a one-time act, so the button stays spent once it has
  // happened. It previously re-enabled itself on every revisit, which
  // invited approving the same opportunity again and again.
  if (approveBtn) {
    approveBtn.disabled = !done || approved;
    approveBtn.textContent = approved ? 'Approved ✓' : 'Approve';
    approveBtn.classList.toggle('pw-next-btn--spent', approved);
  }
  if (viewBtn) viewBtn.disabled = !done;

  // Forward progress is the stage-navigation button's job, not Approve's.
  const navBtn  = document.getElementById('cob-nav-btn');
  const navHint = document.getElementById('cob-nav-hint');
  if (navBtn) navBtn.disabled = !approved;
  if (navHint) {
    // Nothing once approved: the button beside it already says where next,
    // and naming the stage here is a second place to keep in step with the
    // order. (Asked for on the Cob redesign; it was still being set here.)
    navHint.textContent = approved
      ? ''
      : done ? 'Approve an opportunity to continue'
             : 'Still analysing your objective…';
  }
}

// Only acts while the opportunities screen is the active one — once the
// user has moved on to the workspace, this becomes a no-op rather than
// fighting with blueprintWorkspace.js's own rendering of the same data.
function handleOpportunitiesUpdate(bp) {
  const screen = document.getElementById('screen-opportunities');
  if (!screen || screen.style.display === 'none') return;

  // Two pages under one hero. The run while it generates; the result once
  // it is done -- or once it has stopped short, which the stop panel says.
  const running = bp.status === 'generating' && !renderStopPanel(bp);
  if (running) renderOpportunitiesProgress(bp);

  if (!_opportunitiesContentShown) {
    const view = resolveOpportunities(bp);
    if (view) {
      renderOpportunitiesContent(view);
    } else if ((bp.domains || []).find(d => d.domainId === 'ai-use-cases')?.status === 'completed') {
      // The domain is done and there is nothing to show. Only reachable when
      // every capability that could produce opportunities failed.
      renderNoOpportunities();
    }
  }

  // After the result renderers, which show their blocks as soon as they
  // have something -- the run keeps them off the page until it is done.
  setCobMode(running);
  renderEngagementNote(bp);
  updateOpportunitiesGate(bp);
}

// ── Engagement type ──────────────────────────────────────────────────────────

const ENGAGEMENT_LABEL = {
  'product-ai':          'building AI into the product you sell',
  'workflow-automation': 'automating work your own team does',
};

// Flipping to the other reading is the only correction offered here. The
// sub-area and maturity are refinements of a category; getting the category
// itself backwards is the failure that wastes a whole run.
const ENGAGEMENT_OTHER = {
  'product-ai':          'workflow-automation',
  'workflow-automation': 'product-ai',
};

let _engagementBusy = false;

/**
 * Cob's reading of what kind of work this is, with a way to overrule it.
 *
 * Hidden entirely when the classifier was undecided: an empty category means
 * nothing downstream was steered, so there is no decision to show and nothing
 * for the user to correct.
 */
function renderEngagementNote(bp) {
  const wrap = document.getElementById('opp-engagement');
  const textEl = document.getElementById('opp-engagement-text');
  const switchBtn = document.getElementById('opp-engagement-switch');
  if (!wrap || !textEl || !switchBtn) return;

  const category = bp.engagement?.category || '';
  if (!ENGAGEMENT_LABEL[category]) { wrap.style.display = 'none'; return; }
  // Off while the run is on screen; setCobMode() decides the page.
  wrap.style.display = bp.status === 'generating' ? 'none' : '';

  const area = bp.engagement.subArea ? ` (${bp.engagement.subArea})` : '';
  textEl.textContent = bp.engagement.userSet
    ? `You set this as ${ENGAGEMENT_LABEL[category]}${area}.`
    : `Cob read this as ${ENGAGEMENT_LABEL[category]}${area}.`;

  const other = ENGAGEMENT_OTHER[category];
  switchBtn.textContent = `No — it's ${ENGAGEMENT_LABEL[other]}`;
  switchBtn.disabled = _engagementBusy;
  switchBtn.onclick = () => switchEngagement(bp, other);
}

/**
 * Record the correction, then re-rank.
 *
 * Only the AI Use Cases domain is regenerated. The category changes which data
 * the use cases should be built on, so the ranking genuinely has to be redone —
 * but a full six-domain run to answer one corrected checkbox is not a trade
 * anyone would choose.
 */
async function switchEngagement(bp, category) {
  const switchBtn = document.getElementById('opp-engagement-switch');
  const textEl = document.getElementById('opp-engagement-text');
  if (_engagementBusy) return;
  _engagementBusy = true;
  if (switchBtn) { switchBtn.disabled = true; switchBtn.textContent = 'Re-ranking…'; }

  const token = localStorage.getItem('token');
  try {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const saved = await fetch(`${API_BASE}/strategy-canvas/transformation-blueprint/${bp._id}/engagement`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ category, maturity: bp.engagement?.maturity || 'unknown' }),
    });
    if (!saved.ok) throw new Error('Could not save that change.');

    const aiUseCases = (bp.domains || []).find(d =>
      /ai use cases/i.test(d.domainName || '') || /use-?cases/i.test(d.domainId || ''));
    if (aiUseCases) {
      const rerank = await fetch(
        `${API_BASE}/strategy-canvas/transformation-blueprint/${bp._id}/regenerate-domains`,
        { method: 'POST', headers, body: JSON.stringify({ domainIds: [aiUseCases.domainId] }) });
      if (!rerank.ok) throw new Error('Saved, but the use cases could not be re-ranked.');
    }

    // Let the existing poll pick the new content up rather than rendering a
    // half-updated screen from here.
    _opportunitiesContentShown = false;
    if (textEl) textEl.textContent = 'Re-ranking your use cases with the corrected reading…';
  } catch (err) {
    if (textEl) textEl.textContent = err.message || 'That change could not be saved.';
    if (switchBtn) switchBtn.textContent = 'Try again';
  } finally {
    _engagementBusy = false;
    if (switchBtn) switchBtn.disabled = false;
  }
}

/**
 * Which domains a guest generates for free.
 *
 * Must match GUEST_PREVIEW_DOMAIN_IDS in guestController.js. Duplicated
 * rather than fetched because it decides what this screen SAYS, and a screen
 * that has to wait for a round trip to know whether it is paused shows the
 * wrong thing first and corrects itself.
 */
const GUEST_PREVIEW_DOMAINS = ['ai-use-cases'];

const isSettled = c => c.status === 'completed' || c.status === 'error';

/**
 * The paused state at the end of the free preview.
 *
 * A guest's blueprint is marked completed once AI Use Cases finishes, but the
 * other five domains stay pending for ever — nothing is coming without an
 * account. The ordinary progress bar counts every capability in the document,
 * so it sat at roughly 6% with "Analysing your objective…" underneath,
 * describing work that had already stopped. This says what actually happened
 * and what unblocks it.
 *
 * @returns {boolean} whether the pause is showing, so the caller knows to
 *   suppress the ordinary bar rather than draw both.
 */
/**
 * The panel that appears when generation has stopped short of the whole
 * blueprint, and says what restarts it.
 *
 * Two ways to arrive here and they need different answers:
 *
 *   a guest       — the preview is over; an account is what unlocks the rest
 *   signed in     — the domains are unlocked but nobody has asked for them,
 *                   because claiming a preview sets the owner and generates
 *                   nothing
 *
 * The signed-in case is why this stopped being guest-only. A claimed blueprint
 * has one domain generated and five pending, and the ordinary progress bar
 * counts capabilities: four of sixteen settled, none running, so it sat at 25%
 * under "Analysing your objective…" indefinitely. Nothing was being analysed.
 * The screen was describing work that had never been started.
 *
 * @returns {boolean} whether the panel is showing, so the caller suppresses
 *   the ordinary bar rather than drawing both.
 */
function renderStopPanel(bp) {
  const wrap = document.getElementById('opp-paused');
  if (!wrap) return false;
  const hide = () => { wrap.style.display = 'none'; return false; };

  const domains = bp.domains || [];
  const caps = domains.flatMap(d => d.capabilities || []);
  const running = caps.some(c => c.status === 'in-progress' || c.status === 'generating');

  // Work genuinely in flight — the ordinary bar is the right thing, and this
  // panel would be claiming a stop that has not happened.
  if (running || bp.status === 'generating') return hide();

  const generated = domains.filter(d =>
    (d.capabilities || []).length && (d.capabilities || []).every(isSettled));
  const remaining = domains.filter(d => !generated.includes(d));
  // Nothing generated at all, or everything generated — neither is a stop
  // worth a panel. The first is a failure the error slot already covers.
  if (!generated.length || !remaining.length) return hide();

  const isGuest = !!window.SOORGA_GUEST;
  const next = remaining[0];
  const count = document.getElementById('opp-paused-count');
  const text  = document.getElementById('opp-paused-next');
  const label = document.getElementById('opp-paused-label');

  // The count carries the progress. A bar beside it said the same thing and
  // cost three lines of height on the screen where height was the complaint.
  if (count) count.textContent = `${generated.length} of ${domains.length} domains`;
  if (label) label.textContent = isGuest ? 'Preview paused' : 'Not generated yet';
  if (text) {
    text.textContent = isGuest
      // Claiming a preview sets the owner and unlocks the rest; it does not
      // generate them. "Save this blueprint" carries the reassurance that a
      // longer sentence spelled out, in a line that fits.
      ? `${next.domainName || 'The next domain'} is next. Log in to save this blueprint `
        + `and unlock the remaining ${remaining.length} domains.`
      : `${next.domainName || 'The next domain'} and ${remaining.length - 1} other domains `
        + `have not been generated yet. Nothing is running until you ask for it.`;
  }

  // Guests get a login; owners get the button that actually starts the work.
  const loginBtn   = document.getElementById('opp-paused-login');
  const restartBtn = document.getElementById('opp-paused-restart');
  const genBtn     = document.getElementById('opp-paused-generate');
  if (loginBtn)   loginBtn.style.display   = isGuest ? '' : 'none';
  if (restartBtn) restartBtn.style.display = isGuest ? '' : 'none';
  if (genBtn) {
    genBtn.style.display = isGuest ? 'none' : '';
    genBtn.textContent = `Generate the remaining ${remaining.length} domains`;
    genBtn.dataset.domainIds = remaining.map(d => d.domainId).join(',');
  }

  // The guest banner says the same thing less usefully once this is up, and
  // two login prompts on one screen read as a nag rather than a step.
  const banner = document.getElementById('domain-guest-banner');
  if (banner && isGuest) banner.style.display = 'none';

  wrap.style.display = '';
  return true;
}

/**
 * Progress across every capability, on the Cob screen.
 *
 * Errors count as settled: a failed capability is not coming back, and a bar
 * that stops short implies work still in flight that never arrives.
 */
/**
 * The four phases of a run, as a customer would think of them.
 *
 * Six domains generate; nobody waiting wants six rows of capability names.
 * Grouped into what is being done for them, in the order the journey uses it:
 * the opportunities and the strategy are the blueprint, data and technology
 * are what Arth and Aria prepare, people and governance finish it. The first
 * phase is the objective being read, which is done the moment the run exists.
 */
const RUN_PHASES = [
  { title: 'Understanding your objective',   sub: 'Reading your goal and what your business runs on', domains: [] },
  { title: 'Finding the AI opportunities',   sub: 'Where AI would help most, and which to start with',  domains: ['ai-use-cases', 'ai-strategy'] },
  { title: 'Preparing data & infrastructure', sub: 'The data, the model and the environment it needs',  domains: ['data-readiness', 'technology-infrastructure'] },
  { title: 'Finalising the plan',            sub: 'People, adoption and governance for the roll-out',   domains: ['skills-workforce', 'governance-security'] },
];

const isRunning = (c) => c.status === 'in-progress' || c.status === 'generating';

function etaText(ms) {
  const s = Math.max(10, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} sec` : `${s} sec`;
}

/**
 * The run stage: a ring, a bar, an estimate, and the four phases with their
 * real state. Every figure comes from the blueprint the poll delivers; the
 * estimate is the pace so far applied to what is left, and says
 * "Estimating…" until there is a pace to apply.
 */
function renderOpportunitiesProgress(bp) {
  const wrap  = document.getElementById('opp-run');
  const fill  = document.getElementById('opp-progress-fill');
  const label = document.getElementById('opp-progress-label');
  const count = document.getElementById('opp-progress-count');
  const ring  = document.getElementById('opp-run-ring');
  const pct   = document.getElementById('opp-run-pct');
  const eta   = document.getElementById('opp-run-eta');
  const steps = document.getElementById('opp-run-steps');
  if (!wrap || !fill) return;

  // Generation stopped short of the whole blueprint — for a guest at the end
  // of the free domain, for an owner because a claimed preview generates
  // nothing further. Either way the run stage would describe work that is
  // not running.
  if (renderStopPanel(bp)) return;

  // In the first seconds the blueprint has no domains yet -- the shell is
  // written before the run starts -- and the page still has to say what is
  // about to happen rather than show an empty list. The figures below are
  // simply zero then; the phases render as waiting.
  const domains = bp.domains || [];
  const caps = domains.flatMap(d => d.capabilities || []);
  const total = caps.length;

  const done    = caps.filter(c => c.status === 'completed').length;
  const failed  = caps.filter(c => c.status === 'error').length;
  const active  = caps.find(isRunning);
  const settled = done + failed;
  const share   = total ? Math.round((settled / total) * 100) : 0;

  fill.style.width = share + '%';
  fill.classList.toggle('prog-bar__fill--done', total > 0 && settled === total);
  if (ring) ring.style.setProperty('--p', share);
  if (pct) pct.textContent = share + '%';
  if (count) count.textContent = total ? `${settled} of ${total} steps` : '';
  if (label) {
    label.textContent = total && settled === total
      ? (failed ? `${done} of ${total} generated — ${failed} could not be completed` : 'Blueprint complete')
      : (active ? `Generating ${active.capabilityName || active.name}…` : 'Reading your objective…');
  }

  if (eta) {
    const started = bp.createdAt ? new Date(bp.createdAt).getTime() : 0;
    const elapsed = started ? Date.now() - started : 0;
    eta.textContent = total && settled === total ? 'Done'
      : (settled >= 1 && elapsed > 0) ? etaText(elapsed / settled * (total - settled))
      : 'Estimating…';
  }

  if (steps) {
    const capsOf = (ids) => domains.filter(d => ids.includes(d.domainId)).flatMap(d => d.capabilities || []);
    const anyStarted = caps.some(c => isRunning(c) || c.status === 'completed' || c.status === 'error');
    steps.innerHTML = RUN_PHASES.map((ph, i) => {
      let state, detail = ph.sub;
      if (i === 0) {
        state = anyStarted ? 'done' : 'active';
      } else {
        const mine = capsOf(ph.domains);
        const running = mine.find(isRunning);
        const settledMine = mine.filter(c => c.status === 'completed' || c.status === 'error').length;
        state = mine.length && settledMine === mine.length ? 'done'
          : (running || settledMine) ? 'active'
          : 'waiting';
        if (running) detail = `Generating ${running.capabilityName || running.name}…`;
        else if (state === 'done' && mine.some(c => c.status === 'error')) detail = 'Finished, with a part that could not be completed';
      }
      const word = state === 'done' ? 'Completed' : state === 'active' ? 'In progress…' : 'Waiting…';
      return `
        <li class="cr-phase cr-phase--${state}">
          <span class="cr-phase__mark" aria-hidden="true"></span>
          <span class="cr-phase__text">
            <span class="cr-phase__title">${escapeHtml(ph.title)}</span>
            <span class="cr-phase__sub">${escapeHtml(detail)}</span>
          </span>
          <span class="cr-phase__state">${word}</span>
        </li>`;
    }).join('');
  }
}

/**
 * Cob is two pages under one hero: the run, and the result.
 *
 * During the run nothing of the result is shown -- the recommendation card,
 * the other opportunities, the engagement note, the move to Aria. The
 * journey moves on by itself when the blueprint is done, and a recommendation
 * sitting under a progress bar read as finished when most of the work
 * remained. The hero says which page this is.
 */
function setCobMode(running) {
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  show('opp-run', running);
  const nav = document.querySelector('#screen-opportunities .stage-nav');
  if (nav) nav.style.display = running ? 'none' : '';
  // The result blocks are shown by their own renderers once there is
  // something in them; the run simply keeps them off the page meanwhile.
  if (running) {
    show('opp-content', false);
    show('opp-others-wrap', false);
    show('opp-engagement', false);
  } else if (_opportunitiesContentShown) {
    show('opp-content', true);
  }

  const pill  = document.getElementById('opp-hero-pill');
  const title = document.getElementById('opp-hero-title');
  const sub   = document.getElementById('opp-hero-sub');
  const mark  = document.getElementById('opp-hero-mark');
  if (pill)  pill.style.display = running ? '' : 'none';
  if (mark)  mark.classList.toggle('ae-hero__mark--pending', running);
  if (title) title.textContent = running ? 'Generating the blueprint' : 'Your AI opportunities';
  if (sub)   sub.textContent = running
    ? 'Cob is reading your objective and working out where AI would help most. This takes a few minutes.'
    : 'Cob has read your objective and ranked where AI would help most. The one to start with is below.';
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

// Decides whether a fresh page load should skip straight to the
// workspace. ?openBlueprint=1 (set by openBlueprintInNewTab() below)
// forces it regardless of approval status — viewing the blueprint
// shouldn't require approving it first. ?view=cob forces the opposite
// (the "← Back to Cob" link on the workspace uses this) — otherwise an
// already-approved blueprint would just bounce straight back to the
// workspace instead of actually showing Cob.
function shouldShowWorkspace(bp) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'cob') return false;
  if (params.get('openBlueprint') === '1') return bp.status === 'completed';
  return !!bp.opportunityApproval?.approved;
}

// Opens the workspace in a new tab rather than replacing this screen —
// window.open() (not a plain link) so sessionStorage (which
// fetchTransformationBlueprint() reads for the picked-blueprint id) is
// inherited by the new tab per the HTML spec's same-origin auxiliary
// browsing context rules. ?openBlueprint=1 tells that fresh page load to
// go straight to the workspace regardless of approval status — viewing
// shouldn't require approving first.
function openBlueprintInNewTab() {
  window.open('/domain/domain.html?openBlueprint=1', '_blank');
}

let _opportunitiesButtonsWired = false;

function wireOpportunitiesButtons(guestId) {
  if (_opportunitiesButtonsWired) return;
  _opportunitiesButtonsWired = true;

  const approveBtn = document.getElementById('opp-approve-btn');
  const viewBtn    = document.getElementById('opp-view-blueprint-btn');
  const errEl      = document.getElementById('opp-error');

  viewBtn?.addEventListener('click', () => openBlueprintInNewTab());

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
      // Approving records the decision and opens the stage-navigation
      // button -- and then presses it. The journey runs itself from here:
      // approval happened in this visit, so the customer is on their way,
      // not reading. A blueprint opened later, already approved, never
      // reaches this line and stays on Cob (see autopilot.js).
      bp.opportunityApproval = { ...(bp.opportunityApproval || {}), approved: true, approvedAt: new Date().toISOString() };
      _currentBlueprint = bp;
      updateOpportunitiesGate(bp);
      press('cob-nav-btn');
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      approveBtn.disabled = false;
    }
  });
}

// Lets arthScreen.js / eameScreen.js switch screens without importing
// showScreen — same decoupling the blueprint:ready / aria:show events use.
// The journey steps look like navigation, so they should behave like it.
// Switching in-place (rather than via ?view=, which reloads) keeps the
// blueprint already in memory and avoids a refetch on every hop.
let _currentBlueprint = null;

/**
 * Longest a stage is given to say it is ready before it is shown anyway.
 *
 * A stage that never reports -- a module that forgot, an API that hangs --
 * must not leave the customer on the previous screen forever. Past this the
 * old behaviour returns: show it and let it fill in. Two and a half seconds
 * is longer than any of the loads take and shorter than a person starts to
 * wonder whether the click registered.
 */
const STAGE_READY_TIMEOUT_MS = 2500;

/** Resolves when `stage` reports it has rendered its first real state. */
function stageReady(stage) {
  return new Promise(resolve => {
    let done = false;
    const finish = (how) => {
      if (done) return;
      done = true;
      document.removeEventListener('stage:ready', onReady);
      resolve(how);
    };
    const onReady = (e) => { if (e.detail?.stage === stage) finish('ready'); };
    document.addEventListener('stage:ready', onReady);
    setTimeout(() => finish('timeout'), STAGE_READY_TIMEOUT_MS);
  });
}

/**
 * Start a stage loading, and show it only once it has something true to show.
 *
 * Every stage used to be shown first and filled in afterwards: the screen
 * appeared with its markup defaults -- "Generate the Application", a spend
 * limit of "No limit set", datasets marked "To connect" -- and then, a round
 * trip later, replaced all of it with the truth. Under real latency that is a
 * page that says one thing and then another, on every click.
 *
 * Now the previous screen stays until the new one reports ready, so what
 * appears is finished. The clicked stage pulses meanwhile so the click reads
 * as taken. Cob needs none of this: it renders from the blueprint already in
 * memory.
 */
async function revealStage(stage, bp) {
  const steps = document.querySelectorAll(`.rp-journey .pw-step[data-goto="${stage}"]`);
  steps.forEach(s => s.classList.add('pw-step--loading'));

  const ready = stageReady(stage);
  document.dispatchEvent(new CustomEvent(stage + ':show', { detail: { blueprint: bp } }));
  const how = await ready;
  if (how === 'timeout') console.warn(`[stage] ${stage} did not report ready in ${STAGE_READY_TIMEOUT_MS}ms — showing it anyway`);

  steps.forEach(s => s.classList.remove('pw-step--loading'));
  showScreen('screen-' + stage);
}

function goToStage(stage) {
  const bp = _currentBlueprint;
  if (!bp) return;

  if (stage === 'cob') {
    showScreen('screen-opportunities');
    renderJourneyIndicator();
    handleOpportunitiesUpdate(bp);
    return;
  }
  revealStage(stage, bp);
}

/**
 * Start the domains that were never generated.
 *
 * A claimed preview leaves five domains pending and nothing running. This is
 * the explicit ask that starts them — explicit because it is a full run's
 * worth of model calls, and spending that automatically the moment someone
 * signs up is a decision nobody made.
 */
function wireGenerateRemaining() {
  const btn = document.getElementById('opp-paused-generate');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const bp = _currentBlueprint;
    const ids = (btn.dataset.domainIds || '').split(',').filter(Boolean);
    if (!bp || !ids.length) return;
    btn.disabled = true;
    btn.textContent = 'Starting…';
    try {
      const resp = await fetch(
        `${API_BASE}/strategy-canvas/transformation-blueprint/${bp._id}/regenerate-domains`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ domainIds: ids }),
        }
      );
      if (resp.status === 401) { window.handleSessionExpired(); return; }
      if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({}));
        throw new Error(error || 'Could not start generation.');
      }
      // Reload rather than patch: the page already renders a run live, and
      // reusing that path beats a second half-built progress renderer.
      window.location.reload();
    } catch (err) {
      const errEl = document.getElementById('opp-error');
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      btn.disabled = false;
      btn.textContent = 'Try again';
    }
  });
}

function wireJourneyNavigation() {
  // Delegated on document: every screen has its own copy of the nav, and
  // the ones inside hidden screens still need to work once shown.
  document.addEventListener('click', (e) => {
    const step = e.target.closest('.rp-journey .pw-step[data-goto]');
    if (!step) return;
    e.preventDefault();
    goToStage(step.dataset.goto);
  });

  // The stage-navigation button at the foot of every screen. This selector
  // is separate from the journey one above because the journey handler only
  // matches `.pw-step` inside `.rp-journey` — Eame's "Continue to Yusu"
  // carried a data-goto that nothing was listening for, so it did nothing.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.stage-nav__btn[data-goto]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    goToStage(btn.dataset.goto);
  });
}

document.addEventListener('screen:show', (e) => {
  const id = e.detail?.id;
  if (id) showScreen(id);
});

document.addEventListener('blueprint:update', (e) => {
  const { blueprint } = e.detail || {};
  if (blueprint) { _currentBlueprint = blueprint; handleOpportunitiesUpdate(blueprint); }
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
  const bp = await resp.json();
  // Pin whichever blueprint this tab ends up looking at — without an id,
  // the backend falls back to "most recently created", which for an
  // account with several blueprints (approved and not) can silently pick
  // a *different* one on the next call than the one just approved,
  // bouncing a refresh back to the Cob gate instead of Arth/workspace.
  // Same key the sidebar-pick flow already uses, so this is just closing
  // the gap for the "landed here without picking" path.
  if (bp?._id) sessionStorage.setItem('soorgaai_open_blueprint_id', bp._id);
  return bp;
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

    // Clear any pinned blueprint id (see fetchTransformationBlueprint) —
    // otherwise the reload below would fetch the OLD pinned blueprint
    // instead of the one just created, same as index.js's generate flow.
    sessionStorage.removeItem('soorgaai_open_blueprint_id');

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
      if (resp.status === 402) {
        // Not an error the customer can fix by retrying — it is a plan
        // boundary, and the only useful thing to show is the way past it.
        const body = await resp.json().catch(() => ({}));
        showLimitReached(errEl, body);
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.style.display = '';
        if (submitLoader) submitLoader.style.display = 'none';
        return;
      }
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

/**
 * A plan limit, with the tier that lifts it.
 *
 * Built with DOM calls rather than innerHTML because the reason string comes
 * from the server and carries plan names and dates — none of it should ever be
 * able to become markup.
 */
function showLimitReached(el, { error, upgradeLabel }) {
  if (!el) return;
  el.textContent = error || 'You have reached a limit on your plan.';
  const link = document.createElement('a');
  link.href = '/pricing/pricing.html';
  link.className = 'gen-error__link';
  link.textContent = upgradeLabel ? `See what ${upgradeLabel} includes →` : 'See the plans →';
  el.appendChild(document.createTextNode(' '));
  el.appendChild(link);
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
  document.getElementById('opp-paused-login')?.addEventListener('click', guestGoToLogin);
  document.getElementById('opp-paused-restart')?.addEventListener('click', () => {
    // Dropping the id is what actually abandons the preview: the blueprint is
    // keyed on it and held nowhere else, so it can never be opened or claimed
    // again. The row is orphaned server-side —
    // scripts/clear_guest_blueprints.mjs --failed sweeps those up.
    localStorage.removeItem('soorgaai_guest_id');
    window.location.href = '/cob.html';
  });

  try {
    const resp = await fetch(`${API_BASE}/guest/blueprint/${encodeURIComponent(guestId)}`);
    if (resp.status === 404) {
      localStorage.removeItem('soorgaai_guest_id');
      window.location.href = '/cob.html';
      return;
    }
    if (!resp.ok) throw new Error('Failed to load preview blueprint');
    const bp = await resp.json();

    if (shouldShowWorkspace(bp)) {
      document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    } else {
      // Not yet approved (or ?view=cob was explicitly requested) — gate
      // on Screen 2.5, whether generation is still running or this is a
      // pre-existing blueprint from before this screen existed
      // (opportunityApproval defaults to unapproved either way, so both
      // cases are handled identically here).
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
    _currentBlueprint = bp;
    wireJourneyNavigation();
    wireGenerateRemaining();

    if (!bp) {
      // No blueprint yet — the landing page owns the prompt box
      window.location.href = '/cob.html';
      return;
    }

    // Confluence/Jira OAuth on the Arth screen redirects back to this
    // same page (no query-string round trip through the backend's
    // RETURN_PATHS — this flag is set client-side right before leaving,
    // see ariaScreen.js) — an approved blueprint would otherwise default
    // straight to the workspace instead of back to where the user was.
    // ?view=aria is the same override as ?view=cob, but for Arth — once a
    // blueprint is approved, every plain page load bounces straight to
    // the workspace and Arth becomes otherwise unreachable, so this is what
    // the journey indicator's ARIA step relies on.
    const returningToAria = sessionStorage.getItem('svarg_returning_to_aria') === '1';
    sessionStorage.removeItem('svarg_returning_to_aria');
    // Yusu connects GitHub because Yusu is what pushes; the older Eame flag
    // is still honoured so a redirect started before this change lands well.
    const returningToShip = sessionStorage.getItem('svarg_returning_to_yusu') === '1'
      || sessionStorage.getItem('svarg_returning_to_eame') === '1';
    sessionStorage.removeItem('svarg_returning_to_yusu');
    sessionStorage.removeItem('svarg_returning_to_eame');
    if (returningToShip) {
      showScreen('screen-yusu');
      document.dispatchEvent(new CustomEvent('yusu:show', { detail: { blueprint: bp } }));
      initGenerateForm();
      initEnterpriseBlueprintLink();
      return;
    }
    const view = new URLSearchParams(window.location.search).get('view');
    const forceAria = view === 'aria';
    // Aria and Eame are reachable directly too, same override as Arth.
    if (view === 'arth' || view === 'eame' || view === 'yusu') {
      // Same reveal as a click: the loading screen stays until the stage has
      // rendered its real state, rather than the stage appearing half-filled.
      revealStage(view, bp);
      initGenerateForm();
      initGroundingBanner(bp._id);
      initEnterpriseBlueprintLink();
      return;
    }

    if (returningToAria || forceAria) {
      revealStage('aria', bp);
    } else if (shouldShowWorkspace(bp)) {
      document.dispatchEvent(new CustomEvent('blueprint:ready', { detail: { blueprint: bp } }));
    } else {
      // Not yet approved (or ?view=cob was explicitly requested) — gate
      // on Screen 2.5, whether generation is still running or this is a
      // pre-existing blueprint from before this screen existed
      // (opportunityApproval defaults to unapproved either way, so both
      // cases are handled identically here).
      wireOpportunitiesButtons(null);
      showScreen('screen-opportunities');
      renderJourneyIndicator();
      handleOpportunitiesUpdate(bp);
      if (bp.status === 'generating') startLiveUpdates(null);
    }
    initGenerateForm(); // keep form initialised in case user clicks New Blueprint
    initGroundingBanner(bp._id);
    initEnterpriseBlueprintLink();

  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') return; // already redirecting home
    console.error('[blueprintGenerate] init error:', err);
    showScreen('screen-generate');
    initGenerateForm();
  }
}

document.addEventListener('DOMContentLoaded', init);
