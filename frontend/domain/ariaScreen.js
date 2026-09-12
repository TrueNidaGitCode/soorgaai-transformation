/**
 * Svarg — Arth screen (real product)
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

import { findAiUseCasesPrioritizationSection } from './blueprintSections.js';
import { press } from './autopilot.js';

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

  // Generated sample data ranks BELOW every real source and is checked after
  // all of them. It is evidence of shape, not of fact, and a dataset the
  // customer actually has must never be reported as invented.
  if (_samples.has(d.name)) return { state: 'sample', source: null };

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
    case 'sample': {
      // Never the green used for Available. This dataset is still missing —
      // what exists is an illustration of what it would look like, and the row
      // has to keep saying so every time anyone reads it.
      const s = _samples.get(dataset.name);
      return `<span class="aria-status aria-status--sample"><span class="aria-status-dot"></span>`
        + `Sample data &mdash; not your real data`
        + `<span class="aria-status__where">${s?.rowCount || 0} generated rows &middot; `
        // Seeing them is the point. A row count alone asks the customer to
        // take on trust the one thing this feature exists to let them check:
        // whether the shape is right for their business.
        + `<button type="button" class="aria-sample__view" data-sample-view="${esc(dataset.name)}">View</button>`
        + ` &middot; `
        + `<button type="button" class="aria-sample__remove" data-sample-remove="${esc(dataset.name)}">Remove</button>`
        + `</span></span>`;
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
      //
      // The second route is for a company that does not have this data at all
      // — pre-launch, there is nothing to export. Offered as a lesser option,
      // after the real one, because it is one.
      return `<span class="aria-status aria-status--own"><span class="aria-status-dot"></span>`
        + `In your own systems &mdash; upload an export`
        + `<span class="aria-status__where">Don't have it yet? `
        + `<button type="button" class="aria-sample__make" data-sample-make="${esc(dataset.name)}">`
        + `Generate sample data</button></span></span>`;
  }
}

function renderRow(d, confCount, jiraCount) {
  const { state, source, match } = rowState(d, confCount, jiraCount);
  // A second row, spanning both columns, for the sample preview to expand
  // into. Rendered empty and collapsed: the table is redrawn on every
  // readiness change, and holding the fetched rows in a sibling <tr> keeps
  // the expansion tied to its dataset rather than to a floating panel that
  // has to be told which row it belongs to.
  const previewRow = state === 'sample'
    ? `<tr class="aria-sample-preview" data-sample-preview="${esc(d.name)}" hidden>
         <td colspan="2"></td>
       </tr>`
    : '';
  return `
    <tr>
      <td>
        <span class="aria-row-name__title">${esc(d.name)}</span>
        <span class="aria-row-name__desc">${esc(d.purpose)}</span>
      </td>
      <td>${statusCellHtml(state, source, d, match)}</td>
    </tr>
    ${previewRow}
  `;
}

function tally(datasets, confCount, jiraCount) {
  let connected = 0, toConnect = 0, ownSystems = 0, sample = 0;
  datasets.forEach(d => {
    const { state } = rowState(d, confCount, jiraCount);
    if (state === 'connected' || state === 'uploaded' || state === 'in-code') connected++;
    // Sample data does NOT count as available, and this is the line that
    // matters most in the file. Readiness is the one number this screen exists
    // to report honestly; counting invented rows would let a customer generate
    // their way to "6 of 6 datasets available" while having none of them.
    else if (state === 'sample') sample++;
    else if (state === 'not-connected' || state === 'ready') toConnect++;
    else ownSystems++;
  });
  return { connected, toConnect, ownSystems, sample };
}

function updateReadinessCard(datasets, confCount, jiraCount) {
  const { connected, toConnect, ownSystems, sample } = tally(datasets, confCount, jiraCount);

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

  // Its own line, never folded into another count. A reader scanning the
  // legend must be able to see that some of this is generated.
  const sampleLegend = document.getElementById('aria-legend-sample');
  if (sampleLegend) {
    sampleLegend.textContent = `${sample} Sample data`;
    sampleLegend.parentElement.style.display = sample > 0 ? '' : 'none';
  }

  const note = document.getElementById('aria-note');
  const noteText = document.getElementById('aria-note-text');
  if (note && noteText) {
    if (sample > 0) {
      // Said first when it applies. A blueprint partly built on invented rows
      // is the more important fact than a dataset still to upload.
      noteText.textContent = `${sample} dataset${sample === 1 ? ' is' : 's are'} filled with generated `
        + `sample data. It shows the right shape, but ${sample === 1 ? 'it is' : 'they are'} not your `
        + `numbers — replace ${sample === 1 ? 'it' : 'them'} with a real export before trusting any `
        + `figure the blueprint quotes.`;
      note.style.display = '';
    } else if (ownSystems > 0) {
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

  const readyBefore = hasPreparedData();
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
    if (ok) moveOnIfReadyNow(readyBefore);
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
  // Same inputs as the table, so the report and the detail cannot disagree.
  renderPostRun();
}

/**
 * Moving on is never blocked.
 *
 * The gate used to be owned by runProcess — the Confluence/Jira linking path —
 * so a company whose engagement shows only GitHub and Upload could never
 * enable it at all. The one control that unlocked Eame sat on a tab they were
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

  const { connected, sample } = tally(datasets, confCount, jiraCount);
  const total = datasets.length;
  btn.disabled = false;

  if (!total) {
    btn.textContent = 'Move to Eame →';
    if (hint) hint.textContent = '';
    return;
  }
  if (connected === total) {
    btn.textContent = 'Move to Eame →';
    if (hint) hint.textContent = 'Every required dataset has a source.';
    return;
  }

  // Sample data is still not counted as connected — readiness has to stay
  // honest. But saying "No data connected yet" to someone who has just
  // generated a sample for all six is both wrong and dispiriting: they did the
  // thing the screen asked, and it answered as though nothing had happened.
  // So the count stays truthful and the sentence acknowledges the samples.
  const covered = connected + sample;
  if (covered === total && sample > 0) {
    btn.textContent = connected === 0
      ? 'Continue with sample data →'
      : `Continue with ${connected} real of ${total} →`;
    if (hint) {
      hint.textContent = connected === 0
        ? `All ${total} datasets are filled with generated samples. Enough to design `
          + 'against — replace them with real exports before trusting any figure.'
        : `${connected} of ${total} are your own data; the rest are generated samples.`;
    }
    return;
  }

  // Naming the number on the button matters: continuing with partial data is a
  // decision, and it should not be made without seeing what is being left out.
  btn.textContent = `Continue with ${connected} of ${total} →`;
  if (hint) {
    if (connected === 0 && sample === 0) {
      hint.textContent = 'No data connected yet. Svarg will design for the data you plan to collect.';
    } else {
      const missing = total - covered;
      // "listed below" pointed at the Still to collect section, which is gone.
      // The table above is where they are listed, and it is already on screen.
      const parts = [];
      if (sample) parts.push(`${sample} filled with generated samples`);
      if (missing) parts.push(`${missing} still to collect`);
      hint.textContent = parts.join(', ') + '.';
    }
  }
}

// renderCollectionPlan lived here. It re-listed every dataset the Required
// Data table had already shown as not connected — same name, same purpose,
// same typical source — with only the priority badge added. The intent was to
// turn a gap into a plan, but with the table directly above it, the second
// list read as a rendering bug. The table states a dataset and its state once.

// Arth is finished once data has actually been linked. Mark the journey
// step done and say what comes next.
function markAriaComplete(ok) {
  if (!ok) return;
  // Found by its own data-goto, not by index: this screen used to be second
  // in the journey and is now third, so steps[1] silently marked the stage
  // above it done and left this one active.
  const step = document.querySelector('#screen-aria .pw-step[data-goto="aria"]');
  if (step) {
    step.classList.remove('pw-step--active');
    step.classList.add('pw-step--done');
    const line = step.nextElementSibling;
    if (line && line.classList.contains('pw-step-line')) line.classList.add('pw-step-line--done');
  }

  const banner = document.getElementById('aria-next-stage');
  if (banner) banner.style.display = 'flex';

  // Moving on is the stage-navigation button's job. The banner used to carry
  // its own "Continue to Eame" link, which meant two different controls for
  // the same act in two different places on the page.
  // The nav button is no longer enabled from here — updateAriaNav owns it, and
  // it is never disabled. This only reports that processing finished.
  const navHint = document.getElementById('aria-nav-hint');
  if (navHint) navHint.textContent = 'Data processed — Eame can build on it.';
}

// ── The report after the run ──────────────────────────────────────────────
//
// The screen has two jobs and they want different pages: a workbench for
// connecting sources, and a report on what came back. Showing the workbench
// to someone who has finished is how a customer ends up wondering whether it
// worked.
//
// Every figure below is derived from the same state renderTable uses, so the
// summary and the detail cannot drift apart — which is the failure that would
// matter here, because the summary is the part people will believe.

const POST_ICONS = {
  data:   '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
  file:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  code:   '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  sample: '<path d="M9 3h6M10 3v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 18l-5-9V3"/>',
  cloud:  '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  info:   '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
};

const postIcon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"`
  + ` stroke-linecap="round" stroke-linejoin="round">${POST_ICONS[k] || ''}</svg>`;

/** What one dataset actually amounts to, in the terms the row already uses. */
function postRow(d, confCount, jiraCount) {
  const { state, source } = rowState(d, confCount, jiraCount);

  if (state === 'in-code') {
    return { icon: 'code', count: 'in your code', label: 'Found', cls: '' };
  }
  if (state === 'uploaded') {
    const up = _uploads.get(d.name);
    return { icon: 'file', count: up?.filename || 'uploaded file', label: _processed ? 'Processed' : 'Uploaded', cls: '' };
  }
  if (state === 'sample') {
    const s = _samples.get(d.name);
    // Never reported as connected. This dataset is still missing; what exists
    // is an illustration of its shape, and the report has to keep saying so.
    return { icon: 'sample', count: `${s?.rowCount || 0} generated rows`, label: 'Simulated', cls: 'warn' };
  }
  if (state === 'connected') {
    return { icon: 'cloud', count: source?.label || '', label: _processed ? 'Processed' : 'Connected', cls: '' };
  }
  if (state === 'ready') {
    return { icon: 'cloud', count: source?.label || '', label: _processed ? 'Processed' : 'Ready', cls: 'muted' };
  }
  if (state === 'no-connector') {
    return { icon: 'info', count: '—', label: 'Not applicable', cls: 'muted' };
  }
  return { icon: 'cloud', count: source?.label || '', label: 'To connect', cls: 'muted' };
}

