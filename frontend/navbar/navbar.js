/**
 * ============================================
 * NAVBAR - DYNAMIC NAVIGATION COMPONENT
 * ============================================
 * Handles:
 * - Dynamic navbar loading
 * - Authentication state management
 * - Navigation event handlers
 * - User login/logout functionality
 * ============================================
 */

// Global navbar reload function
window.loadNavbar = function () {
    console.log("🔄 loadNavbar() called...");
    setupNavbarHandlers();
};

/**
 * ============================================
 * GET NAVBAR PATH
 * Calculate correct path to navbar based on current page location
 * ============================================
 */
function getNavbarPath() {
    const currentPath = window.location.pathname;
    console.log(`📍 Current page path: ${currentPath}`);
    
    // If we're at /index.html (main landing page)
    if (currentPath.includes('/index.html') || currentPath.endsWith('/')) {
        console.log("📂 At frontend/index.html, using: navbar/navbar.html");
        return 'navbar/navbar.html';
    }
    
    // If we're in /signals/, /login/, /dashboard/, /admin/
    if (currentPath.includes('/signals/') ||
        currentPath.includes('/login/') ||
        currentPath.includes('/dashboard/') ||
        currentPath.includes('/admin/') ||
        currentPath.includes('/about/')) {
        console.log("📂 In / subfolder, using: ../navbar/navbar.html");
        return '../navbar/navbar.html';
    }
    
    // Default fallback for pages in /
    console.log("📂 Using default fallback: navbar/navbar.html");
    return 'navbar/navbar.html';
}

/**
 * ============================================
 * LOAD NAVBAR DYNAMICALLY
 * ============================================
 */
document.addEventListener("DOMContentLoaded", function () {
    console.log("🔥 navbar.js is executing...");

    // Find or create navbar container
    let navbarContainer = document.getElementById("navbar-container");
    if (!navbarContainer) {
        console.warn("⚠️ #navbar-container not found in DOM! Adding it manually...");
        document.body.insertAdjacentHTML("afterbegin", `<div id="navbar-container"></div>`);
        navbarContainer = document.getElementById("navbar-container");
    }

    // Get correct path based on current page location
    const navbarPath = getNavbarPath();
    console.log(`📂 Loading navbar from: ${navbarPath}`);

    // Fetch and inject navbar HTML
    fetch(navbarPath) 
        .then(response => {
            if (!response.ok) {
                throw new Error(`❌ Navbar fetch failed: ${response.status} - ${response.statusText}`);
            }
            return response.text();
        })
        .then(html => {
            console.log("✅ Navbar HTML loaded successfully.");
            navbarContainer.innerHTML = html;

            // Use MutationObserver to detect when navbar elements are in DOM
            const observer = new MutationObserver((mutations, obs) => {
                if (document.getElementById("loginSignupBtn")) {
                    console.log("✅ Navbar elements detected in DOM");
                    setupNavbarHandlers();
                    setupNavigationLinks();
                    obs.disconnect();
                }
            });
            observer.observe(navbarContainer, { childList: true, subtree: true });

            // Fallback timeout in case MutationObserver doesn't fire
            setTimeout(() => {
                setupNavbarHandlers();
                setupNavigationLinks();
            }, 500);
        })
        .catch(error => {
            console.error("❌ Failed to load navbar:", error);
            console.error("Attempted path:", navbarPath);
        });
});

/**
 * ============================================
 * SETUP NAVBAR HANDLERS
 * Ensures navbar reflects authentication state properly
 * ============================================
 */
function setupNavbarHandlers() {
    console.log("🔄 Setting up navbar authentication...");

    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username") || "Guest";
    const role = localStorage.getItem("role") || "user";  // GET ROLE

    const loginButton = document.getElementById("loginSignupBtn");
    const logoutButton = document.getElementById("logoutBtn");
    const usernameDisplay = document.getElementById("username-display");
    const adminDashboardBtn = document.getElementById("adminDashboardBtn");  // GET ADMIN BUTTON

    if (!loginButton || !logoutButton || !usernameDisplay) {
        console.error("❌ Navbar elements not found! Cannot set up authentication.");
        console.error("❌ loginButton:", loginButton);
        console.error("❌ logoutButton:", logoutButton);
        console.error("❌ usernameDisplay:", usernameDisplay);
        return;
    }

    if (token) {
        console.log(`✅ Logged in as ${username} (${role})`);
        usernameDisplay.textContent = `Hello, ${username}`;
        usernameDisplay.style.display = "inline";
        loginButton.style.display = "none";
        logoutButton.style.display = "inline";

        // Show admin dashboard link if user is admin
        if (role === 'admin' && adminDashboardBtn) {
            adminDashboardBtn.style.display = 'inline';
            console.log("✅ Admin dashboard link shown");
        }

        // Remove old listener before adding new one to prevent duplicates
        logoutButton.removeEventListener("click", logoutUser);
        logoutButton.addEventListener("click", logoutUser);
    } else {
        console.warn("⚠️ Not logged in. Showing login button.");
        loginButton.style.display = "inline";
        logoutButton.style.display = "none";
        usernameDisplay.style.display = "none";

        // Hide admin dashboard link
        if (adminDashboardBtn) {
            adminDashboardBtn.style.display = "none";
        }

        // Remove old listener before adding new one
        loginButton.removeEventListener("click", redirectToLogin);
        loginButton.addEventListener("click", redirectToLogin);
    }
}

