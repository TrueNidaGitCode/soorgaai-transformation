/**
 * __APP_NAME__ — chat front end
 *
 * One conversation surface over the defect-matching API. Each turn sends the
 * description to /api/defect-matching/match and renders what comes back: a
 * drafted root cause, and the historical defects it was drawn from.
 *
 * The matches are shown, not just the conclusion — a root cause with no
 * evidence behind it is a guess the reader cannot check.
 */

const API = (window.CONFIG && window.CONFIG.API_BASE) || '';

const log     = document.getElementById('ch-log');
const form    = document.getElementById('ch-form');
const input   = document.getElementById('ch-input');
const sendBtn = document.getElementById('ch-send');
const state   = document.getElementById('ch-state');

let token = localStorage.getItem('token') || '';
let busy = false;

function esc(t) {
  return String(t ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setState(text, ok) {
  state.innerHTML = `<span class="ch-head__dot${ok ? ' ch-head__dot--ok' : ''}"></span>${esc(text)}`;
}

/**
 * A session for this browser. The deployment mints one when public access is
 * enabled; when it is not, the app says so plainly rather than failing on
 * every message with an unexplained 401.
 */
async function ensureSession() {
  if (token) { setState('Ready', true); return true; }
  try {
    const res = await fetch(`${API}/api/session`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      token = data.token;
      localStorage.setItem('token', token);
      setState('Ready', true);
      return true;
    }
    if (res.status === 403) {
      setState('Sign-in required', false);
      addNotice('This deployment requires a sign-in token. Paste one into local storage as `token`, or enable public access on the server.');
      return false;
    }
  } catch { /* falls through to the offline notice */ }
  setState('Offline', false);
  addNotice('Could not reach the server.');
  return false;
}

function clearWelcome() {
  document.querySelector('.ch-welcome')?.remove();
}

function addUser(text) {
  clearWelcome();
  const el = document.createElement('div');
  el.className = 'ch-turn ch-turn--user';
  el.innerHTML = `<div class="ch-bubble">${esc(text)}</div>`;
  log.appendChild(el);
  scroll();
}

function addNotice(text) {
  const el = document.createElement('div');
  el.className = 'ch-notice';
  el.textContent = text;
  log.appendChild(el);
  scroll();
}

function addThinking() {
  const el = document.createElement('div');
  el.className = 'ch-turn ch-turn--bot';
  el.id = 'ch-thinking';
  el.innerHTML = `<div class="ch-bubble ch-bubble--thinking">
    <span class="ch-dot"></span><span class="ch-dot"></span><span class="ch-dot"></span>
    <span class="ch-thinking__text">Searching your defect records…</span>
  </div>`;
  log.appendChild(el);
  scroll();
  return el;
}

/** The answer, with the records it came from underneath it. */
function addAnswer({ rootCause, matches }) {
  const el = document.createElement('div');
  el.className = 'ch-turn ch-turn--bot';

  const cards = (matches || []).map(m => {
    const score = typeof m.score === 'number' ? Math.round(m.score * 100) : null;
    return `
      <li class="ch-match">
        <div class="ch-match__head">
          <span class="ch-match__id">${esc(m.defectId || m.id || 'Record')}</span>
          ${score !== null ? `<span class="ch-match__score">${score}% match</span>` : ''}
        </div>
        <p class="ch-match__title">${esc(m.title || m.summary || '')}</p>
        ${m.rootCause ? `<p class="ch-match__cause"><span>Root cause:</span> ${esc(m.rootCause)}</p>` : ''}
      </li>`;
  }).join('');

  el.innerHTML = `
    <div class="ch-bubble">
      ${rootCause ? `<p class="ch-answer">${esc(rootCause)}</p>` : `<p class="ch-answer">No root cause could be drafted from the records available.</p>`}
      ${cards ? `
        <p class="ch-matches__label">Based on ${(matches || []).length} similar defect${matches.length === 1 ? '' : 's'}</p>
        <ul class="ch-matches">${cards}</ul>` : ''}
    </div>`;
  log.appendChild(el);
  scroll();
}

function scroll() {
  log.scrollTop = log.scrollHeight;
}

async function send(text) {
  if (busy || !text.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  addUser(text);
  input.value = '';
  autoGrow();

  const thinking = addThinking();

  try {
    if (!token && !(await ensureSession())) throw new Error('No session.');

    const res = await fetch(`${API}/api/defect-matching/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ description: text }),
    });

    thinking.remove();

    if (res.status === 401) {
      // The stored token has expired; drop it and try once with a fresh one.
      localStorage.removeItem('token');
      token = '';
      if (await ensureSession()) return send(text);
      throw new Error('Session expired.');
    }
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `The request failed (${res.status}).`);
    }

    const data = await res.json();
    addAnswer({
      rootCause: data.rootCause || data.suggestedRootCause,
      matches: data.matches || data.results || [],
    });
  } catch (err) {
    document.getElementById('ch-thinking')?.remove();
    addNotice(err.message || 'Something went wrong.');
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function autoGrow() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';
}

form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
input.addEventListener('input', autoGrow);
// Enter sends, Shift+Enter makes a new line — what a chat box is expected
// to do, and the reason the textarea is not a plain input.
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
});
document.getElementById('ch-examples')?.addEventListener('click', (e) => {
  const b = e.target.closest('.ch-example');
  if (b) send(b.textContent.trim());
});

ensureSession();
input.focus();
