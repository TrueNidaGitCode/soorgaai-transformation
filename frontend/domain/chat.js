/**
 * SoorgaAI — Chat Module
 *
 * Responsibilities:
 *   - Load and display suggested prompts on mount.
 *   - Load and display conversation history on mount.
 *   - Handle form submit: POST /api/chat/:domainId/message.
 *   - On success: append user + agent messages; call Canvas.updateFocusArea for each accepted update.
 *   - On error: show retry banner with the exact error message from AC11.
 *   - Retry button re-sends the last user message.
 *   - Coordinates with canvas.js via the 'canvas:ready' event before revealing the layout.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken()   { return localStorage.getItem('token'); }
function getDomainId() { return new URLSearchParams(window.location.search).get('domain') || 'ai-strategy'; }

function logout() {
  ['token','username','userId','role','redirectAfterLogin'].forEach(k => localStorage.removeItem(k));
  window.location.href = '/index.html';
}

// ── DOM refs ───────────────────────────────────────────────────────────────────

let chatMessages, chatInput, chatSend, chatSendIcon, chatSendLoader;
let chatError, chatErrorText, chatRetry;
let lastUserMessage = '';

// ── Loading / hiding ───────────────────────────────────────────────────────────

let canvasReady = false;
let chatReady   = false;

function maybeShowLayout() {
  if (canvasReady && chatReady) {
    document.getElementById('domain-loading').style.display = 'none';
    document.getElementById('domain-main').style.display    = 'grid';
  }
}

// ── Message rendering ──────────────────────────────────────────────────────────

function appendMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = `chat-msg chat-msg--${role}`;
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msg;
}

function removeTypingIndicator() {
  const typing = chatMessages.querySelector('.chat-msg--typing');
  if (typing) typing.remove();
}

// ── Error handling ─────────────────────────────────────────────────────────────

function showError(message) {
  chatErrorText.textContent = message || "We couldn't process that. Please try again.";
  chatError.style.display = 'flex';
}

function hideError() {
  chatError.style.display = 'none';
}

// ── Sending ────────────────────────────────────────────────────────────────────

function setSending(on) {
  chatSend.disabled = on;
  chatInput.disabled = on;
  chatSendIcon.style.display  = on ? 'none'  : 'block';
  chatSendLoader.style.display = on ? 'block' : 'none';
}

async function sendMessage(text) {
  if (!text.trim()) return;
  lastUserMessage = text.trim();

  hideError();
  appendMessage('user', text);
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Hide suggested prompts after first real message
  const prompts = document.getElementById('suggested-prompts');
  if (prompts) prompts.style.display = 'none';

  setSending(true);
  const typingEl = appendMessage('assistant', '…');
  typingEl.classList.add('chat-msg--typing');

  try {
    const resp = await fetch(`${API_BASE}/chat/${getDomainId()}/message`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ message: text }),
    });

    const data = await resp.json();

    removeTypingIndicator();
    setSending(false);

    if (!resp.ok) {
      const errMsg = data?.error || "We couldn't process that. Please try again.";
      showError(errMsg);
      return;
    }

    appendMessage('assistant', data.reply);

    // Apply canvas updates live — titles never change
    if (Array.isArray(data.canvasUpdates) && data.canvasUpdates.length > 0) {
      for (const update of data.canvasUpdates) {
        if (window.Canvas?.updateFocusArea) {
          window.Canvas.updateFocusArea(update.focusAreaId, update.newDescription);
        }
      }
    }

  } catch (err) {
    console.error('sendMessage error:', err);
    removeTypingIndicator();
    setSending(false);
    showError("We couldn't process that. Please try again.");
  }
}

// ── History ─────────────────────────────────────────────────────────────────────

async function loadHistory() {
  const domainId = getDomainId();
  try {
    const resp = await fetch(`${API_BASE}/chat/${domainId}/history?limit=50`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!resp.ok) return;

    const { turns } = await resp.json();
    for (const turn of turns) {
      if (!turn.error) appendMessage(turn.role, turn.content);
    }
  } catch { /* history is non-critical */ }
}

// ── Suggested prompts ──────────────────────────────────────────────────────────

async function loadSuggestedPrompts() {
  const domainId = getDomainId();
  try {
    const resp = await fetch(`${API_BASE}/chat/${domainId}/suggested-prompts`, {
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
      btn.addEventListener('click', () => sendMessage(prompt));
      container.appendChild(btn);
    }
  } catch { /* non-critical */ }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) {
    const domainId = getDomainId();
    window.location.href = `/login/login.html?redirect=/domain/domain.html?domain=${domainId}`;
    return;
  }

  // Cache DOM refs
  chatMessages   = document.getElementById('chat-messages');
  chatInput      = document.getElementById('chat-input');
  chatSend       = document.getElementById('chat-send');
  chatSendIcon   = document.getElementById('chat-send-icon');
  chatSendLoader = document.getElementById('chat-send-loader');
  chatError      = document.getElementById('chat-error');
  chatErrorText  = document.getElementById('chat-error-text');
  chatRetry      = document.getElementById('chat-retry');

  // Logout
  document.getElementById('domain-logout').addEventListener('click', logout);

  // Domain title in nav
  const domainId = getDomainId();
  document.getElementById('domain-title-nav').textContent =
    domainId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Set page title
  document.title = `SoorgaAI — ${document.getElementById('domain-title-nav').textContent}`;

  // Load history + prompts in parallel
  await Promise.all([loadHistory(), loadSuggestedPrompts()]);
  chatReady = true;
  maybeShowLayout();

  // Canvas signals when it's ready too
  document.addEventListener('canvas:ready', () => {
    canvasReady = true;
    maybeShowLayout();
  });

  // Form submit
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(chatInput.value);
  });

  // Textarea auto-resize + Enter to send (Shift+Enter = newline)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${chatInput.scrollHeight}px`;
  });

  // Retry button
  chatRetry.addEventListener('click', () => {
    if (lastUserMessage) sendMessage(lastUserMessage);
  });
});
