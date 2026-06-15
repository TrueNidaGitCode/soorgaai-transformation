/**
 * ============================================
 * LOGIN PAGE - AUTHENTICATION LOGIC
 * ============================================
 * Handles:
 * - Login form submission
 * - API authentication
 * - Token storage
 * - Redirect after successful login
 * - Error handling and display
 * - Loading states
 * ============================================
 */

// ============================================
// 🧪 MOCK MODE FOR TESTING (Remove in production)
// ============================================
const MOCK_MODE = false; // ✅ Backend is ready - using real authentication

// ── ?redirect= query-param support ───────────────────────────
// Reads the redirect target from the URL on page load.
// SECURITY: only accepts same-origin relative paths starting with /
// that do NOT start with // (prevents open-redirect attacks).
function getValidRedirect() {
    try {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        if (!redirect) return null;
        if (!redirect.startsWith('/')) return null;       // must be relative
        if (redirect.startsWith('//')) return null;       // reject protocol-relative
        if (/^\/*(https?|ftp|javascript):/i.test(redirect)) return null; // extra guard
        return redirect;
    } catch {
        return null;
    }
}

// Resolved once at load time; used by redirectAfterLogin() and checkExistingAuth()
const pendingRedirect = getValidRedirect();

/**
 * ============================================
 * INITIALIZATION
 * ============================================
 */
document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ Login page loaded");
    
    // Check if CONFIG is loaded
    if (!window.CONFIG) {
        console.warn("⚠️ CONFIG not found. Using default settings.");
    } else {
        console.log("✅ CONFIG loaded successfully");
        console.log("📡 API endpoint:", window.CONFIG.API_BASE);
    }
    
    // Check if already logged in
    checkExistingAuth();
    
    // Get DOM elements
    const loginForm = document.getElementById("login-form");
    const errorMessage = document.getElementById("error-message");
    const loginButton = document.getElementById("login-button");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    
    // Validate required elements exist
    if (!loginForm || !errorMessage || !loginButton) {
        console.error("❌ Required form elements not found");
        return;
    }
    
    // Setup form submission handler
    loginForm.addEventListener("submit", handleLogin);
    
    // Clear error message on input
    emailInput?.addEventListener("input", () => hideError());
    passwordInput?.addEventListener("input", () => hideError());
    
    console.log("✅ Login form initialized");
});

/**
 * ============================================
 * CHECK EXISTING AUTHENTICATION
 * If user already logged in, redirect to intended page
 * ============================================
 */
function checkExistingAuth() {
    const token = localStorage.getItem('token');

    if (token) {
        console.log('✅ User already authenticated');

        // ?redirect= param takes priority (e.g. platform page bounced them here)
        if (pendingRedirect) {
            console.log(`🔄 Redirecting to ?redirect param: ${pendingRedirect}`);
            window.location.href = pendingRedirect;
            return;
        }

        // Fall back to localStorage redirect
        const redirectUrl = localStorage.getItem('redirectAfterLogin');

        if (redirectUrl) {
            console.log(`🔄 Redirecting to saved page: ${redirectUrl}`);
            localStorage.removeItem('redirectAfterLogin');
            window.location.href = redirectUrl;
        } else {
            console.log('🔄 Redirecting to workspace');
            window.location.href = '/workspace/workspace.html';
        }
    }
}

/**
 * ============================================
 * HANDLE LOGIN FORM SUBMISSION
 * Main authentication function
 * ============================================
 */
async function handleLogin(event) {
    event.preventDefault();
    console.log("🔄 Login form submitted");
    
    // Get form elements
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    
    // Get form values
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    
    // Validate inputs
    if (!email || !password) {
        showError("Please enter both email and password");
        return;
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
        showError("Please enter a valid email address");
        return;
    }
    
    // Validate password length
    if (password.length < 6) {
        showError("Password must be at least 6 characters");
        return;
    }
    
    // Clear any existing error
    hideError();
    
    // Show loading state
    setLoadingState(true);
    
    // ============================================
    // 🧪 MOCK LOGIN (for testing without backend)
    // ============================================
    if (MOCK_MODE) {
        console.log('🧪 Using mock login (MOCK_MODE = true)');
        
        setTimeout(() => {
            try {
                const result = window.mockLogin(email, password);
                
                if (result && result.success) {
                    console.log('✅ Mock login successful');
                    showSuccess("Login successful! Redirecting...");
                    
                    setTimeout(() => {
                        redirectAfterLogin();
                    }, 800);
                } else {
                    showError("Login failed. Please try again.");
                    setLoadingState(false);
                }
            } catch (error) {
                console.error('❌ Mock login error:', error);
                showError("Mock login failed. Check console for details.");
                setLoadingState(false);
            }
        }, 1000); // Simulate network delay
        
        return;
    }
    
    // ============================================
    // REAL LOGIN (when backend is ready)
    // ============================================
    try {
        console.log(`📡 Authenticating user: ${email}`);
        
        // Get API endpoint from CONFIG or use fallback
        const authEndpoint = window.CONFIG?.AUTH?.LOGIN || 'http://localhost:3000/api/auth/register';
        console.log(`🔗 Auth endpoint: ${authEndpoint}`);
        
        // Call authentication API
        const response = await fetch(authEndpoint, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({ email, password })
        });
        
        // Parse response
        const data = await response.json();
        console.log("🔍 API Response:", data);
        
        // Handle HTTP errors
        if (!response.ok) {
            throw new Error(data.error || "Authentication failed. Please try again.");
        }
        
        // Validate response data
        if (!data.token) {
            throw new Error("Invalid response from server. Please try again.");
        }
        
        // Authentication successful
        console.log("✅ Authentication successful");

        // Clear any previous user's local data before storing the new session.
        // This prevents blueprint/memory/assessment data leaking across accounts
        // when two users log in on the same device without an explicit logout.
        [
          'soorgaai_blueprint_v1', 'soorgaai_blueprint_activity_v1',
          'soorgaai_executive_memory_v1', 'soorgaai_company_context_v1',
          'da_score', 'soorga_assessment_progress',
        ].forEach(k => localStorage.removeItem(k));

        // Store authentication data
        localStorage.setItem("token", data.token);

        // Store role (important for admin access)
        if (data.role) {
            localStorage.setItem("role", data.role);
            console.log("🔐 User role:", data.role);
        } else {
            localStorage.setItem("role", "user"); // Default to user
            console.log("🔐 User role: user (default)");
        }

        // Store user info if provided
        if (data.user) {
            if (data.user.email) {
                localStorage.setItem("username", data.user.email.split('@')[0]);
            }
            if (data.user.id) {
                localStorage.setItem("userId", data.user.id);
            }
        } else {
            // Fallback: use email prefix as username
            localStorage.setItem("username", email.split('@')[0]);
        }

        console.log("📦 Token stored in localStorage");
        console.log("👤 Username:", localStorage.getItem("username"));
        
        // Show success message briefly
        showSuccess("Login successful! Redirecting...");
        
        // Redirect after short delay
        setTimeout(() => {
            redirectAfterLogin();
        }, 800);
        
    } catch (error) {
        console.error("❌ Login Error:", error);
        
        // Show error to user
        showError(error.message || "Login failed. Please try again.");
        
        // Reset loading state
        setLoadingState(false);
    }
}

