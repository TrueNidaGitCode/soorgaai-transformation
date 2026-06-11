/**
 * SoorgaAI — AI Strategy Advisor Module (Sprint 15)
 *
 * Implements the right-panel AI Advisor. Reads the current capability context
 * from window.StrategyCanvas (set by strategy-canvas.js) and sends questions
 * to POST /api/strategy-canvas/advisor/ask.
 *
 * The advisor is context-aware: every question is answered in the context of
 * the currently selected capability and blueprint. No conversation is persisted.
 *
 * Coordinates layout reveal with strategy-canvas.js via the 'canvas:ready' event.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken()   { return localStorage.getItem('token'); }
function getDomainId() { return new URLSearchParams(window.location.search).get('domain') || 'ai-strategy'; }

function logout() {
  ['token', 'username', 'userId', 'role', 'redirectAfterLogin'].forEach(k => localStorage.removeItem(k));
  window.location.href = '/index.html';
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

let messagesEl, inputEl, sendBtn, sendIcon, sendLoader;
let errorEl, errorTextEl, retryBtn;
let advisorContextEl, advisorSubheadingEl;
let lastQuestion = '';

// ── Layout coordination (mirrors chat.js pattern) ─────────────────────────────

let canvasReady  = false;
let advisorReady = false;

function maybeShowLayout() {
  if (canvasReady && advisorReady) {
    document.getElementById('domain-loading').style.display = 'none';
    document.getElementById('domain-main').style.display    = 'grid';
  }
}

// ── Context indicator ─────────────────────────────────────────────────────────

function updateContextIndicator(context) {
  if (context) {
    const { blueprint } = context;
    advisorContextEl.textContent = `${blueprint.capabilityName} · ${blueprint.industry}`;
    advisorContextEl.style.display = 'block';
    advisorSubheadingEl.textContent = 'Ask a question about this capability.';
    inputEl.disabled = false;
    sendBtn.disabled = false;
  } else {
    advisorContextEl.style.display = 'none';
    advisorSubheadingEl.textContent = 'Select a capability from the canvas to start asking questions.';
    inputEl.disabled = true;
    sendBtn.disabled = true;
  }
}

// ── Response rendering ────────────────────────────────────────────────────────

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

  // Hide suggested prompts after first question
  document.getElementById('suggested-prompts')?.style?.setProperty('display', 'none');

  setSending(true);
  appendTyping();

  try {
    const resp = await fetch(`${API_BASE}/strategy-canvas/advisor/ask`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        capabilityId: ctx.capabilityId,
        blueprint:    ctx.blueprint,
        question:     lastQuestion,
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

  } catch (err) {
    console.error('advisor sendQuestion error:', err);
    removeTyping();
    setSending(false);
    showError('We couldn\'t process that. Please try again.');
  }
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

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

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) {
    const domainId = getDomainId();
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${domainId}`;
    return;
  }

  // Cache DOM refs
  messagesEl        = document.getElementById('chat-messages');
  inputEl           = document.getElementById('chat-input');
  sendBtn           = document.getElementById('chat-send');
  sendIcon          = document.getElementById('chat-send-icon');
  sendLoader        = document.getElementById('chat-send-loader');
  errorEl           = document.getElementById('chat-error');
  errorTextEl       = document.getElementById('chat-error-text');
  retryBtn          = document.getElementById('chat-retry');
  advisorContextEl  = document.getElementById('advisor-context');
  advisorSubheadingEl = document.getElementById('advisor-subheading');

  // Logout
  document.getElementById('domain-logout')?.addEventListener('click', logout);

  // Domain title in nav
  const domainId = getDomainId();
  const titleEl  = document.getElementById('domain-title-nav');
  if (titleEl) {
    titleEl.textContent = domainId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    document.title = `SoorgaAI — ${titleEl.textContent}`;
  }

  // Start disabled until a capability is selected
  updateContextIndicator(null);

  // React to capability selection / deselection from strategy-canvas.js
  document.addEventListener('blueprint:loaded',  e => updateContextIndicator(e.detail));
  document.addEventListener('blueprint:cleared', () => updateContextIndicator(null));

  // Load suggested prompts
  await loadSuggestedPrompts();
  advisorReady = true;
  maybeShowLayout();

  // Wait for canvas panel to be ready too
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
