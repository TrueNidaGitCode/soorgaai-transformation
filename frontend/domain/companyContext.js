/**
 * SoorgaAI — Company Context Module (Sprint 23.1)
 *
 * Manages the one-time Company Context onboarding modal and caches the
 * approved content in localStorage for fast reads.
 *
 * Flow:
 *   1. After the domain layout becomes visible, check localStorage for content.
 *   2. If none, check the backend (GET /api/company-context).
 *   3. If still none, show the onboarding modal.
 *   4. User generates → reviews → approves or edits → saved to DB + localStorage.
 *
 * Exposes window.CompanyContext.getContent() — other modules read from this.
 * The backend fetches Company Context from DB directly (no need to send it in requests).
 */

const CC_STORAGE_KEY = 'soorgaai_company_context_v1';

const API_BASE = window.CONFIG?.API_BASE
  || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://truenidawebsite-production.up.railway.app/api');

function _token() { return localStorage.getItem('token'); }

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cachedContent = null;

function _loadFromStorage() {
  try {
    const raw = localStorage.getItem(CC_STORAGE_KEY);
    return raw ? JSON.parse(raw)?.content || null : null;
  } catch { return null; }
}

function _persistToStorage(content) {
  _cachedContent = content;
  try { localStorage.setItem(CC_STORAGE_KEY, JSON.stringify({ content })); }
  catch { /* storage quota — continue */ }
}

function _clearStorage() {
  _cachedContent = null;
  localStorage.removeItem(CC_STORAGE_KEY);
}

function getContent() {
  if (_cachedContent) return _cachedContent;
  const stored = _loadFromStorage();
  if (stored) _cachedContent = stored;
  return _cachedContent;
}

// ── Modal state ───────────────────────────────────────────────────────────────

let _backdropEl = null;
let _contentEl  = null;
let _actionsEl  = null;
let _labelEl    = null;
let _spinnerEl  = null;
let _errorEl    = null;
let _draftText  = null;
let _draftMeta  = {};   // { orgName, role } from generation

function _removeModal() {
  _backdropEl?.remove();
  _backdropEl = null;
}

// ── Modal DOM ─────────────────────────────────────────────────────────────────

function _buildModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'cc-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'cc-modal-title');

  const modal = document.createElement('div');
  modal.className = 'cc-modal';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'cc-modal__header';

  const title = document.createElement('h2');
  title.id = 'cc-modal-title';
  title.className = 'cc-modal__title';
  title.textContent = 'Personalize Your AI Strategy Advisor';
  header.appendChild(title);

  const sub = document.createElement('p');
  sub.className = 'cc-modal__subtitle';
  sub.textContent =
    'SoorgaAI gives better recommendations when it understands your organization. ' +
    'Generate a brief company profile from your organization name and role — ' +
    'review and edit before approving.';
  header.appendChild(sub);
  modal.appendChild(header);

  // ── Section label ──
  const label = document.createElement('div');
  label.className = 'cc-modal__label';
  label.textContent = 'COMPANY PROFILE';
  modal.appendChild(label);

  // ── Spinner ──
  const spinner = document.createElement('div');
  spinner.className = 'cc-modal__spinner';
  spinner.style.display = 'none';
  modal.appendChild(spinner);

  // ── Content textarea ──
  const content = document.createElement('textarea');
  content.className = 'cc-modal__content';
  content.readOnly = true;
  content.style.display = 'none';
  content.setAttribute('aria-label', 'Company profile content');
  modal.appendChild(content);

  // ── Error ──
  const error = document.createElement('div');
  error.className = 'cc-modal__error';
  error.setAttribute('role', 'alert');
  error.style.display = 'none';
  modal.appendChild(error);

  // ── Actions ──
  const actions = document.createElement('div');
  actions.className = 'cc-modal__actions';
  modal.appendChild(actions);

  backdrop.appendChild(modal);

  _backdropEl = backdrop;
  _contentEl  = content;
  _actionsEl  = actions;
  _labelEl    = label;
  _spinnerEl  = spinner;
  _errorEl    = error;

  document.body.appendChild(backdrop);
}

// ── State renderers ───────────────────────────────────────────────────────────

function _showError(msg) {
  _errorEl.textContent = msg;
  _errorEl.style.display = 'block';
}

function _hideError() {
  _errorEl.style.display = 'none';
}

function _showSpinner(msg) {
  _spinnerEl.textContent = msg;
  _spinnerEl.style.display = 'flex';
  _contentEl.style.display = 'none';
}

function _hideSpinner() {
  _spinnerEl.style.display = 'none';
}

function _makeBtn(text, cls, handler) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `cc-modal__btn ${cls}`;
  btn.textContent = text;
  btn.addEventListener('click', handler);
  return btn;
}

