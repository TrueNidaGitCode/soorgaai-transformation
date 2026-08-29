/**
 * Svarg — Pipeline Wizard: Window 6's governance & ethics checklist
 *
 * Reads the real "Governance & Ethics" domain Cob already generated for
 * this engagement (backend/.../controllers/governanceChecklistController.js)
 * and renders each section's priorityActions as a checklist — a review
 * step, not automated testing: the user manually confirms each item before
 * treating the deployed agent as production-ready.
 *
 * Checked state persists into the wizard's shared sessionStorage state,
 * same pattern as Window 3's Jira selection fix.
 */

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

let wizardState = null;
let persistWizardState = () => {};
let started = false;

function checkedIds() {
  wizardState.governance = wizardState.governance || { checkedIds: [] };
  return new Set(wizardState.governance.checkedIds);
}

function saveCheckedIds(ids) {
  wizardState.governance = { checkedIds: [...ids] };
  persistWizardState(wizardState);
}

function itemId(sectionIndex, itemIndex) {
  return `${sectionIndex}-${itemIndex}`;
}

function renderSections(sections) {
  const checked = checkedIds();
  const container = document.getElementById('pw-governance-sections');
  container.innerHTML = sections.map((section, si) => `
    <div class="pw-governance__section">
      <p class="pw-governance__section-title">${esc(section.title)}</p>
      ${section.items.map((item, ii) => {
        const id = itemId(si, ii);
        return `
          <label class="pw-governance__item">
            <input type="checkbox" class="pw-governance__checkbox" data-item-id="${id}" ${checked.has(id) ? 'checked' : ''}>
            <span>${esc(item)}</span>
          </label>
        `;
      }).join('')}
    </div>
  `).join('');

  updateProgress(sections);

  container.querySelectorAll('.pw-governance__checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const ids = checkedIds();
      if (cb.checked) ids.add(cb.dataset.itemId); else ids.delete(cb.dataset.itemId);
      saveCheckedIds(ids);
      updateProgress(sections);
    });
  });
}

function updateProgress(sections) {
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const done = checkedIds().size;
  document.getElementById('pw-governance-progress').textContent = `${done} / ${total} confirmed`;
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
 * Called once Window 6 becomes active (mirrors revealChatIfNeeded's
 * once-per-page-load guard) — loads and renders the real checklist.
 */
export async function loadGovernanceChecklistIfNeeded() {
  if (started) return;
  started = true;

  const panel = document.getElementById('pw-governance');
  panel.hidden = false;

  try {
    const result = await api('/governance-checklist');
    if (result.generatedWithErrors) {
      document.getElementById('pw-governance-warning').style.display = 'block';
    }
    renderSections(result.sections);
  } catch (err) {
    showError(err.message);
  }
}
