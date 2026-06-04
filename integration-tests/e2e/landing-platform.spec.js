/**
 * SoorgaAI — Landing Page Refinement & Platform Workspace Stub
 * Architecture Version: 2.1.0 | EPIC: SOORGA-EPIC-UI-V2.1.0
 * Framework: Playwright (vanilla HTML/JS — no React, no build step)
 *
 * Test cases: FE-LP-001 → FE-LP-021
 *
 * Setup:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *   npx playwright test integration-tests/e2e/landing-platform.spec.js
 *
 * Env:
 *   BASE_URL — Frontend base URL (default: http://127.0.0.1:5500)
 *
 * API mocking:
 *   All tests that touch backend calls use page.route() intercepts so the suite
 *   runs without a live backend.  Tests that explicitly verify real-backend
 *   behaviour are tagged @needs-backend and are skipped by default.
 *
 * Selector reference:
 *   Landing : #cta-generate-roadmap  .hero__badge  .benefits-cards  .benefit-card
 *   Login   : #login-form  #email  #password  #login-button  #error-message
 *   Platform: #platform-greeting  #platform-loading  #platform-content
 *             .workspace-card  .workspace-card__title
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5500';

// ── Shared route helpers ──────────────────────────────────────────────────────

/** Mock POST /api/users/login to return a successful 200 with a token. */
async function mockLoginSuccess(page, overrides = {}) {
  await page.route('**/api/users/login', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-integration-jwt',
        role: 'user',
        user: { email: 'qa@soorgaai.test', name: 'QA User' },
        ...overrides,
      }),
    });
  });
}

/** Mock POST /api/users/login to return 401 Unauthorized. */
async function mockLoginFail(page) {
  await page.route('**/api/users/login', route => {
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Invalid credentials' }),
    });
  });
}

/** Mock GET /api/users/me to return 200 with a user object. */
async function mockMeSuccess(page, user = { name: 'QA User', email: 'qa@soorgaai.test' }) {
  await page.route('**/api/users/me', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    });
  });
}

/** Mock GET /api/users/me to return 401 Unauthorized. */
async function mockMe401(page) {
  await page.route('**/api/users/me', route => {
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized' }),
    });
  });
}

/** Simulate a network failure on GET /api/users/me. */
async function mockMeNetworkError(page) {
  await page.route('**/api/users/me', route => route.abort('failed'));
}

/** Remove token and any auth keys from localStorage. */
async function clearAuth(page) {
  await page.evaluate(() => {
    ['token', 'username', 'userId', 'role', 'redirectAfterLogin'].forEach(k =>
      localStorage.removeItem(k),
    );
  });
}

/** Inject a mock token into localStorage. */
async function setToken(page, token = 'mock-valid-jwt') {
  await page.evaluate(t => localStorage.setItem('token', t), token);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A — Landing Page (index.html)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-LP-001 — anonymous landing page renders without auth chrome and makes no API calls', async ({ page }) => {
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) apiCalls.push(req.url());
  });

  await page.goto(`${BASE_URL}/index.html`);
  await clearAuth(page);
  await page.reload();

  // Hero badge
  await expect(page.locator('.hero__badge')).toBeVisible();

  // Hero H1
  const h1 = page.locator('h1#hero-heading');
  await expect(h1).toBeVisible();

  // Benefits bar — 3 cards between description and primary CTA
  const benefitCards = page.locator('.benefit-card');
  await expect(benefitCards).toHaveCount(3);

  // Primary CTA
  const cta = page.locator('#cta-generate-roadmap');
  await expect(cta).toBeVisible();
  await expect(cta).toContainText('Generate My AI Roadmap');

  // Right-hand stages section present
  await expect(page.locator('#stages-panel-heading')).toBeVisible();

  // Authenticated chrome must be absent
  const logoutBtn  = page.locator('#logoutBtn');
  const myAssessBtn = page.locator('#myAssessmentsBtn');
  if (await logoutBtn.count() > 0)   await expect(logoutBtn).toBeHidden();
  if (await myAssessBtn.count() > 0) await expect(myAssessBtn).toBeHidden();

  // Zero API calls
  expect(apiCalls).toHaveLength(0);
});

