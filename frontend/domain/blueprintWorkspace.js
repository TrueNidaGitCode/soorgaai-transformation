/**
 * SoorgaAI — Blueprint Workspace Module (PI 26.3 Sprint 1)
 *
 * Manages Screen 3: Company Blueprint Workspace
 *
 * Activated when blueprintGenerate.js dispatches 'blueprint:ready'.
 *
 * Responsibilities:
 *   - Render workspace header (objective, company, dates, completion)
 *   - Render capability navigation tabs (dynamically from blueprint data)
 *   - Render full-width blueprint content for the selected capability
 *   - Manage AI Assistant panel (hidden by default, opens on button click)
 *   - Send AI assistant requests and handle suggestions
 *   - Persist section content changes to backend
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

// ── State ─────────────────────────────────────────────────────────────────────

let _blueprint           = null;
let _selectedCapIndex    = 0;
let _assistantOpen       = false;
let _chatHistory         = [];   // [{ role: 'user'|'assistant', content: string }]
let _pendingSuggestion   = null; // { sectionTitle, content, rationale }
let _isSending           = false;

// ── Screen helpers ────────────────────────────────────────────────────────────

function showScreen(id) {
  ['screen-generate', 'screen-progress', 'screen-workspace', 'domain-loading'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? '' : 'none';
  });
}

// ── Date formatting ───────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Completion calculation ────────────────────────────────────────────────────

function calcCompletion(blueprint) {
  const caps = blueprint.capabilities || [];
  if (!caps.length) return 0;
  const done = caps.filter(c => c.status === 'completed').length;
  return Math.round((done / caps.length) * 100);
}

// ── Workspace header ──────────────────────────────────────────────────────────

function renderHeader(blueprint) {
  const details = document.getElementById('ws-header-details');
  const statusEl = document.getElementById('ws-header-status');

  if (details) {
    details.innerHTML = `
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Objective</span>
        ${blueprint.businessObjective || '—'}
      </span>
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Industry</span>
        ${blueprint.industry || 'Automotive'}
      </span>
      ${blueprint.companyName ? `
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Company</span>
        ${blueprint.companyName}
      </span>` : ''}
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Generated</span>
        ${fmtDate(blueprint.generatedAt)}
      </span>
      <span class="ws-header__detail">
        <span class="ws-header__detail-label">Updated</span>
        ${fmtDate(blueprint.updatedAt)}
      </span>
    `;
  }

  if (statusEl) {
    const pct = calcCompletion(blueprint);
    statusEl.innerHTML = `<span class="ws-completion-pill">⚡ ${pct}% Generated</span>`;
  }
}

// ── Capability tabs ───────────────────────────────────────────────────────────

function renderCapabilityTabs(blueprint) {
  const nav = document.getElementById('cap-nav');
  if (!nav) return;
  nav.innerHTML = '';

  (blueprint.capabilities || []).forEach((cap, idx) => {
    const tab = document.createElement('button');
    tab.className = `cap-nav__tab${idx === _selectedCapIndex ? ' is-active' : ''}`;
    tab.dataset.idx = idx;

    const dotClass = `cap-nav__tab-dot--${cap.status === 'in-progress' ? 'progress' : cap.status}`;
    tab.innerHTML = `<span class="cap-nav__tab-dot ${dotClass}" aria-hidden="true"></span>${cap.capabilityName}`;

    tab.addEventListener('click', () => selectCapability(idx));
    nav.appendChild(tab);
  });
}

function selectCapability(idx) {
  _selectedCapIndex = idx;
  _chatHistory = [];        // reset chat context when switching capability
  clearSuggestionCard();

  // Update tab active state
  document.querySelectorAll('.cap-nav__tab').forEach((t, i) => {
    t.classList.toggle('is-active', i === idx);
  });

  renderBlueprintContent(_blueprint, idx);
  updateAssistantContext();
}

// ── Blueprint content ─────────────────────────────────────────────────────────

function renderBlueprintContent(blueprint, capIdx) {
  const area = document.getElementById('bp-content');
  if (!area) return;
  area.innerHTML = '';

  const cap = (blueprint.capabilities || [])[capIdx];
  if (!cap) return;

  // Capability title
  const header = document.createElement('div');
  header.className = 'bp-cap-header';
  header.innerHTML = `
    <h2 class="bp-cap-title">${cap.capabilityName}</h2>
  `;
  area.appendChild(header);

  if (cap.status !== 'completed' || !cap.sections?.length) {
    const empty = document.createElement('div');
    empty.className = 'bp-empty';
    const isError = cap.status === 'error';
    empty.innerHTML = `
      <div class="bp-empty__icon">${isError ? '⚠' : '⟳'}</div>
      <p class="bp-empty__title">${isError ? 'Generation failed for this capability' : 'Still generating…'}</p>
      <p class="bp-empty__text">${isError ? 'The AI encountered an error. Try regenerating.' : 'This section will appear when generation completes.'}</p>
    `;
    area.appendChild(empty);
    return;
  }

  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'bp-sections';

  for (const section of cap.sections) {
    const card = buildSectionCard(blueprint, cap, section);
    sectionsEl.appendChild(card);
  }

  area.appendChild(sectionsEl);
}

function buildSectionCard(blueprint, cap, section) {
  const card = document.createElement('div');
  card.className = 'bp-section';
  card.dataset.sectionTitle = section.title;

  card.innerHTML = `
    <div class="bp-section__header">
      <h3 class="bp-section__title">${section.title}</h3>
      <div class="bp-section__actions">
        <button class="bp-section__action-btn js-refine-btn" data-section="${section.title}" aria-label="Refine this section with AI">
          Refine with AI
        </button>
      </div>
    </div>
    <p class="bp-section__content">${section.content || '—'}</p>
  `;

  card.querySelector('.js-refine-btn')?.addEventListener('click', () => {
    openAssistantForSection(section.title);
  });

  return card;
}

// ── AI Assistant panel ────────────────────────────────────────────────────────

function initAssistantButton() {
  const btn = document.getElementById('btn-ai-assistant');
  if (btn) btn.addEventListener('click', toggleAssistant);

  const closeBtn = document.getElementById('btn-close-assistant');
  if (closeBtn) closeBtn.addEventListener('click', () => setAssistantOpen(false));
}

function toggleAssistant() {
  setAssistantOpen(!_assistantOpen);
}

function setAssistantOpen(open) {
  _assistantOpen = open;
  const panel  = document.getElementById('ai-panel');
  const btn    = document.getElementById('btn-ai-assistant');
  const wsBody = document.getElementById('ws-body');

  if (panel)  panel.style.display  = open ? '' : 'none';
  if (btn)    btn.classList.toggle('is-open', open);
  if (wsBody) wsBody.classList.toggle('assistant-open', open);

  if (open) updateAssistantContext();
}

function updateAssistantContext() {
  const cap    = (_blueprint?.capabilities || [])[_selectedCapIndex];
  const ctxEl  = document.getElementById('ai-panel-context');
  if (!ctxEl || !cap) return;
  ctxEl.innerHTML = `Working on: <strong>${cap.capabilityName}</strong>`;
  ctxEl.style.display = '';
}

function openAssistantForSection(sectionTitle) {
  setAssistantOpen(true);
  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.value = `Help me improve the "${sectionTitle}" section.`;
    input.focus();
  }
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

function initChat() {
  const form    = document.getElementById('ai-chat-form');
  const retryBtn = document.getElementById('ai-chat-retry');

  if (form) form.addEventListener('submit', handleChatSubmit);
  if (retryBtn) retryBtn.addEventListener('click', () => {
    const input = document.getElementById('ai-chat-input');
    if (input?.value?.trim()) handleChatSubmit(null, input.value.trim());
  });

  const acceptBtn  = document.getElementById('ai-suggestion-accept');
  const discardBtn = document.getElementById('ai-suggestion-discard');
  if (acceptBtn)  acceptBtn.addEventListener('click',  acceptSuggestion);
  if (discardBtn) discardBtn.addEventListener('click', clearSuggestionCard);
}

async function handleChatSubmit(e, prefillText) {
  if (e) e.preventDefault();
  if (_isSending) return;

  const input = document.getElementById('ai-chat-input');
  const message = prefillText || input?.value?.trim();
  if (!message) return;

  if (input) input.value = '';
  clearSuggestionCard();
  setErrorVisible(false);

  appendChatMessage('user', message);
  _chatHistory.push({ role: 'user', content: message });
  setChatSending(true);

  const cap = (_blueprint?.capabilities || [])[_selectedCapIndex];
  if (!cap) return;

  // Build a minimal blueprint summary for the advisor
  const blueprintSummary = buildBlueprintSummary(_blueprint, _selectedCapIndex);

  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/blueprint-suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        capabilityId:        cap.capabilityId,
        blueprint:           blueprintSummary,
        sectionTitle:        cap.capabilityName, // capability-level context
        currentContent:      getCurrentCapabilityContent(cap),
        request:             message,
        automotiveBlueprint: '',
        conversationHistory: _chatHistory.slice(-10),
        companyMemory:       {},
      }),
    });

    if (resp.status === 401) { window.location.href = '/login/login.html'; return; }
    if (!resp.ok) {
      const { error } = await resp.json().catch(() => ({}));
      throw new Error(error || 'AI request failed.');
    }

    const result = await resp.json();
    setChatSending(false);

    if (result.mode === 'conversation') {
      const text = result.response || '';
      appendChatMessage('assistant', text);
      _chatHistory.push({ role: 'assistant', content: text });
    } else if (result.mode === 'blueprint') {
      const s = result.suggestion || {};
      showSuggestionCard(cap.capabilityName, s.suggestedRevision || '', s.whyThisHelps || '');
      _chatHistory.push({ role: 'assistant', content: s.suggestedRevision || '' });
    }

  } catch (err) {
    setChatSending(false);
    setErrorVisible(true, err.message);
    _chatHistory.push({ role: 'assistant', content: `[Error: ${err.message}]` });
  }
}

function buildBlueprintSummary(blueprint, capIdx) {
  const cap = (blueprint.capabilities || [])[capIdx];
  if (!cap) return {};
  return {
    capabilityName: cap.capabilityName,
    sections: (cap.sections || []).map(s => ({ title: s.title, content: s.content || '' })),
  };
}

function getCurrentCapabilityContent(cap) {
  return (cap.sections || [])
    .map(s => `${s.title}:\n${s.content}`)
    .join('\n\n');
}

// ── Suggestion card ───────────────────────────────────────────────────────────

function showSuggestionCard(capabilityName, text, rationale) {
  _pendingSuggestion = { capabilityName, text, rationale };

  const card      = document.getElementById('ai-suggestion-card');
  const textEl    = document.getElementById('ai-suggestion-text');
  const rationale1El = document.getElementById('ai-suggestion-rationale');

  if (textEl)       textEl.textContent     = text;
  if (rationale1El) rationale1El.textContent = rationale;
  if (card)         card.style.display      = '';
}

function clearSuggestionCard() {
  _pendingSuggestion = null;
  const card = document.getElementById('ai-suggestion-card');
  if (card) card.style.display = 'none';
}

async function acceptSuggestion() {
  if (!_pendingSuggestion || !_blueprint) return;

  // For capability-level suggestions, apply to the first section as a proxy
  const cap     = (_blueprint.capabilities || [])[_selectedCapIndex];
  const section = cap?.sections?.[0];
  if (!cap || !section) { clearSuggestionCard(); return; }

  const newContent = _pendingSuggestion.text;

  // Update DOM immediately
  updateSectionContent(section.title, newContent);

  // Update local blueprint state
  section.content = newContent;
  section.updatedAt = new Date().toISOString();
  _blueprint.updatedAt = new Date().toISOString();
  renderHeader(_blueprint);

  // Persist to backend
  try {
    await fetch(
      `${API_BASE}/strategy-canvas/company-blueprint/${_blueprint._id}/capability/${cap.capabilityId}/section/${encodeURIComponent(section.title)}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ content: newContent }),
      }
    );
  } catch (err) {
    console.warn('[workspace] Failed to persist section update:', err.message);
  }

  clearSuggestionCard();
}

function updateSectionContent(sectionTitle, newContent) {
  const area  = document.getElementById('bp-content');
  const cards = area?.querySelectorAll('.bp-section');
  if (!cards) return;

  for (const card of cards) {
    if (card.dataset.sectionTitle === sectionTitle) {
      const contentEl = card.querySelector('.bp-section__content');
      if (contentEl) contentEl.textContent = newContent;
      card.classList.remove('bp-section--updated');
      void card.offsetWidth;
      card.classList.add('bp-section--updated');
      break;
    }
  }
}

// ── Chat UI helpers ───────────────────────────────────────────────────────────

function appendChatMessage(role, content) {
  const log = document.getElementById('ai-chat-messages');
  if (!log) return;

  const msg = document.createElement('div');
  msg.className = `chat-msg chat-msg--${role}`;
  msg.textContent = content;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

function setChatSending(sending) {
  _isSending = sending;
  const sendBtn    = document.getElementById('ai-chat-send');
  const sendIcon   = document.getElementById('ai-chat-send-icon');
  const sendLoader = document.getElementById('ai-chat-send-loader');
  const input      = document.getElementById('ai-chat-input');

  if (sendBtn)    sendBtn.disabled          = sending;
  if (sendIcon)   sendIcon.style.display    = sending ? 'none' : '';
  if (sendLoader) sendLoader.style.display  = sending ? '' : 'none';
  if (input)      input.disabled            = sending;

  if (sending) {
    const typing = document.createElement('div');
    typing.id = 'ai-typing-indicator';
    typing.className = 'chat-msg chat-msg--typing';
    typing.textContent = 'Thinking…';
    document.getElementById('ai-chat-messages')?.appendChild(typing);
    document.getElementById('ai-chat-messages')?.scrollTo({ top: 99999 });
  } else {
    document.getElementById('ai-typing-indicator')?.remove();
  }
}

function setErrorVisible(visible, msg = '') {
  const errEl  = document.getElementById('ai-chat-error');
  const errTxt = document.getElementById('ai-chat-error-text');
  if (errEl)  errEl.style.display  = visible ? '' : 'none';
  if (errTxt) errTxt.textContent   = msg || 'Something went wrong. Please try again.';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function initWorkspace(blueprint) {
  _blueprint        = blueprint;
  _selectedCapIndex = 0;
  _chatHistory      = [];

  // Show AI Assistant button now that we're in workspace
  const assistantBtn = document.getElementById('btn-ai-assistant');
  if (assistantBtn) assistantBtn.style.display = '';

  renderHeader(blueprint);
  renderCapabilityTabs(blueprint);
  renderBlueprintContent(blueprint, _selectedCapIndex);

  showScreen('screen-workspace');

  initAssistantButton();
  initChat();
}

// Listen for 'blueprint:ready' from blueprintGenerate.js
document.addEventListener('blueprint:ready', (e) => {
  const { blueprint } = e.detail || {};
  if (blueprint) initWorkspace(blueprint);
});