function _makeSkip() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cc-modal__skip';
  btn.textContent = 'Skip for now';
  btn.addEventListener('click', _removeModal);
  return btn;
}

function _renderIdle() {
  _labelEl.textContent = 'COMPANY PROFILE';
  _hideSpinner();
  _hideError();
  _contentEl.style.display = 'none';
  _actionsEl.innerHTML = '';

  _actionsEl.appendChild(
    _makeBtn('Generate Company Profile', 'cc-modal__btn--primary', _doGenerate)
  );
  _actionsEl.appendChild(_makeSkip());
}

function _renderGenerated() {
  _labelEl.textContent = 'COMPANY PROFILE — REVIEW & APPROVE';
  _hideSpinner();
  _hideError();
  _contentEl.readOnly = true;
  _contentEl.className = 'cc-modal__content';
  _contentEl.value = _draftText;
  _contentEl.style.display = 'block';
  _actionsEl.innerHTML = '';

  _actionsEl.appendChild(_makeBtn('Approve', 'cc-modal__btn--primary', _doApprove));
  _actionsEl.appendChild(_makeBtn('Edit',    'cc-modal__btn--secondary', _renderEditing));
  _actionsEl.appendChild(_makeBtn('Regenerate', 'cc-modal__btn--secondary', _doGenerate));
  _actionsEl.appendChild(_makeSkip());
}

function _renderEditing() {
  _labelEl.textContent = 'COMPANY PROFILE — EDITING';
  _contentEl.readOnly = false;
  _contentEl.className = 'cc-modal__content cc-modal__content--editable';
  _contentEl.style.display = 'block';
  _contentEl.focus();
  _actionsEl.innerHTML = '';

  _actionsEl.appendChild(
    _makeBtn('Approve', 'cc-modal__btn--primary', () => {
      _draftText = _contentEl.value;
      _doApprove();
    })
  );
  _actionsEl.appendChild(_makeBtn('Cancel', 'cc-modal__btn--secondary', _renderGenerated));
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function _doGenerate() {
  _hideError();
  _showSpinner('Generating company profile…');
  _actionsEl.innerHTML = '';

  try {
    const resp = await fetch(`${API_BASE}/company-context/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token()}` },
    });
    const data = await resp.json();

    if (!resp.ok) {
      _hideSpinner();
      _renderIdle();
      _showError(data?.error || 'Generation failed. Please try again.');
      return;
    }

    _draftText = data.content;
    _draftMeta = { orgName: data.orgName, role: data.role };
    _renderGenerated();

  } catch {
    _hideSpinner();
    _renderIdle();
    _showError('Network error. Please try again.');
  }
}

async function _doApprove() {
  _hideError();
  const content = _contentEl.value.trim();
  if (!content) { _showError('Content cannot be empty.'); return; }

  _actionsEl.querySelectorAll('button').forEach(b => { b.disabled = true; });
  _showSpinner('Saving company profile…');

  try {
    const resp = await fetch(`${API_BASE}/company-context/approve`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token()}` },
      body:    JSON.stringify({ content, ..._draftMeta }),
    });

    if (!resp.ok) {
      _hideSpinner();
      _contentEl.style.display = 'block';
      _renderGenerated();
      _showError('Failed to save. Please try again.');
      return;
    }

    _persistToStorage(content);
    _removeModal();

  } catch {
    _hideSpinner();
    _contentEl.style.display = 'block';
    _renderGenerated();
    _showError('Network error. Please try again.');
  }
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function _checkAndShowModal() {
  if (!_token()) return;

  // Fast path — localStorage has approved content
  const cached = _loadFromStorage();
  if (cached) { _cachedContent = cached; return; }

  // Slow path — check backend
  try {
    const resp = await fetch(`${API_BASE}/company-context`, {
      headers: { Authorization: `Bearer ${_token()}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.content) {
        _persistToStorage(data.content);
        return;
      }
    }
  } catch { /* network error — show modal */ }

  // No approved context — show onboarding
  _buildModal();
  _renderIdle();
}

document.addEventListener('DOMContentLoaded', () => {
  const main = document.getElementById('domain-main');
  if (!main) return;

  // Wait for the domain layout to become visible, then check company context
  const observer = new MutationObserver(() => {
    if (main.style.display !== 'none') {
      observer.disconnect();
      _checkAndShowModal();
    }
  });
  observer.observe(main, { attributes: true, attributeFilter: ['style'] });

  // Also handle the case where it's already visible on mount
  if (main.style.display !== 'none') {
    observer.disconnect();
    _checkAndShowModal();
  }
});

// ── Public API ────────────────────────────────────────────────────────────────
// getContent() returns the approved company profile string, or null.
// clearCache() removes the localStorage cache (used on logout / account switch).

window.CompanyContext = { getContent, clearCache: _clearStorage };
