/**
 * Svarg — Chat with Cob / Aria / Arth / Eame / Yusu
 *
 * Each `.sc-lane[data-screen]` holds the character portrait, a launcher
 * button, and a chat panel. Opening the chat hides the portrait and shows
 * the panel in its place, so the character appears to start talking.
 *
 * Backed by POST /api/strategy-canvas/screen-chat. The server owns all
 * context (opportunities, datasets, what's connected) — this module sends
 * only the message and the visible history.
 *
 * Actions: the reply may carry { action: { type, label } }. It is rendered
 * as a button the user must click; nothing happens automatically. Clicking
 * calls the same endpoints the screen's own buttons use, so a chat-driven
 * approval is exactly as authorised as one made from the UI.
 */

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Blueprint id is resolved the same way the rest of the screen does it.
function getBlueprintId() {
  return window.SVARG_BLUEPRINT_ID || sessionStorage.getItem('soorgaai_open_blueprint_id') || null;
}

const GREETINGS = {
  cob: "I'm Cob. I picked the recommended starting point for you — ask me why, or how it compares to the other options.",
  aria: "I'm Aria. I map the data this use case needs. Ask me what's missing, or what happens to the data we can't connect.",
  arth: "I'm Arth. I work out what this use case should run on. Ask me how the model classes differ, or which one fits your constraints.",
  eame: "I'm Eame. I build the application itself. Ask me what's in the project, how to run it, or what happens when you deploy it.",
  yusu: "I'm Yusu. I put it live and hand it over. Ask me what's still outstanding, or what you own once it's running.",
};

const PLACEHOLDER_BUSY = {
  cob: 'Cob is thinking…',
  aria: 'Aria is thinking…',
  arth: 'Arth is thinking…',
  eame: 'Eame is thinking…',
  yusu: 'Yusu is thinking…',
};

class ScreenChat {
  constructor(lane) {
    this.lane = lane;
    this.screen = lane.dataset.screen;
    this.panel = lane.querySelector('.sc-panel');
    this.portrait = lane.querySelector('.sc-portrait');
    this.launcher = lane.querySelector('.sc-launcher');
    this.log = lane.querySelector('[data-sc-log]');
    this.form = lane.querySelector('[data-sc-form]');
    this.input = lane.querySelector('[data-sc-input]');
    this.sendBtn = lane.querySelector('[data-sc-send]');
    this.history = [];
    this.sending = false;
    // Tracked separately from `history` on purpose. The greeting is UI chrome,
    // not a turn the model produced, so it must not be sent back as context —
    // but it still has to be remembered, or reopening the panel greets again.
    this.greeted = false;

    this.launcher.addEventListener('click', () => this.open());
    lane.querySelector('[data-sc-close]').addEventListener('click', () => this.close());
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });

    // Enter sends, Shift+Enter newlines — same convention as the workspace
    // assistant, so the two chats don't behave differently.
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    this.input.addEventListener('input', () => this.autoGrow());

    this.log.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sc-action]');
      if (btn) this.runAction(btn.dataset.scAction, btn);
    });
  }

  autoGrow() {
    this.input.style.height = 'auto';
    this.input.style.height = Math.min(this.input.scrollHeight, 110) + 'px';
  }

  open() {
    this.panel.hidden = false;
    this.lane.classList.add('sc-lane--open');
    // Greet once per page load. The old guard tested `history`, which the
    // greeting never joins — so every close-and-reopen appended another copy
    // and the panel filled with Cob introducing himself to someone who had
    // been talking to him for a while.
    if (!this.greeted) {
      this.append('bot', GREETINGS[this.screen]);
      this.greeted = true;
    }
    setTimeout(() => this.input.focus(), 60);
  }

  close() {
    this.panel.hidden = true;
    this.lane.classList.remove('sc-lane--open');
  }

  append(role, text, action) {
    const wrap = document.createElement('div');
    wrap.className = `sc-msg sc-msg--${role}`;
    // Model output is inserted as escaped text, never as markup.
    wrap.innerHTML = `<div class="sc-msg__body">${esc(text).replace(/\n/g, '<br>')}</div>`;
    if (action) {
      wrap.innerHTML += `<button type="button" class="sc-action" data-sc-action="${esc(action.type)}">${esc(action.label)}</button>`;
    }
    this.log.appendChild(wrap);
    this.log.scrollTop = this.log.scrollHeight;
    return wrap;
  }

  setBusy(busy) {
    this.sending = busy;
    this.sendBtn.disabled = busy;
    this.input.disabled = busy;
  }

  async send() {
    const message = this.input.value.trim();
    if (!message || this.sending) return;

    this.input.value = '';
    this.autoGrow();
    this.append('user', message);
    this.history.push({ role: 'user', content: message });
    this.setBusy(true);

    const pending = this.append('bot', PLACEHOLDER_BUSY[this.screen]);
    pending.classList.add('sc-msg--pending');

    try {
      const resp = await fetch(`${API_BASE}/strategy-canvas/screen-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          blueprintId: getBlueprintId(),
          screen: this.screen,
          message,
          conversationHistory: this.history.slice(0, -1),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      pending.remove();

      if (!resp.ok) {
        this.append('error', data.error || `Couldn't reach the chat service (${resp.status}).`);
        return;
      }

      this.append('bot', data.reply, data.action);
      this.history.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      pending.remove();
      this.append('error', err.message || 'Network error. Please try again.');
    } finally {
      this.setBusy(false);
      this.input.focus();
    }
  }

  // Actions are never performed by the model — this only runs on a click,
  // and calls the same endpoints the screen's own controls use.
  async runAction(type, btn) {
    btn.disabled = true;
    btn.textContent = 'Working…';

    try {
      if (type === 'approve_opportunity') {
        const id = getBlueprintId();
        const resp = await fetch(`${API_BASE}/strategy-canvas/transformation-blueprint/${id}/approve-opportunity`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!resp.ok) throw new Error('Approval failed. Please use the Approve button instead.');
        btn.textContent = 'Approved ✓';
        // Same destination the screen's own Approve button leads to.
        setTimeout(() => { window.location.href = '/domain/domain.html?view=aria'; }, 700);
        return;
      }

      if (type === 'connect_confluence' || type === 'connect_jira') {
        const source = type === 'connect_confluence' ? 'confluence' : 'jira';
        window.location.href = `/domain/domain.html?view=aria&connect=${source}`;
        return;
      }

      const ARTH_PREF = {
        choose_frontier:    'frontier',
        choose_open_weight: 'open-weight',
        choose_auto:        'auto',
      };
      if (ARTH_PREF[type]) {
        document.dispatchEvent(new CustomEvent('arth:choose', { detail: { preference: ARTH_PREF[type] } }));
        btn.textContent = 'Selected ✓';
        this.close();
        return;
      }

      throw new Error('That action is not available.');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Try again';
      this.append('error', err.message);
    }
  }
}

// Only wire lanes that actually carry a launcher — constructing against a
// lane without one threw on load and took the rest of this module's setup
// with it.
document.querySelectorAll('.sc-lane').forEach(lane => {
  if (lane.querySelector('.sc-launcher')) new ScreenChat(lane);
});