/**
 * ============================================
 * REDIRECT AFTER LOGIN
 * Determine where to redirect user after successful login
 * ============================================
 */
function redirectAfterLogin() {
    console.log("🔄 Determining redirect destination");

    // 1. ?redirect= query param (highest priority — set by CTARouter or platform guard)
    if (pendingRedirect) {
        console.log(`✅ Redirecting to ?redirect param: ${pendingRedirect}`);
        window.location.href = pendingRedirect;
        return;
    }

    // 2. Saved redirect from localStorage (legacy pattern)
    const redirectUrl = localStorage.getItem('redirectAfterLogin');

    if (redirectUrl) {
        console.log(`✅ Redirecting to saved page: ${redirectUrl}`);
        localStorage.removeItem('redirectAfterLogin');
        window.location.href = redirectUrl;
        return;
    }

    // 3. Check for pending signal generation
    const pendingSignalId = localStorage.getItem('pendingSignalId');

    if (pendingSignalId) {
        console.log(`✅ Redirecting to signal page with pending generation`);
        window.location.href = '/signals/signal-page.html';
        return;
    }

    // 4. Default redirect to workspace
    console.log("✅ Redirecting to workspace");
    window.location.href = '/workspace/workspace.html';
}

/**
 * ============================================
 * UI STATE MANAGEMENT
 * Functions to control form UI states
 * ============================================
 */

