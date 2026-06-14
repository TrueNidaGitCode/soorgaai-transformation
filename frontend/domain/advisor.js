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
 *                    User chooses: Accept | Refine | Discard
 *                    Only Accept/Refine pushes content to the Strategy Canvas
 *
 * The Strategy Canvas is the source of truth.
 * The AI may suggest. It may never automatically overwrite user content.
 *
 * Sprint 20.1 — continuous conversation:
 *   Accept/Refine/Discard are blueprint actions, not conversation
 *   terminators. The chat input reactivates as soon as the AI responds,
 *   and follow-up questions refine the latest pending recommendation
 *   until it is accepted or discarded.
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

// Sprint 18.2: sticky editing header extras
let sectionMetaEl;

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

let _sectionMode   = false;
let _activeSection = null; // { sectionTitle, currentContent, capabilityId, blueprint }

// Sprint 20.1: the latest AI recommendation that has not been accepted or
// discarded yet — follow-up questions refine it instead of the older draft.
let _pendingSuggestion = null; // { sectionTitle, content } | null

// ── Context indicator ─────────────────────────────────────────────────────────
// Sprint 19: implementation details (industry layer, source attribution) are
// no longer surfaced — just the capability being worked on.

function updateContextIndicator(context) {
  // Sprint 20: the advisor panel only exists once a capability is open —
  // on the capability list the blueprint canvas gets the full width.
  document.getElementById('domain-main')
    ?.classList.toggle('domain-main--no-chat', !context);

  if (context) {
    const { blueprint } = context;
    advisorContextEl.textContent = blueprint.capabilityName;
    advisorContextEl.style.display = 'block';
    advisorSubheadingEl.textContent =
      'Pick a section on the left, or ask me anything about this capability.';
    inputEl.disabled  = false;
    sendBtn.disabled  = false;
  } else {
    advisorContextEl.style.display = 'none';
    advisorSubheadingEl.textContent =
      'Select a capability from the blueprint to start the conversation.';
    inputEl.disabled  = true;
    sendBtn.disabled  = true;
  }
}

// ── Welcome empty state (Sprint 18.3 / 20) ───────────────────────────────────
// Sprint 20: the empty state guides the first-time user instead of relying on
// instruction text — it lists the blueprint sections as clickable chips, so
// "select a section" is an action in the chat panel, not something to figure
// out. Once a section is active it offers tappable example prompts.

const _EXAMPLE_PROMPTS = [
  'Help improve our AI vision.',
  'Challenge our assumptions.',
  'Make this measurable.',
  'Compare against industry best practices.',
];

function emptyStateEl() {
  const el = document.getElementById('advisor-empty');
  // Once a conversation starts the empty state is gone for good
  return el && el.style.display !== 'none' ? el : null;
}

function renderEmptyStateForBlueprint(blueprint) {
  const el = emptyStateEl();
  if (!el) return;
  el.innerHTML = '';

  const title = document.createElement('p');
  title.className = 'advisor-empty__title';
  title.textContent = `Let's build your ${blueprint.capabilityName} strategy`;
  el.appendChild(title);

  const text = document.createElement('p');
  text.className = 'advisor-empty__text';
  text.textContent = 'Choose the blueprint section you want to work on:';
  el.appendChild(text);

  const chips = document.createElement('div');
  chips.className = 'advisor-empty__chips';
  for (const section of blueprint.sections || []) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'advisor-empty__chip';
    chip.textContent = section.title;
    chip.addEventListener('click', () =>
      window.StrategyCanvas?.selectSectionByTitle(section.title));
    chips.appendChild(chip);
  }
  el.appendChild(chips);

  const hint = document.createElement('p');
  hint.className = 'advisor-empty__text advisor-empty__hint';
  hint.textContent = 'Or just ask me anything about this capability.';
  el.appendChild(hint);
}

