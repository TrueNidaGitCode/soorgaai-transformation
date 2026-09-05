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
let _ariaBlueprint = null;

// Tool-level connection (an OAuth grant exists) — deliberately separate
// from whether any content has been linked. Right after connecting, a tool
// is connected but has nothing linked yet, and the UI has to say so rather
// than still reading "Not connected".
let _connected = { confluence: false, jira: false };

// Last link counts the required-data table was drawn with, so an upload can
// redraw it without re-fetching counts it did not change.
let _lastConfCount = 0;
let _lastJiraCount = 0;

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
  // Found in the customer's own schema, with a file to point at. The strongest
  // answer available: not a tool that might hold the data, the definition of
  // the table that does.
  const inCode = _codeMatches.get(d.name);
  if (inCode) return { state: 'in-code', source: null, match: inCode };

  // An uploaded export outranks a connector: the user has supplied the actual
  // data, which is stronger evidence than a tool being connected.
  if (_uploads.has(d.name)) return { state: 'uploaded', source: null };

  const source = resolveSource(d.typicalSource, confCount, jiraCount);
  // No connector reaches this data. Previously reported as "Filled from
  // analysis", which announced that Svarg would invent it; it is now a
  // first-class state that names the way in.
  if (!source) return { state: 'no-connector', source: null };
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

/**
 * One status per dataset, saying whether Svarg can see this data and what
 * would make it so. The tool's name belongs inside the status — "linked from
 * Jira" is a status; a Source column repeating Cob's guess is not.
 */
function statusCellHtml(state, source, dataset, match) {
  const tool = source ? esc(source.label) : '';

  // Shown even after processing: which table this came from stays useful, and
  // it is the evidence that distinguishes this from a guess.
  if (state === 'in-code') {
    return `<span class="aria-status aria-status--incode"><span class="aria-status-dot"></span>`
      + `In your code &mdash; <code>${esc(match.entity)}</code>`
      + `<span class="aria-status__where">${esc(match.definedIn)}</span></span>`;
  }

  // Once data has actually been processed, anything that had a route in reads
  // as complete. Leaving "Connected" up after a successful run made a finished
  // stage look half-done.
  if (_processed && (state === 'connected' || state === 'ready' || state === 'uploaded')) {
    return `<span class="aria-status aria-status--done"><span class="aria-status-dot"></span>Processed</span>`;
  }

  switch (state) {
    case 'uploaded': {
      const up = _uploads.get(dataset.name);
      return `<span class="aria-status aria-status--connected"><span class="aria-status-dot"></span>`
        + `Available &mdash; ${esc(up?.filename || 'uploaded file')}</span>`;
    }
    case 'connected':
      return `<span class="aria-status aria-status--connected"><span class="aria-status-dot"></span>`
        + `Available &mdash; linked from ${tool}</span>`;
    case 'ready':
      return `<span class="aria-status aria-status--ready"><span class="aria-status-dot"></span>`
        + `${tool} connected, not yet linked</span>`;
    case 'not-connected':
      return `<a href="${connectHref(source.id)}" class="aria-status aria-status--none aria-status--link">`
        + `<span class="aria-status-dot"></span>Connect ${tool} to supply this</a>`;
    default:
      // The state that made this whole screen necessary. It names the route in
      // rather than announcing that the data will be invented.
      return `<span class="aria-status aria-status--own"><span class="aria-status-dot"></span>`
        + `In your own systems &mdash; upload an export</span>`;
  }
}

function renderRow(d, confCount, jiraCount) {
  const { state, source, match } = rowState(d, confCount, jiraCount);
  return `
    <tr>
      <td>
        <span class="aria-row-name__title">${esc(d.name)}</span>
        <span class="aria-row-name__desc">${esc(d.purpose)}</span>
      </td>
      <td>${statusCellHtml(state, source, d, match)}</td>
    </tr>
  `;
}

function tally(datasets, confCount, jiraCount) {
  let connected = 0, toConnect = 0, ownSystems = 0;
  datasets.forEach(d => {
    const { state } = rowState(d, confCount, jiraCount);
    if (state === 'connected' || state === 'uploaded' || state === 'in-code') connected++;
    else if (state === 'not-connected' || state === 'ready') toConnect++;
    else ownSystems++;
  });
  return { connected, toConnect, ownSystems };
}

