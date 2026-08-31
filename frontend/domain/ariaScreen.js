/**
 * Svarg — Aria screen (real product)
 *
 * Reached from Approve on the Cob/Opportunities screen (dispatches
 * 'aria:show', see blueprintGenerate.js). Recaps the approved
 * opportunity, cross-references Cob's real required-datasets list (Data
 * Readiness domain's "Critical Data Identification" capability —
 * already present in the blueprint fetch, no extra request) against
 * what's actually linked to this blueprint so far, and lets the user
 * connect Confluence/Jira and link real sources — reusing the same
 * blueprint-scoped, generic linking endpoints Knowledge Sources already
 * uses for Confluence, plus the equivalent for Jira
 * (POST /jira/personal/link-to-blueprint).
 *
 * Connection status per dataset is a text match of the dataset's
 * typicalSource against "confluence"/"jira" — the only two connectors
 * that exist today. A dataset whose typical source doesn't mention
 * either (e.g. a CRM or product analytics DB) has no connector yet and
 * honestly shows as not connected; there's nothing more specific we can
 * offer it right now.
 */

import { findAiUseCasesPrioritizationSection } from './blueprintGenerate.js';

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function getToken() { return localStorage.getItem('token'); }

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

let _cachedDatasets = [];

// ── Header recap ─────────────────────────────────────────────────────────

function findDatasetsSection(bp) {
  const domain = (bp.domains || []).find(d => d.domainId === 'data-readiness');
  if (!domain) return null;
  for (const cap of (domain.capabilities || [])) {
    for (const section of (cap.sections || [])) {
      if (section.title === 'Critical Data Identification') return section;
    }
  }
  return null;
}

function priorityClass(priority) {
  const p = String(priority || '').toLowerCase();
  return ['high', 'medium', 'low'].includes(p) ? p : 'medium';
}

function renderHeaderRecap(bp) {
  const oppSection = findAiUseCasesPrioritizationSection(bp);
  if (!oppSection) return;
  const brief = oppSection.brief || {};
  const allInitiatives = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
  const recommended = brief.recommendedStartingPoint || '';
  const winner = allInitiatives.find(name => name && recommended.includes(name));
  document.getElementById('aria-recap-name').textContent = winner || recommended;
}

// ── Required Data table + readiness bar + status badge ──────────────────────

function statusIcon(status) {
  if (status === 'connected') return '<span class="aria-status-icon aria-status-icon--connected" title="Connected">&check;</span>';
  if (status === 'partial') return '<span class="aria-status-icon aria-status-icon--partial" title="Partially connected">&#9681;</span>';
  return '<span class="aria-status-icon aria-status-icon--none" title="Not connected">&#9675;</span>';
}

function datasetStatus(typicalSource, confCount, jiraCount) {
  const s = String(typicalSource || '').toLowerCase();
  const mentionsConfluence = s.includes('confluence');
  const mentionsJira = s.includes('jira');
  if (!mentionsConfluence && !mentionsJira) return 'none';
  const confOk = !mentionsConfluence || confCount > 0;
  const jiraOk = !mentionsJira || jiraCount > 0;
  if (confOk && jiraOk) return 'connected';
  if ((mentionsConfluence && confCount > 0) || (mentionsJira && jiraCount > 0)) return 'partial';
  return 'none';
}

