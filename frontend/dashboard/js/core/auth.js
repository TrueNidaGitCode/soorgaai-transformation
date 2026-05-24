/**
 * ============================================
 * AUTHENTICATION MODULE
 * ============================================
 * Handles:
 * - User authentication verification
 * - Token validation
 * - Protected route access control
 * - Auto-redirect on auth failure
 * - Debug logging
 * ============================================
 */

// ✅ REMOVED: const API_BASE_URL declaration
// Access via window.CONFIG.API_BASE directly when needed

/**
 * ============================================
 * INITIALIZATION
 * Check authentication on page load
 * ============================================
 */
document.addEventListener("DOMContentLoaded", async function () {
    persistLogs("🚀 Auth module: Page loaded, checking authentication...");

    const token = localStorage.getItem("token");
    persistLogs("🔍 Stored token at page load: " + (token ? "✅ Present" : "❌ Not Found"));

    // If no token, redirect to login
    if (!token || token.trim() === "") {
        persistLogs("⚠️ No valid token found.");
        redirectToLogin("Token missing or empty.");
        return;
    }

    // Verify token with backend
    await verifyAuthentication(token);
});

/**
 * ============================================
 * VERIFY AUTHENTICATION
 * Validate token with backend API
 * ============================================
 */
async function verifyAuthentication(token) {
    try {
        persistLogs("🔍 Sending request to validate token...");

        // ✅ Get API base URL from CONFIG
        const API_BASE_URL = window.CONFIG?.API_BASE || 'http://localhost:3000/api';
        
        // Get verify endpoint from CONFIG or use fallback
        const verifyEndpoint = window.CONFIG?.AUTH?.VERIFY || `${API_BASE_URL}/auth/verify`;
        persistLogs(`🔗 Verify endpoint: ${verifyEndpoint}`);

        console.log("🚀 Fetching API to verify token...");

        const response = await fetch(verifyEndpoint, {
            method: "GET",
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        console.log("✅ Fetch completed, checking response...");
        persistLogs("🔍 API Response Status: " + response.status);

        // Handle authentication failure
        if (!response.ok) {
            const errorText = await response.text();
            persistLogs(`⚠️ API Error ${response.status}: ${errorText}`);
            
            // Token is invalid or expired
            localStorage.removeItem("token");
            localStorage.removeItem("username");
            localStorage.removeItem("userId");
            
            redirectToLogin("Invalid or expired token.");
            return;
        }

        // Parse response
        const rawText = await response.text();
        persistLogs("🔍 Raw API Response: " + rawText.substring(0, 200)); // Log first 200 chars

        let userData;
        try {
            userData = JSON.parse(rawText);
            persistLogs("✅ Parsed User Data: " + JSON.stringify(userData));
        } catch (jsonError) {
            persistLogs("❌ JSON Parsing Error: " + jsonError);
            localStorage.removeItem("token");
            redirectToLogin("Failed to parse user data.");
            return;
        }

        // Validate user data
        if (!userData || !userData.user) {
            persistLogs("⚠️ No user data found in response.");
            redirectToLogin("Invalid user data received.");
            return;
        }

        // Extract user info
        const user = userData.user;
        const username = user.name || user.email?.split('@')[0] || "User";
        const userId = user.id;

        persistLogs(`✅ Authentication successful. User: ${username}, ID: ${userId}`);

        // Update stored user info
        localStorage.setItem("username", username);
        if (userId) {
            localStorage.setItem("userId", userId);
        }

        // Update UI
        updateUsername(username);
        setupLogout();

        // Trigger auth success event
        triggerAuthEvent('authenticated', { username, userId });

    } catch (error) {
        persistLogs("❌ Critical Fetch Error: " + error);
        console.error("❌ Fetch Request Failed:", error);
        
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        localStorage.removeItem("userId");
        
        redirectToLogin("Network error during authentication.");
    }
}

/**
 * ============================================
 * REDIRECT TO LOGIN
 * Handle redirection with saved redirect URL
 * ============================================
 */
function redirectToLogin(reason) {
    persistLogs(`🔄 Redirecting to login... Reason: ${reason}`);

    // Save current page for redirect after login
    const currentPath = window.location.pathname;
    if (currentPath && !currentPath.includes('login')) {
        localStorage.setItem("redirectAfterLogin", currentPath);
        persistLogs(`💾 Saved redirect URL: ${currentPath}`);
    }

    // Log redirect timestamp
    localStorage.setItem("redirect_triggered_at", Date.now());

    // Immediate redirect (no delay)
    persistLogs("➡️ Redirecting to login page now...");
    window.location.href = "/login/login.html";
}

/**
 * ============================================
 * UPDATE USERNAME DISPLAY
 * Updates the username in navbar or UI
 * ============================================
 */
function updateUsername(name) {
    const usernameDisplay = document.getElementById("username-display");
    
    if (usernameDisplay) {
        usernameDisplay.textContent = name || "User";
        usernameDisplay.style.display = "inline";
        persistLogs("✅ Username updated in UI: " + usernameDisplay.textContent);
    } else {
        persistLogs("⚠️ username-display element not found in DOM!");
    }
}

/**
 * ============================================
 * SETUP LOGOUT FUNCTIONALITY
 * Attach logout handler to button
 * ============================================
 */
function setupLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    
    if (logoutBtn) {
        // Remove old listeners
        logoutBtn.replaceWith(logoutBtn.cloneNode(true));
        const freshLogoutBtn = document.getElementById("logoutBtn");
        
        freshLogoutBtn.addEventListener("click", async function () {
            persistLogs("🔴 User initiated logout...");
            await performLogout();
        });
        
        persistLogs("✅ Logout button initialized.");
    } else {
        persistLogs("⚠️ Logout button not found in DOM!");
    }
}

/**
 * ============================================
 * PERFORM LOGOUT
 * Clear session and redirect to home
 * ============================================
 */
async function performLogout() {
    try {
        // Optional: Call logout endpoint if available
        const logoutEndpoint = window.CONFIG?.AUTH?.LOGOUT;
        const token = localStorage.getItem("token");
        
        if (logoutEndpoint && token) {
            persistLogs("📡 Calling logout API...");
            
            try {
                await fetch(logoutEndpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                persistLogs("✅ Logout API call successful");
            } catch (error) {
                persistLogs("⚠️ Logout API call failed: " + error);
                // Continue with local logout even if API fails
            }
        }
        
    } catch (error) {
        persistLogs("❌ Error during logout: " + error);
    } finally {
        // Always clear local storage
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        localStorage.removeItem("userId");
        localStorage.removeItem("redirectAfterLogin");
        
        persistLogs("🧹 Local storage cleared");
        
        // Trigger logout event
        triggerAuthEvent('logged_out');
        
        // Redirect to home
        persistLogs("➡️ Redirecting to home page...");
        window.location.href = "/index.html";
    }
}

/**
 * ============================================
 * CHECK IF USER IS AUTHENTICATED
 * Utility function for other modules
 * ============================================
 */
function isUserAuthenticated() {
    const token = localStorage.getItem("token");
    return !!(token && token.trim() !== "");
}

/**
 * ============================================
 * REQUIRE AUTHENTICATION
 * Force authentication for protected pages
 * Call this at the top of protected page scripts
 * ============================================
 */
function requireAuthentication() {
    if (!isUserAuthenticated()) {
        persistLogs("🔒 Authentication required. Redirecting to login...");
        redirectToLogin("Protected page accessed without authentication.");
        return false;
    }
    return true;
}

/**
 * ============================================
 * TRIGGER AUTHENTICATION EVENT
 * Dispatch custom events for auth state changes
 * ============================================
 */
function triggerAuthEvent(eventName, data = {}) {
    const event = new CustomEvent(`auth:${eventName}`, {
        detail: data
    });
    document.dispatchEvent(event);
    persistLogs(`📢 Auth event triggered: ${eventName}`);
}

/**
 * ============================================
 * PERSIST LOGS
 * Store logs in localStorage for debugging after page reload
 * ============================================
 */
function persistLogs(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    
    // Get existing logs
    let logs = [];
    try {
        logs = JSON.parse(localStorage.getItem("debug_logs")) || [];
    } catch (e) {
        logs = [];
    }
    
    // Add new log
    logs.push(logMessage);
    
    // Keep only last 100 logs
    if (logs.length > 100) {
        logs = logs.slice(-100);
    }
    
    // Save to localStorage
    localStorage.setItem("debug_logs", JSON.stringify(logs));
    
    // Also log to console
    console.log(logMessage);
}

/**
 * ============================================
 * CLEAR DEBUG LOGS
 * Utility to clear stored logs
 * ============================================
 */
function clearDebugLogs() {
    localStorage.removeItem("debug_logs");
    persistLogs("🧹 Debug logs cleared");
}

/**
 * ============================================
 * VIEW DEBUG LOGS
 * Display all stored logs in console
 * ============================================
 */
function viewDebugLogs() {
    const logs = JSON.parse(localStorage.getItem("debug_logs")) || [];
    console.log("📜 Debug Logs (" + logs.length + " entries):");
    logs.forEach(log => console.log(log));
    return logs;
}

/**
 * ============================================
 * INITIALIZE ON LOAD
 * Print previous session logs
 * ============================================
 */
(function() {
    const previousLogs = JSON.parse(localStorage.getItem("debug_logs")) || [];
    if (previousLogs.length > 0) {
        console.log("📜 Previous Session Logs (" + previousLogs.length + " entries):");
        previousLogs.forEach(log => console.log(log));
    }
})();

/**
 * ============================================
 * ROLE-BASED ACCESS CONTROL
 * ============================================
 */

/**
 * Check if current user is admin
 * @returns {boolean} True if user has admin role
 */
function isAdmin() {
    const role = localStorage.getItem('role');
    return role === 'admin';
}

/**
 * Get current user role
 * @returns {string} User role ('user' or 'admin')
 */
function getUserRole() {
    return localStorage.getItem('role') || 'user';
}

/**
 * Require admin access
 * Redirects to admin login if not admin
 * @returns {boolean} True if user is admin
 */
function requireAdmin() {
    if (!isAdmin()) {
        persistLogs('🔒 Admin access required. Redirecting...');
        localStorage.setItem('redirectAfterLogin', window.location.pathname);
        window.location.href = '/admin/login.html';
        return false;
    }
    return true;
}

/**
 * ============================================
 * EXPOSE FUNCTIONS GLOBALLY
 * ============================================
 */
window.auth = {
    verifyAuthentication,
    isUserAuthenticated,
    requireAuthentication,
    performLogout,
    updateUsername,
    setupLogout,
    redirectToLogin,
    clearDebugLogs,
    viewDebugLogs,
    persistLogs,
    isAdmin,
    getUserRole,
    requireAdmin
};

console.log('✅ Auth module loaded');
console.log('📡 Auth API endpoint:', window.CONFIG?.AUTH?.VERIFY || (window.CONFIG?.API_BASE + '/auth/verify') || 'http://localhost:3000/api/auth/verify');