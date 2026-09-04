/**
 * Svarg — Profile Setup Page
 *
 * Guards: if no JWT → redirect to login.
 * On submit: POST /api/profile → redirect to /domain/domain.html.
 */

const API = window.CONFIG?.AUTH?.VERIFY
  ? window.CONFIG.API_BASE
  : (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login/login.html?redirect=/profile-setup/profile.html';
  }
}

// ── ?redirect= — where to send the user once setup is done ───────────────────
// Same-origin-only guard, matching login.js's getValidRedirect(). Persisted to
// sessionStorage before leaving for the Confluence OAuth round-trip, since
// Atlassian's return doesn't carry our query params back.
const REDIRECT_STORAGE_KEY = 'soorgaai_profile_redirect';

// Where someone lands after completing setup, when nothing better is known.
// Cob is the product entry point and matches login.js's own default.
const DEFAULT_DESTINATION = '/cob.html';

// Marketing pages are never a sensible destination for someone who has just
// finished onboarding. They arrive here carrying whichever page they logged
// in from — usually the landing page, '/' — and honouring that drops a brand
// new user back on the marketing site instead of into the product.
const NOT_A_DESTINATION = new Set(['/', '/index.html']);

function getValidRedirect(raw) {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/^\/*(https?|ftp|javascript):/i.test(raw)) return null;
  if (NOT_A_DESTINATION.has(raw.split('?')[0])) return null;
  return raw;
}

function resolveRedirectTarget() {
  const fromQuery = getValidRedirect(new URLSearchParams(window.location.search).get('redirect'));
  if (fromQuery) {
    sessionStorage.setItem(REDIRECT_STORAGE_KEY, fromQuery);
    return fromQuery;
  }
  return getValidRedirect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)) || DEFAULT_DESTINATION;
}

function showError(msg) {
  const el = document.getElementById('profile-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError() {
  const el = document.getElementById('profile-error');
  el.style.display = 'none';
}

function setLoading(on) {
  const btn    = document.getElementById('profile-submit');
  const text   = btn.querySelector('.button-text');
  const loader = btn.querySelector('.button-loader');
  btn.disabled       = on;
  text.style.display = on ? 'none' : 'block';
  loader.style.display = on ? 'flex' : 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth();

  const redirectTarget = resolveRedirectTarget();

  // If profile already exists, skip setup
  try {
    const resp = await fetch(`${API}/profile/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (resp.ok) {
      window.location.href = redirectTarget;
      return;
    }
  } catch { /* network error — continue to form */ }

  initConnectorCards();

  const form = document.getElementById('profile-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const orgName = document.getElementById('orgName').value.trim();

    if (!orgName) {
      showError('Organisation name is required.');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${API}/profile`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ orgName }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        showError(data.error || 'Failed to save profile. Please try again.');
        setLoading(false);
        return;
      }

      // Reading the site takes a few seconds, so say what is happening
      // rather than leaving the button spinning on "saving".
      // Optional field, and optional element: the profile must still save on
      // any page that does not render it.
      const websiteUrl = document.getElementById('websiteUrl')?.value.trim() || '';
      if (websiteUrl) {
        const hint = document.getElementById('website-hint');
        if (hint) hint.textContent = 'Reading your website…';
        try {
          const siteResp = await fetch(`${API}/website/company`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
            body:    JSON.stringify({ url: websiteUrl }),
          });
          const siteData = await siteResp.json().catch(() => ({}));
          if (!siteResp.ok) {
            // The profile is already saved, so this is not a failure of the
            // form — let them fix the address or move on without it.
            showError(`${siteData.error || 'Could not read that website.'} Your profile was saved — you can continue without it.`);
            if (hint) hint.textContent = '';
            setLoading(false);
            return;
          }
          const read = (siteData.results || []).filter(r => r.status !== 'error').length;
          if (hint) hint.textContent = `Read ${read} page${read === 1 ? '' : 's'} from your site.`;
        } catch {
          showError('Could not reach your website. Your profile was saved — you can continue without it.');
          if (hint) hint.textContent = '';
          setLoading(false);
          return;
        }
      }

      window.location.href = redirectTarget;

    } catch (err) {
      showError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  });
});

// ── Connector cards ────────────────────────────────────────────────────────
// Optional and non-blocking — connecting never gates submitting the org-name
// form above it. Only Confluence is wired up; GitHub/SharePoint are shown
// disabled ("Coming soon") and have no click handlers.

function setConnectorStatus(text, kind) {
  const el = document.getElementById('connector-confluence-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind || '';
}

async function initConnectorCards() {
  const btn = document.getElementById('connector-confluence');
  if (!btn) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) {
    setConnectorStatus('Connection failed — try again', 'error');
  }

  btn.addEventListener('click', async () => {
    setConnectorStatus('Connecting…', 'progress');
    btn.disabled = true;
    try {
      const resp = await fetch(`${API}/confluence/personal/connect?returnTo=profile-setup`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Could not start Confluence connection.');
      window.location.href = data.url;
    } catch (err) {
      setConnectorStatus('Connect', '');
      btn.disabled = false;
      showError(err.message);
    }
  });

  // Check status regardless of how the page was reached — covers both a
  // fresh return from the OAuth round-trip and revisiting with an existing
  // connection. Skipped only when we just showed an OAuth error above.
  if (!params.get('error')) {
    try {
      const status = await fetch(`${API}/confluence/personal/status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }).then(r => r.json());

      if (status.connected) {
        setConnectorStatus('In progress…', 'progress');
        const spacesResp = await fetch(`${API}/confluence/personal/spaces`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const { spaces } = await spacesResp.json().catch(() => ({ spaces: [] }));
        setConnectorStatus(`Connected — ${spaces?.length || 0} space${spaces?.length === 1 ? '' : 's'} found`, 'success');
        btn.disabled = true;
      }
    } catch { /* non-critical — card just keeps showing "Connect" */ }
  }
}
