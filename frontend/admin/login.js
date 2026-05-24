/**
 * ============================================
 * ADMIN LOGIN PAGE
 * ============================================
 */

document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ Admin login page loaded");

    // Check if already logged in as admin
    checkExistingAuth();

    // Setup form handler
    const loginForm = document.getElementById("admin-login-form");
    loginForm.addEventListener("submit", handleAdminLogin);

    // Clear error on input
    document.getElementById("email").addEventListener("input", () => hideError());
    document.getElementById("password").addEventListener("input", () => hideError());
});

/**
 * Check if user is already authenticated as admin
 */
function checkExistingAuth() {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (token && role === 'admin') {
        console.log("✅ Already logged in as admin, redirecting to dashboard");
        window.location.href = '/admin/dashboard.html';
    }
}

/**
 * Handle admin login form submission
 */
async function handleAdminLogin(event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    // Validation
    if (!email || !password) {
        showError("Please enter both email and password");
        return;
    }

    if (password.length < 6) {
        showError("Password must be at least 6 characters");
        return;
    }

    // Show loading state
    setLoadingState(true);
    hideError();

    try {
        console.log(`📡 Admin login attempt for: ${email}`);

        const authEndpoint = window.CONFIG?.AUTH?.LOGIN;
        console.log(`🔗 Endpoint: ${authEndpoint}`);

        const response = await fetch(authEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        console.log("Response:", data);

        if (!response.ok) {
            throw new Error(data.msg || data.error || "Authentication failed");
        }

        // CRITICAL: Verify admin role
        if (data.role !== 'admin') {
            console.error("❌ Access denied - user is not admin");
            throw new Error("Access denied. Admin privileges required.");
        }

        console.log("✅ Admin login successful");

        // Store authentication data
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username || email.split('@')[0]);
        localStorage.setItem("role", data.role);  // STORE ROLE

        // Show success message
        showSuccess("Login successful! Redirecting...");

        // Redirect to admin dashboard
        setTimeout(() => {
            window.location.href = '/admin/dashboard.html';
        }, 800);

    } catch (error) {
        console.error("❌ Admin Login Error:", error);
        showError(error.message || "Login failed. Please check your credentials.");
    } finally {
        setLoadingState(false);
    }
}

/**
 * Set loading state
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
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
    errorMessage.style.background = "rgba(255, 107, 107, 0.15)";
    errorMessage.style.borderColor = "rgba(255, 107, 107, 0.5)";
    errorMessage.style.color = "#ff6b6b";
}

/**
 * Show success message
 */
function showSuccess(message) {
    const errorMessage = document.getElementById("error-message");
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
    errorMessage.style.background = "rgba(92, 197, 167, 0.15)";
    errorMessage.style.borderColor = "rgba(92, 197, 167, 0.5)";
    errorMessage.style.color = "#5CC5A7";
}

/**
 * Hide error message
 */
function hideError() {
    const errorMessage = document.getElementById("error-message");
    errorMessage.style.display = "none";
}

console.log("✅ Admin login module loaded");
