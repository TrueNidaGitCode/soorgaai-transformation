/**
 * Svarg — Pipeline Wizard: Window 6's Yusu deployment + chat
 *
 * Reuses the real fetchMatch() from defect-matching.js rather than
 * duplicating the fetch/error-handling logic — this is the same live
 * POST /api/defect-matching/match already proven working, just presented
 * as a chat instead of a form.
 */

import { fetchMatch } from '../defect-matching/defect-matching.js';

// Matches pipeline-wizard-model.js's MODEL_PREFERENCE — Window 4's display
// and Window 6's actual chat behavior stay in sync.
const MODEL_PREFERENCE = 'frontier';

const DEPLOY_STEPS = [
  'Deploying agent into prepared infrastructure…',
  'Connecting to model & compute infrastructure…',
  'Connecting to structured data architecture…',
  'Agent deployed and ready.',
];

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderDeployStep(text, done, index) {
  const el = document.createElement('div');
  el.className = `pw-process-item pw-reveal ${done ? 'pw-process-item--done' : ''}`;
  el.style.setProperty('--i', index);
  el.innerHTML = `<span class="pw-process-item__title">${esc(text)}</span>`;
  return el;
}

function runDeploySequence() {
  return new Promise((resolve) => {
    const list = document.getElementById('pw-deploy-checklist');
    list.innerHTML = '';
    let i = 0;

    const next = () => {
      if (i > 0) list.lastElementChild.classList.add('pw-process-item--done');
      if (i >= DEPLOY_STEPS.length) { resolve(); return; }
      list.appendChild(renderDeployStep(DEPLOY_STEPS[i], false, i));
      i++;
      setTimeout(next, 500);
    };
    next();
  });
}

function appendMessage(role, html) {
  const messagesEl = document.getElementById('pw-chat-messages');
  const el = document.createElement('div');
  el.className = `chat-msg chat-msg--${role} pw-reveal`;
  el.innerHTML = html;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function renderAssistantResult(result) {
  const matchesHtml = result.matches.length
    ? `<ul class="pw-chat__matches">${result.matches.map(m =>
        `<li><strong>${esc(m.defectId)}</strong> (${Math.round(m.score * 100)}%) — ${esc(m.title)}</li>`
      ).join('')}</ul>`
    : '<p>No matching historical defects found.</p>';

  const answeredBy = result.modelSelection
    ? `<p class="pw-chat__answered-by">Answered by: ${esc(result.modelSelection.displayName)}</p>`
    : '';

  return `<p>${esc(result.suggestedRootCause)}</p>${matchesHtml}${answeredBy}`;
}

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('pw-chat-input');
  const sendBtn = document.getElementById('pw-chat-send');
  const description = input.value.trim();
  if (!description) return;

  appendMessage('user', esc(description));
  input.value = '';
  sendBtn.disabled = true;

  const typingEl = appendMessage('assistant', '<span class="chat-msg--typing">Matching against historical defects…</span>');

  try {
    const result = await fetchMatch(description, MODEL_PREFERENCE);
    typingEl.innerHTML = renderAssistantResult(result);
  } catch (err) {
    typingEl.innerHTML = `<span style="color:rgba(248,113,113,0.9)">${esc(err.message)}</span>`;
  } finally {
    sendBtn.disabled = false;
  }
}

let started = false;

export function initChat() {
  document.getElementById('pw-chat-form').addEventListener('submit', handleChatSubmit);
}

/**
 * Called by pipeline-demo.js's showScreen() whenever Window 6 becomes the
 * active screen (including landing there directly via restored wizard
 * state) — runs the deploy sequence and reveals the chat panel exactly
 * once per page load.
 */
export function revealChatIfNeeded() {
  if (started) return;
  started = true;
  runDeploySequence().then(() => { document.getElementById('pw-chat').hidden = false; });
}
