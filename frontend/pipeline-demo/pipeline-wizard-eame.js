/**
 * Svarg — Pipeline Wizard: Window 5's real Eame — GitHub delivery
 *
 * Eame doesn't preview a snippet — it pushes the real, working
 * defect-matching project (see backend's services/eameProjectBuilder.js)
 * to the user's own GitHub via a dedicated OAuth connection (separate
 * from the Confluence/Jira one, different scope entirely).
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
  const pushBtn = document.getElementById('pw-eame-push-btn');
  const repoName = document.getElementById('pw-eame-repo-name').value.trim() || 'defect-matching-agent';
  const isPrivate = document.getElementById('pw-eame-private').checked;

  hideError();
  saveEameState({ repoName, isPrivate });

  pushBtn.disabled = true;
  pushBtn.textContent = 'Pushing…';
  try {
    const result = await api('/github/personal/push-project', {
      method: 'POST',
      body: JSON.stringify({ repoName, isPrivate }),
    });
    renderResult(result);
    saveEameState({ pushResult: result });
  } catch (err) {
    showError(err.message);
  } finally {
    pushBtn.disabled = false;
    pushBtn.textContent = 'Push to GitHub';
  }
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
