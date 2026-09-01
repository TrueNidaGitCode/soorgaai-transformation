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
  // API_BASE has no trailing slash, so a path missing its leading slash
  // silently concatenates into ".../apiconfluence/..." and 404s. Normalise
  // rather than trusting every call site to remember.
  if (!path.startsWith('/')) path = '/' + path;
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
let _blueprintId = null;

// Tool-level connection (an OAuth grant exists) — deliberately separate
// from whether any content has been linked. Right after connecting, a tool
// is connected but has nothing linked yet, and the UI has to say so rather
// than still reading "Not connected".
let _connected = { confluence: false, jira: false };

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

// The opportunity name only exists once AI Use Cases has finished
// generating. Until then (or if the section shape ever changes) show
// nothing rather than a dangling label with no value.
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

// Cob writes typicalSource as a list of candidate tools ("Jira, Polarion,
// TestRail"). Only one of those matters here: the tool this organization
// actually uses, which we know from the connectors Svarg supports. So
// resolve the list down to that single tool rather than showing all the
// options, and return null when none of them is a tool we can connect —
// those datasets get filled from analysis instead.
const CONNECTORS = [
  { id: 'confluence', label: 'Confluence', match: 'confluence', letter: 'C' },
  { id: 'jira', label: 'Jira', match: 'jira', letter: 'J' },
];

function resolveSource(typicalSource, confCount, jiraCount) {
  const s = String(typicalSource || '').toLowerCase();
  const mentioned = CONNECTORS.filter(c => s.includes(c.match));
  if (!mentioned.length) return null;
  // If the dataset names more than one supported tool, the one that
  // actually has content linked is the one in use.
  const linked = { confluence: confCount, jira: jiraCount };
  return mentioned.find(c => linked[c.id] > 0) || mentioned[0];
}

function rowState(d, confCount, jiraCount) {
  const source = resolveSource(d.typicalSource, confCount, jiraCount);
  if (!source) return { state: 'inferred', source: null };
  const count = source.id === 'confluence' ? confCount : jiraCount;
  if (count > 0) return { state: 'connected', source };
  // Tool connected but nothing linked from it yet — Process will do the
  // linking, so this is not a "go and connect something" state.
  if (_connected[source.id]) return { state: 'ready', source };
  return { state: 'not-connected', source };
}

function connectHref(sourceId) {
  return `/domain/domain.html?view=aria&connect=${sourceId}`;
}

function renderRow(d, confCount, jiraCount) {
  const { state, source } = rowState(d, confCount, jiraCount);

  let sourceCell, statusCell, actionCell;
  if (state === 'inferred') {
    // No connector exists for this data, so there is nothing to connect.
    // Say what will happen instead of showing a dead control.
    sourceCell = `<span class="aria-source aria-source--none">Not available</span>`;
    statusCell = `<span class="aria-status aria-status--inferred"><span class="aria-status-dot"></span>Filled from analysis</span>`;
    actionCell = `<span class="aria-action-none">&mdash;</span>`;
  } else {
    sourceCell = `<span class="aria-source">`
      + `<span class="aria-source__icon aria-source__icon--${source.id}">${source.letter}</span>${esc(source.label)}</span>`;
    statusCell = state === 'connected'
      ? `<span class="aria-status aria-status--connected"><span class="aria-status-dot"></span>Connected</span>`
      : state === 'ready'
        ? `<span class="aria-status aria-status--ready"><span class="aria-status-dot"></span>Ready to link</span>`
        : `<span class="aria-status aria-status--none"><span class="aria-status-dot"></span>Not connected</span>`;
    // Connect only appears when the tool genuinely isn't connected —
    // once it is, Process does the linking, so there is nothing to click.
    actionCell = state === 'not-connected'
      ? `<a href="${connectHref(source.id)}" class="aria-action-btn aria-action-btn--primary">Connect &rarr;</a>`
      : `<span class="aria-action-none">&mdash;</span>`;
  }

  return `
    <tr>
      <td>
        <span class="aria-row-name__title">${esc(d.name)}</span>
        <span class="aria-row-name__desc">${esc(d.purpose)}</span>
      </td>
      <td>${sourceCell}</td>
      <td>${statusCell}</td>
      <td>${actionCell}</td>
    </tr>
  `;
}

