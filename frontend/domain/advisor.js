/**
 * SoorgaAI — AI Strategy Advisor Module (Sprint 15 / 16)
 *
 * Right-panel AI collaboration interface.
 *
 * Two operating modes:
 *
 *   GENERAL MODE   — capability selected, no section active
 *                    Questions go to POST /advisor/ask
 *                    Returns structured executive guidance
 *
 *   SECTION MODE   — a blueprint section is selected (Sprint 16)
 *                    Questions go to POST /blueprint-suggest
 *                    Returns a structured suggestion (observations → gaps →
 *                    revision → reasoning → alternatives)
 *                    User chooses: Accept | Edit | Reject
 *                    Only Accept/Edit pushes content to the Strategy Canvas
 *
 * The Strategy Canvas is the source of truth.
 * The AI may suggest. It may never automatically overwrite user content.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken()    { return localStorage.getItem('token'); }
function getDomainId() { return new URLSearchParams(window.location.search).get('domain') || 'ai-strategy'; }

function logout() {
  ['token', 'username', 'userId', 'role', 'redirectAfterLogin'].forEach(k => localStorage.removeItem(k));
  window.location.href = '/index.html';
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

let messagesEl, inputEl, sendBtn, sendIcon, sendLoader;
let errorEl, errorTextEl, retryBtn;
let advisorContextEl, advisorSubheadingEl;

// Sprint 16
let sectionContextEl, sectionTitleEl, sectionPreviewEl, sectionClearEl;
let sectionPromptsEl, generalPromptsEl;

let lastQuestion = '';

// ── Layout coordination ───────────────────────────────────────────────────────

let canvasReady  = false;
let advisorReady = false;

function maybeShowLayout() {
  if (canvasReady && advisorReady) {
    document.getElementById('domain-loading').style.display = 'none';
    document.getElementById('domain-main').style.display    = 'grid';
  }
}

// ── Mode state (Sprint 16) ────────────────────────────────────────────────────

let _sectionMode               = false;
let _activeSection             = null; // { sectionTitle, currentContent, capabilityId, blueprint }
let _generalPromptsWereVisible = false;

// ── Context indicator ─────────────────────────────────────────────────────────

function updateContextIndicator(context) {
  if (context) {
    const { blueprint } = context;
    advisorContextEl.textContent = `${blueprint.capabilityName} · ${blueprint.industry}`;
    advisorContextEl.style.display = 'block';
    advisorSubheadingEl.textContent =
      'Select a section to collaborate on it, or ask a general question below.';
    inputEl.disabled  = false;
    sendBtn.disabled  = false;
  } else {
    advisorContextEl.style.display = 'none';
    advisorSubheadingEl.textContent =
      'Select a capability from the canvas to start asking questions.';
    inputEl.disabled  = true;
    sendBtn.disabled  = true;
  }
}

// ── Section mode (Sprint 16) ──────────────────────────────────────────────────

const SECTION_PROMPTS = [
  'Improve this section',
  'Make it more measurable',
  'Make it more executive focused',
  'Compare with industry practices',
  'Identify missing elements',
  'Simplify this statement',
  'Generate alternatives',
  'Challenge our assumptions',
];

function enterSectionMode(detail) {
  _sectionMode   = true;
  _activeSection = { ...detail };

  // Track whether general prompts were visible so we can restore them on exit
  _generalPromptsWereVisible = generalPromptsEl.style.display !== 'none';

  // Update context badge
  advisorContextEl.textContent =
    `${detail.blueprint.capabilityName} · ${detail.sectionTitle} · ${detail.blueprint.industry}`;
  advisorContextEl.style.display = 'block';

  advisorSubheadingEl.textContent = 'Ask me to improve, review, or rewrite this section.';

  // Show section context panel
  sectionTitleEl.textContent   = detail.sectionTitle;
  sectionPreviewEl.textContent = detail.currentContent
    ? truncate(detail.currentContent, 140)
    : '(No draft yet — I\'ll generate one from the knowledge base)';
  sectionContextEl.style.display = 'block';

  // Swap to section-specific prompts
  generalPromptsEl.style.display = 'none';
  renderSectionPrompts();
  sectionPromptsEl.style.display = 'flex';

  inputEl.disabled  = false;
  sendBtn.disabled  = false;
  inputEl.placeholder = `Ask about the ${detail.sectionTitle} section…`;
  inputEl.focus();
}

function exitSectionMode() {
  _sectionMode   = false;
  _activeSection = null;

  sectionContextEl.style.display = 'none';
  sectionPromptsEl.style.display = 'none';

  inputEl.placeholder = 'Type your message…';

  // Restore general prompts only if they were visible before section mode started
  if (_generalPromptsWereVisible) {
    generalPromptsEl.style.display = 'flex';
  }
  _generalPromptsWereVisible = false;

  // Restore context indicator
  const ctx = window.StrategyCanvas?.getCurrentContext();
  updateContextIndicator(ctx ? { blueprint: ctx.blueprint } : null);
}

function renderSectionPrompts() {
  sectionPromptsEl.innerHTML = '';
  for (const prompt of SECTION_PROMPTS) {
    const btn = document.createElement('button');
    btn.className = 'suggested-prompt-btn';
    btn.textContent = prompt;
    btn.addEventListener('click', () => {
      // Hide prompts after first use
      sectionPromptsEl.style.display = 'none';
      sendQuestion(prompt);
    });
    sectionPromptsEl.appendChild(btn);
  }
}

// Update the section context preview after a draft is accepted
function updateSectionPreview(sectionTitle, content) {
  if (_activeSection?.sectionTitle === sectionTitle) {
    _activeSection.currentContent = content;
    sectionPreviewEl.textContent  = truncate(content, 140);
  }
}

// ── Response rendering — General mode ─────────────────────────────────────────

function appendQuestion(text) {
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg--user';
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendTyping() {
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg--assistant chat-msg--typing';
  el.id = 'advisor-typing';
  el.textContent = '…';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function removeTyping() {
  document.getElementById('advisor-typing')?.remove();
}

function appendAdvisorResponse(result) {
  const { response, capabilityName, industry } = result;
  const card = document.createElement('div');
  card.className = 'advisor-response';

  const sections = [
    { key: 'executivePerspective', label: 'Executive Perspective', isList: false },
    { key: 'industryContext',      label: `${industry} Context`,   isList: false },
    { key: 'recommendations',      label: 'Recommendations',       isList: true  },
    { key: 'potentialRisks',       label: 'Potential Risks',        isList: true  },
    { key: 'suggestedNextStep',    label: 'Suggested Next Step',    isList: false },
  ];

  let html = `
    <div class="advisor-response__header">
      <span class="advisor-response__capability">${escapeHtml(capabilityName)}</span>
      <span class="advisor-response__industry-tag">${escapeHtml(industry)}</span>
    </div>`;

  for (const { key, label, isList } of sections) {
    const value = response[key];
    if (!value || (Array.isArray(value) && value.length === 0)) continue;

    html += `<div class="advisor-response__section">
      <h4 class="advisor-response__section-title">${escapeHtml(label)}</h4>`;

    if (isList && Array.isArray(value)) {
      html += `<ul class="advisor-response__list">${value.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    } else {
      html += `<p class="advisor-response__section-body">${escapeHtml(String(value))}</p>`;
    }

    html += `</div>`;
  }

  card.innerHTML = html;
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Suggestion card — Section mode (Sprint 16) ────────────────────────────────

function createSuggestionCard(result) {
  const { suggestion, sectionTitle } = result;
  const card = document.createElement('div');
  card.className = 'suggestion-card';

  // Helper: append a labeled section to a parent element
  function addSection(parent, title, value, isList) {
    if (!value || (Array.isArray(value) && !value.length)) return;
    const s = document.createElement('div');
    s.className = 'suggestion-section';

    const h = document.createElement('h4');
    h.className = 'suggestion-section__title';
    h.textContent = title;
    s.appendChild(h);

    if (isList) {
      const ul = document.createElement('ul');
      ul.className = 'suggestion-section__list';
      (value || []).forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      s.appendChild(ul);
    } else {
      const p = document.createElement('p');
      p.className = 'suggestion-section__body';
      p.textContent = String(value);
      s.appendChild(p);
    }

    parent.appendChild(s);
  }

  // Header
  const headerEl = document.createElement('div');
  headerEl.className = 'suggestion-card__header';
  const sectionBadge = document.createElement('span');
  sectionBadge.className = 'suggestion-card__section';
  sectionBadge.textContent = sectionTitle;
  const labelBadge = document.createElement('span');
  labelBadge.className = 'suggestion-card__label';
  labelBadge.textContent = 'AI Suggestion';
  headerEl.appendChild(sectionBadge);
  headerEl.appendChild(labelBadge);
  card.appendChild(headerEl);

  // Analysis
  addSection(card, 'Current Observations', suggestion.currentObservations, false);
  addSection(card, 'Strengths',            suggestion.strengths,            true);
  addSection(card, 'Potential Gaps',       suggestion.potentialGaps,        true);

  // Suggested revision (supports edit mode)
  const revisionEl = document.createElement('div');
  revisionEl.className = 'suggestion-revision';

  const revTitle = document.createElement('h4');
  revTitle.className = 'suggestion-section__title';
  revTitle.textContent = 'Suggested Revision';
  revisionEl.appendChild(revTitle);

  const revText = document.createElement('p');
  revText.className = 'suggestion-revision__text';
  revText.textContent = suggestion.suggestedRevision;
  revisionEl.appendChild(revText);

  const revEdit = document.createElement('textarea');
  revEdit.className = 'suggestion-revision__edit';
  revEdit.value = suggestion.suggestedRevision;
  revEdit.rows = 5;
  revEdit.style.display = 'none';
  revisionEl.appendChild(revEdit);

  card.appendChild(revisionEl);

  // Why this helps + alternatives
  addSection(card, 'Why This Helps', suggestion.whyThisHelps, false);
  addSection(card, 'Alternatives',   suggestion.alternatives,   true);

  // Action buttons
  const actionsEl = document.createElement('div');
  actionsEl.className = 'suggestion-actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'suggestion-btn suggestion-btn--accept';
  acceptBtn.textContent = 'Accept';

  const editBtn = document.createElement('button');
  editBtn.className = 'suggestion-btn suggestion-btn--edit';
  editBtn.textContent = 'Edit';

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'suggestion-btn suggestion-btn--reject';
  rejectBtn.textContent = 'Reject';

  actionsEl.appendChild(acceptBtn);
  actionsEl.appendChild(editBtn);
  actionsEl.appendChild(rejectBtn);
  card.appendChild(actionsEl);

  // ── Action handlers ───────────────────────────────────────────────────────

  function doAccept(content) {
    window.StrategyCanvas?.acceptSection(sectionTitle, content);

    // Show accepted state in card
    actionsEl.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = 'suggestion-accepted-badge';
    badge.textContent = '✓ Accepted — blueprint section updated';
    actionsEl.appendChild(badge);
    card.classList.add('suggestion-card--accepted');

    // Restore text view if we were in edit mode
    revText.textContent   = content;
    revText.style.display = 'block';
    revEdit.style.display = 'none';
    revisionEl.classList.remove('suggestion-revision--editing');

    setSending(false);
    inputEl.placeholder = `Ask about the ${sectionTitle} section…`;
  }

  function doReject() {
    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg--assistant';
    msg.textContent = 'Suggestion rejected. The blueprint section remains unchanged.';
    card.replaceWith(msg);
    setSending(false);
  }

  function enterEditMode() {
    revText.style.display = 'none';
    revEdit.style.display = 'block';
    revisionEl.classList.add('suggestion-revision--editing');
    revEdit.style.height = 'auto';
    revEdit.style.height = `${revEdit.scrollHeight}px`;
    revEdit.focus();

    actionsEl.innerHTML = '';

    const acceptEditBtn = document.createElement('button');
    acceptEditBtn.className = 'suggestion-btn suggestion-btn--accept';
    acceptEditBtn.textContent = 'Accept Edit';

    const cancelEditBtn = document.createElement('button');
    cancelEditBtn.className = 'suggestion-btn suggestion-btn--reject';
    cancelEditBtn.textContent = 'Cancel';

    actionsEl.appendChild(acceptEditBtn);
    actionsEl.appendChild(cancelEditBtn);

    acceptEditBtn.addEventListener('click', () => {
      const edited = revEdit.value.trim() || suggestion.suggestedRevision;
      doAccept(edited);
    });

    cancelEditBtn.addEventListener('click', () => {
      revText.style.display = 'block';
      revEdit.style.display = 'none';
      revisionEl.classList.remove('suggestion-revision--editing');

      actionsEl.innerHTML = '';
      actionsEl.appendChild(acceptBtn);
      actionsEl.appendChild(editBtn);
      actionsEl.appendChild(rejectBtn);
    });
  }

  acceptBtn.addEventListener('click', () => doAccept(suggestion.suggestedRevision));
  editBtn.addEventListener('click',   () => enterEditMode());
  rejectBtn.addEventListener('click', () => doReject());

  return card;
}

// ── Error handling ────────────────────────────────────────────────────────────

function showError(msg) {
  errorTextEl.textContent = msg || 'We couldn\'t process that. Please try again.';
  errorEl.style.display = 'flex';
}

function hideError() { errorEl.style.display = 'none'; }

// ── Send logic ────────────────────────────────────────────────────────────────

function setSending(on) {
  sendBtn.disabled  = on;
  inputEl.disabled  = on;
  sendIcon.style.display   = on ? 'none'  : 'block';
  sendLoader.style.display = on ? 'block' : 'none';
}

async function sendQuestion(text) {
  if (!text.trim()) return;

  const ctx = window.StrategyCanvas?.getCurrentContext();
  if (!ctx) {
    showError('Please select a capability from the Strategy Canvas first.');
    return;
  }

  lastQuestion = text.trim();
  hideError();
  appendQuestion(text);
  inputEl.value = '';
  inputEl.style.height = 'auto';

  // Hide both prompt sets once a message is sent
  document.getElementById('suggested-prompts')?.style?.setProperty('display', 'none');
  sectionPromptsEl.style.display = 'none';

  setSending(true);
  appendTyping();

  try {
    if (_sectionMode && _activeSection) {
      await sendSectionRequest(ctx, lastQuestion);
    } else {
      await sendGeneralRequest(ctx, lastQuestion);
    }
  } catch (err) {
    console.error('advisor sendQuestion error:', err);
    removeTyping();
    setSending(false);
    showError('We couldn\'t process that. Please try again.');
  }
}

async function sendGeneralRequest(ctx, question) {
  const resp = await fetch(`${API_BASE}/strategy-canvas/advisor/ask`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({
      capabilityId: ctx.capabilityId,
      blueprint:    ctx.blueprint,
      question,
    }),
  });

  const data = await resp.json();
  removeTyping();
  setSending(false);

  if (!resp.ok) {
    showError(data?.error || 'We couldn\'t process that. Please try again.');
    return;
  }

  appendAdvisorResponse(data);
}

async function sendSectionRequest(ctx, question) {
  const { sectionTitle, currentContent } = _activeSection;

  const resp = await fetch(`${API_BASE}/strategy-canvas/blueprint-suggest`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({
      capabilityId:   ctx.capabilityId,
      blueprint:      ctx.blueprint,
      sectionTitle,
      currentContent: ctx.companyDraft?.[sectionTitle] || currentContent || '',
      request:        question,
    }),
  });

  const data = await resp.json();
  removeTyping();

  if (!resp.ok) {
    setSending(false);
    showError(data?.error || 'We couldn\'t process that. Please try again.');
    return;
  }

  // Render suggestion card — setSending(false) is deferred to Accept/Reject
  const card = createSuggestionCard(data);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Suggested prompts (general mode) ─────────────────────────────────────────

async function loadSuggestedPrompts() {
  try {
    const resp = await fetch(`${API_BASE}/chat/${getDomainId()}/suggested-prompts`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!resp.ok) return;

    const { prompts } = await resp.json();
    const container = document.getElementById('suggested-prompts');
    container.innerHTML = '';

    for (const prompt of prompts) {
      const btn = document.createElement('button');
      btn.className = 'suggested-prompt-btn';
      btn.textContent = prompt;
      btn.addEventListener('click', () => sendQuestion(prompt));
      container.appendChild(btn);
    }
  } catch { /* non-critical */ }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(text, max) {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + '…';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) {
    const domainId = getDomainId();
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${domainId}`;
    return;
  }

  // Cache DOM refs
  messagesEl          = document.getElementById('chat-messages');
  inputEl             = document.getElementById('chat-input');
  sendBtn             = document.getElementById('chat-send');
  sendIcon            = document.getElementById('chat-send-icon');
  sendLoader          = document.getElementById('chat-send-loader');
  errorEl             = document.getElementById('chat-error');
  errorTextEl         = document.getElementById('chat-error-text');
  retryBtn            = document.getElementById('chat-retry');
  advisorContextEl    = document.getElementById('advisor-context');
  advisorSubheadingEl = document.getElementById('advisor-subheading');
  generalPromptsEl    = document.getElementById('suggested-prompts');

  // Sprint 16 refs
  sectionContextEl = document.getElementById('section-context');
  sectionTitleEl   = document.getElementById('section-context-title');
  sectionPreviewEl = document.getElementById('section-context-preview');
  sectionClearEl   = document.getElementById('section-context-clear');
  sectionPromptsEl = document.getElementById('section-prompts');

  // Logout
  document.getElementById('domain-logout')?.addEventListener('click', logout);

  // Domain title in nav
  const domainId = getDomainId();
  const titleEl  = document.getElementById('domain-title-nav');
  if (titleEl) {
    titleEl.textContent = domainId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    document.title = `SoorgaAI — ${titleEl.textContent}`;
  }

  // Start in disabled/idle state
  updateContextIndicator(null);

  // ── Canvas events ──────────────────────────────────────────────────────────
  document.addEventListener('blueprint:loaded',  e => {
    exitSectionMode();
    updateContextIndicator(e.detail);
  });

  document.addEventListener('blueprint:cleared', () => {
    exitSectionMode();
    updateContextIndicator(null);
    generalPromptsEl.style.display = 'none';
  });

  // Sprint 16: section events
  document.addEventListener('section:selected',  e => enterSectionMode(e.detail));
  document.addEventListener('section:deselected', () => exitSectionMode());

  document.addEventListener('section:draft-updated', e => {
    updateSectionPreview(e.detail.sectionTitle, e.detail.content);
  });

  // Section clear button
  sectionClearEl?.addEventListener('click', () => {
    window.StrategyCanvas?.deselectSection();
    exitSectionMode();
  });

  // Load general suggested prompts
  await loadSuggestedPrompts();
  advisorReady = true;
  maybeShowLayout();

  // Wait for canvas panel
  document.addEventListener('canvas:ready', () => {
    canvasReady = true;
    maybeShowLayout();
  });

  // Form submit
  document.getElementById('chat-form').addEventListener('submit', e => {
    e.preventDefault();
    sendQuestion(inputEl.value);
  });

  // Retry
  retryBtn.addEventListener('click', () => {
    if (lastQuestion) sendQuestion(lastQuestion);
  });

  // Textarea auto-resize + Enter to send
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(inputEl.value); }
  });
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = `${inputEl.scrollHeight}px`;
  });
});