/**
 * Set loading state on button
 */
function setLoadingState(isLoading) {
    const loginButton = document.getElementById("login-button");
    const buttonText = loginButton.querySelector('.button-text');
    const buttonLoader = loginButton.querySelector('.button-loader');
    
    if (isLoading) {
        loginButton.disabled = true;
        loginButton.classList.add('loading');
        if (buttonText) buttonText.style.display = 'none';
        if (buttonLoader) buttonLoader.style.display = 'flex';
    } else {
        loginButton.disabled = false;
        loginButton.classList.remove('loading');
        if (buttonText) buttonText.style.display = 'flex';
        if (buttonLoader) buttonLoader.style.display = 'none';
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorMessage = document.getElementById("error-message");
    
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Reset styles (in case it was showing success)
        errorMessage.style.background = 'rgba(255, 107, 107, 0.15)';
        errorMessage.style.borderColor = 'rgba(255, 107, 107, 0.5)';
        errorMessage.style.color = '#ff6b6b';
        
        // Shake animation (if CSS supports it)
        errorMessage.classList.remove('shake');
        void errorMessage.offsetWidth; // Trigger reflow
        errorMessage.classList.add('shake');
    }
    
    console.error("⚠️ Error displayed to user:", message);
}

/**
 * Hide error message
 */
function hideError() {
    const errorMessage = document.getElementById("error-message");
    
    if (errorMessage) {
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';
    }
}

/**
 * Show success message
 */
function showSuccess(message) {
    const errorMessage = document.getElementById("error-message");
    
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.style.background = 'rgba(92, 197, 167, 0.15)';
        errorMessage.style.borderColor = 'rgba(92, 197, 167, 0.5)';
        errorMessage.style.color = '#5CC5A7';
    }
    
    console.log("✅ Success message displayed:", message);
}

/**
 * ============================================
 * VALIDATION HELPERS
 * ============================================
 */

/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * ============================================
 * KEYBOARD SHORTCUTS
 * Optional: Add keyboard shortcuts for better UX
 * ============================================
 */
document.addEventListener('keydown', function(event) {
    // ESC key clears error
    if (event.key === 'Escape') {
        hideError();
    }
});

/**
 * ============================================
 * PASSWORD VISIBILITY TOGGLE (Optional Enhancement)
 * Add this if you want a show/hide password feature
 * ============================================
 */
function togglePasswordVisibility() {
    const passwordInput = document.getElementById("password");
    
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
    } else {
        passwordInput.type = "password";
    }
}

// Expose function globally if needed
window.togglePasswordVisibility = togglePasswordVisibility;

/**
 * ============================================
 * ANALYTICS TRACKING (Optional)
 * Track login attempts for product insights
 * ============================================
 */
function trackLoginAttempt(success, errorType = null) {
    try {
        // Send analytics event to backend
        const analyticsData = {
            event: success ? 'login_success' : 'login_failure',
            timestamp: new Date().toISOString(),
            errorType: errorType
        };
        
        // Optional: Send to analytics endpoint if CONFIG available
        if (window.CONFIG?.ANALYTICS?.EVENT) {
            fetch(window.CONFIG.ANALYTICS.EVENT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(analyticsData)
            }).catch(err => console.log('Analytics failed:', err));
        }
        
        console.log('📊 Analytics:', analyticsData);
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

console.log('✅ Login module loaded');