/**
 * Svarg — Defect Matching Demo
 *
 * Walking-skeleton UI for "Retrieval-Augmented Semantic Matching for
 * Defects" — submits a new failure description, renders the suggested
 * root cause and the matched historical defect records.
 */

const API_BASE = window.CONFIG?.API_BASE || 'http://localhost:3000/api';
const getToken = () => localStorage.getItem('token');

let formEl, textareaEl, submitBtn, loadingEl, errorEl, resultsEl, rootCauseTextEl, matchesEl;

// ── Auth guard ────────────────────────────────────────────────────────────

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login/login.html?redirect=/defect-matching/defect-matching.html';
    return false;
  }
  return true;
}

// ── API call ──────────────────────────────────────────────────────────────

async function fetchMatch(description) {
  const resp = await fetch(`${API_BASE}/defect-matching/match`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  });

  if (resp.status === 401) {
    window.location.href = '/login/login.html?redirect=/defect-matching/defect-matching.html';
    throw new Error('session expired');
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to match defect.');
  }

  return resp.json();
}

// ── Render ────────────────────────────────────────────────────────────────

function renderMatch(match) {
  return `
    <div class="dm-match">
      <div class="dm-match__top">
        <span class="dm-match__title">${escapeHtml(match.title)}</span>
        <span class="dm-match__score">${Math.round(match.score * 100)}% match</span>
      </div>
      <div class="dm-match__meta">
        <span class="dm-match__tag">${escapeHtml(match.defectId)}</span>
        <span class="dm-match__tag">${escapeHtml(match.component || '—')}</span>
        <span class="dm-match__tag">${escapeHtml(match.severity || '—')}</span>
      </div>
      <p class="dm-match__field"><strong>Symptom:</strong> ${escapeHtml(match.symptom)}</p>
      <p class="dm-match__field"><strong>Root cause:</strong> ${escapeHtml(match.rootCause)}</p>
      <p class="dm-match__field"><strong>Resolution:</strong> ${escapeHtml(match.resolution)}</p>
    </div>
  `;
}

function renderResults(result) {
  rootCauseTextEl.textContent = result.suggestedRootCause;
  matchesEl.innerHTML = result.matches.length
    ? result.matches.map(renderMatch).join('')
    : '<p style="color:rgba(255,255,255,0.4);font-size:14px">No matching historical defects found.</p>';
  resultsEl.hidden = false;
}

// ── Submit ────────────────────────────────────────────────────────────────

async function handleSubmit(e) {
  e.preventDefault();

  const description = textareaEl.value.trim();
  if (!description) return;

  submitBtn.disabled = true;
  loadingEl.hidden = false;
  errorEl.hidden = true;
  resultsEl.hidden = true;

  try {
    const result = await fetchMatch(description);
    renderResults(result);
  } catch (err) {
    if (err.message === 'session expired') return;
    errorEl.textContent = err.message;
    errorEl.hidden = false;
    console.error('[DefectMatching] submit error:', err);
  } finally {
    submitBtn.disabled = false;
    loadingEl.hidden = true;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  formEl          = document.getElementById('dm-form');
  textareaEl      = document.getElementById('dm-description');
  submitBtn       = document.getElementById('dm-submit');
  loadingEl       = document.getElementById('dm-loading');
  errorEl         = document.getElementById('dm-error');
  resultsEl       = document.getElementById('dm-results');
  rootCauseTextEl = document.getElementById('dm-root-cause-text');
  matchesEl       = document.getElementById('dm-matches');

  formEl.addEventListener('submit', handleSubmit);
});