function renderRequiredData(datasets, confCount, jiraCount) {
  const body = document.getElementById('aria-required-body');
  let readyCount = 0;

  body.innerHTML = datasets.map(d => {
    const status = datasetStatus(d.typicalSource, confCount, jiraCount);
    if (status === 'connected') readyCount++;
    return `<tr>
      <td>${esc(d.name)}</td>
      <td><span class="pd-dataset__priority pd-dataset__priority--${priorityClass(d.priority)}">${esc((d.priority || '').toUpperCase())}</span></td>
      <td>${statusIcon(status)}${esc(d.typicalSource)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="3" class="ks-card-body">Data Readiness hasn't finished generating yet — check back shortly.</td></tr>`;

  const total = datasets.length;
  const pct = total ? Math.round((readyCount / total) * 100) : 0;
  document.getElementById('aria-readiness-count').textContent = `${readyCount} of ${total} dataset${total === 1 ? '' : 's'} ready`;
  document.getElementById('aria-readiness-pct').textContent = `${pct}%`;
  document.getElementById('aria-readiness-fill').style.width = `${pct}%`;

  const badge = document.getElementById('aria-status-badge');
  const badgeText = document.getElementById('aria-status-badge__text');
  badge.classList.remove('aria-status-badge--ready', 'aria-status-badge--partial');
  if (total > 0 && readyCount === total) {
    badge.classList.add('aria-status-badge--ready');
    badgeText.textContent = 'DATA CONNECTED';
  } else if (readyCount > 0) {
    badge.classList.add('aria-status-badge--partial');
    badgeText.textContent = 'PARTIALLY CONNECTED';
  } else {
    badgeText.textContent = 'NOT CONNECTED';
  }
}

// ── Connected Sources summary + refresh ──────────────────────────────────────

function renderSourcesSummary(documents) {
  const confDocs = documents.filter(d => (d.sourceType || 'confluence') === 'confluence');
  const jiraDocs = documents.filter(d => d.sourceType === 'jira');

  document.getElementById('aria-conf-summary-count').textContent = confDocs.length
    ? `${confDocs.length} page${confDocs.length === 1 ? '' : 's'} selected`
    : 'Not connected';

  const jiraProjectCount = new Set(jiraDocs.map(d => d.projectKey).filter(Boolean)).size;
  document.getElementById('aria-jira-summary-count').textContent = jiraDocs.length
    ? `${jiraProjectCount} project${jiraProjectCount === 1 ? '' : 's'} · ${jiraDocs.length} issue${jiraDocs.length === 1 ? '' : 's'} selected`
    : 'Not connected';

  const linkedList = document.getElementById('aria-conf-linked-list');
  if (confDocs.length) {
    linkedList.innerHTML = `<strong>Already linked:</strong> ${confDocs.map(d => esc(d.title)).join(', ')}`;
    linkedList.style.display = 'block';
  } else {
    linkedList.style.display = 'none';
  }

  return { confCount: confDocs.length, jiraCount: jiraDocs.length };
}

async function refreshLinked(blueprintId) {
  try {
    const { documents } = await api(`/confluence/personal/linked/${encodeURIComponent(blueprintId)}`);
    const { confCount, jiraCount } = renderSourcesSummary(documents);
    renderRequiredData(_cachedDatasets, confCount, jiraCount);
  } catch {
    renderRequiredData(_cachedDatasets, 0, 0);
  }
}

// ── Manage toggles ────────────────────────────────────────────────────────

function wireManageToggle(btnId, panelId) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  btn.addEventListener('click', () => {
    const opening = panel.style.display === 'none';
    panel.style.display = opening ? 'block' : 'none';
    btn.textContent = opening ? 'Hide' : 'Manage';
  });
}

// ── Confluence: connect → spaces → pages → link ─────────────────────────────

function goConnectAtlassian(blueprintId) {
  sessionStorage.setItem('svarg_returning_to_aria', '1');
  api(`/confluence/personal/connect?blueprintId=${encodeURIComponent(blueprintId)}&returnTo=domain`)
    .then(({ url }) => { window.location.href = url; })
    .catch(err => showConfError(err.message));
}

function showConfError(message) {
  const el = document.getElementById('aria-conf-error');
  el.textContent = message;
  el.style.display = 'block';
}

function showOnly(ids, activeId) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === activeId ? 'block' : 'none';
  });
}

const CONF_SECTIONS = ['aria-conf-not-connected', 'aria-conf-spaces', 'aria-conf-pages'];

