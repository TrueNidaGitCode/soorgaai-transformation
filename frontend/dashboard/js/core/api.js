/**
 * ============================================
 * API UTILITY MODULE
 * ============================================
 * Centralized API request utilities for SOORGA
 * Handles:
 * - HTTP requests with authentication
 * - Error handling and retries
 * - Token management
 * - Request/response logging
 * ============================================
 */

// ✅ REMOVED: const API_BASE_URL declaration
// Access via window.CONFIG.API_BASE instead

/**
 * ============================================
 * AUTHENTICATION UTILITIES
 * ============================================
 */

/**
 * Get authentication token from localStorage
 * @returns {string|null} JWT token or null
 */
function getAuthToken() {
    return localStorage.getItem("token");
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if token exists
 */
function isAuthenticated() {
    return !!getAuthToken();
}

/**
 * Clear authentication and redirect to login
 * @param {string} redirectUrl - Optional URL to redirect after login
 */
function clearAuthAndRedirect(redirectUrl = null) {
    console.warn("🔴 Clearing authentication and redirecting to login");
    
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    
    if (redirectUrl) {
        localStorage.setItem("redirectAfterLogin", redirectUrl);
    } else {
        localStorage.setItem("redirectAfterLogin", window.location.pathname);
    }
    
    window.location.href = "/login/login.html";
}

/**
 * ============================================
 * HTTP REQUEST WRAPPER
 * Generic fetch wrapper with authentication and error handling
 * ============================================
 */

/**
 * Make authenticated API request
 * @param {string} endpoint - API endpoint (relative to API_BASE_URL)
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<object>} Response data
 */
async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    
    // ✅ Get API_BASE_URL from CONFIG
    const API_BASE_URL = window.CONFIG?.API_BASE || 'http://localhost:3000/api';
    
    // Build full URL
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    
    // Default headers
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    // Add authorization if token exists
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Merge options
    const config = {
        ...options,
        headers
    };
    
    try {
        console.log(`📡 API Request: ${options.method || 'GET'} ${url}`);
        
        const response = await fetch(url, config);
        
        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
            console.error('❌ Authentication failed. Redirecting to login...');
            clearAuthAndRedirect();
            throw new Error('Authentication required');
        }
        
        // Handle HTTP errors
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Parse and return response
        const data = await response.json();
        console.log(`✅ API Response: ${options.method || 'GET'} ${url}`, data);
        
        return data;
        
    } catch (error) {
        console.error(`❌ API Error: ${options.method || 'GET'} ${url}`, error);
        throw error;
    }
}

/**
 * ============================================
 * AUTHENTICATION API CALLS
 * ============================================
 */

/**
 * Login or register user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<object>} User data and token
 */
async function loginUser(email, password) {
    const endpoint = window.CONFIG?.AUTH?.LOGIN || '/auth/register';
    
    return apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
}

/**
 * Verify authentication token
 * @returns {Promise<object>} User data
 */
async function verifyToken() {
    const endpoint = window.CONFIG?.AUTH?.VERIFY || '/auth/verify';
    
    return apiRequest(endpoint, {
        method: 'GET'
    });
}

/**
 * Logout user
 * Clears local authentication data and redirects to login
 * Note: JWT is stateless, so logout is handled client-side only
 * @returns {Promise<object>} Logout confirmation
 */
async function logoutUser() {
    console.log("🔴 Logging out user...");

    // Clear all authentication data
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");

    // Optional: Call backend logout endpoint if it exists (for session tracking, token blacklist, etc.)
    // Since we don't have this endpoint yet, we skip it
    // If you implement it later, uncomment below:
    /*
    try {
        const endpoint = window.CONFIG?.AUTH?.LOGOUT || '/auth/logout';
        await apiRequest(endpoint, { method: 'POST' });
    } catch (error) {
        console.warn('Logout API call failed (this is ok for JWT):', error);
    }
    */

    console.log("✅ Logout successful");

    // Redirect to login page
    window.location.href = "/login/login.html";

    return { success: true };
}

/**
 * ============================================
 * SIGNALS API CALLS
 * ============================================
 */

/**
 * Fetch all available signals
 * @returns {Promise<array>} List of signals
 */
async function fetchSignals() {
    const endpoint = window.CONFIG?.SIGNALS?.LIST || '/signals';
    
    const data = await apiRequest(endpoint, {
        method: 'GET'
    });
    
    return data.signals || data;
}

/**
 * Fetch specific signal by ID
 * @param {string} signalId - Signal ID
 * @returns {Promise<object>} Signal data
 */
async function fetchSignalById(signalId) {
    const endpoint = window.CONFIG?.SIGNALS?.DETAIL 
        ? window.CONFIG.SIGNALS.DETAIL(signalId)
        : `/signals/${signalId}`;
    
    const data = await apiRequest(endpoint, {
        method: 'GET'
    });
    
    return data.signal || data;
}