function updateReadinessCard(datasets, confCount, jiraCount) {
  const { connected, toConnect, ownSystems } = tally(datasets, confCount, jiraCount);

  // Over EVERY required dataset, not just the ones a connector can reach.
  // Dividing by the connectable subset is what rendered six required datasets
  // as "0 of 0" for a company that owns all six — a number that told the user
  // nothing and looked broken. Upload is a route in for any dataset, so all of
  // them belong in the denominator.
  const total = datasets.length;
  const pct = total ? Math.round((connected / total) * 100) : 0;

  document.getElementById('aria-readiness-fraction').textContent = `${connected} of ${total}`;
  document.getElementById('aria-readiness-pct').textContent = `${pct}%`;
  document.getElementById('aria-readiness-fill').style.width = `${pct}%`;
  document.getElementById('aria-legend-ready').textContent = `${connected} Available`;
  document.getElementById('aria-legend-missing').textContent = `${toConnect} To connect`;
  document.getElementById('aria-legend-inferred').textContent = `${ownSystems} In your systems`;

  const note = document.getElementById('aria-note');
  const noteText = document.getElementById('aria-note-text');
  if (note && noteText) {
    if (ownSystems > 0) {
      noteText.textContent = `${ownSystems} dataset${ownSystems === 1 ? '' : 's'} live${ownSystems === 1 ? 's' : ''} `
        + `in systems Svarg has no connector for. Upload an export for `
        + `${ownSystems === 1 ? 'it' : 'each'} so the blueprint is built on your real data.`;
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

  // A finished run owns the button. Any later re-render of the table — a
  // source list refreshing, for instance — would otherwise re-enable it and
  // wipe the completed state out from under the user.
  if (_processed) {
    if (btn) { btn.disabled = true; btn.textContent = '✓ Data Processed'; }
    return;
  }
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
          // Silently skipping an empty source is why Jira could vanish from
          // a run with no explanation. Say so instead.
          else results.push({ status: 'empty', title: src.name, error: 'No pages in this space — nothing to link.' });
        } else {
          // listIssues is ordered by created DESC.
          const res = await api('/jira/personal/projects/' + encodeURIComponent(src.key) + '/issues');
          const batch = (res.issues || []).slice(0, LINK_BATCH).map(iss => ({ issueKey: iss.key }));
          if (batch.length) jobs.push({ src, batch });
          else {
            // Show what Jira actually said, so an empty project and a
            // rejected query don't look identical on screen.
            const d = (res.diagnostics || [])[0];
            const detail = d?.errorMessages?.length
              ? 'Jira rejected the query: ' + d.errorMessages.join('; ')
              : d
                ? 'Jira returned no issues (total: ' + d.total + ', fields: ' + (d.responseKeys || []).join('/') + ')'
                : 'No issues in this project — nothing to link.';
            results.push({ status: 'empty', title: src.name, error: detail });
          }
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
      hint.textContent = results.some(r => r.status === 'error')
        ? 'No items could be read — see below.'
        : 'The connected sources are empty — nothing to link yet.';
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

    const linked = results.filter(r => r.status === 'linked').length;
    const failed = results.filter(r => r.status === 'error').length;
    const empty  = results.filter(r => r.status === 'empty').length;
    const ok = linked > 0 && failed === 0;
    if (ok) {
      // Re-render the dataset table so every sourced row reads Completed
      // rather than still advertising work to do.
      _processed = true;
      renderTable(_cachedDatasets, _sources.confluence.length, _sources.jira.length);
    }
    markAriaComplete(ok);
    // Finished state — the button previously stayed enabled and read the
    // same as before the run, which gave no signal the stage was done.
    // "Run again" stays available for re-linking after new content lands.
    btn.textContent = '✓ Data Processed';
    btn.disabled = true;
    hint.innerHTML = esc(
      linked + ' item' + (linked === 1 ? '' : 's') + ' linked'
      + (empty ? ', ' + empty + ' source' + (empty === 1 ? '' : 's') + ' empty' : '')
      + (failed ? ', ' + failed + ' failed' : '') + '.'
    ) + ' <button type="button" class="aria-relink" id="aria-relink">Run again</button>';
    document.getElementById('aria-relink')?.addEventListener('click', () => {
      _processed = false;
      renderTable(_cachedDatasets, _sources.confluence.length, _sources.jira.length);
      btn.disabled = false;
      btn.textContent = 'Process Connected Data';
      hint.textContent = '';
      hideProgress();
    });
  } catch (err) {
    hideProgress();
    btn.textContent = 'Process Connected Data';
    btn.disabled = false;
    hint.textContent = err.message || 'Linking failed. Please try again.';
  } finally {
    // Deliberately does NOT re-enable the button: on success the finished
    // state owns it (and "Run again" restores it), and the catch above
    // re-enables it when a retry is actually warranted. Re-enabling here
    // unconditionally undid the completion state.
    _processing = false;
  }
}

function renderTable(datasets, confCount, jiraCount) {
  // Remembered so an upload can redraw the table without re-fetching link
  // counts it did not change.
  _lastConfCount = confCount;
  _lastJiraCount = jiraCount;

  const body = document.getElementById('aria-required-body');
  body.innerHTML = datasets.map(d => renderRow(d, confCount, jiraCount)).join('')
    || `<tr><td colspan="2" class="ks-card-body">Data Readiness hasn't finished generating yet — check back shortly.</td></tr>`;
  updateReadinessCard(datasets, confCount, jiraCount);
  updateProcessBar(datasets);
  updateAriaNav(datasets, confCount, jiraCount);
  renderCollectionPlan(datasets, confCount, jiraCount);
}

/**
 * Moving on is never blocked.
 *
 * The gate used to be owned by runProcess — the Confluence/Jira linking path —
 * so a company whose engagement shows only GitHub and Upload could never
 * enable it at all. The one control that unlocked Arth sat on a tab they were
 * never shown.
 *
 * Beyond that bug, blocking on coverage is wrong on its own terms. A company
 * founded this year does not have most of its data yet, and refusing to let
 * them continue makes the product unusable for exactly the customers it is
 * aimed at. So the button always works, and says what it is continuing with.
 */
function updateAriaNav(datasets, confCount, jiraCount) {
  const btn  = document.getElementById('aria-nav-btn');
  const hint = document.getElementById('aria-nav-hint');
  if (!btn) return;

  const { connected } = tally(datasets, confCount, jiraCount);
  const total = datasets.length;
  btn.disabled = false;

  if (!total) {
    btn.textContent = 'Move to Arth →';
    if (hint) hint.textContent = '';
    return;
  }
  if (connected === total) {
    btn.textContent = 'Move to Arth →';
    if (hint) hint.textContent = 'Every required dataset has a source.';
    return;
  }

  // Naming the number on the button matters: continuing with partial data is a
  // decision, and it should not be made without seeing what is being left out.
  btn.textContent = `Continue with ${connected} of ${total} →`;
  if (hint) {
    hint.textContent = connected === 0
      ? 'No data connected yet. Svarg will design for the data you plan to collect.'
      : `${total - connected} dataset${total - connected === 1 ? '' : 's'} still to collect — listed below.`;
  }
}

/**
 * What the customer does not have yet, as something to act on.
 *
 * A new business is not failing when it cannot supply five of six datasets;
 * it has not started collecting them. Turning the gap into a list of what to
 * instrument is more useful than a warning, and it is derived from what is
 * already on screen rather than generated — nothing here is invented.
 */
function renderCollectionPlan(datasets, confCount, jiraCount) {
  const wrap = document.getElementById('aria-collect');
  const body = document.getElementById('aria-collect-body');
  if (!wrap || !body) return;

  const missing = datasets.filter(d => {
    const { state } = rowState(d, confCount, jiraCount);
    return state !== 'connected' && state !== 'uploaded' && state !== 'in-code';
  });

  if (!missing.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  // Highest priority first: Cob already ranked these, and the order it chose
  // is the order to start collecting in.
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sorted = [...missing].sort((a, b) =>
    (rank[(a.priority || '').toUpperCase()] ?? 3) - (rank[(b.priority || '').toUpperCase()] ?? 3));

  body.innerHTML = sorted.map(d => `
    <div class="aria-collect__row">
      <div class="aria-collect__main">
        <span class="aria-row-name__title">${esc(d.name)}</span>
        <span class="aria-row-name__desc">${esc(d.purpose || '')}</span>
        ${d.typicalSource ? `<span class="aria-collect__where">Usually lives in: ${esc(d.typicalSource)}</span>` : ''}
      </div>
      ${d.priority ? `<span class="aria-collect__pri aria-collect__pri--${esc(String(d.priority).toLowerCase())}">${esc(d.priority)}</span>` : ''}
    </div>`).join('');
}

// Aria is finished once data has actually been linked. Mark the journey
// step done and say what comes next — Arth isn't built, so this states
// that plainly instead of offering a link that goes nowhere.
function markAriaComplete(ok) {
  if (!ok) return;
  const steps = document.querySelectorAll('#screen-aria .pw-step');
  const aria = steps[1];
  if (aria) {
    aria.classList.remove('pw-step--active');
    aria.classList.add('pw-step--done');
  }
  const line = document.querySelector('#screen-aria .pw-step-line:nth-of-type(2)');
  if (line) line.classList.add('pw-step-line--done');

  const banner = document.getElementById('aria-next-stage');
  if (banner) banner.style.display = 'flex';

  // Moving on is the stage-navigation button's job. The banner used to carry
  // its own "Continue to Arth" link, which meant two different controls for
  // the same act in two different places on the page.
  // The nav button is no longer enabled from here — updateAriaNav owns it, and
  // it is never disabled. This only reports that processing finished.
  const navHint = document.getElementById('aria-nav-hint');
  if (navHint) navHint.textContent = 'Data processed — Arth is ready to choose a model.';
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
// Per source: how many documents are linked, how many went through the
// redaction pass, how many carry structured output. All derived from the
// stored documents, so they survive a reload and cannot drift from the DB.
let _linkedStats = { confluence: new Map(), jira: new Map() };

// Cached so Process can link without re-listing, and so Status can
// re-render after linking without another round trip.
let _sources = { confluence: [], jira: [] };

// Set once a processing run has succeeded. Drives the completed state of the
// dataset table and the stage-navigation gate.
let _processed = false;

function renderProcessing(el, results, keyField) {
  // Only surface what needs attention. A successful link already shows up
  // as "Linked · N" plus the Sensitive Data / Structured columns on the
  // source's own row, so listing every page and ticket again just piled a
  // long block of duplicate detail under the table.
  const notable = results.filter(r => r.status === 'error' || r.status === 'empty');
  if (!notable.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = 'block';
  el.innerHTML = notable.map(r => {
    // An empty source is a legitimate outcome, not a failure — a project
    // with no issues should not read like something went wrong.
    const cls = r.status === 'empty' ? 'empty' : 'error';
    return `<div class="pw-process-item pw-process-item--${cls}">
      <span class="pw-process-item__title">${esc(r.title || r[keyField] || '')}</span>
      <span class="pw-process-item__detail">${esc(r.error)}</span>
    </div>`;
  }).join('');
}

function pipelineCell(done, total, doneLabel, pendingLabel) {
  if (!total) return `<span class="aria-pipe aria-pipe--idle">&mdash;</span>`;
  if (done >= total) return `<span class="aria-pipe aria-pipe--ok">&check; ${doneLabel}</span>`;
  if (done === 0) return `<span class="aria-pipe aria-pipe--idle">${pendingLabel}</span>`;
  return `<span class="aria-pipe aria-pipe--part">${done} of ${total}</span>`;
}

function sourceRowHtml({ tool, toolId, name, key, count, capped, noun }) {
  const s = _linkedStats[toolId]?.get(key) || { linked: 0, redacted: 0, redactions: 0, structured: 0, failed: 0 };
  const status = s.linked > 0
    ? `<span class="aria-status aria-status--connected"><span class="aria-status-dot"></span>Linked · ${s.linked} ${noun}${s.linked === 1 ? '' : 's'}</span>`
    : `<span class="aria-status aria-status--ready"><span class="aria-status-dot"></span>Ready to link</span>`;

  // "Clean" is a real finding, not an absence: the pass ran and matched
  // nothing. Distinct from "—", which means nothing has been processed.
  const sensitive = !s.linked
    ? `<span class="aria-pipe aria-pipe--idle">&mdash;</span>`
    : s.redacted < s.linked
      ? `<span class="aria-pipe aria-pipe--part">${s.redacted} of ${s.linked}</span>`
      : s.redactions > 0
        ? `<span class="aria-pipe aria-pipe--flag">${s.redactions} removed</span>`
        : `<span class="aria-pipe aria-pipe--ok">&check; Clean</span>`;

  const structured = s.failed
    ? `<span class="aria-pipe aria-pipe--fail" title="Extraction failed — see the log">${s.failed} failed</span>`
    : pipelineCell(s.structured, s.linked, 'Structured', 'Pending');

  return `
    <tr>
      <td><span class="aria-src-tool aria-src-tool--${toolId}">${esc(tool)}</span></td>
      <td>
        <span class="aria-row-name__title">${esc(name)}</span>
        <span class="aria-row-name__desc">${esc(key)}</span>
      </td>
      <td>${status}</td>
      <td>${sensitive}</td>
      <td>${structured}</td>
      <td class="aria-src-table__count">${countCellHtml(count, capped, noun)}</td>
    </tr>
  `;
}

function renderSourcesTable() {
  const body = document.getElementById('aria-sources-body');
  if (!body) return;

  // Confluence and Jira share this table; the active tab decides whose rows
  // appear. Before any tab is selected (or when neither is shown), fall back
  // to both rather than rendering an empty table.
  const showConf = _activeTab !== 'jira';
  const showJira = _activeTab !== 'confluence';

  const rows = [
    ...(showConf ? _sources.confluence.map(sp => sourceRowHtml({
      tool: 'Confluence', toolId: 'confluence', name: sp.name, key: sp.key,
      count: sp.itemCount, capped: sp.itemCountCapped, noun: 'page',
    })) : []),
    ...(showJira ? _sources.jira.map(pr => sourceRowHtml({
      tool: 'Jira', toolId: 'jira', name: pr.name, key: pr.key,
      count: pr.itemCount, capped: pr.itemCountCapped, noun: 'ticket',
    })) : []),
  ];
  body.innerHTML = rows.join('')
    || `<tr><td colspan="6" class="ks-card-body">No sources connected yet.</td></tr>`;
}

async function refreshLinked(blueprintId) {
  try {
    const { documents } = await api(`/confluence/personal/linked/${encodeURIComponent(blueprintId)}`);
    const confDocs = documents.filter(d => (d.sourceType || 'confluence') === 'confluence');
    const jiraDocs = documents.filter(d => d.sourceType === 'jira');

    // Per-space / per-project linkage drives the Status column. Linked
    // documents carry spaceKey/projectKey, so this is real state.
    const tally = (docs, keyField) => {
      const m = new Map();
      docs.forEach(d => {
        const k = d[keyField];
        if (!k) return;
        const s = m.get(k) || { linked: 0, redacted: 0, redactions: 0, structured: 0, failed: 0 };
        s.linked++;
        if (d.redactionApplied) s.redacted++;
        s.redactions += (d.redactionCount || 0);
        // "Structured" means the extraction produced usable output, not
        // merely that it ran — a doc with no keywords is not structured.
        if (d.extractionStatus === 'extracted' && (d.keywords || []).length) s.structured++;
        if (d.extractionStatus === 'error') s.failed++;
        m.set(k, s);
      });
      return m;
    };
    _linkedStats = {
      confluence: tally(confDocs, 'spaceKey'),
      jira: tally(jiraDocs, 'projectKey'),
    };

    // The per-source "Linked · N pages" in the table replaces what used to
    // be one long comma-separated list of every title, which said nothing
    // about which source each came from.
    const linkedList = document.getElementById('aria-linked-list');
    if (linkedList) linkedList.style.display = 'none';

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
  body.innerHTML = `<tr><td colspan="6" class="ks-card-body">Loading sources…</td></tr>`;

  let status;
  try {
    status = await api('/confluence/personal/status');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="ks-card-body">Couldn't check your connection.</td></tr>`;
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
    body.innerHTML = `<tr><td colspan="6" class="ks-card-body">Connect a tool to list its sources.</td></tr>`;
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


// ── Connector tabs ───────────────────────────────────────────────────────────
// Which connectors matter depends on what kind of AI work this is. A company
// putting AI into the product it sells needs its repository and its own
// exports; a team automating its own support workflow needs the issue tracker.
// Showing all four to everyone is what left an education-software company
// staring at Confluence and Jira.

// Each connector carries its own mark and colour. A row of identical text
// labels made four quite different things — a wiki, an issue tracker, a code
// host, your own file — look like one undifferentiated list, and the tab you
// want is the one you recognise before you read it.
//
// Colours are the vendors' own, lightened where their brand value was chosen
// for a white interface — Jira's #0052CC on this background is a smudge, not a
// signal. Upload takes Aria's accent because it is not a vendor: it is the way
// in that always exists.
const ICONS = {
  confluence: '<path d="M2 15.5c2.5-4 5-4.5 8-1.5l4 4"/><path d="M22 8.5c-2.5 4-5 4.5-8 1.5l-4-4"/>',
  jira:       '<path d="M12 2 3 11a2 2 0 0 0 0 2l9 9"/><path d="M12 11h9a2 2 0 0 1 0 2l-5 5"/>',
  github:     '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  upload:     '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
};

const TABS = {
  confluence: { label: 'Confluence', panel: 'aria-sources-panel', color: '#2684FF' },
  jira:       { label: 'Jira',       panel: 'aria-sources-panel', color: '#4C9AFF' },
  github:     { label: 'GitHub',     panel: 'aria-tab-github',    color: '#C9D1D9' },
  upload:     { label: 'Upload',     panel: 'aria-tab-upload',    color: 'var(--aria-accent)' },
};

function tabIcon(id) {
  return '<svg class="aria-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[id] || '') + '</svg>';
}

let _activeTab = null;

/**
 * @returns {string[]} tab ids, in display order.
 *
 * An undecided engagement returns everything. Guests and every blueprint
 * generated before the classifier existed land there, and hiding a connector
 * someone genuinely needs is a worse failure than a slightly busier screen.
 */
function relevantTabs(bp) {
  const category = bp?.engagement?.category || '';
  if (category === 'product-ai') return ['github', 'upload'];

  if (category === 'workflow-automation') {
    const area = bp.engagement.subArea || '';
    if (area === 'requirements' || area === 'design') return ['confluence', 'upload'];
    if (area === 'code') return ['github', 'upload'];
    if (area === 'test' || area === 'deploy' || area === 'support') return ['jira', 'confluence', 'upload'];
    return ['confluence', 'jira', 'upload'];
  }
  return ['confluence', 'jira', 'github', 'upload'];
}

function selectTab(id) {
  _activeTab = id;

  document.querySelectorAll('#aria-tabs .aria-tab').forEach(btn => {
    const on = btn.dataset.tab === id;
    btn.classList.toggle('aria-tab--active', on);
    btn.setAttribute('aria-selected', String(on));
  });

  // Confluence and Jira share one panel and one linked-sources table; the tab
  // decides which tool's rows that table shows.
  const shown = TABS[id]?.panel;
  Object.values(TABS).forEach(t => {
    const el = document.getElementById(t.panel);
    if (el) el.style.display = t.panel === shown ? '' : 'none';
  });

  if (id === 'confluence' || id === 'jira') renderSourcesTable();
  if (id === 'upload') renderUploadList();
  if (id === 'github') refreshGithubStatus();
}

function renderTabs(bp) {
  const wrap = document.getElementById('aria-tabs');
  if (!wrap) return;
  const ids = relevantTabs(bp);

  wrap.innerHTML = ids.map(id =>
    `<button type="button" class="aria-tab" role="tab" data-tab="${id}"`
    + ` style="--tab-color:${TABS[id].color}" aria-selected="false">`
    + `${tabIcon(id)}<span>${esc(TABS[id].label)}</span></button>`
  ).join('');

  wrap.querySelectorAll('.aria-tab').forEach(btn => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
  });

  // A ?connect= deep link decides the opening tab when it names one we show.
  const wanted = new URLSearchParams(window.location.search).get('connect');
  selectTab(ids.includes(wanted) ? wanted : ids[0]);
}

// ── GitHub: connection only ──────────────────────────────────────────────────

/**
 * The READ-ONLY GitHub App, not the OAuth connection Eame delivers through.
 * That one carries the `repo` scope — write access to every repository the
 * user owns — which is not something to ask for on a data-connection screen.
 */
async function refreshGithubStatus() {
  const statusEl = document.getElementById('aria-gh-status');
  const btn = document.getElementById('aria-gh-connect');
  if (!statusEl || !btn) return;

  try {
    const { connected, configured, connectVia, scopeNote, accountLogin, repositorySelection } =
      await api('/github/app/status');

    if (!configured) {
      // Distinguished from "not connected" on purpose: nothing the user does
      // will fix a server with no GitHub connection configured at all, so do
      // not offer them a button that cannot work.
      statusEl.textContent = 'Reading repositories is not available on this server yet.';
      btn.style.display = 'none';
      return;
    }

    // Which flow the button starts depends on what the server has. A
    // deployment with only the OAuth connector still connects in one click.
    _connectVia = connectVia || 'app';

    statusEl.textContent = connected
      ? `Connected to ${accountLogin}`
        + (repositorySelection === 'selected' ? ' — selected repositories' : ' — all repositories')
        // What this connection actually grants. The OAuth one was granted for
        // delivery and carries write access; saying so is the difference
        // between a promise and a fact.
        + (scopeNote ? ` (${scopeNote}).` : '.')
      : 'Not connected.';
    btn.style.display = connected ? 'none' : '';

    const repos = document.getElementById('aria-gh-repos');
    if (repos) repos.style.display = connected ? '' : 'none';
    if (connected) loadRepos();
    renderAnalysis();
  } catch {
    statusEl.textContent = "Couldn't check your GitHub connection.";
    btn.style.display = '';
  }
}

function showGhError(message) {
  const el = document.getElementById('aria-gh-error');
  if (!el) return;
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

async function loadRepos() {
  const select = document.getElementById('aria-gh-repo-select');
  if (!select || select.dataset.loaded === '1') return;

  try {
    const { repositories } = await api('/github/app/repos');
    if (!repositories?.length) {
      showGhError('No repositories are covered by your installation. Add one from your GitHub settings.');
      return;
    }
    select.innerHTML = repositories
      .map(r => `<option value="${esc(r.fullName)}">${esc(r.fullName)}${r.language ? ` — ${esc(r.language)}` : ''}</option>`)
      .join('');
    select.dataset.loaded = '1';

    // Preselect whatever was read last, so re-reading the same repo is the
    // default rather than whichever happens to sort first.
    const previous = _ariaBlueprint?.codebaseProfile?.repoFullName;
    if (previous && repositories.some(r => r.fullName === previous)) select.value = previous;
  } catch (err) {
    showGhError(err.message);
  }
}

/** What the last read found, or that one is still running. */
function renderAnalysis() {
  const el = document.getElementById('aria-gh-analysis');
  if (!el) return;
  const p = _ariaBlueprint?.codebaseProfile;

  if (_analyzing) {
    el.textContent = 'Reading the repository… this takes a minute or two.';
    return;
  }
  if (!p?.checked) { el.textContent = ''; return; }

  const stack = [p.database, ...(p.frameworks || [])].filter(Boolean).slice(0, 4).join(', ');
  el.textContent = `Read ${p.filesRead} file${p.filesRead === 1 ? '' : 's'} from ${p.repoFullName}`
    + (stack ? ` — ${stack}.` : '.')
    + ` Found ${(p.entities || []).length} data entit${(p.entities || []).length === 1 ? 'y' : 'ies'},`
    + ` ${(p.datasetMatches || []).length} matched to required datasets.`
    // A partial read must say so: a profile built from 30 of 500 model files
    // should not read as a complete description of the product.
    + (p.partial ? ' This repository is large, so the profile covers part of it.' : '');
}

let _analyzing = false;

// 'app' or 'oauth' — set from status, decides which connect flow the button
// starts. Defaults to the App, which is the one a customer should be offered.
let _connectVia = 'app';

async function analyzeRepo() {
  const select = document.getElementById('aria-gh-repo-select');
  const btn = document.getElementById('aria-gh-analyze');
  if (!select?.value || !_blueprintId || _analyzing) return;

  _analyzing = true;
  showGhError('');
  if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
  renderAnalysis();

  try {
    await api('/github/app/analyze', {
      method: 'POST',
      body: JSON.stringify({ blueprintId: _blueprintId, repoFullName: select.value }),
    });
    // The read runs in the background, so poll the blueprint until the profile
    // lands rather than guessing how long a repository takes.
    await pollForProfile();
  } catch (err) {
    showGhError(err.message);
    ghProgress(null);
  } finally {
    _analyzing = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Read repository'; }
    renderAnalysis();
  }
}

/**
 * Wait for the read to land.
 *
 * Twenty minutes, not three. A local model takes well over a minute on three
 * small files, so a real repository is minutes of work — the original window
 * would have timed out on every honest run and told the user to reload a page
 * that was still working.
 */
/** What each phase is called, in the order the server runs them. */
const GH_PHASES = {
  listing:   'Listing the files in your repository…',
  fetching:  'Reading files…',
  profiling: 'Working out how the product is built…',
  matching:  'Matching your data to what it found…',
  storing:   'Saving…',
};
const GH_PHASE_ORDER = ['listing', 'fetching', 'profiling', 'matching', 'storing'];

function ghProgress(progress, startedMs) {
  const wrap = document.getElementById('aria-gh-progress');
  const l = document.getElementById('aria-gh-progress-label');
  const c = document.getElementById('aria-gh-progress-count');
  const f = document.getElementById('aria-gh-progress-fill');
  if (!wrap) return;

  if (!progress) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const phase = progress.phase || 'listing';
  if (l) l.textContent = GH_PHASES[phase] || 'Reading…';

  // Counters where the server has them; elapsed time otherwise. Both beat a
  // percentage invented for a phase whose length is not knowable.
  const elapsed = startedMs ? `${Math.round((Date.now() - startedMs) / 1000)}s` : '';
  if (c) c.textContent = progress.total ? `${progress.done} of ${progress.total} · ${elapsed}` : elapsed;

  // The bar tracks which phase we are in; within a counted phase it tracks the
  // count. Phases are not equal in length, so this is a position, not a
  // prediction of time remaining.
  const idx = Math.max(0, GH_PHASE_ORDER.indexOf(phase));
  const within = progress.total ? (progress.done / progress.total) : 0;
  const pct = Math.round(((idx + within) / GH_PHASE_ORDER.length) * 100);
  if (f) {
    f.style.width = Math.max(3, pct) + '%';
    f.classList.toggle('aria-progress__fill--working', !progress.total);
  }
}

async function pollForProfile() {
  const started = Date.now();
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const bp = await api(`/strategy-canvas/transformation-blueprint?id=${encodeURIComponent(_blueprintId)}`);
      if (bp?.codebaseProfile?.checked) {
        _ariaBlueprint = bp;
        applyCodeMatches(bp);
        renderTable(_cachedDatasets, _lastConfCount, _lastJiraCount);
        ghProgress(null);
        return;
      }
      ghProgress(bp?.codebaseProfile?.progress || { phase: 'listing' }, started);
    } catch { /* keep waiting — a transient failure is not an answer */ }
  }
  ghProgress(null);
  showGhError('The read is taking longer than expected. Reload the page to see the result.');
}

/** dataset name → { entity, definedIn } */
let _codeMatches = new Map();

function applyCodeMatches(bp) {
  _codeMatches = new Map(
    (bp?.codebaseProfile?.datasetMatches || []).map(m => [m.dataset, m])
  );
}

// ── Upload ───────────────────────────────────────────────────────────────────

// datasetName → { filename, ... } for files that were placed. Drives the
// required-data table, so only classified files belong here.
let _uploads = new Map();
// Everything uploaded, classified or not. A file we could not place is still
// context the customer supplied and must stay visible.
let _allUploads = [];

const MAX_UPLOAD_CHARS = 2_000_000;

async function loadUploads(blueprintId) {
  try {
    const { uploads } = await api(`/uploads/dataset-files/${encodeURIComponent(blueprintId)}`);
    _allUploads = uploads || [];
    _uploads = new Map(_allUploads.filter(u => u.datasetName).map(u => [u.datasetName, u]));
  } catch {
    // A failed list must not make the screen claim nothing was uploaded — but
    // it also must not block the rest of Aria. Leave whatever we already have.
  }
}

function renderUploadList() {
  const list = document.getElementById('aria-upload-list');
  if (!list) return;

  const unplaced = _allUploads.filter(u => !u.datasetName);
  const unplacedHtml = unplaced.length ? `
    <div class="aria-upload-unplaced">
      <p class="aria-upload-unplaced__head">${unplaced.length} file${unplaced.length === 1 ? '' : 's'} kept but not matched to a dataset</p>
      <p class="aria-upload-unplaced__note">Still used as background context. Nothing you uploaded is discarded.</p>
      ${unplaced.slice(0, 12).map(u => `<span class="aria-upload-unplaced__file">${esc(u.path || u.filename)}</span>`).join('')}
      ${unplaced.length > 12 ? `<span class="aria-upload-unplaced__file">and ${unplaced.length - 12} more</span>` : ''}
    </div>` : '';

  list.innerHTML = unplacedHtml;
}

function showUploadError(message) {
  const el = document.getElementById('aria-upload-error');
  if (!el) return;
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

// Must stay in step with ACCEPTED in uploadController — the browser filters
// first so the user is not told about a rejection the server would repeat.
const UPLOAD_EXTS = ['.csv', '.tsv', '.json', '.txt', '.md', '.sql', '.prisma', '.yaml', '.yml', '.xml'];
const UPLOAD_BATCH = 15;          // files per request; the server caps at 20

/**
 * A whole folder, classified afterwards.
 *
 * Nobody has one clean export per required dataset, so the user hands over the
 * folder and Svarg works out what is in it. Files are read in the browser and
 * only their text is sent — the same as the single-file path.
 */
/**
 * Progress for something that takes minutes.
 *
 * Reading is instant, uploading is quick, and classification is one slow model
 * call — so a bar driven by bytes would sit at 90% for most of the wait. The
 * phases are reported instead, with a counter during upload and an elapsed
 * clock during classification, because the question someone is actually asking
 * is "is this still working".
 */
function uploadProgress(label, { pct = null, count = '' } = {}) {
  const wrap = document.getElementById('aria-upload-progress');
  const l = document.getElementById('aria-upload-progress-label');
  const c = document.getElementById('aria-upload-progress-count');
  const f = document.getElementById('aria-upload-progress-fill');
  if (!wrap) return;

  if (label === null) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  if (l) l.textContent = label;
  if (c) c.textContent = count;
  if (f && pct !== null) f.style.width = Math.max(2, Math.min(100, pct)) + '%';
  if (f) f.classList.toggle('aria-progress__fill--working', pct === null);
}

async function handleFolderPick(fileList) {
  const all = [...(fileList || [])];
  const files = all.filter(f => UPLOAD_EXTS.some(e => f.name.toLowerCase().endsWith(e)));
  const btn = document.getElementById('aria-upload-folder-btn');
  const hint = document.getElementById('aria-upload-hint');
  const setHint = (t) => { if (hint) hint.textContent = t; };

  showUploadError('');
  if (!files.length) {
    showUploadError(`No readable text files in that folder. Svarg accepts ${UPLOAD_EXTS.join(', ')} — other formats need a parser it does not have yet.`);
    return;
  }
  if (!_blueprintId) return;

  const skipped = all.length - files.length;
  // Disabled while working: a second folder picked mid-run would interleave
  // uploads with a classification pass over a half-written set.
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
  setHint('');

  let clock = null;
  try {
    uploadProgress('Reading files from your folder…', { pct: 4, count: `0 of ${files.length}` });

    let sent = 0;
    for (let i = 0; i < files.length; i += UPLOAD_BATCH) {
      const slice = files.slice(i, i + UPLOAD_BATCH);
      const payload = [];
      for (const f of slice) {
        const text = await f.text().catch(() => null);
        if (text === null || !text.trim()) continue;
        if (text.length > MAX_UPLOAD_CHARS) continue;
        payload.push({ path: f.webkitRelativePath || f.name, text });
      }
      if (!payload.length) continue;

      await api('/uploads/folder', {
        method: 'POST',
        body: JSON.stringify({ blueprintId: _blueprintId, files: payload }),
      });
      sent += payload.length;
      // Uploading is capped at 60% of the bar: classification is the long part
      // and a bar that reached 100% before it started would be a lie.
      uploadProgress('Uploading to Svarg…', {
        pct: 4 + Math.round((sent / files.length) * 56),
        count: `${sent} of ${files.length}`,
      });
    }

    if (!sent) { showUploadError('None of those files could be read.'); uploadProgress(null); return; }

    // No percentage here on purpose — one model call whose duration is not
    // knowable in advance. An elapsed clock is honest; a crawling bar is not.
    const started = Date.now();
    const tick = () => uploadProgress('Working out which dataset each file serves…', {
      pct: null,
      count: `${Math.round((Date.now() - started) / 1000)}s`,
    });
    tick();
    clock = setInterval(tick, 1000);

    const { classified, unclassified } = await api('/uploads/classify', {
      method: 'POST',
      body: JSON.stringify({ blueprintId: _blueprintId }),
    });

    clearInterval(clock); clock = null;
    uploadProgress('Done', { pct: 100, count: `${Math.round((Date.now() - started) / 1000)}s` });

    await loadUploads(_blueprintId);
    renderUploadList();
    renderTable(_cachedDatasets, _lastConfCount, _lastJiraCount);

    setHint(`${sent} file${sent === 1 ? '' : 's'} uploaded — ${classified} matched to a dataset, ${unclassified} kept as context`
      + (skipped ? `. ${skipped} skipped as unsupported types.` : '.'));
    setTimeout(() => uploadProgress(null), 2500);
  } catch (err) {
    showUploadError(err.message);
    uploadProgress(null);
  } finally {
    if (clock) clearInterval(clock);
    if (btn) { btn.disabled = false; btn.textContent = 'Choose a folder'; }
  }

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

  document.getElementById('aria-gh-analyze')?.addEventListener('click', analyzeRepo);

  document.getElementById('aria-upload-folder-btn')?.addEventListener('click', () => {
    const input = document.getElementById('aria-upload-folder');
    input.value = '';               // so re-picking the same folder still fires
    input.click();
  });
  document.getElementById('aria-upload-folder')?.addEventListener('change', (e) => {
    handleFolderPick(e.target.files);
  });

  document.getElementById('aria-gh-connect')?.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.setItem('svarg_returning_to_aria', '1');
    // App install or OAuth authorize, whichever this server can do.
    const connectPath = _connectVia === 'oauth'
      ? '/github/personal/connect?returnTo=aria'
      : '/github/app/connect?returnTo=aria';
    api(connectPath)
      .then(({ url }) => { window.location.href = url; })
      .catch(err => { document.getElementById('aria-gh-status').textContent = err.message; });
  });
}

document.addEventListener('aria:show', (e) => {
  const bp = e.detail?.blueprint;
  if (!bp) return;
  wireStaticControls();
  renderBreadcrumb(bp);

  _blueprintId = bp._id;
  _ariaBlueprint = bp;
  const datasetsSection = findDatasetsSection(bp);
  _cachedDatasets = datasetsSection?.brief?.datasets || [];

  // Anything already found in their code, so the first paint shows it rather
  // than briefly claiming those datasets have no route in.
  applyCodeMatches(bp);

  // Which connectors this engagement calls for. Done before the first table
  // render so the opening tab is right on the first paint.
  renderTabs(bp);

  renderTable(_cachedDatasets, 0, 0);

  // Uploads decide dataset status, so the table has to be redrawn once they
  // are known — the first render above cannot know them yet.
  loadUploads(bp._id).then(() => {
    renderTable(_cachedDatasets, _lastConfCount, _lastJiraCount);
    if (_activeTab === 'upload') renderUploadList();
  });

  initSources(bp._id);

  // A ?connect= link lands back here; renderTabs has already opened the
  // matching tab, so this only has to bring it into view.
  const connectParam = new URLSearchParams(window.location.search).get('connect');
  if (connectParam) {
    setTimeout(() => {
      document.getElementById('aria-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
});
