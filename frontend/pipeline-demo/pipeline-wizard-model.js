/**
 * Svarg — Pipeline Wizard: Window 4's model selection display
 *
 * Informational only, not an interactive journey step — the frontier vs.
 * open-weight configuration stays a code-level setting (modelCatalog.js /
 * modelSelectionService.js / the modelPreference param on the API),
 * tested separately rather than exposed as a user-facing toggle here.
 * Currently configured to Frontier — change MODEL_PREFERENCE below (and
 * the matching constant in pipeline-wizard-chat.js) to switch what this
 * demo shows/uses without touching the underlying selection logic.
 */

const MODEL_PREFERENCE = 'frontier';

const API_BASE = window.CONFIG?.API_BASE || 'http://localhost:3000/api';
const getToken = () => localStorage.getItem('token');

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(message) {
  document.getElementById('pw-model-result').style.display = 'none';
  const el = document.getElementById('pw-model-error');
  el.textContent = message;
  el.style.display = 'block';
}

function renderSelection(selection) {
  document.getElementById('pw-model-error').style.display = 'none';
  document.getElementById('pw-model-result').style.display = 'block';
  document.getElementById('pw-model-name').textContent = selection.displayName;
  document.getElementById('pw-model-tags').innerHTML = `
    <span class="pw-model-tag">Quality: ${esc(selection.quality)}</span>
    <span class="pw-model-tag">Cost: ${esc(selection.cost)}</span>
    <span class="pw-model-tag">Performance: ${esc(selection.performance)}</span>
  `;
  document.getElementById('pw-model-rationale').textContent = selection.rationale;
}

export async function initModelSelection() {
  try {
    const selection = await api(`/defect-matching/model-selection?preference=${MODEL_PREFERENCE}`);
    renderSelection(selection);
  } catch (err) {
    showError(err.message);
  }
}
