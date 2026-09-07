/**
 * Svarg — Pipeline Wizard: Window 5's real Eame — GitHub delivery
 *
 * SUPERSEDED. This window pushed the built project to the user own GitHub.
 * Delivery now goes to a repository Svarg owns (controllers/deliveryController.js)
 * because Railway GitHub App is installed once on Svarg account and can build
 * from there; the customer copy is a zip download. The push endpoint this
 * called is gone, and nothing links to this page — it is a deletion candidate,
 * kept only so the demo still loads.
 *
 * Selection state (repo name, private toggle, push result) mirrors into
 * the wizard's shared sessionStorage state — same pattern Window 3's Jira
 * flow uses — so a reload doesn't lose an in-progress choice or a
 * completed push.
 */

const API_BASE = window.CONFIG?.API_BASE || 'http://localhost:3000/api';
const getToken = () => localStorage.getItem('token');

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let wizardState = null;
let persistWizardState = () => {};

function eameState() {
  wizardState.eame = wizardState.eame || { repoName: 'defect-matching-agent', isPrivate: false, pushResult: null };
  return wizardState.eame;
}

function saveEameState(patch) {
  Object.assign(eameState(), patch);
  persistWizardState(wizardState);
}

function showError(message) {
  const el = document.getElementById('pw-eame-error');
  el.textContent = message;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('pw-eame-error').style.display = 'none';
}

function renderResult(result) {
  document.getElementById('pw-eame-file-count').textContent = result.fileCount;
  const link = document.getElementById('pw-eame-repo-link');
  link.href = result.repoUrl;
  link.textContent = result.repoUrl.replace('https://github.com/', '');
  const resultEl = document.getElementById('pw-eame-result');
  resultEl.style.display = 'block';
  resultEl.classList.remove('pw-reveal');
  void resultEl.offsetWidth;
  resultEl.classList.add('pw-reveal');
}

async function handlePush() {
  // Delivery no longer goes to the customer own GitHub. Eame publishes to a
  // repository Svarg owns (POST /api/delivery/publish) so Railway can build
  // from it, and the customer copy is the zip from /api/delivery/download.
  //
  // This demo window predates that and has no blueprint to publish, so there
  // is nothing to call. Left saying so rather than removed, because a button
  // that silently does nothing reads as a bug.
  showError("Delivery has moved: Eame now publishes to Svarg own repository. "
    + "Run it from the Yusu screen, which has the blueprint this page lacks.");
}

function wireConnectButton() {
  document.getElementById('pw-eame-connect-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    btn.textContent = 'Connecting…';
    try {
      const { url } = await api('/github/personal/connect');
      window.location.href = url;
    } catch (err) {
      showError(err.message);
    }
  });
}

export async function initEameConnector(state, persist) {
  wizardState = state;
  persistWizardState = persist;

  wireConnectButton();
  document.getElementById('pw-eame-push-btn').addEventListener('click', handlePush);

  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) showError(params.get('error'));

  try {
    const status = await api('/github/personal/status');
    if (!status.connected) {
      document.getElementById('pw-eame-not-connected').style.display = 'block';
      return;
    }

    document.getElementById('pw-eame-not-connected').style.display = 'none';
    document.getElementById('pw-eame-push-form').style.display = 'block';
    document.getElementById('pw-eame-github-login').textContent = status.githubLogin;
    document.getElementById('pw-eame-repo-name').value = esc(eameState().repoName);
    document.getElementById('pw-eame-private').checked = !!eameState().isPrivate;

    if (eameState().pushResult) renderResult(eameState().pushResult);
  } catch (err) {
    showError(err.message);
  }
}
