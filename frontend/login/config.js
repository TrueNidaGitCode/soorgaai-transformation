/**
 * ============================================
 * SOORGA APPLICATION CONFIGURATION
 * ============================================
 * Centralized configuration for all API endpoints
 * Update these URLs when deploying to production
 * ============================================
 */

// Base URL Configuration
// Development: Use localhost or 127.0.0.1
// Production: Railway backend URL
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'  // Local development
    : 'https://jubilant-essence-production-0a8a.up.railway.app';  // Railway backend

// API Endpoints Configuration
window.CONFIG = {
    // Main API Base URL
    API_BASE: `${API_BASE_URL}/api`,
    
    // Authentication Endpoints
    AUTH: {
        REGISTER: `${API_BASE_URL}/api/users/signup`,  // ✅ Fixed: Correct signup endpoint
        LOGIN: `${API_BASE_URL}/api/users/login`,  // ✅ Fixed: Correct login endpoint
        VERIFY: `${API_BASE_URL}/api/users/me`,  // ✅ Fixed: Token verification endpoint
        FORGOT_PASSWORD: `${API_BASE_URL}/api/users/forgot-password`,  // ✅ NEW: Request password reset
        RESET_PASSWORD: `${API_BASE_URL}/api/users/reset-password`,  // ✅ NEW: Reset password
        // LOGOUT: Not needed - JWT logout is handled client-side (removes token from localStorage)
    },
    
    // Signal Endpoints
    SIGNALS: {
        LIST: `${API_BASE_URL}/api/signals`,  // Get all available signals
        TRENDING: `${API_BASE_URL}/api/signals/trending`,  // Get trending signals
        EARLY: `${API_BASE_URL}/api/signals/early`,  // Get early signals
        DETAIL: (id) => `${API_BASE_URL}/api/signals/${id}`,  // Get specific signal
        USER_SIGNALS: `${API_BASE_URL}/api/signals/user/my-signals`,  // ✅ Fixed: Get user's generated signals
        USER_SIGNAL_DETAIL: (id) => `${API_BASE_URL}/api/signals/user/${id}`,  // ✅ Fixed
        UPDATE_ANALYTICS: (id) => `${API_BASE_URL}/api/signals/user/${id}/analytics`,  // ✅ Fixed
        DELETE: (id) => `${API_BASE_URL}/api/signals/user/${id}`  // ✅ Fixed
    },
    
    // AI Generation Endpoints
    AI: {
        GENERATE_POST: `${API_BASE_URL}/api/signals/generate-post`,  // ✅ Fixed: Added /signals
        GENERATE_IMAGE: `${API_BASE_URL}/api/signals/generate-image`  // ✅ NEW: Generate LinkedIn visual
    },

    // Admin Endpoints (admin role required)
    ADMIN: {
        CREATE_SIGNAL: `${API_BASE_URL}/api/admin/signals`,  // Create new signal
        UPDATE_SIGNAL: (id) => `${API_BASE_URL}/api/admin/signals/${id}`,  // Update signal
        DELETE_SIGNAL: (id) => `${API_BASE_URL}/api/admin/signals/${id}`,  // Delete signal
        GET_ALL_SIGNALS: `${API_BASE_URL}/api/admin/signals`  // Get all signals (including drafts)
    },

    // Analytics Endpoints (optional, for future use)
    ANALYTICS: {
        OVERVIEW: `${API_BASE_URL}/api/analytics/overview`,
        EVENT: `${API_BASE_URL}/api/analytics/event`
    },
    
    // Legacy endpoints (if you have FastAPI or other services)
    FASTAPI: `http://localhost:8000/api`  // If you're using FastAPI for AI
};

// ============================================
// ✅ GLOBAL API_BASE_URL DEFINITION
// This prevents "already declared" errors across files
// ============================================
window.API_BASE_URL = window.CONFIG.API_BASE;

// Helper function to check if API is reachable
window.CONFIG.checkAPIHealth = async function() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        return response.ok;
    } catch (error) {
        console.error('❌ API health check failed:', error);
        return false;
    }
};

// Log configuration on load (only in development)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('⚙️ SOORGA Configuration loaded');
    console.log('📡 API Base URL:', window.API_BASE_URL);
    console.log('📡 CONFIG object:', window.CONFIG);
}