/**
 * ============================================
 * SETUP NAVIGATION LINKS
 * Handles navigation links and ensures they are clickable
 * ============================================
 */
function setupNavigationLinks(attempt = 0) {
    console.log("🔄 Setting up navigation links...");

    // "Your Signals" button handler
    const yourSignalsBtn = document.getElementById("yourSignalsBtn");
    if (yourSignalsBtn) {
        // Remove any existing listeners first
        yourSignalsBtn.replaceWith(yourSignalsBtn.cloneNode(true));
        const freshYourSignalsBtn = document.getElementById("yourSignalsBtn");
        
        freshYourSignalsBtn.addEventListener("click", function (event) {
            event.preventDefault();
            console.log("✅ 'Your Signals' button clicked!");

            const token = localStorage.getItem("token");
            if (token) {
                console.log("✅ Redirecting to Your Signals dashboard...");
                window.location.href = "/dashboard/signaldashboard.html";
            } else {
                console.log("🔒 User not logged in. Redirecting to login...");
                localStorage.setItem("redirectAfterLogin", "/dashboard/signaldashboard.html");
                window.location.href = "/login/login.html";
            }
        });
        console.log("✅ 'Your Signals' button event attached.");
    } else if (attempt < 5) {
        console.warn(`⚠️ 'Your Signals' button not found. Retrying... (Attempt ${attempt + 1})`);
        setTimeout(() => setupNavigationLinks(attempt + 1), 500);
        return; // Exit to prevent other buttons from being processed yet
    } else {
        console.error("❌ 'Your Signals' button NOT found after 5 attempts.");
    }

    // "Admin Dashboard" button handler
    const adminDashboardBtn = document.getElementById("adminDashboardBtn");
    if (adminDashboardBtn) {
        // Remove any existing listeners first
        adminDashboardBtn.replaceWith(adminDashboardBtn.cloneNode(true));
        const freshAdminDashboardBtn = document.getElementById("adminDashboardBtn");

        freshAdminDashboardBtn.addEventListener("click", function (event) {
            event.preventDefault();
            console.log("✅ 'Admin Dashboard' button clicked!");

            const role = localStorage.getItem("role");
            if (role === 'admin') {
                console.log("✅ Redirecting to Admin Dashboard...");
                window.location.href = "/admin/dashboard.html";
            } else {
                console.log("🔒 Access denied - not admin. Redirecting to admin login...");
                window.location.href = "/admin/login.html";
            }
        });
        console.log("✅ 'Admin Dashboard' button event attached.");
    }

    // "Signal Page" button handler
    const signalpageBtn = document.getElementById("signalpageBtn");
    if (signalpageBtn) {
        // Remove any existing listeners first
        signalpageBtn.replaceWith(signalpageBtn.cloneNode(true));
        const freshSignalpageBtn = document.getElementById("signalpageBtn");
        
        freshSignalpageBtn.addEventListener("click", function (event) {
            event.preventDefault();
            console.log("✅ 'Signal Page' button clicked! Redirecting...");
            window.location.href = "/signals/signal-page.html";
        });
        console.log("✅ 'Signal Page' button event attached.");
    } else if (attempt < 5) {
        console.warn(`⚠️ 'Signal Page' button not found. Retrying... (Attempt ${attempt + 1})`);
    } else {
        console.error("❌ 'Signal Page' button NOT found after 5 attempts.");
    }

    // "About Us" button handler
    const aboutUsBtn = document.getElementById("aboutUsBtn");
    if (aboutUsBtn) {
        // Remove any existing listeners first
        aboutUsBtn.replaceWith(aboutUsBtn.cloneNode(true));
        const freshAboutUsBtn = document.getElementById("aboutUsBtn");
        
        freshAboutUsBtn.addEventListener("click", function (event) {
            event.preventDefault();
            console.log("✅ 'About Us' button clicked! Redirecting...");
            window.location.href = "/about/about.html";
        });
        console.log("✅ 'About Us' button event attached.");
    } else if (attempt < 5) {
        console.warn(`⚠️ 'About Us' button not found. Retrying... (Attempt ${attempt + 1})`);
    } else {
        console.error("❌ 'About Us' button NOT found after 5 attempts.");
    }
}

/**
 * ============================================
 * REDIRECT TO LOGIN
 * Uses absolute path to work from any page location
 * ============================================
 */
function redirectToLogin() {
    console.log("🔒 Redirecting to login...");
    window.location.href = "/login/login.html";
}

/**
 * ============================================
 * LOGOUT USER
 * Logs out the user and clears session
 * Redirects to home page after logout
 * ============================================
 */
function logoutUser() {
    console.log("🚪 Logging out...");
    
    // Optional: Call logout endpoint if CONFIG is available
    if (window.CONFIG?.AUTH?.LOGOUT) {
        const token = localStorage.getItem("token");
        if (token) {
            fetch(window.CONFIG.AUTH.LOGOUT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }).catch(err => console.log('Logout API call failed:', err));
        }
    }
    
    // Clear local storage
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    localStorage.removeItem("role");  // CLEAR ROLE
    localStorage.removeItem("redirectAfterLogin");
    
    // Refresh navbar to show logged-out state
    setupNavbarHandlers();
    
    // Redirect to home page
    console.log("✅ Redirecting to home page...");
    window.location.href = "/index.html";
}

console.log('✅ Navbar module loaded');