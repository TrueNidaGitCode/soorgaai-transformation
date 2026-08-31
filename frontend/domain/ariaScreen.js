/**
 * Svarg — Aria screen (real product)
 *
 * Reached from Approve on the Cob/Opportunities screen (dispatches
 * 'aria:show', see blueprintGenerate.js). Renders one table row per
 * dataset Cob's Data Readiness capability flagged as required (already
 * present in the blueprint fetch, no extra request) — each row shows
 * the tool(s) it typically lives in and whether that source is actually
 * linked to this blueprint yet. "Configure" is a real link to
 * /domain/domain.html?view=aria&connect=<source>, which reloads onto
 * this same screen with that connector panel already expanded — the
 * panel's own status check then decides whether to show the OAuth
 * "Connect" button (a real redirect to Atlassian) or the space/page
 * (or project/issue) picker. Reuses the same blueprint-scoped, generic
 * linking endpoints Knowledge Sources already uses for Confluence, plus
 * the equivalent for Jira (POST /jira/personal/link-to-blueprint).
 *
 * Connection status per dataset is a text match of the dataset's
 * typicalSource against "confluence"/"jira" — the only two connectors
 * that exist today. A dataset whose typical source doesn't mention
 * either (e.g. Polarion, TestRail) has no connector yet and honestly
 * shows as unsupported rather than offering a dead link.
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

// The opportunity name only exists once AI Use Cases has finished
// generating. Until then (or if the section shape ever changes) show
// nothing rather than a dangling "Blueprint:" label with no value.
function renderBreadcrumb(bp) {
  const crumb = document.querySelector('.aria-breadcrumb');
  const oppSection = findAiUseCasesPrioritizationSection(bp);
  const brief = oppSection?.brief || {};
  const allInitiatives = (brief.priorityQuadrants || []).flatMap(q => q.initiatives || []);
  const recommended = brief.recommendedStartingPoint || '';
  const winner = allInitiatives.find(name => name && recommended.includes(name));
  const label = winner || recommended;

  if (!label) { if (crumb) crumb.style.display = 'none'; return; }
  if (crumb) crumb.style.display = '';
  document.getElementById('aria-recap-name').textContent = label;
}

// ── Required Data table ──────────────────────────────────────────────────────

function datasetStatus(mentionsConfluence, mentionsJira, confCount, jiraCount) {
  if (!mentionsConfluence && !mentionsJira) return 'none';
  const confOk = !mentionsConfluence || confCount > 0;
  const jiraOk = !mentionsJira || jiraCount > 0;
  if (confOk && jiraOk) return 'connected';
  if ((mentionsConfluence && confCount > 0) || (mentionsJira && jiraCount > 0)) return 'partial';
  return 'none';
}

// Which panel Configure should send the user to — whichever mentioned
// source still needs attention, defaulting to Confluence if both do.
function primaryActionSource(mentionsConfluence, mentionsJira, confCount, jiraCount) {
  if (mentionsConfluence && confCount === 0) return 'confluence';
  if (mentionsJira && jiraCount === 0) return 'jira';
  if (mentionsConfluence) return 'confluence';
  if (mentionsJira) return 'jira';
  return null;
}

function configureHref(source) {
  return `/domain/domain.html?view=aria&connect=${source}`;
}

function sourceIconHtml(mentionsConfluence, mentionsJira, typicalSource) {
  if (mentionsConfluence) return `<span class="aria-source__icon aria-source__icon--confluence">C</span>`;
  if (mentionsJira) return `<span class="aria-source__icon aria-source__icon--jira">J</span>`;
  const letter = String(typicalSource || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="aria-source__icon aria-source__icon--other">${esc(letter)}</span>`;
}

function statusHtml(status) {
  if (status === 'connected') return `<span class="aria-status aria-status--connected"><span class="aria-status-dot"></span>Connected</span>`;
  if (status === 'partial') return `<span class="aria-status aria-status--partial"><span class="aria-status-dot"></span>Partial</span>`;
  return `<span class="aria-status aria-status--none"><span class="aria-status-dot"></span>Not Connected</span>`;
}

// A dead "Connect" link for a source we don't actually support would be
// worse than no link — Polarion/TestRail/etc. get an em dash instead.
function actionHtml(status, actionSource) {
  if (!actionSource) return `<span class="aria-action-none">&mdash;</span>`;
  if (status === 'none') return `<a href="${configureHref(actionSource)}" class="aria-action-btn aria-action-btn--primary">Connect &rarr;</a>`;
  return `<a href="${configureHref(actionSource)}" class="aria-action-btn aria-action-btn--ghost">Configure &rarr;</a>`;
}

function renderRow(d, confCount, jiraCount) {
  const s = String(d.typicalSource || '').toLowerCase();
  const mentionsConfluence = s.includes('confluence');
  const mentionsJira = s.includes('jira');

  const status = datasetStatus(mentionsConfluence, mentionsJira, confCount, jiraCount);
  const actionSource = primaryActionSource(mentionsConfluence, mentionsJira, confCount, jiraCount);

  return `
    <tr>
      <td>
        <span class="aria-row-name__title">${esc(d.name)}</span>
        <span class="aria-row-name__desc">${esc(d.purpose)}</span>
      </td>
      <td><span class="aria-priority-pill aria-priority-pill--${priorityClass(d.priority)}">${esc((d.priority || '').toUpperCase())}</span></td>
      <td><span class="aria-source">${sourceIconHtml(mentionsConfluence, mentionsJira, d.typicalSource)}${esc(d.typicalSource)}</span></td>
      <td>${statusHtml(status)}</td>
      <td>${actionHtml(status, actionSource)}</td>
    </tr>
  `;
}

function eachDatasetStatus(datasets, confCount, jiraCount, fn) {
  datasets.forEach(d => {
    const s = String(d.typicalSource || '').toLowerCase();
    fn(datasetStatus(s.includes('confluence'), s.includes('jira'), confCount, jiraCount));
  });
}

function updateReadinessCard(datasets, confCount, jiraCount) {
  let ready = 0, partial = 0, missing = 0;
  eachDatasetStatus(datasets, confCount, jiraCount, (status) => {
    if (status === 'connected') ready++;
    else if (status === 'partial') partial++;
    else missing++;
  });

  const total = datasets.length;
  const pct = total ? Math.round((ready / total) * 100) : 0;
  document.getElementById('aria-readiness-fraction').textContent = `${ready} of ${total}`;
  document.getElementById('aria-readiness-pct').textContent = `${pct}%`;
  document.getElementById('aria-readiness-fill').style.width = `${pct}%`;
  document.getElementById('aria-legend-ready').textContent = `${ready} Ready`;
  document.getElementById('aria-legend-partial').textContent = `${partial} Partial`;
  document.getElementById('aria-legend-missing').textContent = `${missing} Missing`;
}

// ── Process Connected Data ───────────────────────────────────────────────────
// UI hook only for now — the actual processing pipeline (Gritworks) isn't
// specced yet, so this reports real state honestly instead of pretending
// to run something that doesn't exist.

function updateProcessBar(datasets, confCount, jiraCount) {
  let connectable = 0;
  eachDatasetStatus(datasets, confCount, jiraCount, (status) => {
    if (status === 'connected' || status === 'partial') connectable++;
  });

  const btn = document.getElementById('aria-process-btn');
  const hint = document.getElementById('aria-process-hint');
  if (btn) btn.disabled = connectable === 0;
  if (hint) hint.textContent = connectable > 0
    ? `${connectable} dataset${connectable === 1 ? '' : 's'} have linked data`
    : 'Connect at least one source to process data';
}

function renderTable(datasets, confCount, jiraCount) {
  const body = document.getElementById('aria-required-body');
  body.innerHTML = datasets.map(d => renderRow(d, confCount, jiraCount)).join('')
    || `<tr><td colspan="5" class="ks-card-body">Data Readiness hasn't finished generating yet — check back shortly.</td></tr>`;
  updateReadinessCard(datasets, confCount, jiraCount);
  updateProcessBar(datasets, confCount, jiraCount);
}

// ── Connector panels: open/close + linked-doc refresh ────────────────────────

function openPanel(source) {
  const panel = document.getElementById(source === 'jira' ? 'aria-jira-panel' : 'aria-conf-panel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePanel(panelId) {
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = 'none';
}

async function refreshLinked(blueprintId) {
  try {
    const { documents } = await api(`/confluence/personal/linked/${encodeURIComponent(blueprintId)}`);
    const confDocs = documents.filter(d => (d.sourceType || 'confluence') === 'confluence');
    const jiraDocs = documents.filter(d => d.sourceType === 'jira');

    const linkedList = document.getElementById('aria-conf-linked-list');
    if (confDocs.length) {
      linkedList.innerHTML = `<strong>Already linked:</strong> ${confDocs.map(d => esc(d.title)).join(', ')}`;
      linkedList.style.display = 'block';
    } else {
      linkedList.style.display = 'none';
    }

    renderTable(_cachedDatasets, confDocs.length, jiraDocs.length);
  } catch {
    renderTable(_cachedDatasets, 0, 0);
  }
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
    document.getElementById('aria-jira-connected-badge').style.display = 'inline-flex';
    await renderJiraProjects(blueprintId);
  } catch (err) {
    showJiraError(err.message);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

let _wired = false;

function wireStaticControls() {
  if (_wired) return;
  _wired = true;

  document.getElementById('aria-process-btn')?.addEventListener('click', () => {
    const hint = document.getElementById('aria-process-hint');
    if (hint) hint.textContent = 'Processing isn’t connected yet — coming soon.';
  });

  document.querySelectorAll('.aria-connector__close').forEach(btn => {
    btn.addEventListener('click', () => closePanel(btn.dataset.panel));
  });
}

document.addEventListener('aria:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  wireStaticControls();
  renderBreadcrumb(bp);

  const datasetsSection = findDatasetsSection(bp);
  _cachedDatasets = datasetsSection?.brief?.datasets || [];
  renderTable(_cachedDatasets, 0, 0);

  initConfluenceSection(bp._id);
  initJiraSection(bp._id);
  refreshLinked(bp._id);

  // Configure links redirect here with ?connect=<source> — land straight
  // on the matching panel instead of the bare table.
  const connectParam = new URLSearchParams(window.location.search).get('connect');
  if (connectParam === 'confluence' || connectParam === 'jira') openPanel(connectParam);
});