/**
 * Fetch user's generated signals
 * @returns {Promise<array>} List of user's signals
 */
async function fetchUserSignals() {
    const endpoint = window.CONFIG?.SIGNALS?.USER_SIGNALS || '/user/signals';
    
    const data = await apiRequest(endpoint, {
        method: 'GET'
    });
    
    return data.signals || data;
}

/**
 * Fetch specific user signal by ID
 * @param {string} signalId - Signal ID
 * @returns {Promise<object>} User signal data
 */
async function fetchUserSignalById(signalId) {
    const endpoint = window.CONFIG?.SIGNALS?.USER_SIGNAL_DETAIL
        ? window.CONFIG.SIGNALS.USER_SIGNAL_DETAIL(signalId)
        : `/user/signals/${signalId}`;
    
    const data = await apiRequest(endpoint, {
        method: 'GET'
    });
    
    return data.signal || data;
}

/**
 * Update signal analytics
 * @param {string} signalId - Signal ID
 * @param {object} analyticsData - Analytics data (impressions, reactions, comments)
 * @returns {Promise<object>} Updated signal data
 */
async function updateSignalAnalytics(signalId, analyticsData) {
    const endpoint = window.CONFIG?.SIGNALS?.UPDATE_ANALYTICS
        ? window.CONFIG.SIGNALS.UPDATE_ANALYTICS(signalId)
        : `/user/signals/${signalId}/analytics`;
    
    return apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(analyticsData)
    });
}

/**
 * Delete user signal
 * @param {string} signalId - Signal ID
 * @returns {Promise<object>} Deletion confirmation
 */
async function deleteSignal(signalId) {
    const endpoint = window.CONFIG?.SIGNALS?.DELETE
        ? window.CONFIG.SIGNALS.DELETE(signalId)
        : `/user/signals/${signalId}`;
    
    return apiRequest(endpoint, {
        method: 'DELETE'
    });
}

/**
 * ============================================
 * AI GENERATION API CALLS
 * ============================================
 */

/**
 * Generate LinkedIn post from signal
 * @param {object} signalData - Signal data for post generation
 * @returns {Promise<object>} Generated post data
 */
async function generateLinkedInPost(signalData) {
    const endpoint = window.CONFIG?.AI?.GENERATE_POST || '/generate-post';
    
    return apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(signalData)
    });
}

/**
 * ============================================
 * ANALYTICS API CALLS (Optional)
 * ============================================
 */

/**
 * Fetch analytics overview
 * @returns {Promise<object>} Analytics data
 */
async function fetchAnalyticsOverview() {
    const endpoint = window.CONFIG?.ANALYTICS?.OVERVIEW || '/analytics/overview';
    
    return apiRequest(endpoint, {
        method: 'GET'
    });
}

/**
 * Track analytics event
 * @param {string} eventName - Event name
 * @param {object} eventData - Event data
 * @returns {Promise<object>} Tracking confirmation
 */
async function trackAnalyticsEvent(eventName, eventData = {}) {
    const endpoint = window.CONFIG?.ANALYTICS?.EVENT || '/analytics/event';
    
    try {
        return await apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({
                event: eventName,
                ...eventData,
                timestamp: new Date().toISOString()
            })
        });
    } catch (error) {
        // Analytics failures shouldn't break the app
        console.error('Analytics tracking failed:', error);
        return { success: false };
    }
}

/**
 * ============================================
 * HEALTH CHECK
 * ============================================
 */

/**
 * Check API health
 * @returns {Promise<boolean>} True if API is healthy
 */
async function checkAPIHealth() {
    try {
        const API_BASE_URL = window.CONFIG?.API_BASE || 'http://localhost:3000/api';
        const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
        return response.ok;
    } catch (error) {
        console.error('API health check failed:', error);
        return false;
    }
}

/**
 * ============================================
 * RETRY LOGIC WRAPPER
 * ============================================
 */

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} delay - Initial delay in ms
 * @returns {Promise<any>} Function result
 */
async function retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            const backoffDelay = delay * Math.pow(2, i);
            console.log(`Retry ${i + 1}/${maxRetries} after ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
    }
}

/**
 * ============================================
 * EXPOSE API FUNCTIONS GLOBALLY
 * ============================================
 */
window.api = {
    // Authentication
    getAuthToken,
    isAuthenticated,
    clearAuthAndRedirect,
    loginUser,
    verifyToken,
    logoutUser,
    
    // Signals
    fetchSignals,
    fetchSignalById,
    fetchUserSignals,
    fetchUserSignalById,
    updateSignalAnalytics,
    deleteSignal,
    
    // AI Generation
    generateLinkedInPost,
    
    // Analytics
    fetchAnalyticsOverview,
    trackAnalyticsEvent,
    
    // Utilities
    apiRequest,
    checkAPIHealth,
    retryWithBackoff
};

console.log('✅ API module loaded');
console.log('📡 API Base URL:', window.CONFIG?.API_BASE || 'http://localhost:3000/api');