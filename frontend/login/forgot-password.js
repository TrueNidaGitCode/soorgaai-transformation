/**
 * ============================================
 * FORGOT PASSWORD PAGE
 * ============================================
 */

document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ Forgot Password page loaded");

    const form = document.getElementById("forgot-password-form");
    const emailInput = document.getElementById("email");
    const message = document.getElementById("message");
    const resetButton = document.getElementById("reset-button");

    form.addEventListener("submit", handleForgotPassword);

    // Clear message on input
    emailInput.addEventListener("input", () => hideMessage());
});

/**
 * Handle forgot password form submission
 */
async function handleForgotPassword(event) {
    event.preventDefault();

    const emailInput = document.getElementById("email");
    const email = emailInput.value.trim();

    // Validate email
    if (!email) {
        showMessage("Please enter your email address", "error");
        return;
    }

    if (!isValidEmail(email)) {
        showMessage("Please enter a valid email address", "error");
        return;
    }

    // Show loading state
    setLoadingState(true);
    hideMessage();

    try {
        console.log(`📡 Requesting password reset for: ${email}`);

        const endpoint = window.CONFIG?.AUTH?.FORGOT_PASSWORD || 'http://localhost:3000/api/users/forgot-password';
        console.log(`🔗 Endpoint: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            // 503 = mail was never configured, 502 = it failed just now. Both
            // come with a sentence written for the person reading it.
            throw new Error(data.msg || "Failed to send reset link");
        }

        // The server no longer returns the token — it goes into the email and
        // nowhere else — so there is nothing to redirect to from here. The
        // person's next step is their inbox.
        //
        // The wording is the server's, not ours: it is the same sentence
        // whether or not the account exists, and saying "sent!" here would
        // undo that on the client.
        showMessage(
            data.delivery === 'console'
                ? "No mail transport is configured in this environment — the reset link is in the server log."
                : (data.msg || "If an account exists with this email, we've sent a link to reset the password."),
            "success"
        );

        // Clear form
        emailInput.value = "";

    } catch (error) {
        console.error("❌ Error:", error);
        showMessage(error.message || "Failed to send reset link. Please try again.", "error");
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

/**
 * Validate email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

console.log("✅ Forgot password module loaded");
