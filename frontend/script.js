/**
 * ============================================
 * LANDING PAGE - MAIN SCRIPT
 * ============================================
 * Handles:
 * - Authentication state checking
 * - Redirect after login
 * - CTA button navigation
 * - Navbar synchronization
 * ============================================
 */

/**
 * ============================================
 * AUTHENTICATION HELPERS
 * ============================================
 */

// Check if user is logged in
function isLoggedIn() {
    return localStorage.getItem("token") !== null;
}

// Check and handle redirect after login
function checkRedirectAfterLogin() {
    const redirectPage = localStorage.getItem("redirectAfterLogin");
    if (isLoggedIn() && redirectPage) {
        console.log(`🔄 Redirecting to saved page: ${redirectPage}`);
        localStorage.removeItem("redirectAfterLogin");
        window.location.href = redirectPage;
    }
}

// Navigate to destination with auth check
function navigateTo(destination) {
    if (isLoggedIn()) {
        console.log(`✅ Navigating to: ${destination}`);
        window.location.href = destination;
    } else {
        console.warn("⚠️ User not logged in. Redirecting to login...");
        localStorage.setItem("redirectAfterLogin", destination);
        window.location.href = "login/login.html";
    }
}

// Logout function
function logoutUser() {
    console.log("🚪 Logging out...");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    localStorage.removeItem("redirectAfterLogin");
    
    // Reload navbar if function exists
    if (typeof window.loadNavbar === "function") {
        window.loadNavbar();
    }
    
    // Reload page for clean state
    setTimeout(() => location.reload(), 300);
}

/**
 * ============================================
 * INITIALIZATION
 * ============================================
 */
document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ Landing page script.js loaded");

    // Check for redirect after login
    checkRedirectAfterLogin();

    // Ensure navbar loads correctly
    ensureNavbarLoads();

    // Setup CTA button handler
    setupCTAButton();

    // Setup logout button (if present in navbar)
    setupLogoutButton();
});

/**
 * ============================================
 * NAVBAR LOADING
 * Ensure navbar.js has loaded and executed
 * ============================================
 */
function ensureNavbarLoads(retries = 10) {
    if (typeof window.loadNavbar === "function") {
        console.log("✅ loadNavbar() found! Executing...");
        window.loadNavbar();
    } else if (retries > 0) {
        console.warn(`⚠️ loadNavbar() not found. Retrying in 500ms... (${retries} attempts left)`);
        setTimeout(() => ensureNavbarLoads(retries - 1), 500);
    } else {
        console.error("❌ loadNavbar() still not found after retries!");
    }
}

/**
 * ============================================
 * CTA BUTTON HANDLER
 * "Create a Post from a Signal" button on landing page
 * ============================================
 */
function setupCTAButton() {
    // Wait for DOM to be fully ready
    setTimeout(() => {
        // Try multiple possible button IDs/classes
        const ctaButton = document.querySelector('.cta-button') || 
                         document.getElementById('createPostBtn') ||
                         document.querySelector('a[href*="signal"]');
        
        if (ctaButton) {
            // Check if it's already an anchor tag with href
            if (ctaButton.tagName === 'A' && ctaButton.href) {
                console.log("✅ CTA button found (anchor tag with href)");
                // No additional handler needed - href will work
            } else {
                // Add click handler for buttons without href
                ctaButton.addEventListener("click", function (event) {
                    event.preventDefault();
                    console.log("🎯 CTA button clicked - navigating to signals page");
                    window.location.href = "signals/signal-page.html";
                });
                console.log("✅ CTA button event attached");
            }
        } else {
            console.warn("⚠️ CTA button not found in DOM");
        }
    }, 500);
}

/**
 * ============================================
 * LOGOUT BUTTON HANDLER
 * Setup logout functionality if button exists
 * ============================================
 */
function setupLogoutButton() {
    setTimeout(() => {
        const logoutBtn = document.getElementById("logoutBtn");
        
        if (logoutBtn) {
            logoutBtn.addEventListener("click", function (event) {
                event.preventDefault();
                console.log("🔴 Logout button clicked");
                logoutUser();
            });
            console.log("✅ Logout button event attached");
        } else {
            console.log("ℹ️ Logout button not found (user may not be logged in)");
        }
    }, 1000); // Wait longer for navbar to load
}

/**
 * ============================================
 * EXPOSE FUNCTIONS GLOBALLY
 * Allow other scripts to use these functions
 * ============================================
 */
window.landingPage = {
    isLoggedIn,
    navigateTo,
    logoutUser,
    checkRedirectAfterLogin
};

console.log("✅ Landing page module loaded");