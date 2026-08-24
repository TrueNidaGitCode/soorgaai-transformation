/**
 * ============================================
 * SOORGAAI — APPLICATION CONFIGURATION
 * ============================================
 * Centralized API endpoint config.
 * Update PROD_API_URL when deploying to production.
 * ============================================
 */

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://truenidawebsite-production.up.railway.app'; // ← Svarg Railway backend

window.CONFIG = {
    API_BASE: `${API_BASE_URL}/api`,

    // ── Authentication ────────────────────────────────────
    AUTH: {
        REGISTER:        `${API_BASE_URL}/api/users/signup`,
        LOGIN:           `${API_BASE_URL}/api/users/login`,
        VERIFY:          `${API_BASE_URL}/api/users/me`,
        FORGOT_PASSWORD: `${API_BASE_URL}/api/users/forgot-password`,
        RESET_PASSWORD:  `${API_BASE_URL}/api/users/reset-password`,

        // OAuth — browser navigates directly to these URLs (not fetch)
        OAUTH: {
            GOOGLE:    `${API_BASE_URL}/api/auth/oauth/google`,
            MICROSOFT: `${API_BASE_URL}/api/auth/oauth/microsoft`,
        },
    },

    // ── Assessment ────────────────────────────────────────
    ASSESSMENT: {
        QUESTIONS:       `${API_BASE_URL}/api/assessment/questions`,
        SUBMIT:          `${API_BASE_URL}/api/assessment/submit`,
        MY_ASSESSMENTS:  `${API_BASE_URL}/api/assessment/my-assessments`,
        RESULTS:   (id) => `${API_BASE_URL}/api/assessment/results/${id}`,
        GEN_REPORT:(id) => `${API_BASE_URL}/api/assessment/report/${id}`,
        GET_REPORT:(id) => `${API_BASE_URL}/api/assessment/report/${id}`,
        ADMIN_ALL:       `${API_BASE_URL}/api/assessment/admin/all`,
    },

    // ── Admin ─────────────────────────────────────────────
    ADMIN: {
        ALL_ASSESSMENTS: `${API_BASE_URL}/api/assessment/admin/all`,
    },

    // ── Dynamic Assessment (v2) ───────────────────────────
    DYNAMIC: {
        START_SESSION:     `${API_BASE_URL}/api/assessment/dynamic/sessions`,
        DISCOVER:    (id) => `${API_BASE_URL}/api/assessment/dynamic/sessions/${id}/discover`,
        QUESTIONS:   (id) => `${API_BASE_URL}/api/assessment/dynamic/sessions/${id}/questions`,
        SUBMIT_ANSWER:(id) => `${API_BASE_URL}/api/assessment/dynamic/sessions/${id}/answers`,
        GET_SESSION: (id) => `${API_BASE_URL}/api/assessment/dynamic/sessions/${id}`,
        SCORE:       (id) => `${API_BASE_URL}/api/assessment/dynamic/sessions/${id}/score`,
    },
};

window.API_BASE_URL = window.CONFIG.API_BASE;

// Auth helpers
window.CONFIG.getToken  = () => localStorage.getItem('token');
window.CONFIG.getHeader = () => ({ 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
window.CONFIG.isLoggedIn = () => !!localStorage.getItem('token');

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('⚙️ Svarg Config loaded — API:', window.API_BASE_URL);
}