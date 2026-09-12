/**
 * Svarg — Landing Page Module (ChatGPT-style layout)
 *
 * Wires: auth-aware topbar and the hero prompt composer (try-before-login
 * entry point). The rail on the left is shared/rail.js.
 *
 * Loaded as <script type="module"> — runs after DOM is parsed.
 */

import { MATURITY_STAGES } from './data/maturityStages.js';
import { captureOutreachRef, outreachRef, clearOutreachRef, visitorId, recordVisit }
  from './shared/visitor.js';
import { voiceAvailable, createVoiceRecorder } from './shared/voiceInput.js?v=2';

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';
const OPEN_BLUEPRINT_KEY = 'soorgaai_open_blueprint_id';
/**
 * Ref capture and the visit beacon now live in shared/visitor.js, because this
 * file is loaded by cob.html and every tracked link lands on index.html. Both
 * pages call the same code; the ref survives the hop between them in
 * localStorage.
 *
 * Called again here rather than only on the marketing page: cob.html is also
 * reachable directly, and both functions are safe to run twice.
 */
captureOutreachRef();
recordVisit();

// New users have no UserProfile yet — detour through profile setup once,
// then on to the original destination. A failed check fails open (never
// let a broken profile lookup block someone who just authenticated).
async function redirectRespectingProfile(destination) {
    try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE()}/profile/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.status === 404) {
            window.location.href = `/profile-setup/profile.html?redirect=${encodeURIComponent(destination)}`;
            return;
        }
    } catch { /* fall through to destination */ }
    window.location.href = destination;
}

/**
 * Where a fresh login lands.
 *
 * Kept identical to login.js's computeLoginDestination and the OAuth
 * callback's, because signing in three different ways should not land you in
 * three different places. This one used to send people to '/', which was the
 * product home until the marketing site took that URL — after which anyone
 * signing in with an email code arrived at the marketing page instead of
 * their blueprints, while Google sign-in worked.
 *
 * It also ignored redirectAfterLogin, so a deep link that bounced someone to
 * log in was honoured for Google and dropped for email.
 */
function loginDestination() {
    try {
        const pending = localStorage.getItem('redirectAfterLogin');
        // Same-origin relative paths only. A pending redirect is attacker-
        // reachable through localStorage, and '//evil.example' is a valid
        // protocol-relative URL that would leave the site entirely.
        if (pending && pending.startsWith('/') && !pending.startsWith('//')
            && !new RegExp('^/*(https?|ftp|javascript):', 'i').test(pending)) {
            localStorage.removeItem('redirectAfterLogin');
            return pending;
        }
        // A guest preview waiting to be claimed onto this account —
        // domain.html's init() does the claim, so it has to load first.
        if (localStorage.getItem('soorgaai_guest_id')) return '/domain/domain.html';
    } catch { /* localStorage unavailable — fall through */ }
    return '/cob.html';
}

// Must match backend/trunida-backend/config/objectiveLimits.js — a soft guide
// here (never blocks typing/pasting) backed by a hard, clearly-messaged
// rejection server-side. No silent truncation either way.
const MAX_OBJECTIVE_LENGTH = 8000;
const OBJECTIVE_COUNTER_THRESHOLD = 0.85; // start showing the counter at 85% of the limit

/* v8 ignore next 10 */
document.addEventListener('DOMContentLoaded', () => {
    renderStages(MATURITY_STAGES, document.querySelector('.stages'));
    wirePrimaryCta();
    wireTopbarAuth();
    wireHeroPrompt();
    const authModal = wireAuthModal();
    wireCobConfluenceConnector(authModal?.open);
});

/**
 * "Log in or sign up" modal — opens from the topbar Log in button.
 * Google goes straight to OAuth. Email is passwordless: a 6-digit code is
 * sent to the address, and verifying it signs the user in (creating the
 * account on first use).
 */