function tally(datasets, confCount, jiraCount) {
  let connected = 0, toConnect = 0, inferred = 0;
  datasets.forEach(d => {
    const { state } = rowState(d, confCount, jiraCount);
    if (state === 'connected') connected++;
    else if (state === 'not-connected' || state === 'ready') toConnect++;
    else inferred++;
  });
  return { connected, toConnect, inferred };
}

function updateReadinessCard(datasets, confCount, jiraCount) {
  const { connected, toConnect, inferred } = tally(datasets, confCount, jiraCount);

  // Percentage is over what's actually connectable — datasets with no
  // connector can never be connected, so counting them would make 100%
  // permanently unreachable and the bar meaningless.
  const connectable = connected + toConnect;
  const pct = connectable ? Math.round((connected / connectable) * 100) : 0;

  document.getElementById('aria-readiness-fraction').textContent = `${connected} of ${connectable}`;
  document.getElementById('aria-readiness-pct').textContent = `${pct}%`;
  document.getElementById('aria-readiness-fill').style.width = `${pct}%`;
  document.getElementById('aria-legend-ready').textContent = `${connected} Connected`;
  document.getElementById('aria-legend-missing').textContent = `${toConnect} To connect`;
  document.getElementById('aria-legend-inferred').textContent = `${inferred} From analysis`;

  const note = document.getElementById('aria-note');
  const noteText = document.getElementById('aria-note-text');
  if (note && noteText) {
    if (inferred > 0) {
      noteText.textContent = `${inferred} dataset${inferred === 1 ? '' : 's'} ha${inferred === 1 ? 's' : 've'} no connector available yet. `
        + `Svarg will fill th${inferred === 1 ? 'at' : 'ose'} in from its own analysis instead of your documents.`;
      note.style.display = '';
    } else {
      note.style.display = 'none';
    }
  }
}

// ── Process Connected Data ───────────────────────────────────────────────────
// UI hook only for now — the actual processing pipeline (Gritworks) isn't
// specced yet, so this reports real state honestly instead of pretending
// to run something that doesn't exist.

// Every source with something to link. Linking is idempotent — the backend
// skips items whose content hash is unchanged before doing any LLM work —
// so re-running this over already-linked spaces is cheap.
function linkableSources() {
  return [
    ..._sources.confluence.map(s => ({ tool: 'confluence', key: s.key, name: s.name })),
    ..._sources.jira.map(p => ({ tool: 'jira', key: p.key, name: p.name })),
  ];
}

function updateProcessBar(datasets) {
  const btn = document.getElementById('aria-process-btn');
  const hint = document.getElementById('aria-process-hint');
  const pending = linkableSources();
  if (btn) btn.disabled = pending.length === 0;
  // No idle text — the table above already says what is ready, so a
  // standing "N sources ready" line was pure repetition. The element stays
  // because linking progress, results and errors are reported through it.
  if (hint) hint.textContent = pending.length ? '' : 'Connect a source to process data';
}

// Process = link, then process. The user asked for one button that does
// both, so this links the newest items from every available source before
// handing over. Progress is reported per source, because linking is the
// slow part (one LLM classification per new item, server-side).
let _processing = false;

function setProgress(label, done, total) {
  const wrap = document.getElementById('aria-progress');
  const lbl = document.getElementById('aria-progress-label');
  const cnt = document.getElementById('aria-progress-count');
  const fill = document.getElementById('aria-progress-fill');
  if (!wrap) return;
  wrap.style.display = 'block';
  lbl.textContent = label;
  // total 0 means "phase with no measurable size yet" — keep the bar at 0
  // rather than dividing by zero and showing a misleading 100%.
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  fill.style.width = pct + '%';
  cnt.textContent = total > 0 ? done + ' of ' + total + ' items · ' + pct + '%' : '';
}

function hideProgress() {
  const wrap = document.getElementById('aria-progress');
  if (wrap) wrap.style.display = 'none';
}