/** The connectors that actually contributed, with what each supplied. */
function postSources(confCount, jiraCount) {
  const out = [];
  if (confCount > 0) out.push({ icon: 'cloud', name: 'Confluence', what: `${confCount} page${confCount === 1 ? '' : 's'} linked`, state: 'Connected' });
  if (jiraCount > 0) out.push({ icon: 'cloud', name: 'Jira', what: `${jiraCount} issue${jiraCount === 1 ? '' : 's'} linked`, state: 'Connected' });

  if (_uploads.size) {
    out.push({ icon: 'file', name: 'Uploaded files', what: [..._uploads.values()].map(u => u.filename).filter(Boolean).slice(0, 3).join(', ') || 'Your exports', state: 'Connected' });
  }
  if (_codeMatches.size) {
    out.push({ icon: 'code', name: 'Your repository', what: `${_codeMatches.size} table${_codeMatches.size === 1 ? '' : 's'} matched in your schema`, state: 'Read' });
  }
  if (_samples.size) {
    out.push({ icon: 'sample', name: 'Simulated data', what: `${_samples.size} dataset${_samples.size === 1 ? '' : 's'} filled with generated rows`, state: 'Not real data', muted: true });
  }
  return out;
}

/**
 * Is there prepared data to report on?
 *
 * Not the same question as "did a run happen in this browser tab". _processed
 * is set by runProcess and starts false on every load, so keying the report to
 * it alone would show it exactly once — the customer who processed yesterday
 * would come back to the workbench, the Process button live again, and no sign
 * that anything had ever worked.
 *
 * What the report describes is the state of the data, and that is on the
 * server: a dataset reads 'connected' only when content is actually linked to
 * this blueprint, which is what processing does. Uploads, matched tables and
 * generated rows count too — each is data the application can be built on.
 */