export function wireAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    const stepEmail = document.getElementById('auth-step-email');
    const stepCode  = document.getElementById('auth-step-code');
    const errEl     = document.getElementById('auth-modal-error');
    let currentEmail = '';
    let resendTimer  = null;

    const showError = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };
    const hideError = () => { if (errEl) errEl.style.display = 'none'; };

    const showStep = (step) => {
        hideError();
        if (stepEmail) stepEmail.style.display = (step === 'email') ? '' : 'none';
        if (stepCode)  stepCode.style.display  = (step === 'code')  ? '' : 'none';
        (step === 'email'
            ? document.getElementById('auth-email')
            : document.getElementById('auth-code'))?.focus();
    };

    const open  = () => { modal.style.display = ''; showStep('email'); };
    const close = () => { modal.style.display = 'none'; clearInterval(resendTimer); };

    document.getElementById('topbar-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        open();
    });

    document.getElementById('auth-modal-close')?.addEventListener('click', close);
    document.getElementById('auth-modal-backdrop')?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') close();
    });

    document.getElementById('auth-google')?.addEventListener('click', () => {
        window.location.href = window.CONFIG?.AUTH?.OAUTH?.GOOGLE
            || `${API_BASE()}/auth/oauth/google`;
    });

    // 60s resend cooldown, mirroring the backend's per-email limit
    const startResendCooldown = () => {
        const btn = document.getElementById('auth-code-resend');
        if (!btn) return;
        let left = 60;
        btn.disabled = true;
        btn.textContent = `Resend code (${left}s)`;
        clearInterval(resendTimer);
        resendTimer = setInterval(() => {
            left -= 1;
            if (left <= 0) {
                clearInterval(resendTimer);
                btn.disabled = false;
                btn.textContent = 'Resend code';
            } else {
                btn.textContent = `Resend code (${left}s)`;
            }
        }, 1000);
    };

    const requestCode = async (email) => {
        const resp = await fetch(`${API_BASE()}/users/email-otp/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        if (!resp.ok) {
            const { msg } = await resp.json().catch(() => ({}));
            throw new Error(msg || 'Failed to send the code. Please try again.');
        }
        // 'console' means the server has no mail transport and wrote the code
        // to its log instead. Telling someone to check their email in that
        // case sends them looking for a message that does not exist.
        const { delivery } = await resp.json().catch(() => ({}));
        return delivery || 'sent';
    };

    // Step 1 — send the code (or hand Gmail addresses straight to Google)
    document.getElementById('auth-email-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        const email = document.getElementById('auth-email')?.value?.trim() || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        // Gmail accounts sign in with Google — same account, one less code
        const domain = email.split('@')[1].toLowerCase();
        if (domain === 'gmail.com' || domain === 'googlemail.com') {
            const base = window.CONFIG?.AUTH?.OAUTH?.GOOGLE || `${API_BASE()}/auth/oauth/google`;
            window.location.href = `${base}?login_hint=${encodeURIComponent(email)}`;
            return;
        }

        const btn = document.getElementById('auth-email-continue');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending code…'; }

        try {
            const delivery = await requestCode(email);
            currentEmail = email;
            const emailEl = document.getElementById('auth-code-email');
            if (emailEl) emailEl.textContent = email;
            const sub = document.querySelector('#auth-step-code .auth-modal__sub');
            if (sub && delivery === 'console') {
                sub.textContent = 'This server has no mail transport configured, so the code was written'
                    + ' to its log rather than emailed. It expires in 10 minutes.';
            }
            const codeInput = document.getElementById('auth-code');
            if (codeInput) codeInput.value = '';
            showStep('code');
            startResendCooldown();
        } catch (err) {
            showError(err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
        }
    });

    // Step 2 — verify the code, sign in, and continue
    document.getElementById('auth-code-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        const code = document.getElementById('auth-code')?.value?.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            showError('Enter the 6-digit code from the email.');
            return;
        }

        const btn = document.getElementById('auth-code-verify');
        if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }

        try {
            const resp = await fetch(`${API_BASE()}/users/email-otp/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail, code }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.msg || 'Verification failed. Please try again.');

            localStorage.setItem('token',    data.token);
            localStorage.setItem('userId',   data.userId);
            localStorage.setItem('username', data.username);
            localStorage.setItem('role',     data.role || 'user');

            await redirectRespectingProfile(loginDestination());
        } catch (err) {
            showError(err.message);
            if (btn) { btn.disabled = false; btn.textContent = 'Verify & continue'; }
        }
    });

    document.getElementById('auth-code-resend')?.addEventListener('click', async () => {
        hideError();
        try {
            await requestCode(currentEmail);
            startResendCooldown();
        } catch (err) {
            showError(err.message);
        }
    });

    document.getElementById('auth-code-back')?.addEventListener('click', () => {
        clearInterval(resendTimer);
        showStep('email');
    });

    return { open };
}

