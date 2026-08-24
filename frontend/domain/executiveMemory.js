/**
 * Svarg — Executive Memory (Sprint 23)
 *
 * Persists company profile across page sessions using localStorage.
 * Domain-agnostic — any future Svarg capability can call these functions.
 *
 * Conversation history is session-only and is managed in advisor.js.
 */

const STORAGE_KEY = 'soorgaai_executive_memory_v1';

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { companyProfile: {} };
  } catch {
    return { companyProfile: {} };
  }
}

function _save(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch { /* storage quota exceeded — continue without persisting */ }
}

export function getCompanyProfile() {
  return _load().companyProfile || {};
}

/**
 * Merge new fields into the stored company profile.
 * Arrays (e.g. priorities) are union-merged, not replaced.
 */
export function updateCompanyProfile(updates) {
  if (!updates || typeof updates !== 'object') return;
  const data = _load();
  const prev = data.companyProfile || {};
  data.companyProfile = {
    ...prev,
    ...updates,
    priorities: _mergeUnique(prev.priorities, updates.priorities),
  };
  _save(data);
}

export function clearCompanyProfile() {
  _save({ companyProfile: {} });
}

function _mergeUnique(a = [], b = []) {
  if (!b?.length) return a || [];
  const result = [...(a || [])];
  for (const item of b) {
    if (item && !result.includes(item)) result.push(item);
  }
  return result;
}
