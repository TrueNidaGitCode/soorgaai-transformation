/**
 * SoorgaAI — Profile Setup Page
 *
 * Guards: if no JWT → redirect to login.
 * On submit: POST /api/profile → redirect to /workspace/workspace.html.
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

  // If profile already exists, skip setup
  try {
    const resp = await fetch(`${API}/profile/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (resp.ok) {
      window.location.href = '/workspace/workspace.html';
      return;
    }
  } catch { /* network error — continue to form */ }

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

      window.location.href = '/workspace/workspace.html';

    } catch (err) {
      showError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  });
});