function renderEmptyStateForSection(sectionTitle) {
  const el = emptyStateEl();
  if (!el) return;
  el.innerHTML = '';

  const title = document.createElement('p');
  title.className = 'advisor-empty__title';
  title.textContent = `Working on ${sectionTitle}`;
  el.appendChild(title);

  const text = document.createElement('p');
  text.className = 'advisor-empty__text';
  text.textContent = 'Tell me what you need — or start from one of these:';
  el.appendChild(text);

  const list = document.createElement('ul');
  list.className = 'advisor-empty__examples';
  for (const prompt of _EXAMPLE_PROMPTS) {
    const li  = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'advisor-empty__example-btn';
    btn.textContent = `“${prompt}”`;
    btn.addEventListener('click', () => {
      inputEl.value = prompt;
      inputEl.dispatchEvent(new Event('input'));
      inputEl.focus();
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
  el.appendChild(list);
}

// ── Section mode (Sprint 16) ──────────────────────────────────────────────────

function enterSectionMode(detail) {
  _sectionMode   = true;
  _activeSection = { ...detail };

  // Update context badge
  advisorContextEl.textContent =
    `${detail.blueprint.capabilityName} · ${detail.sectionTitle}`;
  advisorContextEl.style.display = 'block';

  advisorSubheadingEl.textContent = 'Chat naturally — I\'ll help you build this section.';

  // Show compact "Working on" header (Sprint 18.2/19)
  sectionTitleEl.textContent = detail.sectionTitle;
  if (sectionMetaEl) {
    sectionMetaEl.textContent = detail.blueprint.capabilityName;
  }
  if (sectionPreviewEl) {
    sectionPreviewEl.textContent = detail.currentContent
      ? truncate(detail.currentContent, 140)
      : '(No draft yet — I\'ll generate one from the knowledge base)';
  }
  sectionContextEl.style.display = 'flex';

  // Sprint 18.3: mark the context switch in the conversation flow
  appendSectionDivider(detail.sectionTitle);

  inputEl.disabled  = false;
  sendBtn.disabled  = false;
  inputEl.placeholder = 'Ask me to improve, review, rewrite, or challenge this section…';

  // Sprint 18.2: focus the advisor. On the stacked (mobile) layout the
  // advisor panel is not sticky, so bring the editing header into view.
  if (window.matchMedia('(max-width: 900px)').matches) {
    sectionContextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  inputEl.focus({ preventScroll: true });
}

// Sprint 18.3: small divider in the conversation when the working section
// changes — keeps a continuous history readable across sections.
function appendSectionDivider(sectionTitle) {
  if (!messagesEl || messagesEl.childElementCount === 0) return;
  const last = messagesEl.lastElementChild;
  if (last?.classList.contains('chat-divider') && last.dataset.section === sectionTitle) return;

  const el = document.createElement('div');
  el.className = 'chat-divider';
  el.dataset.section = sectionTitle;
  el.textContent = `Now working on: ${sectionTitle}`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function exitSectionMode() {
  _sectionMode   = false;
  _activeSection = null;

  sectionContextEl.style.display = 'none';

  inputEl.placeholder = 'Ask SoorgaAI…';

  // Restore context indicator
  const ctx = window.StrategyCanvas?.getCurrentContext();
  updateContextIndicator(ctx ? { blueprint: ctx.blueprint } : null);
}

// Update the section context after a draft is accepted
function updateSectionPreview(sectionTitle, content) {
  if (_activeSection?.sectionTitle === sectionTitle) {
    _activeSection.currentContent = content;
    if (sectionPreviewEl) {
      sectionPreviewEl.textContent = content
        ? truncate(content, 140)
        : '(No draft yet — I\'ll generate one from the knowledge base)';
    }
  }
}

// ── Response rendering — General mode ─────────────────────────────────────────

// Sprint 18.3: the welcome empty state hides once a conversation begins
function hideEmptyState() {
  const el = document.getElementById('advisor-empty');
  if (el) el.style.display = 'none';
}

function appendQuestion(text) {
  hideEmptyState();
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

// Sprint 18.3: responses read conversationally — the executive perspective
// leads as natural chat text; supporting detail collapses behind "Show more".
function appendAdvisorResponse(result) {
  const { response, industry } = result;
  const card = document.createElement('div');
  card.className = 'advisor-response';

  const lead = document.createElement('p');
  lead.className = 'advisor-response__lead';
  lead.textContent = response.executivePerspective || 'Here\'s my perspective on that.';
  card.appendChild(lead);

  const detailSections = [
    { key: 'industryContext',   label: `${industry} Context`,    isList: false },
    { key: 'recommendations',   label: 'Recommendations',        isList: true  },
    { key: 'potentialRisks',    label: 'Potential Risks',        isList: true  },
    { key: 'suggestedNextStep', label: 'Suggested Next Step',    isList: false },
  ];

  let detailsHtml = '';
  for (const { key, label, isList } of detailSections) {
    const value = response[key];
    if (!value || (Array.isArray(value) && value.length === 0)) continue;

    detailsHtml += `<div class="advisor-response__section">
      <h4 class="advisor-response__section-title">${escapeHtml(label)}</h4>`;

    if (isList && Array.isArray(value)) {
      detailsHtml += `<ul class="advisor-response__list">${value.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    } else {
      detailsHtml += `<p class="advisor-response__section-body">${escapeHtml(String(value))}</p>`;
    }

    detailsHtml += `</div>`;
  }

  if (detailsHtml) {
    const detailsEl = document.createElement('div');
    detailsEl.className = 'suggestion-analysis';
    detailsEl.style.display = 'none';
    detailsEl.innerHTML = detailsHtml;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'suggestion-analysis-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = 'Show more ▾';
    toggleBtn.addEventListener('click', () => {
      const open = detailsEl.style.display !== 'none';
      detailsEl.style.display = open ? 'none' : 'flex';
      toggleBtn.textContent = open ? 'Show more ▾' : 'Show less ▴';
      toggleBtn.setAttribute('aria-expanded', String(!open));
    });

    card.appendChild(toggleBtn);
    card.appendChild(detailsEl);
  }

  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Continuous conversation helpers (Sprint 20.1) ─────────────────────────────
// Blueprint actions update the artifact; the strategic discussion continues.

const _FOLLOW_UP_QUESTIONS = [
  'Why did you suggest this?',
  'What risks do you see?',
  'Compare with industry best practices.',
  'How measurable is this?',
];

// Chip that prefills the input so the user stays in control of what is sent
function makeQuestionChip(question) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'advisor-empty__chip';
  chip.textContent = question;
  chip.addEventListener('click', () => {
    inputEl.value = question;
    inputEl.dispatchEvent(new Event('input'));
    inputEl.focus();
  });
  return chip;
}

function nextSectionAfter(sectionTitle) {
  const sections = _activeSection?.blueprint?.sections
    || window.StrategyCanvas?.getCurrentContext()?.blueprint?.sections
    || [];
  const i = sections.findIndex(s => s.title === sectionTitle);
  return i >= 0 && i + 1 < sections.length ? sections[i + 1].title : null;
}

// Shown after Accept: confirm the blueprint update, then keep collaborating
function appendAcceptFollowUp(sectionTitle) {
  const msg = document.createElement('div');
  msg.className = 'chat-msg chat-msg--assistant advisor-followup';

  const text = document.createElement('p');
  text.className = 'advisor-followup__text';
  text.textContent =
    `✓ ${sectionTitle} updated successfully. You can continue discussing ` +
    'this section or move to another topic.';
  msg.appendChild(text);

  const chips = document.createElement('div');
  chips.className = 'advisor-followup__chips';
  for (const question of _FOLLOW_UP_QUESTIONS) {
    chips.appendChild(makeQuestionChip(question));
  }

  const next = nextSectionAfter(sectionTitle);
  if (next) {
    const moveChip = document.createElement('button');
    moveChip.type = 'button';
    moveChip.className = 'advisor-empty__chip advisor-followup__move-chip';
    moveChip.textContent = `Move to ${next} →`;
    moveChip.addEventListener('click', () =>
      window.StrategyCanvas?.selectSectionByTitle(next));
    chips.appendChild(moveChip);
  }

  msg.appendChild(chips);
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Suggestion card — Section mode (Sprint 16 / 19) ───────────────────────────
// Sprint 19: concise and conversational — a short lead, the revision, a brief
// "why this improves the strategy", and three actions. No structured report,
// no technical labels. Accept/Refine/Discard map to the existing
// Accept/Edit/Reject workflow — behavior unchanged.

function createSuggestionCard(result) {
  const { suggestion, sectionTitle } = result;
  const card = document.createElement('div');
  card.className = 'suggestion-card';

  // Conversational lead-in
  const industry = _activeSection?.blueprint?.industry || '';
  const leadEl = document.createElement('p');
  leadEl.className = 'advisor-response__lead';
  leadEl.textContent = industry
    ? `Here's an improved ${sectionTitle} for your ${industry.toLowerCase()} AI strategy:`
    : `Here's an improved ${sectionTitle} for your AI strategy:`;
  card.appendChild(leadEl);

  // Suggested revision (supports refine mode)
  const revisionEl = document.createElement('div');
  revisionEl.className = 'suggestion-revision';

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

  // Brief reasoning — kept conversational, no report headings
  if (suggestion.whyThisHelps) {
    const whyEl = document.createElement('div');
    whyEl.className = 'suggestion-why';
    whyEl.innerHTML = `<span class="suggestion-why__label">Why this improves the strategy:</span>`;
    const whyText = document.createElement('p');
    whyText.className = 'suggestion-why__text';
    whyText.textContent = String(suggestion.whyThisHelps);
    whyEl.appendChild(whyText);
    card.appendChild(whyEl);
  }

  // Action buttons
  const actionsEl = document.createElement('div');
  actionsEl.className = 'suggestion-actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'suggestion-btn suggestion-btn--accept';
  acceptBtn.textContent = 'Accept';

  const editBtn = document.createElement('button');
  editBtn.className = 'suggestion-btn suggestion-btn--edit';
  editBtn.textContent = 'Refine';

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'suggestion-btn suggestion-btn--reject';
  rejectBtn.textContent = 'Discard';

  actionsEl.appendChild(acceptBtn);
  actionsEl.appendChild(editBtn);
  actionsEl.appendChild(rejectBtn);
  card.appendChild(actionsEl);

  // ── Action handlers ───────────────────────────────────────────────────────

  function doAccept(content) {
    window.StrategyCanvas?.acceptSection(sectionTitle, content);
    _pendingSuggestion = null; // accepted — the blueprint draft is the base again

    // Show accepted state in card
    actionsEl.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = 'suggestion-accepted-badge';
    badge.textContent = '✓ Added to your blueprint';
    actionsEl.appendChild(badge);
    card.classList.add('suggestion-card--accepted');

    // Restore text view if we were in refine mode
    revText.textContent   = content;
    revText.style.display = 'block';
    revEdit.style.display = 'none';
    revisionEl.classList.remove('suggestion-revision--editing');

    // Sprint 20.1: accepting updates the artifact — the conversation continues
    setSending(false);
    inputEl.placeholder = 'Ask a follow-up question…';
    appendAcceptFollowUp(sectionTitle);
  }

  function doReject() {
    _pendingSuggestion = null; // discarded — the blueprint stays unchanged

    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg--assistant';
    msg.textContent =
      'Recommendation discarded — your blueprint remains unchanged. '
      + 'Ask another question or request a different approach.';
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
    acceptEditBtn.textContent = 'Accept';

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
  retryBtn.style.display = ''; // restore Retry (hidden during session expiry)
  errorEl.style.display = 'flex';
}

function hideError() { errorEl.style.display = 'none'; }

// Sprint 20.1 fix: an expired JWT used to surface as a raw "Invalid token"
// error with a Retry button that could never succeed. A 401 now sends the
// user to sign in again and returns them to this exact domain page.
function handleSessionExpired() {
  showError('Your session has expired — taking you to sign in…');
  retryBtn.style.display = 'none'; // retrying with the same token cannot work
  setTimeout(() => {
    window.location.href =
      `/login/login.html?redirect=/domain/domain.html?domain=${getDomainId()}`;
  }, 1500);
}

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
  // Sprint 18.3: suggestion chips stay visible — they're compact and optional

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
      capabilityId:        ctx.capabilityId,
      blueprint:           ctx.blueprint,
      question,
      automotiveBlueprint: ctx.blueprint?.automotiveBlueprint || '',
    }),
  });

  const data = await resp.json();
  removeTyping();
  setSending(false);

  if (!resp.ok) {
    if (resp.status === 401) { handleSessionExpired(); return; }
    showError(data?.error || 'We couldn\'t process that. Please try again.');
    return;
  }

  appendAdvisorResponse(data);
}

async function sendSectionRequest(ctx, question) {
  const { sectionTitle, currentContent } = _activeSection;

  // Sprint 20.1: follow-up questions build on the latest AI recommendation
  // while it is pending — so "add sustainability" refines the suggestion on
  // the table, not the older accepted draft underneath it.
  const acceptedDraft = ctx.companyDraft?.[sectionTitle] || currentContent || '';
  const baseContent =
    (_pendingSuggestion?.sectionTitle === sectionTitle && _pendingSuggestion.content)
      ? _pendingSuggestion.content
      : acceptedDraft;

  const resp = await fetch(`${API_BASE}/strategy-canvas/blueprint-suggest`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({
      capabilityId:        ctx.capabilityId,
      blueprint:           ctx.blueprint,
      sectionTitle,
      currentContent:      baseContent,
      request:             question,
      automotiveBlueprint: ctx.blueprint?.automotiveBlueprint || '',
    }),
  });

  const data = await resp.json();
  removeTyping();
  // Sprint 20.1: the chat always reactivates once the AI responds — Accept/
  // Refine/Discard are blueprint actions, not conversation terminators.
  setSending(false);

  if (!resp.ok) {
    if (resp.status === 401) { handleSessionExpired(); return; }
    showError(data?.error || 'We couldn\'t process that. Please try again.');
    return;
  }

  const card = createSuggestionCard(data);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  _pendingSuggestion = {
    sectionTitle,
    content: data.suggestion?.suggestedRevision || '',
  };
  inputEl.placeholder = 'Ask a follow-up question…';
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

  // Sprint 16 refs
  sectionContextEl = document.getElementById('section-context');
  sectionTitleEl   = document.getElementById('section-context-title');
  sectionPreviewEl = document.getElementById('section-context-preview');
  sectionClearEl   = document.getElementById('section-context-clear');

  // Sprint 18.2 refs
  sectionMetaEl = document.getElementById('section-context-meta');

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
    _pendingSuggestion = null; // section titles can repeat across capabilities
    exitSectionMode();
    updateContextIndicator(e.detail);
    renderEmptyStateForBlueprint(e.detail.blueprint);
  });

  document.addEventListener('blueprint:cleared', () => {
    _pendingSuggestion = null;
    exitSectionMode();
    updateContextIndicator(null);
  });

  // Sprint 16: section events
  document.addEventListener('section:selected',  e => {
    enterSectionMode(e.detail);
    renderEmptyStateForSection(e.detail.sectionTitle);
  });
  document.addEventListener('section:deselected', () => {
    exitSectionMode();
    const ctx = window.StrategyCanvas?.getCurrentContext();
    if (ctx?.blueprint) renderEmptyStateForBlueprint(ctx.blueprint);
  });

  document.addEventListener('section:draft-updated', e => {
    updateSectionPreview(e.detail.sectionTitle, e.detail.content);
  });

  // Section clear button
  sectionClearEl?.addEventListener('click', () => {
    window.StrategyCanvas?.deselectSection();
    exitSectionMode();
  });

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