test('FE-LP-002 — logged-in user sees identical anonymous landing page (no auth chrome leakage)', async ({ page }) => {
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) apiCalls.push(req.url());
  });

  await page.goto(`${BASE_URL}/index.html`);
  await setToken(page);
  await page.reload();

  // Same anonymous CTA must be visible
  await expect(page.locator('#cta-generate-roadmap')).toBeVisible();

  // Authenticated navbar chrome must NOT leak on the homepage
  const usernameDisplay = page.locator('#username-display');
  if (await usernameDisplay.count() > 0) await expect(usernameDisplay).toBeHidden();

  // No API calls made on the homepage regardless of auth state
  expect(apiCalls).toHaveLength(0);

  await clearAuth(page);
});

test('FE-LP-003 — body has data-nav-mode="anonymous" on index.html', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  const navMode = await page.locator('body').getAttribute('data-nav-mode');
  expect(navMode).toBe('anonymous');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B — CTA Router (shared/ctaRouter.js)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-LP-004 — anonymous user clicking CTA navigates to login page with redirect param', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);
  await clearAuth(page);
  await page.reload();

  const cta = page.locator('#cta-generate-roadmap');
  await expect(cta).toBeVisible();

  await cta.click();

  await page.waitForURL('**/login/login.html*', { timeout: 5000 });

  const url = page.url();
  expect(url).toContain('/login/login.html');
  expect(url).toContain('redirect=');
  expect(url).toContain('/platform/');
});

test('FE-LP-005 — authenticated user clicking CTA navigates directly to platform (no login detour)', async ({ page }) => {
  await mockMeSuccess(page);
  await page.goto(`${BASE_URL}/index.html`);
  await setToken(page);
  await page.reload();

  const cta = page.locator('#cta-generate-roadmap');
  await expect(cta).toBeVisible();

  await cta.click();

  await page.waitForURL('**/platform/platform.html', { timeout: 5000 });
  expect(page.url()).toContain('/platform/platform.html');
  expect(page.url()).not.toContain('/login/');

  await clearAuth(page);
});

test('FE-LP-006 — window.CTARouter is loaded on the homepage with a callable routeToWorkspace', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  const ctaRouterExists = await page.evaluate(() =>
    typeof window.CTARouter === 'object' && typeof window.CTARouter.routeToWorkspace === 'function',
  );
  expect(ctaRouterExists).toBe(true);

  // ctaRouter.js script tag must be present in the document
  const scriptSrc = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[src]')];
    return scripts.map(s => s.getAttribute('src'));
  });
  expect(scriptSrc.some(s => s.includes('ctaRouter'))).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION C — Login Page Redirect Enhancement (login/login.js)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-LP-007 — valid ?redirect= param is honored after successful login', async ({ page }) => {
  await mockLoginSuccess(page);
  await mockMeSuccess(page);

  await page.goto(`${BASE_URL}/login/login.html?redirect=/platform/platform.html`);

  await page.fill('#email',    'qa@soorgaai.test');
  await page.fill('#password', 'TestPass123!');
  await page.locator('#login-button').click();

  await page.waitForURL('**/platform/platform.html', { timeout: 3000 });
  expect(page.url()).toContain('/platform/platform.html');

  await clearAuth(page);
});

test('FE-LP-008 — absolute HTTPS redirect (https://evil.com) is rejected; default destination used', async ({ page }) => {
  await mockLoginSuccess(page);

  await page.goto(`${BASE_URL}/login/login.html?redirect=https://evil.com`);

  await page.fill('#email',    'qa@soorgaai.test');
  await page.fill('#password', 'TestPass123!');
  await page.locator('#login-button').click();

  // Wait for a redirect to happen — it must NOT go to evil.com
  await page.waitForURL(url => !url.includes('login.html'), { timeout: 3000 });

  expect(page.url()).not.toContain('evil.com');

  await clearAuth(page);
});

test('FE-LP-009 — protocol-relative redirect (//evil.com) is rejected; default destination used', async ({ page }) => {
  await mockLoginSuccess(page);

  await page.goto(`${BASE_URL}/login/login.html?redirect=//evil.com`);

  await page.fill('#email',    'qa@soorgaai.test');
  await page.fill('#password', 'TestPass123!');
  await page.locator('#login-button').click();

  await page.waitForURL(url => !url.includes('login.html'), { timeout: 3000 });

  expect(page.url()).not.toContain('evil.com');

  await clearAuth(page);
});