// Process = link, then process. Linking is the slow part: the server makes
// one LLM classification call per NEW item, sequentially, so a real
// item-level progress bar is worth the extra listing pass up front.
//
// Two phases:
//   1. list every source, so the total is a real number rather than a guess
//   2. link source by source, advancing by the items each batch actually
//      returned (not by the batch size we hoped for)
async function runProcess(blueprintId) {
  if (_processing) return;
  const btn = document.getElementById('aria-process-btn');
  const hint = document.getElementById('aria-process-hint');
  const proc = document.getElementById('aria-sources-processing');
  const sources = linkableSources();
  if (!sources.length) return;

  _processing = true;
  btn.disabled = true;
  btn.textContent = 'Processing…';
  hint.textContent = '';
  proc.style.display = 'none';
  proc.innerHTML = '';

  const results = [];

  try {
    // ── Phase 1: work out what there actually is to link ──────────────
    const jobs = [];
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      setProgress('Reading ' + src.name + '…', i, sources.length);
      try {
        if (src.tool === 'confluence') {
          // listPages is newest-first, so the head is the newest N.
          const { pages } = await api('/confluence/personal/spaces/' + encodeURIComponent(src.key) + '/pages');
          const batch = pages.slice(0, LINK_BATCH).map(pg => ({ pageId: pg.id, spaceKey: src.key }));
          if (batch.length) jobs.push({ src, batch });
        } else {
          // listIssues is ordered by created DESC.
          const { issues } = await api('/jira/personal/projects/' + encodeURIComponent(src.key) + '/issues');
          const batch = issues.slice(0, LINK_BATCH).map(iss => ({ issueKey: iss.key }));
          if (batch.length) jobs.push({ src, batch });
        }
      } catch (err) {
        // One unreadable source must not abandon the rest.
        results.push({ status: 'error', title: src.name, error: err.message });
      }
    }

    const total = jobs.reduce((n, j) => n + j.batch.length, 0);
    if (!total) {
      hideProgress();
      btn.textContent = 'Process Connected Data';
      hint.textContent = results.length
        ? 'Could not read any source. See the log below.'
        : 'Nothing new to link.';
      if (results.length) renderProcessing(proc, results, 'title');
      return;
    }

    // ── Phase 2: link, advancing by real completions ──────────────────
    let done = 0;
    for (const job of jobs) {
      setProgress('Linking ' + job.src.name + '…', done, total);
      try {
        const r = job.src.tool === 'confluence'
          ? await api('/confluence/personal/link', {
              method: 'POST', body: JSON.stringify({ blueprintId, pages: job.batch }),
            })
          : await api('/jira/personal/link-to-blueprint', {
              method: 'POST', body: JSON.stringify({ blueprintId, issues: job.batch }),
            });
        const got = r.results || [];
        results.push(...got);
        // Advance by what the server actually reported, falling back to the
        // batch size if it returned nothing, so the bar can never stall.
        done += got.length || job.batch.length;
      } catch (err) {
        results.push({ status: 'error', title: job.src.name, error: err.message });
        done += job.batch.length;
      }
      setProgress('Linking ' + job.src.name + '…', Math.min(done, total), total);
      renderProcessing(proc, results, job.src.tool === 'confluence' ? 'pageId' : 'issueKey');
    }

    setProgress('Linked', total, total);
    await refreshLinked(blueprintId);

    const linked = results.filter(r => r.status !== 'error').length;
    const failed = results.length - linked;
    btn.textContent = 'Process Connected Data';
    // Linking is real and finished. Processing itself isn't built yet, so
    // say so plainly rather than implying a pipeline ran.
    hint.textContent = linked + ' item' + (linked === 1 ? '' : 's') + ' linked'
      + (failed ? ', ' + failed + ' failed' : '')
      + '. Processing isn\'t connected yet — coming soon.';
  } catch (err) {
    hideProgress();
    btn.textContent = 'Process Connected Data';
    hint.textContent = err.message || 'Linking failed. Please try again.';
  } finally {
    _processing = false;
    btn.disabled = false;
  }
}

function renderTable(datasets, confCount, jiraCount) {
  const body = document.getElementById('aria-required-body');
  body.innerHTML = datasets.map(d => renderRow(d, confCount, jiraCount)).join('')
    || `<tr><td colspan="4" class="ks-card-body">Data Readiness hasn't finished generating yet — check back shortly.</td></tr>`;
  updateReadinessCard(datasets, confCount, jiraCount);
  updateProcessBar(datasets);
}

// ── Sources: one table for every connected tool ─────────────────────────────
// Confluence spaces and Jira projects used to live in two separate panels,
// with duplicated status calls and near-identical rendering. They are one
// list now: same columns, same statuses, one status request.

function showSourcesError(message) {
  const el = document.getElementById('aria-sources-error');
  el.textContent = message;
  el.style.display = 'block';
}

