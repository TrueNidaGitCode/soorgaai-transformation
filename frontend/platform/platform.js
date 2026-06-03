/**
 * SoorgaAI — Platform Workspace Auth Guard
 *
 * Validates the JWT on every load:
 *   No token         → redirect to login (with ?redirect= back here)
 *   Valid token      → show workspace, render greeting
 *   Expired/invalid  → clear token, redirect to login
 *
 * Depends on window.CONFIG (loaded by config.js before this script).
 */

const REDIRECT_BACK = '/login/login.html?redirect=/platform/platform.html';

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = REDIRECT_BACK;
        return;
    }

    try {
        const verifyUrl = window.CONFIG?.AUTH?.VERIFY || '/api/users/me';

        const response = await fetch(verifyUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = REDIRECT_BACK;
            return;
        }

        if (response.ok) {
            const data = await response.json();
            const username =
                data?.user?.name ||
                data?.user?.email?.split('@')[0] ||
                localStorage.getItem('username') ||
                'there';

            const greeting = document.getElementById('platform-greeting');
            if (greeting) greeting.textContent = `Welcome back, ${username}.`;

            showContent();
        } else {
            // Non-401 error (e.g. 500) — show content but no greeting
            showContent();
        }

    } catch {
        // Network error — still show content (guard at server level)
        showContent();
    }
});

function showContent() {
    const loading = document.getElementById('platform-loading');
    const content = document.getElementById('platform-content');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
}
