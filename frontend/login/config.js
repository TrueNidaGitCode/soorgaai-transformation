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
    : 'https://jubilant-essence-production-0a8a.up.railway.app'; // ← update with SoorgaAI backend URL

window.CONFIG = {
    API_BASE: `${API_BASE_URL}/api`,

    // ── Authentication ────────────────────────────────────
    AUTH: {
        REGISTER:        `${API_BASE_URL}/api/users/signup`,
        LOGIN:           `${API_BASE_URL}/api/users/login`,
        VERIFY:          `${API_BASE_URL}/api/users/me`,
        FORGOT_PASSWORD: `${API_BASE_URL}/api/users/forgot-password`,
        RESET_PASSWORD:  `${API_BASE_URL}/api/users/reset-password`,
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
};

window.API_BASE_URL = window.CONFIG.API_BASE;

// Auth helpers
window.CONFIG.getToken  = () => localStorage.getItem('token');
window.CONFIG.getHeader = () => ({ 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
window.CONFIG.isLoggedIn = () => !!localStorage.getItem('token');

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('⚙️ SoorgaAI Config loaded — API:', window.API_BASE_URL);
}