async function loadConfluencePages(spaceKey, blueprintId) {
  try {
    const { pages } = await api(`/confluence/personal/spaces/${encodeURIComponent(spaceKey)}/pages`);
    const list = document.getElementById('aria-conf-page-list');
    list.innerHTML = pages.map(p => `
      <label class="aria-list__item">
        <input type="checkbox" class="aria-conf-page-checkbox" value="${esc(p.id)}" data-space-key="${esc(spaceKey)}">
        <span class="aria-list__item-name">${esc(p.title)}</span>
      </label>
    `).join('') || '<p class="ks-card-body">No pages found in this space.</p>';

    const linkBtn = document.getElementById('aria-conf-link-btn');
    const selectAll = document.getElementById('aria-conf-select-all');
    linkBtn.disabled = true;
    selectAll.checked = false;

    const update = () => { linkBtn.disabled = !list.querySelectorAll('.aria-conf-page-checkbox:checked').length; };
    list.querySelectorAll('.aria-conf-page-checkbox').forEach(cb => cb.addEventListener('change', update));
    selectAll.onchange = () => {
      list.querySelectorAll('.aria-conf-page-checkbox').forEach(cb => { cb.checked = selectAll.checked; });
      update();
    };

    linkBtn.onclick = async () => {
      const checked = Array.from(list.querySelectorAll('.aria-conf-page-checkbox:checked'));
      const pages2 = checked.map(cb => ({ pageId: cb.value, spaceKey: cb.dataset.spaceKey }));
      linkBtn.disabled = true;
      linkBtn.textContent = 'Linking…';
      try {
        const result = await api('/confluence/personal/link', { method: 'POST', body: JSON.stringify({ blueprintId, pages: pages2 }) });
        await refreshLinked(blueprintId);
        document.getElementById('aria-conf-error').style.display = 'none';
        linkBtn.textContent = `Linked ${result.linkedCount}/${result.total}`;
      } catch (err) {
        showConfError(err.message);
      } finally {
        linkBtn.disabled = false;
        setTimeout(() => { linkBtn.textContent = 'Link selected pages'; }, 2000);
      }
    };

    showOnly(CONF_SECTIONS, 'aria-conf-pages');
  } catch (err) {
    showConfError(err.message);
  }
}

async function renderConfluenceSpaces(blueprintId) {
  try {
    const { spaces } = await api('/confluence/personal/spaces');
    const list = document.getElementById('aria-conf-space-list');
    list.innerHTML = spaces.map(s => `
      <div class="aria-list__item">
        <span class="aria-list__item-name">${esc(s.name)} <span style="opacity:.5">(${esc(s.key)})</span></span>
        <button type="button" class="aria-list__item-action" data-space-key="${esc(s.key)}">Choose pages &rarr;</button>
      </div>
    `).join('') || '<p class="ks-card-body">No spaces found in this Confluence site.</p>';

    list.querySelectorAll('.aria-list__item-action').forEach(btn => {
      btn.addEventListener('click', () => loadConfluencePages(btn.dataset.spaceKey, blueprintId));
    });

    showOnly(CONF_SECTIONS, 'aria-conf-spaces');
  } catch (err) {
    showConfError(err.message);
  }
}

async function initConfluenceSection(blueprintId) {
  document.getElementById('aria-conf-connect-btn').addEventListener('click', (e) => {
    e.preventDefault();
    goConnectAtlassian(blueprintId);
  });
  document.getElementById('aria-conf-back-to-spaces').addEventListener('click', () => showOnly(CONF_SECTIONS, 'aria-conf-spaces'));

  try {
    const status = await api('/confluence/personal/status');
    if (!status.connected) { showOnly(CONF_SECTIONS, 'aria-conf-not-connected'); return; }

    document.getElementById('aria-conf-connected-badge').style.display = 'flex';
    document.getElementById('aria-conf-site').textContent = status.siteName || 'Confluence';
    await renderConfluenceSpaces(blueprintId);
  } catch (err) {
    showConfError(err.message);
  }
}

// ── Jira: connect → projects → issues → link ────────────────────────────────

function showJiraError(message) {
  const el = document.getElementById('aria-jira-error');
  el.textContent = message;
  el.style.display = 'block';
}

const JIRA_SECTIONS = ['aria-jira-scope-missing', 'aria-jira-not-connected', 'aria-jira-projects', 'aria-jira-issues'];

