/**
 * Svarg — Pipeline Wizard: Window 6's governance & ethics test results
 *
 * Runs the real, automated test suite
 * (backend/.../services/governanceTestService.js) against the live
 * defect-matching agent and publishes the results — fully automated, no
 * manual review step, per direction ("no more person involved... run the
 * applicable test automatically and publish the result").
 *
 * Results persist into the wizard's shared sessionStorage state (same
 * pattern as Window 3/5's fixes) so a reload shows the last run instead
 * of silently re-running ~7 real LLM-backed calls.
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
let started = false;

function groupBySection(results) {
  const bySection = new Map();
  for (const r of results) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }
  return [...bySection.entries()];
}

function renderResults({ results, passedCount, total, sourceGeneratedWithErrors }) {
  document.getElementById('pw-governance-progress').textContent = `${passedCount} / ${total} passed`;
  document.getElementById('pw-governance-warning').style.display = sourceGeneratedWithErrors ? 'block' : 'none';

  const container = document.getElementById('pw-governance-sections');
  let itemIndex = 0;
  container.innerHTML = groupBySection(results).map(([section, tests]) => `
    <div class="pw-governance__section">
      <p class="pw-governance__section-title">${esc(section)}</p>
      ${tests.map(t => `
        <div class="pw-governance__item pw-reveal" style="--i:${itemIndex++}">
          <span class="pw-governance__badge ${t.passed ? 'pw-governance__badge--pass' : 'pw-governance__badge--fail'}">${t.passed ? 'PASS' : 'FAIL'}</span>
          <span>
            <strong>${esc(t.name)}</strong>
            <span class="pw-governance__detail">${esc(t.detail)}</span>
          </span>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function showError(message) {
  document.getElementById('pw-governance-error').textContent = message;
  document.getElementById('pw-governance-error').style.display = 'block';
}

export async function initGovernanceChecklist(state, persist) {
  wizardState = state;
  persistWizardState = persist;
}

/**
 * Called once Window 6 becomes active — runs the real test suite (or
 * shows the last run's results if one already happened this session).
 */
export async function loadGovernanceChecklistIfNeeded() {
  if (started) return;
  started = true;

  const panel = document.getElementById('pw-governance');
  panel.hidden = false;

  if (wizardState.governance?.lastRun) {
    renderResults(wizardState.governance.lastRun);
    return;
  }

  document.getElementById('pw-governance-progress').textContent = 'Running…';

  try {
    const result = await api('/governance-checklist/run', { method: 'POST' });
    renderResults(result);
    wizardState.governance = { lastRun: result };
    persistWizardState(wizardState);
  } catch (err) {
    showError(err.message);
    document.getElementById('pw-governance-progress').textContent = '';
  }
}