// The rail — Home, Blueprints (and their list), Knowledge sources, Privacy —
// is shared/rail.js now, the same element on every page. The sidebar, the
// flyout and the blueprint list that used to be wired here went with it.

/**
 * Topbar: signed-in visitors see their profile name with a dropdown
 * (workspace + log out) instead of the Log in button.
 */
export function wireTopbarAuth() {
    const wrap = document.getElementById('topbar-auth');
    if (!wrap) return;
    if (!localStorage.getItem('token')) return;

    const username = (localStorage.getItem('username') || 'Account').trim() || 'Account';
    const initial  = username.charAt(0).toUpperCase();

    wrap.innerHTML = `
        <div class="profile-menu">
            <button id="profile-btn" class="profile-btn" aria-haspopup="menu" aria-expanded="false">
                <span class="profile-avatar" aria-hidden="true"></span>
                <span class="profile-name"></span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="profile-dropdown" class="profile-dropdown" style="display:none" role="menu">
                <a href="/domain/domain.html" class="profile-dropdown__item" role="menuitem">My Blueprint</a>
                <button id="profile-logout" class="profile-dropdown__item profile-dropdown__item--danger" role="menuitem">Log out</button>
            </div>
        </div>`;

    // textContent keeps any odd characters in the stored name inert
    wrap.querySelector('.profile-avatar').textContent = initial;
    wrap.querySelector('.profile-name').textContent   = username;

    const btn      = document.getElementById('profile-btn');
    const dropdown = document.getElementById('profile-dropdown');
    const setOpen  = (open) => {
        if (dropdown) dropdown.style.display = open ? '' : 'none';
        btn?.setAttribute('aria-expanded', String(open));
    };

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(dropdown?.style.display === 'none');
    });
    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });

    document.getElementById('profile-logout')?.addEventListener('click', () => {
        [
            'token', 'username', 'userId', 'role', 'redirectAfterLogin',
            'soorgaai_blueprint_v1', 'soorgaai_blueprint_activity_v1',
            'soorgaai_executive_memory_v1', 'soorgaai_company_context_v1',
            'da_score', 'soorga_assessment_progress',
        ].forEach(k => localStorage.removeItem(k));
        window.location.reload();
    });
}

/**
 * Wire the hero prompt composer (try-before-login entry point).
 * Anonymous  → objective saved to sessionStorage, off to /try/try.html
 * Signed in  → same save, off to the workspace (its form prefills from it)
 */
/** How many bars the waveform draws. Odd, so one sits dead centre under the mic. */
const WAVE_BARS = 27;

/**
 * Chat and Speak, on one card.
 *
 * Speak is only offered when the server says transcription is configured AND
 * the browser can record. Everything else on this screen degrades to the Chat
 * panel, which is the panel that always works — a stranger who opens the page
 * never sees a control that cannot do anything.
 */