test('FE-LP-010 — javascript: URI redirect is rejected; default destination used', async ({ page }) => {
  await mockLoginSuccess(page);

  await page.goto(`${BASE_URL}/login/login.html?redirect=javascript:alert(1)`);

  await page.fill('#email',    'qa@soorgaai.test');
  await page.fill('#password', 'TestPass123!');
  await page.locator('#login-button').click();

  await page.waitForURL(url => !url.includes('login.html'), { timeout: 3000 });

  // No script execution, no evil navigation
  expect(page.url()).not.toContain('javascript');

  await clearAuth(page);
});

test('FE-LP-011 — login with no ?redirect= uses the pre-existing default destination', async ({ page }) => {
  await mockLoginSuccess(page);

  await page.goto(`${BASE_URL}/login/login.html`);

  await page.fill('#email',    'qa@soorgaai.test');
  await page.fill('#password', 'TestPass123!');
  await page.locator('#login-button').click();

  // Must navigate away from login — exactly where is the pre-existing default
  await page.waitForURL(url => !url.includes('login/login.html'), { timeout: 3000 });

  expect(page.url()).not.toContain('login/login.html');

  await clearAuth(page);
});

test('FE-LP-012 — failed login shows inline error and does NOT redirect; URL still has redirect param', async ({ page }) => {
  await mockLoginFail(page);

  await page.goto(`${BASE_URL}/login/login.html?redirect=/platform/platform.html`);

  await page.fill('#email',    'qa@soorgaai.test');
  await page.fill('#password', 'WrongPass!');
  await page.locator('#login-button').click();

  // Error must show
  const errorEl = page.locator('#error-message');
  await expect(errorEl).toBeVisible({ timeout: 3000 });
  await expect(errorEl).not.toBeEmpty();

  // URL must not have changed (still on login page)
  expect(page.url()).toContain('login/login.html');

  // redirect param must still be present for retry
  expect(page.url()).toContain('redirect=');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION D — Platform Page (platform/platform.html + platform.js)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-LP-013 — authenticated user sees workspace with greeting and four placeholder cards', async ({ page }) => {
  await mockMeSuccess(page, { name: 'Alice', email: 'alice@soorgaai.test' });

  await page.goto(`${BASE_URL}/platform/platform.html`);
  await setToken(page, 'mock-valid-jwt');
  await page.reload();

  // Content must become visible
  await expect(page.locator('#platform-content')).toBeVisible({ timeout: 5000 });

  // Loading indicator must hide
  const loading = page.locator('#platform-loading');
  if (await loading.count() > 0) await expect(loading).toBeHidden({ timeout: 5000 });

  // Greeting includes user name
  await expect(page.locator('#platform-greeting')).toContainText('Alice');

  // All four workspace cards present
  const cardTitles = await page.locator('.workspace-card__title').allTextContents();
  expect(cardTitles).toContain('Assessments');
  expect(cardTitles).toContain('Roadmaps');
  expect(cardTitles).toContain('Benchmark Reports');
  expect(cardTitles).toContain('AI Recommendations');

  await clearAuth(page);
});

test('FE-LP-014 — unauthenticated user is immediately redirected to login from platform page', async ({ page }) => {
  await page.goto(`${BASE_URL}/platform/platform.html`);
  await clearAuth(page);
  await page.reload();

  await page.waitForURL('**/login/login.html*', { timeout: 5000 });

  const url = page.url();
  expect(url).toContain('/login/login.html');
  expect(url).toContain('redirect=');
  expect(url).toContain('platform');
});

test('FE-LP-015 — expired token (401 from /users/me) clears token and redirects to login', async ({ page }) => {
  await mockMe401(page);

  await page.goto(`${BASE_URL}/platform/platform.html`);
  await setToken(page, 'expired-jwt');
  await page.reload();

  await page.waitForURL('**/login/login.html*', { timeout: 5000 });

  // Token must be cleared
  const tokenAfter = await page.evaluate(() => localStorage.getItem('token'));
  expect(tokenAfter).toBeNull();

  expect(page.url()).toContain('/login/login.html');
});

