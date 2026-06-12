/**
 * SoorgaAI — Blueprint LocalStorage Persistence (Sprint 17)
 *
 * All blueprint lifecycle state is browser-local — no backend storage.
 * Gracefully handles missing, corrupt, or full storage.
 *
 * Storage key: 'soorgaai_blueprint_v1'
 *
 * Schema:
 * {
 *   currentCapabilityId: string | null,
 *   capabilities: {
 *     [capabilityId]: {
 *       capabilityName: string,
 *       industry:       string,
 *       sections: {
 *         [sectionTitle]: {
 *           status:  'Template' | 'Working Draft' | 'Approved',
 *           sources: string[],   // ['Core'] | ['Core','Automotive'] | [...,'User Modified']
 *           content: string,     // empty = template, otherwise accepted/edited text
 *           collapsed?: boolean, // Sprint 20: section minimised on the canvas
 *         }
 *       }
 *     }
 *   }
 * }
 */

const KEY = 'soorgaai_blueprint_v1';

function loadAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { currentCapabilityId: null, capabilities: {} };
    const parsed = JSON.parse(raw);
    return {
      currentCapabilityId: parsed.currentCapabilityId || null,
      capabilities:        parsed.capabilities        || {},
    };
  } catch {
    return { currentCapabilityId: null, capabilities: {} };
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* storage full or unavailable — fail silently */ }
}

// ── Current capability tracking ───────────────────────────────────────────────

export function loadCurrentCapability() {
  return loadAll().currentCapabilityId;
}

export function saveCurrentCapability(capabilityId) {
  const data = loadAll();
  data.currentCapabilityId = capabilityId;
  saveAll(data);
}

export function clearCurrentCapability() {
  const data = loadAll();
  data.currentCapabilityId = null;
  saveAll(data);
}

// ── Per-capability section state ──────────────────────────────────────────────

export function loadCapabilityState(capabilityId) {
  return loadAll().capabilities[capabilityId] || null;
}

export function saveCapabilityState(capabilityId, state) {
  const data = loadAll();
  data.capabilities[capabilityId] = state;
  saveAll(data);
}

// ── Activity log (Sprint 18 — Blueprint Timeline) ─────────────────────────────
//
// Separate key so the Sprint 17 blueprint schema stays untouched.
// Newest event first. Capped to avoid unbounded growth.

const ACTIVITY_KEY = 'soorgaai_blueprint_activity_v1';
const ACTIVITY_MAX = 50;

export function logActivity(action, capabilityName, sectionTitle) {
  try {
    const events = loadActivities(ACTIVITY_MAX);
    events.unshift({
      action,                              // 'Accepted' | 'Approved' | 'Reset'
      capabilityName: capabilityName || '',
      sectionTitle:   sectionTitle   || '',
      at: new Date().toISOString(),
    });
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(events.slice(0, ACTIVITY_MAX)));
  } catch { /* storage full or unavailable — fail silently */ }
}

export function loadActivities(limit = 10) {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, limit);
  } catch {
    return [];
  }
}

// ── Company-wide snapshot (aggregate across all capabilities) ─────────────────

export function getCompanySnapshot() {
  const { capabilities } = loadAll();
  const capIds = Object.keys(capabilities);

  let capabilitiesStarted   = 0;
  let capabilitiesCompleted = 0;
  let approvedSections      = 0;
  let draftSections         = 0;
  let totalSections         = 0;

  for (const capId of capIds) {
    const cap      = capabilities[capId];
    const sections = Object.values(cap.sections || {});
    if (!sections.length) continue;

    totalSections += sections.length;

    const approved = sections.filter(s => s.status === 'Approved').length;
    const draft    = sections.filter(s => s.status === 'Working Draft').length;

    approvedSections += approved;
    draftSections    += draft;

    if (approved > 0 || draft > 0) capabilitiesStarted++;
    if (approved === sections.length) capabilitiesCompleted++;
  }

  const overallPct = totalSections > 0
    ? Math.round((approvedSections / totalSections) * 100)
    : 0;

  return {
    totalCapabilities:    capIds.length,
    capabilitiesStarted,
    capabilitiesCompleted,
    approvedSections,
    draftSections,
    totalSections,
    overallPct,
  };
}