async function wireAnswerModes({ form, input, counter, errEl }) {
  const chatBtn  = document.getElementById('sv-mode-chat');
  const speakBtn = document.getElementById('sv-mode-speak');
  const chatPane = document.getElementById('sv-panel-chat');
  const speakPane = document.getElementById('sv-panel-speak');
  const mic = document.getElementById('sv-mic');
  const wave = document.getElementById('sv-wave');
  const stateEl = document.getElementById('sv-speak-state');
  const hintEl = document.getElementById('sv-speak-hint');
  if (!chatBtn || !speakBtn || !chatPane || !speakPane || !mic || !wave) return;

  const say = (msg) => {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = msg ? '' : 'none';
  };

  // Asked before the toggle is shown at all, and never awaited by anything the
  // page needs to paint.
  if (!(await voiceAvailable())) return;
  speakBtn.hidden = false;

  /**
   * A resting shape, not a flat line.
   *
   * At idle the panel is not claiming to hear anything, so a gentle static
   * waveform is honest and looks like a microphone rather than like a dead
   * control. The moment recording starts these are driven by the real signal,
   * and a flat line THEN is real information: nothing is reaching the mic.
   */
  const mid = (WAVE_BARS - 1) / 2;
  const restHeight = (i) => 4 + Math.round(Math.cos((i - mid) / mid * 1.35) * 7 + Math.sin(i * 1.7) * 2.5);

  const bars = [];
  for (let i = 0; i < WAVE_BARS; i += 1) {
    const b = document.createElement('span');
    b.className = 'sv-wave__bar';
    b.style.height = Math.max(3, restHeight(i)) + 'px';
    wave.appendChild(b);
    bars.push(b);
  }

  let idleTimer = 0;
  let phase = 0;

  const rest = () => bars.forEach((b, i) => { b.style.height = Math.max(3, restHeight(i)) + 'px'; });

  /**
   * A slow travelling swell while idle.
   *
   * Not pretending to hear anything — the panel says "Tap to speak" — but a
   * row of motionless dots reads as a broken control, and this is the one
   * screen where nothing may look broken.
   */
  function idleAnimate(on) {
    clearInterval(idleTimer);
    idleTimer = 0;
    if (!on) return;
    idleTimer = setInterval(() => {
      phase += 0.16;
      bars.forEach((b, i) => {
        const swell = Math.sin(phase + i * 0.42) * 0.5 + 0.5;
        b.style.height = (4 + restHeight(i) * 0.55 * (0.45 + swell * 0.55)).toFixed(1) + 'px';
      });
    }, 90);
  }

  function show(mode) {
    const speaking = mode === 'speak';
    chatBtn.classList.toggle('sv-mode--on', !speaking);
    speakBtn.classList.toggle('sv-mode--on', speaking);
    chatBtn.setAttribute('aria-selected', String(!speaking));
    speakBtn.setAttribute('aria-selected', String(speaking));
    chatPane.hidden = speaking;
    speakPane.hidden = !speaking;
    if (!speaking && recorder.isRecording()) recorder.stop();
    idleAnimate(speaking && !recorder.isRecording());
    if (!speaking) input.focus();
  }

  const recorder = createVoiceRecorder({
    /**
     * Bars taper from the centre, so the row reads as one shape rather than as
     * a wall. The level is the real microphone signal — a flat line means
     * nothing is being heard, which is information worth showing honestly.
     */
    onLevel: (level) => {
      for (let i = 0; i < bars.length; i += 1) {
        const falloff = 1 - Math.abs(i - mid) / (mid + 2);
        const jitter = 0.55 + Math.random() * 0.45;
        const h = 3 + level * falloff * jitter * 40;
        bars[i].style.height = h.toFixed(1) + 'px';
      }
    },
    onState: (st) => {
      mic.classList.toggle('sv-mic--live', st === 'recording');
      mic.disabled = st === 'working';
      if (stateEl) {
        stateEl.textContent = st === 'recording' ? 'Listening…'
          : st === 'working' ? 'Writing it down…'
          : 'Tap to speak';
      }
      if (hintEl) {
        hintEl.textContent = st === 'recording' ? 'Tap to finish'
          : st === 'working' ? 'One moment'
          : 'Describe it the way you would explain it to a colleague';
      }
      // Real levels while recording; the idle swell whenever it is not.
      idleAnimate(st !== 'recording');
      if (st === 'working') rest();
    },
    onError: say,
    onText: (text) => {
      // Appended, never replacing. Someone who typed half a sentence and then
      // spoke the rest meant to add to it, and silently discarding what they
      // had written would be the last time they pressed this.
      const existing = input.value.trim();
      input.value = existing ? existing + ' ' + text : text;
      autogrow(input);
      updateObjectiveCounter(input, counter);
      say('');
      // Straight back to the words, because the next thing anybody does is
      // read what was heard and fix a name.
      show('chat');
    },
  });

  chatBtn.addEventListener('click', () => show('chat'));

  /**
   * Picking Speak starts listening.
   *
   * The alternative is choosing Speak and then pressing a microphone, which is
   * two decisions for one intention. The browser still asks permission the
   * first time, so nothing records without consent — and if that is refused,
   * onError says so and the panel falls back to its resting state.
   */
  speakBtn.addEventListener('click', () => {
    say('');
    show('speak');
    if (!recorder.isRecording()) recorder.start();
  });

  mic.addEventListener('click', () => recorder.toggle());
}