function goConnectAtlassian(blueprintId) {
  sessionStorage.setItem('svarg_returning_to_aria', '1');
  api(`/confluence/personal/connect?blueprintId=${encodeURIComponent(blueprintId)}&returnTo=domain`)
    .then(({ url }) => { window.location.href = url; })
    .catch(err => showSourcesError(err.message));
}

// Each linked item costs one sequential LLM call (classifyDocument) and the
// link endpoints cap a request at 30, so "link everything" links the 30 most
// recent items per source. The table still reports the true total so the
// user knows what was left behind.
const LINK_BATCH = 30;

function countCellHtml(count, capped, noun) {
  // Jira's approximate-count is unavailable on some editions and answers 0
  // rather than erroring, so a zero here is not proof of emptiness. Say
  // "unknown" instead of claiming the source is empty.
  if (!count) return `<span class="aria-src-table__count--empty">&mdash;</span>`;
  const label = `${count.toLocaleString()}${capped ? '+' : ''} ${noun}${count === 1 && !capped ? '' : 's'}`;
  const limit = count > LINK_BATCH
    ? `<span class="aria-src-table__limit">newest ${LINK_BATCH} will link</span>`
    : '';
  return `${esc(label)}${limit}`;
}

// Which spaces / projects already have content linked to this blueprint —
// filled by refreshLinked() from the real linked-documents response, so the
// Status column reflects the database rather than anything the user clicked.
let _linkedKeys = { confluence: new Set(), jira: new Set() };

// Cached so Process can link without re-listing, and so Status can
// re-render after linking without another round trip.
let _sources = { confluence: [], jira: [] };

function renderProcessing(el, results, keyField) {
  el.style.display = 'block';
  el.innerHTML = results.map(r => {
    if (r.status === 'error') {
      return `<div class="pw-process-item pw-process-item--error">
        <span class="pw-process-item__title">${esc(r[keyField] || r.title || '')}</span>
        <span class="pw-process-item__detail">${esc(r.error)}</span>
      </div>`;
    }
    return `<div class="pw-process-item pw-process-item--done">
      <span class="pw-process-item__title">${esc(r.title || r[keyField] || '')}</span>
      <span class="pw-process-item__detail">${r.unchanged ? 'already linked, unchanged' : 'linked to this blueprint'}</span>
    </div>`;
  }).join('');
}

function sourceRowHtml({ tool, toolId, name, key, count, capped, noun }) {
  const linked = _linkedKeys[toolId]?.has(key);
  const status = linked
    ? `<span class="aria-status aria-status--connected"><span class="aria-status-dot"></span>Linked</span>`
    : `<span class="aria-status aria-status--ready"><span class="aria-status-dot"></span>Ready to link</span>`;
  return `
    <tr>
      <td><span class="aria-src-tool aria-src-tool--${toolId}">${esc(tool)}</span></td>
      <td>
        <span class="aria-row-name__title">${esc(name)}</span>
        <span class="aria-row-name__desc">${esc(key)}</span>
      </td>
      <td>${status}</td>
      <td class="aria-src-table__count">${countCellHtml(count, capped, noun)}</td>
    </tr>
  `;
}

function renderSourcesTable() {
  const body = document.getElementById('aria-sources-body');
  if (!body) return;
  const rows = [
    ..._sources.confluence.map(sp => sourceRowHtml({
      tool: 'Confluence', toolId: 'confluence', name: sp.name, key: sp.key,
      count: sp.itemCount, capped: sp.itemCountCapped, noun: 'page',
    })),
    ..._sources.jira.map(pr => sourceRowHtml({
      tool: 'Jira', toolId: 'jira', name: pr.name, key: pr.key,
      count: pr.itemCount, capped: pr.itemCountCapped, noun: 'ticket',
    })),
  ];
  body.innerHTML = rows.join('')
    || `<tr><td colspan="4" class="ks-card-body">No sources connected yet.</td></tr>`;
}

