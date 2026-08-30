/**
 * Svarg — Pipeline Wizard: Window 3's real Jira connector
 *
 * Reuses the SAME PersonalConfluenceConnection Window 1 establishes — one
 * Atlassian OAuth grant covers both products (see
 * backend/.../services/atlassianAuthService.js). There's no separate
 * connect/callback here; this module only reads jiraScopeGranted off the
 * existing connection status and, once granted, lists projects/issues and
 * submits selected issues to /api/jira/personal/link, which fetches +
 * redacts + LLM-structures each one into a real DefectRecord.
 *
 * Selection state (chosen project, checked issues, processed results) is
 * mirrored into the wizard's shared sessionStorage state (passed in from
 * pipeline-demo.js) as it changes, and restored on init — otherwise a page
 * reload (e.g. returning from the Atlassian OAuth redirect) silently wiped
 * whatever the user had picked, forcing them to redo it.
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

function jiraState() {
  wizardState.jira = wizardState.jira || { projectKey: null, checkedIssueKeys: [], processingResults: null };
  return wizardState.jira;
}

function saveJiraState(patch) {
  Object.assign(jiraState(), patch);
  persistWizardState(wizardState);
}

const SECTIONS = ['pw-jira-scope-missing', 'pw-jira-not-connected', 'pw-jira-projects', 'pw-jira-issues'];

function showOnly(id) {
  SECTIONS.forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = sid === id ? 'block' : 'none';
  });
}

function showError(message) {
  const el = document.getElementById('pw-jira-error');
  el.textContent = message;
  el.style.display = 'block';
}

function renderProjects(projects) {
  const list = document.getElementById('pw-jira-project-list');
  list.innerHTML = projects.map((p, i) => `
    <div class="ks-space-item ks-space-item--row pw-reveal" style="--i:${i}">
      <div class="ks-space-item__info">
        <span class="ks-space-item__name">${esc(p.name)}</span>
        <span class="ks-space-key">${esc(p.key)}</span>
      </div>
      <div class="ks-space-item__actions">
        <button type="button" class="ks-space-item__action ks-space-item__choose" data-project-key="${esc(p.key)}">Choose issues &rarr;</button>
      </div>
    </div>
  `).join('') || '<p class="ks-card-body">No projects found in this Jira site.</p>';

  list.querySelectorAll('.ks-space-item__choose').forEach(el => {
    el.addEventListener('click', () => {
      saveJiraState({ projectKey: el.dataset.projectKey, checkedIssueKeys: [], processingResults: null });
      loadIssues(el.dataset.projectKey);
    });
  });

  showOnly('pw-jira-projects');
}

async function loadIssues(projectKey) {
  try {
    const { issues } = await api(`/jira/personal/projects/${encodeURIComponent(projectKey)}/issues`);
    const list = document.getElementById('pw-jira-issue-list');
    const restoredChecked = new Set(jiraState().projectKey === projectKey ? jiraState().checkedIssueKeys : []);
    list.innerHTML = issues.map((issue, idx) => `
      <label class="ks-space-item pw-reveal" style="--i:${idx}">
        <input type="checkbox" class="pw-jira-issue-checkbox" value="${esc(issue.key)}" ${restoredChecked.has(issue.key) ? 'checked' : ''}>
        <span>${esc(issue.key)} — ${esc(issue.summary)}</span>
      </label>
    `).join('') || '<p class="ks-card-body">No issues found in this project.</p>';

    const linkBtn = document.getElementById('pw-jira-link-btn');
    const selectAll = document.getElementById('pw-jira-select-all');
    const checkedKeys = () => Array.from(list.querySelectorAll('.pw-jira-issue-checkbox:checked')).map(cb => cb.value);
    const updateBtnState = () => { linkBtn.disabled = !list.querySelectorAll('.pw-jira-issue-checkbox:checked').length; };

    linkBtn.disabled = !restoredChecked.size;
    selectAll.checked = issues.length > 0 && restoredChecked.size === issues.length;

    list.querySelectorAll('.pw-jira-issue-checkbox').forEach(cb => cb.addEventListener('change', () => {
      saveJiraState({ projectKey, checkedIssueKeys: checkedKeys() });
      updateBtnState();
    }));
    selectAll.onchange = () => {
      list.querySelectorAll('.pw-jira-issue-checkbox').forEach(cb => { cb.checked = selectAll.checked; });
      saveJiraState({ projectKey, checkedIssueKeys: checkedKeys() });
      updateBtnState();
    };

    linkBtn.onclick = () => processIssues(checkedKeys().map(key => ({ issueKey: key })), projectKey);

    showOnly('pw-jira-issues');

    if (jiraState().projectKey === projectKey && jiraState().processingResults) {
      renderProcessing(jiraState().processingResults);
    }
  } catch (err) {
    showError(err.message);
  }
}

function renderProcessing(results) {
  const el = document.getElementById('pw-jira-processing');
  el.style.display = 'block';
  el.innerHTML = results.map((r, i) => {
    if (r.status === 'error') {
      return `<div class="pw-process-item pw-process-item--error pw-reveal" style="--i:${i}">
        <span class="pw-process-item__title">${esc(r.issueKey)}</span>
        <span class="pw-process-item__detail">${esc(r.error)}</span>
      </div>`;
    }
    const notes = r.redactionNotes?.length ? r.redactionNotes.map(esc).join(', ') : 'nothing to redact';
    return `<div class="pw-process-item pw-process-item--done pw-reveal" style="--i:${i}">
      <span class="pw-process-item__title">${esc(r.title)}</span>
      <span class="pw-process-item__detail">${r.unchanged ? 'already structured, unchanged' : `redacted (${notes}) → structured → indexed`}</span>
    </div>`;
  }).join('');
}

async function processIssues(issues, projectKey) {
  const linkBtn = document.getElementById('pw-jira-link-btn');
  linkBtn.disabled = true;
  linkBtn.textContent = 'Processing…';
  try {
    const result = await api('/jira/personal/link', { method: 'POST', body: JSON.stringify({ issues }) });
    renderProcessing(result.results);
    saveJiraState({ projectKey, processingResults: result.results });
  } catch (err) {
    showError(err.message);
  } finally {
    linkBtn.disabled = false;
    linkBtn.textContent = 'Process selected issues';
  }
}

function wireConnectButtons() {
  const connect = async (btn) => {
    btn.textContent = 'Connecting…';
    try {
      const { url } = await api('/confluence/personal/connect?returnTo=pipeline-wizard');
      window.location.href = url;
    } catch (err) {
      showError(err.message);
    }
  };

  document.getElementById('pw-jira-connect-btn').addEventListener('click', (e) => {
    e.preventDefault();
    connect(e.currentTarget);
  });
  document.getElementById('pw-jira-reconnect-btn').addEventListener('click', (e) => {
    e.preventDefault();
    connect(e.currentTarget);
  });
}

export async function initJiraConnector(state, persist) {
  wizardState = state;
  persistWizardState = persist;

  wireConnectButtons();

  document.getElementById('pw-jira-back-to-projects').addEventListener('click', () => {
    saveJiraState({ projectKey: null, checkedIssueKeys: [], processingResults: null });
    showOnly('pw-jira-projects');
  });

  try {
    const status = await api('/confluence/personal/status');
    if (!status.connected) { showOnly('pw-jira-not-connected'); return; }
    if (!status.jiraScopeGranted) { showOnly('pw-jira-scope-missing'); return; }

    const { projects } = await api('/jira/personal/projects');
    renderProjects(projects);

    // Resume exactly where the user left off — a page reload (e.g.
    // returning from the Atlassian OAuth redirect) would otherwise land
    // back on the bare project list, discarding an in-progress selection.
    if (jiraState().projectKey) {
      loadIssues(jiraState().projectKey);
    }
  } catch (err) {
    showError(err.message);
  }
}