async function loadJiraIssues(projectKey, blueprintId) {
  try {
    const { issues } = await api(`/jira/personal/projects/${encodeURIComponent(projectKey)}/issues`);
    const list = document.getElementById('aria-jira-issue-list');
    list.innerHTML = issues.map(i => `
      <label class="aria-list__item">
        <input type="checkbox" class="aria-jira-issue-checkbox" value="${esc(i.key)}">
        <span class="aria-list__item-name">${esc(i.key)} — ${esc(i.summary)}</span>
      </label>
    `).join('') || '<p class="ks-card-body">No issues found in this project.</p>';

    const linkBtn = document.getElementById('aria-jira-link-btn');
    const selectAll = document.getElementById('aria-jira-select-all');
    linkBtn.disabled = true;
    selectAll.checked = false;

    const update = () => { linkBtn.disabled = !list.querySelectorAll('.aria-jira-issue-checkbox:checked').length; };
    list.querySelectorAll('.aria-jira-issue-checkbox').forEach(cb => cb.addEventListener('change', update));
    selectAll.onchange = () => {
      list.querySelectorAll('.aria-jira-issue-checkbox').forEach(cb => { cb.checked = selectAll.checked; });
      update();
    };

    linkBtn.onclick = async () => {
      const checked = Array.from(list.querySelectorAll('.aria-jira-issue-checkbox:checked')).map(cb => ({ issueKey: cb.value }));
      linkBtn.disabled = true;
      linkBtn.textContent = 'Linking…';
      try {
        const result = await api('/jira/personal/link-to-blueprint', { method: 'POST', body: JSON.stringify({ blueprintId, issues: checked }) });
        renderJiraProcessing(result.results);
        await refreshLinked(blueprintId);
      } catch (err) {
        showJiraError(err.message);
      } finally {
        linkBtn.disabled = false;
        linkBtn.textContent = 'Link selected issues';
      }
    };

    showOnly(JIRA_SECTIONS, 'aria-jira-issues');
  } catch (err) {
    showJiraError(err.message);
  }
}

function renderJiraProcessing(results) {
  const el = document.getElementById('aria-jira-processing');
  el.style.display = 'block';
  el.innerHTML = results.map(r => {
    if (r.status === 'error') {
      return `<div class="pw-process-item pw-process-item--error">
        <span class="pw-process-item__title">${esc(r.issueKey)}</span>
        <span class="pw-process-item__detail">${esc(r.error)}</span>
      </div>`;
    }
    return `<div class="pw-process-item pw-process-item--done">
      <span class="pw-process-item__title">${esc(r.title)}</span>
      <span class="pw-process-item__detail">${r.unchanged ? 'already linked, unchanged' : 'linked to this blueprint'}</span>
    </div>`;
  }).join('');
}

async function renderJiraProjects(blueprintId) {
  try {
    const { projects } = await api('/jira/personal/projects');
    const list = document.getElementById('aria-jira-project-list');
    list.innerHTML = projects.map(p => `
      <div class="aria-list__item">
        <span class="aria-list__item-name">${esc(p.name)} <span style="opacity:.5">(${esc(p.key)})</span></span>
        <button type="button" class="aria-list__item-action" data-project-key="${esc(p.key)}">Choose issues &rarr;</button>
      </div>
    `).join('') || '<p class="ks-card-body">No projects found in this Jira site.</p>';

    list.querySelectorAll('.aria-list__item-action').forEach(btn => {
      btn.addEventListener('click', () => loadJiraIssues(btn.dataset.projectKey, blueprintId));
    });

    showOnly(JIRA_SECTIONS, 'aria-jira-projects');
  } catch (err) {
    showJiraError(err.message);
  }
}

async function initJiraSection(blueprintId) {
  const connect = (e) => { e.preventDefault(); goConnectAtlassian(blueprintId); };
  document.getElementById('aria-jira-connect-btn').addEventListener('click', connect);
  document.getElementById('aria-jira-reconnect-btn').addEventListener('click', connect);
  document.getElementById('aria-jira-back-to-projects').addEventListener('click', () => showOnly(JIRA_SECTIONS, 'aria-jira-projects'));

  try {
    const status = await api('/confluence/personal/status');
    if (!status.connected) { showOnly(JIRA_SECTIONS, 'aria-jira-not-connected'); return; }
    if (!status.jiraScopeGranted) { showOnly(JIRA_SECTIONS, 'aria-jira-scope-missing'); return; }
    await renderJiraProjects(blueprintId);
  } catch (err) {
    showJiraError(err.message);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

let _wired = false;

function wireContinueButton() {
  if (_wired) return;
  _wired = true;
  document.getElementById('aria-continue-btn')?.addEventListener('click', () => {
    window.location.href = '/domain/domain.html?openBlueprint=1';
  });
  wireManageToggle('aria-conf-manage-btn', 'aria-conf-panel');
  wireManageToggle('aria-jira-manage-btn', 'aria-jira-panel');
}

document.addEventListener('aria:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  wireContinueButton();
  renderHeaderRecap(bp);

  const datasetsSection = findDatasetsSection(bp);
  _cachedDatasets = datasetsSection?.brief?.datasets || [];
  renderRequiredData(_cachedDatasets, 0, 0);

  initConfluenceSection(bp._id);
  initJiraSection(bp._id);
  refreshLinked(bp._id);
});