export function wireHeroPrompt() {
    const form     = document.getElementById('hero-prompt-form');
    const input    = document.getElementById('hero-objective');
    const errEl    = document.getElementById('hero-prompt-error');
    const counter  = document.getElementById('hero-objective-counter');
    if (!form || !input) return;

    // Example prompt card fills the input
    /**
     * The example, demonstrated rather than displayed.
     *
     * It used to sit on the page as a 90-word block — the largest thing to read
     * on a screen whose whole problem was too much to read, and still 3 of the
     * first 12 strangers typed something unusable into the box beneath it.
     * Pressing it fills the field, which is the only way an example actually
     * teaches anything.
     */
    const example = document.getElementById('example-card');
    const exampleText = document.getElementById('sv-example');
    example?.addEventListener('click', () => {
        input.value = (exampleText?.innerHTML || '').replace(/\s+/g, ' ').trim();
        autogrow(input);
        updateObjectiveCounter(input, counter);
        input.focus();
    });

    wireAnswerModes({ form, input, counter, errEl });

    // ChatGPT-style input: grow with content, Enter submits, Shift+Enter = newline
    input.addEventListener('input', () => {
        autogrow(input);
        updateObjectiveCounter(input, counter);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const objective = input.value.trim();
        if (!objective) {
            if (errEl) {
                errEl.textContent = 'Tell us about your project first.';
                errEl.style.display = '';
            }
            input.focus();
            return;
        }
        if (objective.length > MAX_OBJECTIVE_LENGTH) {
            if (errEl) {
                errEl.textContent = `Your objective is ${objective.length.toLocaleString()} characters — please trim it to ${MAX_OBJECTIVE_LENGTH.toLocaleString()} or fewer. Nothing you typed has been lost; edit and resubmit.`;
                errEl.style.display = '';
            }
            input.focus();
            return;
        }
        if (errEl) errEl.style.display = 'none';

        const sendBtn = form.querySelector('.prompt__send');
        if (sendBtn) sendBtn.disabled = true;

        try {
            const token = localStorage.getItem('token');
            if (token) {
                sessionStorage.removeItem(OPEN_BLUEPRINT_KEY);
                const resp = await fetch(`${API_BASE()}/strategy-canvas/generate-transformation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ businessObjective: objective }),
                });
                if (resp.status === 401) {
                    // Stale session — restart as anonymous
                    localStorage.removeItem('token');
                    window.location.reload();
                    return;
                }
                if (resp.status === 402) {
                    // A plan boundary, not a failure. Retrying will not help,
                    // so show the limit and where it is lifted.
                    const body = await resp.json().catch(() => ({}));
                    if (errEl) {
                        errEl.textContent = body.error || 'You have reached a limit on your plan.';
                        const link = document.createElement('a');
                        link.href = '/pricing/pricing.html';
                        link.className = 'prompt__error-link';
                        link.textContent = body.upgradeLabel
                            ? `See what ${body.upgradeLabel} includes →` : 'See the plans →';
                        errEl.appendChild(document.createTextNode(' '));
                        errEl.appendChild(link);
                        errEl.style.display = '';
                    }
                    if (sendBtn) sendBtn.disabled = false;
                    return;
                }
                if (!resp.ok) {
                    const { error } = await resp.json().catch(() => ({}));
                    throw new Error(error || 'Failed to start generation. Please try again.');
                }
            } else {
                const resp = await fetch(`${API_BASE()}/guest/generate-blueprint`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // ref comes from ?ref= on a cold email's link, stashed on
                    // arrival. Without it a prospect who was emailed is
                    // indistinguishable from a stranger who found the site.
                    body: JSON.stringify({ businessObjective: objective, ref: outreachRef(), visitorId: visitorId() }),
                });
                if (!resp.ok) {
                    const { error } = await resp.json().catch(() => ({}));
                    throw new Error(error || 'Failed to start generation. Please try again.');
                }
                const { guestId } = await resp.json();
                localStorage.setItem('soorgaai_guest_id', guestId);
                // Spent. A ref belongs to one prospect and one visit; left in
                // place it would keep crediting every later preview from this
                // browser to the same cold email, which is worse than no
                // attribution because it reads as a result.
                clearOutreachRef();
            }

            // Straight into the blueprint view — it renders live, filling in
            // capabilities as they complete. Guests have no profile to check
            // (no token at all); logged-in users get the same profile-setup
            // safety net as the other auth entry points.
            // ?view=cob so the destination is explicit rather than inferred
            // from blueprint state — and so a returning user with an already
            // approved blueprint still lands on the run they just started
            // instead of being bounced to the workspace.
            if (token) {
                await redirectRespectingProfile('/domain/domain.html?view=cob');
            } else {
                window.location.href = '/domain/domain.html?view=cob';
            }

        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message;
                errEl.style.display = '';
            }
            if (sendBtn) sendBtn.disabled = false;
        }
    });
}

/**
 * Confluence connector — connect-only (no blueprint exists yet at
 * objective-entry time to attach specific pages to; picking pages stays
 * in the existing post-generation Knowledge Sources flow). Requires an
 * authenticated user (OAuth connections are per-user), so a guest who
 * clicks this is sent to the login modal instead of the API.
 */
function wireCobConfluenceConnector(openAuthModal) {
    const badge   = document.getElementById('confluence-connect-badge');
    const site    = document.getElementById('confluence-connect-site');
    const btn     = document.getElementById('confluence-connect-btn');
    const errEl   = document.getElementById('confluence-connect-error');
    if (!btn) return;

    const showError = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };

    const params = new URLSearchParams(window.location.search);
    if (params.has('personalConnected') || params.has('error')) {
        if (params.get('error')) showError(params.get('error'));
        window.history.replaceState({}, '', window.location.pathname);
    }

    async function refreshStatus() {
        const token = localStorage.getItem('token');
        if (!token) return; // stays in the not-connected/prompt-login state
        try {
            // A company website grounds the blueprint just as a Confluence
            // connection does. Checking only Confluence meant a customer who
            // had given us their website — and who may have no Confluence at
            // all — was still asked to connect one.
            const [conf, siteRes] = await Promise.all([
                fetch(`${API_BASE()}/confluence/personal/status`, { headers: { Authorization: `Bearer ${token}` } })
                    .then(r => (r.ok ? r.json() : { connected: false })).catch(() => ({ connected: false })),
                fetch(`${API_BASE()}/website/company`, { headers: { Authorization: `Bearer ${token}` } })
                    .then(r => (r.ok ? r.json() : { pages: [] })).catch(() => ({ pages: [] })),
            ]);

            const pages = (siteRes.pages || []).length;
            if (conf.connected) {
                if (site) site.textContent = conf.siteName || 'Confluence';
                if (badge) badge.style.display = 'flex';
                btn.style.display = 'none';
            } else if (pages > 0) {
                // Name what they actually connected, not a tool they don't use.
                let host = siteRes.websiteUrl || '';
                try { host = new URL(siteRes.websiteUrl).hostname; } catch { /* keep as-is */ }
                if (site) site.textContent = host || 'your website';
                if (badge) badge.style.display = 'flex';
                btn.style.display = 'none';
            }
        } catch { /* leave the connect button showing */ }
    }

    btn.addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            openAuthModal?.();
            return;
        }
        if (errEl) errEl.style.display = 'none';
        btn.disabled = true;
        try {
            const resp = await fetch(`${API_BASE()}/confluence/personal/connect?returnTo=cob`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!resp.ok) {
                const { error } = await resp.json().catch(() => ({}));
                throw new Error(error || 'Failed to start the Confluence connection.');
            }
            const { url } = await resp.json();
            window.location.href = url;
        } catch (err) {
            showError(err.message);
            btn.disabled = false;
        }
    });

    refreshStatus();
}

function autogrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

// Soft guidance only — never blocks typing/pasting. Stays hidden until the
// user is actually approaching the limit, so it doesn't nag short objectives.
function updateObjectiveCounter(input, counterEl) {
    if (!counterEl) return;
    const len = input.value.length;
    if (len < MAX_OBJECTIVE_LENGTH * OBJECTIVE_COUNTER_THRESHOLD) {
        counterEl.style.display = 'none';
        return;
    }
    counterEl.style.display = '';
    counterEl.textContent = `${len.toLocaleString()} / ${MAX_OBJECTIVE_LENGTH.toLocaleString()} characters`;
    counterEl.classList.toggle('prompt__counter--over', len > MAX_OBJECTIVE_LENGTH);
}

/**
 * Render maturity stages into the given container.
 * The ChatGPT-style landing no longer shows stages, but the renderer is
 * kept (and still exported) for the framework page and unit tests.
 *
 * @param {Array}       stages    - Array of stage objects (from MATURITY_STAGES)
 * @param {HTMLElement} container - The <ol> element to populate
 */
export function renderStages(stages, container) {
    if (!container) return;

    container.innerHTML = ''; // Idempotent — clear before re-render

    const fragment = document.createDocumentFragment();

    [...stages].reverse().forEach(stage => {
        const li = document.createElement('li');
        li.className = 'stage-item';
        li.style.setProperty('--stage-color', stage.color || '#5CC5A7');
        li.setAttribute('data-stage-id', stage.id ?? '');

        li.innerHTML = `
            <div class="stage-item__num" aria-hidden="true">${stage.id ?? ''}</div>
            <div class="stage-item__body">
                <strong class="stage-item__name">${stage.name ?? ''}</strong>
                <span class="stage-item__desc">${stage.descriptor ?? ''}</span>
            </div>
        `;

        fragment.appendChild(li);
    });

    container.appendChild(fragment);
}

/**
 * Set the primary CTA href from the shared SoorgaAuth helper
 * and attach analytics instrumentation to all [data-cta] elements.
 * Exported for unit testing.
 */
export function wirePrimaryCta() {
    const cta = document.getElementById('primaryCta');
    if (!cta) return;

    if (window.SoorgaAuth) {
        cta.href = window.SoorgaAuth.getRoadmapHref();
    }

    // Instrument clicks for future analytics EPIC
    document.querySelectorAll('[data-cta]').forEach(el => {
        el.addEventListener('click', () => {
            console.log(`[CTA] ${el.dataset.cta} clicked`);
        });
    });
}
