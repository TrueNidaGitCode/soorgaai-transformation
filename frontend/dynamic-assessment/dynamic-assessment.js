/**
 * SoorgaAI — Dynamic Assessment Shared Utilities
 *
 * Shared helpers available on all 4 dynamic assessment pages.
 * Pages include this file and call helpers directly.
 */

// ── Error / success helpers ───────────────────────────────────────────────────

function showError(message) {
    const banner = document.getElementById('errorBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.classList.add('visible');
    banner.style.display = 'block';
}

function clearError() {
    const banner = document.getElementById('errorBanner');
    if (!banner) return;
    banner.textContent = '';
    banner.classList.remove('visible');
    banner.style.display = 'none';
}

// ── Auth header helper (optional — uses token if present) ─────────────────────

function getOptionalAuthHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// ── Session guard ─────────────────────────────────────────────────────────────

function requireSession() {
    const id = localStorage.getItem('da_sessionId');
    if (!id) { window.location.href = 'start.html'; return null; }
    return id;
}

// ── Sleep utility ─────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