function hasPreparedData() {
  if (_processed) return true;
  if (_uploads.size || _samples.size || _codeMatches.size) return true;
  const { connected } = tally(_cachedDatasets || [], _sources.confluence.length, _sources.jira.length);
  return connected > 0;
}

/**
 * The journey runs itself from here.
 *
 * This is the one stage where the customer decides -- their own data or
 * generated samples -- and the moment that decision has produced ready data
 * is the moment the stage is finished. Called at the end of each action that
 * can produce it (the sample batch, processing connected sources, a folder
 * upload) with what hasPreparedData() said BEFORE the action: the move
 * happens only when this action is what made the data ready. A customer who
 * arrived with data already prepared and generated one more sample is
 * refining, not finishing, and stays.
 */
function moveOnIfReadyNow(readyBefore) {
  if (readyBefore || !hasPreparedData()) return;
  press('aria-nav-btn');
}

function renderPostRun() {
  const post = document.getElementById('aria-postrun');
  const during = document.getElementById('aria-during');
  if (!post || !during) return;

  // The report exists only once there is something to report. Before that the
  // workbench is the page.
  const ready = hasPreparedData();
  post.hidden = !ready;

  // The hero sits above both pages of this screen and says which one this
  // is. Written here so it can never disagree with what is shown under it.
  const heroMark = document.getElementById('aria-hero-mark');
  const heroPill = document.getElementById('aria-hero-pill');
  const heroTitle = document.getElementById('aria-hero-title');
  const postSubEl = document.getElementById('aria-post-sub');
  if (heroMark) heroMark.classList.toggle('ae-hero__mark--pending', !ready);
  if (heroPill) {
    heroPill.textContent = ready ? 'Data ready' : 'Connecting';
    heroPill.classList.toggle('ae-pill--pending', !ready);
  }
  if (heroTitle) heroTitle.textContent = ready ? 'Your data is ready!' : 'Prepare your data';

  if (!ready) {
    if (postSubEl) postSubEl.textContent = 'Choose how to provide the data for your application: simulate it, or connect your own.';
    during.hidden = false;
    return;
  }
  // After the run the report is the page. The workbench used to sit behind
  // a "View technical details" disclosure; that went as not useful.
  during.hidden = true;
  // And the move on is offered whatever was chosen to get here.
  const navEl = document.querySelector('#screen-aria .stage-nav');
  if (navEl) navEl.style.display = '';

  const datasets = _cachedDatasets || [];
  const confCount = _sources.confluence.length;
  const jiraCount = _sources.jira.length;
  const { connected, sample } = tally(datasets, confCount, jiraCount);

  // The dial counts real data only, for the same reason the readiness number
  // does: a customer must not be able to generate their way to a full circle.
  const total = datasets.length;
  const pct = total ? Math.round((connected / total) * 100) : 0;
  const dial = document.getElementById('aria-post-dial');
  if (dial) {
    dial.innerHTML = `
      <div class="dr-dial__ring" style="background: conic-gradient(var(--ws-accent, #2ee6d6) ${pct * 3.6}deg, rgba(93,143,155,.2) 0deg)">
        <span class="dr-dial__inner">
          <span class="dr-dial__num">${connected}</span>
          <span class="dr-dial__unit">of ${total}</span>
        </span>
      </div>
      <span>${connected === total && total ? 'Connected successfully' : 'Data sources connected'}</span>`;
  }

  const rows = document.getElementById('aria-post-rows');
  if (rows) {
    rows.innerHTML = datasets.map(d => {
      const r = postRow(d, confCount, jiraCount);
      return `
        <li class="dr-row">
          <span class="dr-row__icon" aria-hidden="true">${postIcon(r.icon)}</span>
          <span class="dr-row__meta">
            <span class="dr-row__name">${esc(d.name)}</span>
            <span class="dr-row__count">${esc(r.count)}</span>
          </span>
          <span class="dr-row__state${r.cls ? ' dr-row__state--' + r.cls : ''}">${esc(r.label)}</span>
        </li>`;
    }).join('') || '<li class="dr-row"><span class="dr-row__name">No datasets were identified for this use case.</span></li>';
  }

  const srcEl = document.getElementById('aria-post-sources');
  const sources = postSources(confCount, jiraCount);
  if (srcEl) {
    srcEl.innerHTML = sources.map(s => `
      <li class="dr-source">
        <span class="dr-source__icon" aria-hidden="true">${postIcon(s.icon)}</span>
        <span class="dr-row__meta">
          <span class="dr-source__name">${esc(s.name)}</span>
          <span class="dr-source__what">${esc(s.what)}</span>
        </span>
        <span class="dr-source__state${s.muted ? ' dr-source__state--muted' : ''}">${esc(s.state)}</span>
      </li>`).join('') || '<li class="dr-source"><span class="dr-source__what">Nothing was connected for this use case.</span></li>';
  }

  const sub = document.getElementById('aria-post-sources-sub');
  if (sub) {
    sub.textContent = connected > 0
      ? 'Real data has been collected from your connected sources.'
      : 'No real data was connected, so the application will run on generated rows.';
  }

  // The "What's Next" card is gone, but the warning it carried is not. A
  // customer running partly on invented rows has to be told they are invented
  // and that their own data will replace them — that is the one thing on this
  // screen they could otherwise act on while believing something false.
  const note = document.getElementById('aria-post-note');
  if (note) {
    note.textContent = sample
      ? `${sample} dataset${sample === 1 ? ' is' : 's are'} filled with generated rows carrying _source=sample, `
        + 'replaced by your own data once it is connected. Everything else is stored securely in your Svarg environment.'
      : 'All data is securely processed and stored in your Svarg environment.';
  }

  const stateText = document.getElementById('aria-post-state-text');
  const state = document.getElementById('aria-post-state');
  const allReal = total > 0 && connected === total;
  if (stateText) stateText.textContent = allReal ? 'Ready' : (connected > 0 ? 'Partly simulated' : 'Simulated');
  if (state) state.classList.toggle('ae-state--pending', !allReal);

  const postSub = document.getElementById('aria-post-sub');
  if (postSub) {
    postSub.textContent = allReal
      ? 'Arth has collected and prepared the required data for this use case.'
      : 'Arth has prepared what it could reach, and filled the rest so you can still build.';
  }
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
// signal. Upload takes Arth's accent because it is not a vendor: it is the way
// in that always exists.
const ICONS = {
  confluence: '<path d="M2 15.5c2.5-4 5-4.5 8-1.5l4 4"/><path d="M22 8.5c-2.5 4-5 4.5-8 1.5l-4-4"/>',
  jira:       '<path d="M12 2 3 11a2 2 0 0 0 0 2l9 9"/><path d="M12 11h9a2 2 0 0 1 0 2l-5 5"/>',
  github:     '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  upload:     '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  sample:     '<path d="M3 3v18h18"/><path d="M7 15l3-4 3 2 4-6"/><circle cx="7" cy="15" r="1"/><circle cx="17" cy="7" r="1"/>',
};

const TABS = {
  confluence: { label: 'Confluence', panel: 'aria-sources-panel', color: '#2684FF' },
  jira:       { label: 'Jira',       panel: 'aria-sources-panel', color: '#4C9AFF' },
  github:     { label: 'GitHub',     panel: 'aria-tab-github',    color: '#C9D1D9' },
  upload:     { label: 'Upload',     panel: 'aria-tab-upload',    color: 'var(--aria-accent)' },
  // Amber, matching the sample rows in the table. Last, because it is the
  // answer for data that does not exist and every real route should be tried
  // before that one.
  sample:     { label: 'Sample data', panel: 'aria-tab-sample',    color: '#D4AF6E' },
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
  // Sample data is appended to every set rather than listed in each: "we have
  // not collected this yet" is true of every engagement type, and a connector
  // list is about where data lives, not whether it exists.
  const withSample = ids => [...ids, 'sample'];

  if (category === 'product-ai') return withSample(['github', 'upload']);

  if (category === 'workflow-automation') {
    const area = bp.engagement.subArea || '';
    if (area === 'requirements' || area === 'design') return withSample(['confluence', 'upload']);
    if (area === 'code') return withSample(['github', 'upload']);
    if (area === 'test' || area === 'deploy' || area === 'support') return withSample(['jira', 'confluence', 'upload']);
    return withSample(['confluence', 'jira', 'upload']);
  }
  return withSample(['confluence', 'jira', 'github', 'upload']);
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
  if (id === 'sample') renderSamplePanel();
}

/**
 * ── The one decision ────────────────────────────────────────────────────────
 *
 * Before the run, the screen asks one thing: simulate the data, or bring your
 * own. Simulate runs the sample batch for every dataset it can, at once, and
 * moves on when it is done; Upload opens the connectors, and the first source
 * that lands moves on with whatever is there. Neither path shows a Generate
 * or Process button that the customer then has to find.
 *
 * The choice is remembered for the tab session, because connecting
 * Confluence or GitHub leaves the page for OAuth and comes back to it.
 */
const CHOICE_KEY = 'svarg_arth_choice';

const SOURCE_CARDS = {
  github:     { title: 'GitHub',       sub: 'Read your repositories to find the data your product already has.' },
  upload:     { title: 'Local folder', sub: 'Upload exports and files from your own computer.' },
  confluence: { title: 'Confluence',   sub: 'Connect your Confluence space for documents and knowledge.' },
  jira:       { title: 'Jira',         sub: 'Connect your Jira projects for tickets, defects and history.' },
};

let _choice = null;
let _githubConnected = false;

function chooseData(choice, { remember = true } = {}) {
  _choice = choice;
  if (remember) { try { sessionStorage.setItem(CHOICE_KEY, choice); } catch { /* fine */ } }

  const wrap = document.getElementById('aria-choice');
  wrap?.classList.toggle('dc-choice--decided', !!choice);
  wrap?.querySelectorAll('.dc-card').forEach(c => c.classList.toggle('dc-card--on', c.dataset.choice === choice));
  const note = document.getElementById('aria-choice-note');
  if (note) note.style.display = choice ? 'none' : '';

  const strip = document.getElementById('aria-runstrip');
  const connectors = document.getElementById('aria-connectors');
  const workbench = document.getElementById('aria-workbench');
  if (strip) strip.style.display = choice === 'simulate' ? '' : 'none';
  if (connectors) connectors.style.display = choice === 'upload' ? '' : 'none';
  // The readiness card and the required-data table answer "what does this
  // need" -- the question the Upload path asks. The Simulate path does not.
  if (workbench) workbench.style.display = choice === 'upload' ? '' : 'none';
  // Before the choice, the choice is the action; a "Continue with 0 of 5"
  // beside it is a second one. Back once a path is taken: Upload can
  // legitimately continue with part of the data.
  const nav = document.querySelector('#screen-aria .stage-nav');
  // Simulate moves on by itself, so no Continue sits under it while it runs.
  if (nav) nav.style.display = (choice === 'upload' || hasPreparedData()) ? '' : 'none';

  if (choice === 'upload') renderConnectors();
}

/** The connector cards for this engagement, and what is connected. */
function renderConnectors() {
  const cards = document.getElementById('aria-connector-cards');
  const list = document.getElementById('aria-connector-status');
  if (!cards || !_ariaBlueprint) return;
  const ids = relevantTabs(_ariaBlueprint).filter(id => id !== 'sample');

  const connectedOf = (id) => id === 'github' ? _githubConnected
    : id === 'upload' ? _allUploads.length > 0
    : id === 'confluence' ? _sources.confluence.length > 0
    : id === 'jira' ? _sources.jira.length > 0
    : false;

  cards.innerHTML = ids.map(id => {
    const c = SOURCE_CARDS[id];
    const on = connectedOf(id);
    return `
      <div class="dc-src${on ? ' dc-src--on' : ''}" style="--tab-color:${TABS[id].color}">
        <div class="dc-src__head">
          <span class="dc-src__icon">${tabIcon(id)}</span>
          <span class="dc-src__title">${esc(c.title)}</span>
        </div>
        <p class="dc-src__sub">${esc(c.sub)}</p>
        <button type="button" class="dc-src__btn" data-connector="${id}">${on ? 'Open' : 'Connect'}</button>
      </div>`;
  }).join('');

  if (list) {
    list.innerHTML = ids.map(id => {
      const on = connectedOf(id);
      return `<li class="dc-connect__item"><span>${esc(SOURCE_CARDS[id].title)}</span>
        <span class="dc-connect__state${on ? ' dc-connect__state--on' : ''}">${on ? '✓ Connected' : 'Not connected'}</span></li>`;
    }).join('');
  }

  cards.querySelectorAll('[data-connector]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.connector;
      selectTab(id);
      cards.querySelectorAll('.dc-src').forEach(s => s.classList.toggle('dc-src--on', s.contains(btn) || connectedOf(s.querySelector('[data-connector]').dataset.connector)));
      // A local folder is one click: the picker opens straight away.
      if (id === 'upload') document.getElementById('aria-upload-folder-btn')?.click();
      document.getElementById(TABS[id].panel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/**
 * Simulate: the batch, started from the card, with the strip reporting it.
 * The sample panel's own controls stay hidden; renderSamplePanel builds the
 * target list the batch reads, and runSampleBatch does the work.
 */
async function simulateNow() {
  selectTab('sample');
  const targets = samplableDatasets();
  if (!targets.length) {
    // Nothing to generate: every dataset already has data. That is ready.
    renderRunStrip(4);
    moveOnIfReadyNow(false);
    return;
  }
  await runSampleBatch();
}

/**
 * The four steps of the Simulate run. Generating is the batch itself, one
 * dataset at a time; validation and preparation are the reload and the
 * redraw that follow it, quick but real; ready is the move.
 */
const STRIP_STEPS = [
  { title: 'Generating data', sub: 'Creating realistic datasets…' },
  { title: 'Validating',      sub: 'Checking what came back' },
  { title: 'Preparing',       sub: 'Preparing for the model' },
  { title: 'Ready',           sub: 'Moving on to Eame' },
];
let _stripStart = 0;

function renderRunStrip(reached, detail = '', eta = '') {
  const ol = document.getElementById('aria-runstrip-steps');
  const etaEl = document.getElementById('aria-runstrip-eta');
  if (ol) {
    ol.innerHTML = STRIP_STEPS.map((st, i) => {
      const state = i < reached ? 'done' : i === reached ? 'active' : 'waiting';
      const sub = state === 'active' && detail ? detail : (state === 'done' ? 'Done' : st.sub);
      return `<li class="dc-step dc-step--${state}"><span class="dc-step__mark" aria-hidden="true"></span>
        <span class="dc-step__text"><span class="dc-step__title">${esc(st.title)}</span><span class="dc-step__sub">${esc(sub)}</span></span></li>`;
    }).join('');
  }
  if (etaEl) etaEl.textContent = reached >= STRIP_STEPS.length ? 'Done' : (eta || 'Estimating…');
}

function stripEta(done, total) {
  if (!done || !_stripStart) return '';
  const perOne = (Date.now() - _stripStart) / done;
  const s = Math.max(5, Math.round(perOne * (total - done) / 1000) + 6);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} sec` : `${s} sec`;
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
    _githubConnected = !!connected;
    if (_choice === 'upload') renderConnectors();

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
        const readyBefore = hasPreparedData();
        _ariaBlueprint = bp;
        applyCodeMatches(bp);
        renderTable(_cachedDatasets, _lastConfCount, _lastJiraCount);
        ghProgress(null);
        // A repository that matched datasets is data; the journey moves on.
        moveOnIfReadyNow(readyBefore);
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

/**
 * datasetName → { rowCount, generatedAt } for generated sample data.
 *
 * Deliberately a separate map from _uploads, mirroring the separate list the
 * endpoint returns. Merging them would put "is this the customer's data or
 * ours?" behind a flag someone has to remember to check, and that question is
 * the entire point.
 */
let _samples = new Map();

async function loadUploads(blueprintId) {
  try {
    const { uploads, samples } = await api(`/uploads/dataset-files/${encodeURIComponent(blueprintId)}`);
    _allUploads = uploads || [];
    _uploads = new Map(_allUploads.filter(u => u.datasetName).map(u => [u.datasetName, u]));
    _samples = new Map((samples || []).filter(s => s.datasetName).map(s => [s.datasetName, s]));
  } catch {
    // A failed list must not make the screen claim nothing was uploaded — but
    // it also must not block the rest of Arth. Leave whatever we already have.
  }
}

/**
 * Generate or remove sample data for one dataset.
 *
 * Delegated on the table so it keeps working across re-renders — the rows are
 * replaced wholesale every time the readiness figure changes.
 */
/**
 * Show the generated rows under their dataset.
 *
 * Built with DOM calls rather than innerHTML: the cells come from a model, and
 * a generated value containing markup must render as text, not as elements.
 */
async function toggleSamplePreview(datasetName, btn) {
  const row = document.querySelector(`[data-sample-preview="${CSS.escape(datasetName)}"]`);
  if (!row) return;

  if (!row.hidden) {
    row.hidden = true;
    btn.textContent = 'View';
    return;
  }

  const cell = row.firstElementChild;
  if (!cell.dataset.loaded) {
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      const data = await api(`/uploads/synthetic-dataset/${encodeURIComponent(_blueprintId)}`
        + `/${encodeURIComponent(datasetName)}`);

      const wrap = document.createElement('div');
      wrap.className = 'aria-sample-table__wrap';

      const note = document.createElement('p');
      note.className = 'aria-sample-table__note';
      note.textContent = `${data.rowCount} generated rows. Every row carries _source=sample. `
        + 'These are not your records — they show the columns and spread this dataset would have.';
      wrap.appendChild(note);

      const table = document.createElement('table');
      table.className = 'aria-sample-table';

      const thead = document.createElement('thead');
      const htr = document.createElement('tr');
      for (const h of data.header) {
        const th = document.createElement('th');
        th.textContent = h;
        htr.appendChild(th);
      }
      thead.appendChild(htr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const r of data.rows) {
        const tr = document.createElement('tr');
        for (let i = 0; i < data.header.length; i++) {
          const td = document.createElement('td');
          // An empty cell is meaningful in a sample — it is what a null looks
          // like — so it is shown as a dash rather than as nothing.
          td.textContent = (r[i] ?? '').trim() || '—';
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);

      cell.replaceChildren(wrap);
      cell.dataset.loaded = '1';
    } catch (err) {
      showUploadError(err.message || 'Could not load the sample data.');
      btn.disabled = false;
      btn.textContent = 'View';
      return;
    }
    btn.disabled = false;
  }

  row.hidden = false;
  btn.textContent = 'Hide';
}

// ── Sample data tab: everything missing, in one run ──────────────────────────

/**
 * The datasets a sample would actually help with.
 *
 * Only rows in the `no-connector` state: no repository match, no upload, no
 * connector, and no sample already. Anything the customer has supplied is
 * excluded rather than offered and refused — the server would 409, but making
 * the user discover that one dataset at a time is not a design.
 */
function samplableDatasets() {
  return (_cachedDatasets || []).filter(d =>
    rowState(d, _lastConfCount, _lastJiraCount).state === 'no-connector');
}

function renderSamplePanel() {
  const list = document.getElementById('aria-sample-targets');
  const btn = document.getElementById('aria-sample-run');
  if (!list || !btn) return;

  const targets = samplableDatasets();
  const have = _samples.size;

  if (!targets.length) {
    list.innerHTML = `<p class="aria-sample__none">${
      have
        ? 'Every dataset now has either your own data or a generated sample.'
        : 'Every dataset already has a route in. There is nothing to generate.'
    }</p>`;
    btn.style.display = 'none';
    return;
  }

  list.innerHTML = `
    <p class="aria-sample__targets-head">Svarg will generate a sample for ${targets.length} dataset${targets.length === 1 ? '' : 's'}:</p>
    ${targets.map(d => `
      <div class="aria-sample__target" data-target="${esc(d.name)}">
        <span class="aria-sample__target-name">${esc(d.name)}</span>
        <span class="aria-sample__target-state">waiting</span>
      </div>`).join('')}`;

  btn.style.display = '';
  btn.disabled = false;
  btn.textContent = `Generate sample data for ${targets.length} dataset${targets.length === 1 ? '' : 's'}`;
}

function setSampleProgress(done, total, label) {
  const wrap = document.getElementById('aria-sample-progress');
  const fill = document.getElementById('aria-sample-progress-fill');
  const lab = document.getElementById('aria-sample-progress-label');
  const count = document.getElementById('aria-sample-progress-count');
  if (!wrap) return;
  if (total === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`;
  if (lab) lab.textContent = label;
  if (count) count.textContent = `${done} of ${total}`;
}

function markTarget(name, state, text) {
  const row = document.querySelector(`[data-target="${CSS.escape(name)}"]`);
  if (!row) return;
  row.classList.remove('is-running', 'is-done', 'is-failed');
  row.classList.add(state);
  const cell = row.querySelector('.aria-sample__target-state');
  if (cell) cell.textContent = text;
}

/**
 * Generate for every missing dataset, one at a time.
 *
 * Sequential on purpose. Each is a model call of tens of seconds, and firing
 * five at once would make the progress meaningless, hammer the provider's rate
 * limit, and turn one failure into an ambiguous result. One at a time means
 * the failures are attributable and the ones that worked are kept.
 */
async function runSampleBatch() {
  const btn = document.getElementById('aria-sample-run');
  const errEl = document.getElementById('aria-sample-error');
  const targets = samplableDatasets();
  if (!targets.length || !_blueprintId) return;

  const context = (document.getElementById('aria-sample-context')?.value || '').trim();
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  const readyBefore = hasPreparedData();
  let done = 0;
  const failures = [];
  _stripStart = Date.now();
  renderRunStrip(0, `0 of ${targets.length} datasets`);

  for (const d of targets) {
    markTarget(d.name, 'is-running', 'generating…');
    setSampleProgress(done, targets.length, `Generating ${d.name}…`);
    renderRunStrip(0, `${d.name} (${done + 1} of ${targets.length})`, stripEta(done, targets.length));
    try {
      const res = await api('/uploads/synthetic-dataset', {
        method: 'POST',
        body: JSON.stringify({ blueprintId: _blueprintId, datasetName: d.name, context }),
      });
      markTarget(d.name, 'is-done', `${res.rowCount} rows`);
    } catch (err) {
      // Kept going. One dataset the model choked on must not cost the other
      // four, and the ones that worked are already saved.
      markTarget(d.name, 'is-failed', 'failed');
      failures.push(`${d.name}: ${err.message}`);
    }
    done++;
    setSampleProgress(done, targets.length, done === targets.length ? 'Done' : `Generating…`);
  }

  renderRunStrip(1, 'Checking what came back', stripEta(targets.length - 0.5, targets.length));
  await loadUploads(_blueprintId);
  renderRunStrip(2, 'Preparing for the model');
  renderTable(_cachedDatasets, _lastConfCount, _lastJiraCount);
  renderRunStrip(failures.length ? 2 : 3, failures.length ? `${failures.length} could not be generated` : 'Moving on to Eame');
  if (!failures.length) renderRunStrip(4);
  // The reason, on the page the customer is looking at. The batch keeps the
  // ones that worked, so trying again generates only what is missing.
  const failBox = document.getElementById('aria-runstrip-error');
  const failText = document.getElementById('aria-runstrip-error-text');
  if (failBox && failText) {
    const ok = targets.length - failures.length;
    failText.textContent = failures.length
      ? `${failures.length} of ${targets.length} could not be generated${ok ? ` (${ok} saved)` : ''}: ${failures[0]}`
        + (failures.length > 1 ? ` — and ${failures.length - 1} more like it.` : '')
      : '';
    failBox.style.display = failures.length ? 'flex' : 'none';
  }

  // Deliberately NOT re-rendering the target list. It would rebuild from
  // what is still missing and reset every row to "waiting", erasing the
  // per-dataset outcome the user just watched — including which ones failed,
  // which is the only part worth reading afterwards. The list rebuilds next
  // time the tab is opened.
  if (btn) {
    const ok = targets.length - failures.length;
    btn.textContent = failures.length
      ? `${ok} of ${targets.length} generated — try the rest again`
      : `Generated ${ok} dataset${ok === 1 ? '' : 's'}`;
    btn.disabled = failures.length === 0;
  }

  if (failures.length && errEl) {
    errEl.textContent = `${failures.length} of ${targets.length} could not be generated. `
      + failures.join(' · ') + ' — the rest were saved; try these again.';
    errEl.style.display = 'block';
  }

  // A batch with failures leaves the customer here to try the rest again;
  // the ones that worked are saved and the screen says which failed.
  if (!failures.length) moveOnIfReadyNow(readyBefore);
}

function wireSampleData() {
  document.addEventListener('click', async (e) => {
    const view = e.target.closest('[data-sample-view]');
    if (view) {
      e.preventDefault();
      await toggleSamplePreview(view.dataset.sampleView, view);
      return;
    }

    const make = e.target.closest('[data-sample-make]');
    const drop = e.target.closest('[data-sample-remove]');
    if (!make && !drop) return;
    e.preventDefault();

    const btn = make || drop;
    const datasetName = btn.dataset.sampleMake || btn.dataset.sampleRemove;
    if (!_blueprintId || !datasetName) return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = make ? 'Generating…' : 'Removing…';
    showUploadError('');

    try {
      if (make) {
        await api('/uploads/synthetic-dataset', {
          method: 'POST',
          body: JSON.stringify({ blueprintId: _blueprintId, datasetName }),
        });
      } else {
        await api(`/uploads/synthetic-dataset/${encodeURIComponent(_blueprintId)}`
          + `/${encodeURIComponent(datasetName)}`, { method: 'DELETE' });
      }
      await loadUploads(_blueprintId);
      renderTable(_cachedDatasets, _lastConfCount, _lastJiraCount);
    } catch (err) {
      showUploadError(err.message || 'Could not change the sample data.');
      btn.disabled = false;
      btn.textContent = original;
    }
  });
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

  const readyBefore = hasPreparedData();
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
    moveOnIfReadyNow(readyBefore);
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

  wireSampleData();
  document.getElementById('aria-sample-run')?.addEventListener('click', runSampleBatch);

  document.getElementById('aria-choose-simulate')?.addEventListener('click', () => {
    if (_choice === 'simulate') return;
    chooseData('simulate');
    simulateNow();
  });
  document.getElementById('aria-choose-upload')?.addEventListener('click', () => {
    chooseData('upload');
  });
  document.getElementById('aria-runstrip-retry')?.addEventListener('click', () => {
    const box = document.getElementById('aria-runstrip-error');
    if (box) box.style.display = 'none';
    simulateNow();
  });

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

  // The decision. A choice made before leaving for OAuth is restored so the
  // customer lands back on the connectors; a ?connect= link is an Upload
  // choice by definition. Otherwise the two cards.
  let remembered = null;
  try { remembered = sessionStorage.getItem(CHOICE_KEY); } catch { /* fine */ }
  const connectWanted = new URLSearchParams(window.location.search).get('connect');
  chooseData(connectWanted ? 'upload' : (remembered === 'upload' ? 'upload' : null), { remember: false });

  renderTable(_cachedDatasets, 0, 0);

  // Uploads decide dataset status, so the table has to be redrawn once they
  // are known — the first render above cannot know them yet.
  const uploadsIn = loadUploads(bp._id).then(() => {
    renderTable(_cachedDatasets, _lastConfCount, _lastJiraCount);
    if (_activeTab === 'upload') renderUploadList();
  });

  const sourcesIn = initSources(bp._id);

  // Ready once uploads and sources are both known: every dataset's state
  // depends on them, and a screen shown before they arrive marks the lot
  // "To connect" for a round trip, then flips them to what they are.
  // Settled, not all -- a source check that fails still has an honest state.
  Promise.allSettled([uploadsIn, sourcesIn]).then(() => {
    if (_choice === 'upload') renderConnectors();
    document.dispatchEvent(new CustomEvent('stage:ready', { detail: { stage: 'aria' } }));
  });

  // A ?connect= link lands back here; renderTabs has already opened the
  // matching tab, so this only has to bring it into view.
  const connectParam = new URLSearchParams(window.location.search).get('connect');
  if (connectParam) {
    setTimeout(() => {
      document.getElementById('aria-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
});