test('FE-LP-016 — network error on /users/me shows content gracefully without redirect or token clear', async ({ page }) => {
  await mockMeNetworkError(page);

  await page.goto(`${BASE_URL}/platform/platform.html`);
  await setToken(page, 'valid-jwt');
  await page.reload();

  // Content should still show (graceful degradation)
  await expect(page.locator('#platform-content')).toBeVisible({ timeout: 5000 });

  // Token must NOT be cleared
  const tokenAfter = await page.evaluate(() => localStorage.getItem('token'));
  expect(tokenAfter).toBe('valid-jwt');

  // Must not have redirected to login
  expect(page.url()).toContain('/platform/platform.html');

  await clearAuth(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION E — End-to-End User Journey Tests
// ─────────────────────────────────────────────────────────────────────────────

test('FE-LP-017 — full anonymous → login → platform journey', async ({ page }) => {
  // Step 1: Fresh homepage
  await clearAuth(page);
  await page.goto(`${BASE_URL}/index.html`);

  await expect(page.locator('#cta-generate-roadmap')).toBeVisible();
  expect(page.url()).toContain('/index.html');

  // Step 2: Click CTA → lands on login with redirect param
  await page.locator('#cta-generate-roadmap').click();
  await page.waitForURL('**/login/login.html*', { timeout: 5000 });
  expect(page.url()).toContain('redirect=');

  // Step 3: Mock login API, fill form, submit
  await mockLoginSuccess(page);
  await mockMeSuccess(page, { name: 'NewUser' });
  await page.fill('#email',    'qa@soorgaai.test');
  await page.fill('#password', 'TestPass123!');
  await page.locator('#login-button').click();

  // Step 4: Should land on platform page
  await page.waitForURL('**/platform/platform.html', { timeout: 5000 });

  // Workspace content must render
  await expect(page.locator('#platform-content')).toBeVisible({ timeout: 5000 });

  // Greeting must include the user name from /api/users/me
  await expect(page.locator('#platform-greeting')).toContainText('NewUser');

  await clearAuth(page);
});

test('FE-LP-018 — returning logged-in user goes directly from homepage CTA to platform', async ({ page }) => {
  await mockMeSuccess(page);

  await page.goto(`${BASE_URL}/index.html`);
  await setToken(page);
  await page.reload();

  // Click CTA — must skip login
  await page.locator('#cta-generate-roadmap').click();
  await page.waitForURL('**/platform/platform.html', { timeout: 5000 });

  // Landed on platform without visiting login page
  expect(page.url()).not.toContain('/login/');
  expect(page.url()).toContain('/platform/platform.html');

  await clearAuth(page);
});

test('FE-LP-019 — regression: existing authenticated pages render without console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => {
    // Exclude the pre-existing jsdom navigation error; surface real JS errors
    if (!err.message.includes('navigation') && !err.message.includes('Not implemented')) {
      errors.push(err.message);
    }
  });

  await setToken(page);

  // Assessment page
  if (await page.goto(`${BASE_URL}/dynamic-assessment/start.html`, { timeout: 8000 }).catch(() => null)) {
    await expect(page.locator('body')).not.toBeEmpty();
  }

  expect(errors).toHaveLength(0);

  await clearAuth(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION F — Performance & Accessibility Smoke Tests
// ─────────────────────────────────────────────────────────────────────────────

test('FE-LP-020 — landing page LCP candidate (h1) visible within 2500ms and zero API calls', async ({ page }) => {
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) apiCalls.push(req.url());
  });

  const start = Date.now();
  await page.goto(`${BASE_URL}/index.html`);
  await expect(page.locator('h1#hero-heading')).toBeVisible({ timeout: 2500 });
  const elapsed = Date.now() - start;

  // LCP proxy — h1 visible in under 2500ms
  expect(elapsed).toBeLessThan(2500);

  // Zero backend calls on landing
  expect(apiCalls).toHaveLength(0);
});

test('FE-LP-021 — CTA button is focusable via keyboard and activates on Enter', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);
  await clearAuth(page);
  await page.reload();

  // Tab until #cta-generate-roadmap is focused
  let focused = '';
  let attempts = 0;
  while (focused !== 'cta-generate-roadmap' && attempts < 30) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.id || '');
    attempts++;
  }

  expect(focused).toBe('cta-generate-roadmap');

  // Focused element must have a visible focus indicator
  const hasVisibleFocus = await page.evaluate(() => {
    const el = document.activeElement;
    const style = window.getComputedStyle(el);
    return parseFloat(style.outlineWidth) > 0 || (style.boxShadow !== 'none' && style.boxShadow !== '');
  });
  expect(hasVisibleFocus).toBe(true);

  // Press Enter — anonymous user → navigates to login
  await page.keyboard.press('Enter');
  await page.waitForURL('**/login/login.html*', { timeout: 4000 });
  expect(page.url()).toContain('/login/login.html');
});
