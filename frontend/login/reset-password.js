/**
 * ============================================
 * RESET PASSWORD PAGE
 * ============================================
 */

document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ Reset Password page loaded");

    // Get token and email from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const email = urlParams.get('email');

    // Validate URL parameters
    if (!token || !email) {
        showMessage("Invalid reset link. Please request a new password reset.", "error");
        document.getElementById("reset-password-form").style.display = "none";
        return;
    }

    // Store in hidden fields
    document.getElementById("token").value = token;
    document.getElementById("email").value = email;

    console.log("✅ Valid reset token found");

    // Setup form handler
    const form = document.getElementById("reset-password-form");
    form.addEventListener("submit", handleResetPassword);

    // Clear message on input
    document.getElementById("new-password").addEventListener("input", () => hideMessage());
    document.getElementById("confirm-password").addEventListener("input", () => hideMessage());
});

/**
 * Handle reset password form submission
 */
async function handleResetPassword(event) {
    event.preventDefault();

    const token = document.getElementById("token").value;
    const email = document.getElementById("email").value;
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    // Validate passwords
    if (!newPassword || !confirmPassword) {
        showMessage("Please enter both password fields", "error");
        return;
    }

    if (newPassword.length < 6) {
        showMessage("Password must be at least 6 characters", "error");
        return;
    }

    if (newPassword !== confirmPassword) {
        showMessage("Passwords do not match", "error");
        return;
    }

    // Show loading state
    setLoadingState(true);
    hideMessage();

    try {
        console.log(`📡 Resetting password for: ${email}`);

        const endpoint = window.CONFIG?.AUTH?.RESET_PASSWORD || 'http://localhost:3000/api/users/reset-password';
        console.log(`🔗 Endpoint: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                token,
                newPassword
            })
        });

        const data = await response.json();
        console.log("Response:", data);

        if (!response.ok) {
            throw new Error(data.msg || "Failed to reset password");
        }

        // Success
        showMessage(
            "Password reset successful! Redirecting to login...",
            "success"
        );

        // Redirect to login after 2 seconds
        setTimeout(() => {
            window.location.href = "login.html";
        }, 2000);

    } catch (error) {
        console.error("❌ Error:", error);
        showMessage(
            error.message || "Failed to reset password. The link may have expired.",
            "error"
        );
    } finally {
        setLoadingState(false);
    }
}

/**
 * Show message
 */
function showMessage(text, type = "error") {
    const message = document.getElementById("message");

    message.textContent = text;
    message.style.display = "block";

    if (type === "success") {
        message.style.background = "rgba(92, 197, 167, 0.15)";
        message.style.borderColor = "rgba(92, 197, 167, 0.5)";
        message.style.color = "#5CC5A7";
    } else {
        message.style.background = "rgba(255, 107, 107, 0.15)";
        message.style.borderColor = "rgba(255, 107, 107, 0.5)";
        message.style.color = "#ff6b6b";
    }
}

/**
 * Hide message
 */
function hideMessage() {
    const message = document.getElementById("message");
    message.style.display = "none";
}

/**
 * Set loading state
 */
function setLoadingState(isLoading) {
    const resetButton = document.getElementById("reset-button");
    const buttonText = resetButton.querySelector('.button-text');
    const buttonLoader = resetButton.querySelector('.button-loader');

    if (isLoading) {
        resetButton.disabled = true;
        resetButton.classList.add('loading');
        if (buttonText) buttonText.style.display = 'none';
        if (buttonLoader) buttonLoader.style.display = 'flex';
    } else {
        resetButton.disabled = false;
        resetButton.classList.remove('loading');
        if (buttonText) buttonText.style.display = 'flex';
        if (buttonLoader) buttonLoader.style.display = 'none';
    }
}

console.log("✅ Reset password module loaded");