async function refreshLinked(blueprintId) {
  try {
    const { documents } = await api(`/confluence/personal/linked/${encodeURIComponent(blueprintId)}`);
    const confDocs = documents.filter(d => (d.sourceType || 'confluence') === 'confluence');
    const jiraDocs = documents.filter(d => d.sourceType === 'jira');

    // Per-space / per-project linkage drives the Status column. Linked
    // documents carry spaceKey/projectKey, so this is real state.
    _linkedKeys = {
      confluence: new Set(confDocs.map(d => d.spaceKey).filter(Boolean)),
      jira: new Set(jiraDocs.map(d => d.projectKey).filter(Boolean)),
    };

    const linkedList = document.getElementById('aria-linked-list');
    if (documents.length) {
      linkedList.innerHTML = `<strong>Already linked:</strong> ${documents.map(d => esc(d.title)).join(', ')}`;
      linkedList.style.display = 'block';
    } else {
      linkedList.style.display = 'none';
    }

    renderSourcesTable();
    renderTable(_cachedDatasets, confDocs.length, jiraDocs.length);
  } catch {
    renderTable(_cachedDatasets, 0, 0);
  }
}

// One status call answers for both tools — they share a single Atlassian
// connection, so asking twice was pure duplication.
async function initSources(blueprintId) {
  const prompts = document.getElementById('aria-connect-prompts');
  const confBtn = document.getElementById('aria-conf-connect-btn');
  const jiraBtn = document.getElementById('aria-jira-connect-btn');
  const scopeMsg = document.getElementById('aria-jira-scope-missing');
  const connect = (e) => { e.preventDefault(); goConnectAtlassian(blueprintId); };

  confBtn.addEventListener('click', connect);
  jiraBtn.addEventListener('click', connect);
  document.getElementById('aria-jira-reconnect-btn').addEventListener('click', connect);

  const body = document.getElementById('aria-sources-body');
  body.innerHTML = `<tr><td colspan="4" class="ks-card-body">Loading sources…</td></tr>`;

  let status;
  try {
    status = await api('/confluence/personal/status');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="ks-card-body">Couldn't check your connection.</td></tr>`;
    showSourcesError(err.message);
    return;
  }

  _connected.confluence = !!status.connected;
  _connected.jira = !!(status.connected && status.jiraScopeGranted);

  confBtn.style.display = _connected.confluence ? 'none' : '';
  jiraBtn.style.display = status.connected ? 'none' : '';
  scopeMsg.style.display = (status.connected && !status.jiraScopeGranted) ? '' : 'none';
  prompts.style.display = (!_connected.confluence || !_connected.jira) ? 'flex' : 'none';

  if (!status.connected) {
    body.innerHTML = `<tr><td colspan="4" class="ks-card-body">Connect a tool to list its sources.</td></tr>`;
    renderTable(_cachedDatasets, 0, 0);
    return;
  }

  // Both lists in parallel — neither depends on the other. A failure in one
  // must not blank the other, so each catches for itself.
  const [conf, jira] = await Promise.all([
    api('/confluence/personal/spaces?withCounts=1')
      .catch(err => { showSourcesError(err.message); return { spaces: [] }; }),
    _connected.jira
      ? api('/jira/personal/projects?withCounts=1')
          .catch(err => { showSourcesError(err.message); return { projects: [] }; })
      : Promise.resolve({ projects: [] }),
  ]);

  // Personal spaces (key "~accountId") are an individual's scratch area
  // holding Confluence's default tutorial pages, not team documentation.
  // Process links every listed source automatically, so leaving them in
  // would quietly ground the blueprint in "Getting started in Confluence".
  _sources.confluence = (conf.spaces || [])
    .filter(sp => sp.type !== 'personal' && !String(sp.key || '').startsWith('~'));
  _sources.jira = jira.projects || [];

  renderSourcesTable();
  await refreshLinked(blueprintId);
  updateProcessBar(_cachedDatasets);
}


// ── Bootstrap ─────────────────────────────────────────────────────────────

let _wired = false;

function wireStaticControls() {
  if (_wired) return;
  _wired = true;

  document.getElementById('aria-process-btn')?.addEventListener('click', () => {
    const id = _blueprintId;
    if (id) runProcess(id);
  });
}

document.addEventListener('aria:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  wireStaticControls();
  renderBreadcrumb(bp);

  _blueprintId = bp._id;
  const datasetsSection = findDatasetsSection(bp);
  _cachedDatasets = datasetsSection?.brief?.datasets || [];
  renderTable(_cachedDatasets, 0, 0);

  initSources(bp._id);

  // Connect links come back here with ?connect=<source>; there is one
  // sources table now, so just scroll to it rather than picking a panel.
  const connectParam = new URLSearchParams(window.location.search).get('connect');
  if (connectParam === 'confluence' || connectParam === 'jira') {
    setTimeout(() => {
      document.getElementById('aria-sources-panel')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
});
