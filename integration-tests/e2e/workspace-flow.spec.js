/**
 * SoorgaAI — AI Transformation Workspace Integration Tests
 * Architecture Version: 2.2.0 | EPIC: SOORGA-EPIC-WORKSPACE-001
 * Framework: Playwright (vanilla HTML/JS)
 *
 * Test cases: FE-WS-001 → FE-WS-021
 *
 * Setup:
 *   npx playwright test integration-tests/e2e/workspace-flow.spec.js
 *
 * Env:
 *   BASE_URL — Frontend base URL (default: http://127.0.0.1:5500)
 *
 * API mocking:
 *   All backend calls are intercepted via page.route() so the suite runs
 *   without a live backend.
 *
 * Selector reference:
 *   Profile setup : #profile-form  #orgName  #role  #industryDomain  #profile-error
 *   Workspace     : .domain-grid  .domain-card  .workspace-nav__logout
 *   Domain        : .canvas-panel  .chat-panel  #chat-input  #chat-send  #suggested-prompts
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5500';

// ── Shared route helpers ──────────────────────────────────────────────────────

async function mockProfileNotFound(page) {
  await page.route('**/api/profile/me', route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) }),
  );
}

async function mockProfileExists(page, overrides = {}) {
  const profile = { orgName: 'Acme Motors GmbH', role: 'CTO', industryDomain: 'ADAS', ...overrides };
  await page.route('**/api/profile/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile }) }),
  );
}

async function mockProfileCreate(page) {
  await page.route('**/api/profile', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ profile: { orgName: 'Acme', role: 'CTO', industryDomain: 'ADAS' }, created: true }),
      });
    }
    return route.continue();
  });
}

async function mockWorkspaceState(page) {
  const domains = [
    { domainId: 'ai-strategy',            title: 'AI Strategy',            description: 'Define your AI vision.', icon: '🎯', enabled: true,  canvas: [], lastActivityAt: null },
    { domainId: 'leadership',             title: 'Leadership',              description: 'Develop AI-literate leadership.', icon: '👥', enabled: false, canvas: [], lastActivityAt: null },
    { domainId: 'ai-use-cases',           title: 'AI Use Cases',            description: 'Identify and prioritize.', icon: '💡', enabled: false, canvas: [], lastActivityAt: null },
    { domainId: 'data-readiness',         title: 'Data Readiness',          description: 'Assess your data foundation.', icon: '📊', enabled: false, canvas: [], lastActivityAt: null },
    { domainId: 'technology-infrastructure', title: 'Technology Infrastructure', description: 'Build the platforms.', icon: '⚙️', enabled: false, canvas: [], lastActivityAt: null },
    { domainId: 'skills-workforce',       title: 'Skills & Workforce',      description: 'Upskill your teams.', icon: '🧠', enabled: false, canvas: [], lastActivityAt: null },
    { domainId: 'governance-security',    title: 'Governance & Security',   description: 'Establish responsible AI.', icon: '🔒', enabled: false, canvas: [], lastActivityAt: null },
  ];
  await page.route('**/api/workspace/state', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: { orgName: 'Acme Motors GmbH', role: 'CTO', industryDomain: 'ADAS' }, domains }),
    }),
  );
}

async function mockCanvasAndHistory(page) {
  await page.route('**/api/chat/ai-strategy/canvas', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        focusAreas: [
          { id: 'vision-alignment',          title: 'AI Vision & Business Alignment',  description: 'Default vision description.' },
          { id: 'investment-prioritization', title: 'AI Investment & Prioritization',   description: 'Default investment description.' },
          { id: 'roadmap-execution',         title: 'AI Roadmap & Execution',           description: 'Default roadmap description.' },
          { id: 'culture-change',            title: 'AI Culture & Change Management',   description: 'Default culture description.' },
          { id: 'metrics-value',             title: 'AI Metrics & Value Tracking',      description: 'Default metrics description.' },
        ],
      }),
    }),
  );
  await page.route('**/api/chat/ai-strategy/history**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ turns: [], summary: '' }) }),
  );
  await page.route('**/api/chat/ai-strategy/suggested-prompts', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ prompts: [
        'What should our AI strategy focus on first given our current situation?',
        'How do we align AI investments with our business priorities?',
        'Help me build a realistic 12-month AI transformation roadmap.',
        'What cultural and organizational changes do we need to scale AI?',
      ]}),
    }),
  );
}

async function setToken(page, token = 'mock-valid-jwt') {
  await page.evaluate(t => localStorage.setItem('token', t), token);
}

async function clearAuth(page) {
  await page.evaluate(() => ['token', 'username', 'userId', 'role'].forEach(k => localStorage.removeItem(k)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A — Profile Setup Page (/profile-setup/profile.html)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-WS-001 — profile setup redirects to login when no JWT is present', async ({ page }) => {
  await clearAuth(page);
  await page.goto(`${BASE_URL}/profile-setup/profile.html`);

  await page.waitForURL('**/login/login.html*', { timeout: 5000 });
  expect(page.url()).toContain('/login/login.html');
});

test('FE-WS-002 — profile setup redirects to workspace when profile already exists', async ({ page }) => {
  await mockProfileExists(page);
  await mockWorkspaceState(page);
  await page.goto(`${BASE_URL}/profile-setup/profile.html`);
  await setToken(page);
  await page.reload();

  await page.waitForURL('**/workspace/workspace.html', { timeout: 5000 });
  expect(page.url()).toContain('/workspace/workspace.html');
});

test('FE-WS-003 — profile setup form renders all three required fields', async ({ page }) => {
  await mockProfileNotFound(page);
  await page.goto(`${BASE_URL}/profile-setup/profile.html`);
  await setToken(page);
  await page.reload();

  await expect(page.locator('#orgName')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#role')).toBeVisible();
  await expect(page.locator('#industryDomain')).toBeVisible();
});

test('FE-WS-004 — profile setup shows error when required fields are empty on submit', async ({ page }) => {
  await mockProfileNotFound(page);
  await page.goto(`${BASE_URL}/profile-setup/profile.html`);
  await setToken(page);
  await page.reload();

  // Submit without filling fields
  await page.locator('#profile-form').evaluate(f => f.dispatchEvent(new Event('submit', { cancelable: true })));

  await expect(page.locator('#profile-error')).toBeVisible({ timeout: 2000 });
});

test('FE-WS-005 — successful profile creation redirects to workspace', async ({ page }) => {
  await mockProfileNotFound(page);
  await mockProfileCreate(page);
  await mockWorkspaceState(page);
  await page.goto(`${BASE_URL}/profile-setup/profile.html`);
  await setToken(page);
  await page.reload();

  await page.fill('#orgName', 'Acme Motors GmbH');
  await page.selectOption('#role', 'CTO');
  await page.selectOption('#industryDomain', 'ADAS');
  await page.locator('#profile-submit').click();

  await page.waitForURL('**/workspace/workspace.html', { timeout: 5000 });
  expect(page.url()).toContain('/workspace/workspace.html');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B — Workspace Shell (/workspace/workspace.html)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-WS-006 — workspace redirects to login when no JWT present', async ({ page }) => {
  await clearAuth(page);
  await page.goto(`${BASE_URL}/workspace/workspace.html`);

  await page.waitForURL('**/login/login.html*', { timeout: 5000 });
  expect(page.url()).toContain('/login/login.html');
});

test('FE-WS-007 — workspace redirects to profile setup when profile is 404', async ({ page }) => {
  await mockProfileNotFound(page);
  await page.goto(`${BASE_URL}/workspace/workspace.html`);
  await setToken(page);
  await page.reload();

  await page.waitForURL('**/profile-setup/profile.html', { timeout: 5000 });
  expect(page.url()).toContain('/profile-setup/profile.html');
});

test('FE-WS-008 — workspace shows exactly 7 domain cards', async ({ page }) => {
  await mockProfileExists(page);
  await mockWorkspaceState(page);
  await page.goto(`${BASE_URL}/workspace/workspace.html`);
  await setToken(page);
  await page.reload();

  await expect(page.locator('.domain-card')).toHaveCount(7, { timeout: 5000 });
});

test('FE-WS-009 — exactly one domain card is enabled (AI Strategy)', async ({ page }) => {
  await mockProfileExists(page);
  await mockWorkspaceState(page);
  await page.goto(`${BASE_URL}/workspace/workspace.html`);
  await setToken(page);
  await page.reload();

  await page.waitForSelector('.domain-card', { timeout: 5000 });
  const enabled = page.locator('.domain-card--enabled');
  await expect(enabled).toHaveCount(1);
  await expect(enabled.first()).toContainText('AI Strategy');
});

test('FE-WS-010 — disabled domains show "Coming Soon" badge and are not clickable', async ({ page }) => {
  await mockProfileExists(page);
  await mockWorkspaceState(page);
  await page.goto(`${BASE_URL}/workspace/workspace.html`);
  await setToken(page);
  await page.reload();

  await page.waitForSelector('.domain-card--disabled', { timeout: 5000 });

  const badges = page.locator('.domain-card__badge');
  await expect(badges).toHaveCount(6);
  await expect(badges.first()).toContainText('Coming Soon');

  const disabledCards = page.locator('.domain-card--disabled');
  await expect(disabledCards).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await expect(disabledCards.nth(i)).not.toHaveAttribute('tabindex');
  }
});

test('FE-WS-011 — workspace title reads "Your AI Transformation Workspace"', async ({ page }) => {
  await mockProfileExists(page);
  await mockWorkspaceState(page);
  await page.goto(`${BASE_URL}/workspace/workspace.html`);
  await setToken(page);
  await page.reload();

  await expect(page.locator('.workspace-title')).toContainText('Your AI Transformation Workspace', { timeout: 5000 });
});

test('FE-WS-012 — logout clears localStorage and redirects to landing within 2s', async ({ page }) => {
  await mockProfileExists(page);
  await mockWorkspaceState(page);
  await page.goto(`${BASE_URL}/workspace/workspace.html`);
  await setToken(page);
  await page.reload();

  await page.waitForSelector('#ws-logout', { timeout: 5000 });
  await page.locator('#ws-logout').click();

  await page.waitForURL('**/index.html', { timeout: 2000 });
  expect(page.url()).toContain('index.html');

  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION C — Domain View (/domain/domain.html?domain=ai-strategy)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-WS-013 — domain view redirects to login when no JWT', async ({ page }) => {
  await clearAuth(page);
  await page.goto(`${BASE_URL}/domain/domain.html?domain=ai-strategy`);

  await page.waitForURL('**/login/login.html*', { timeout: 5000 });
  expect(page.url()).toContain('/login/login.html');
});

test('FE-WS-014 — domain view renders two-panel layout (canvas + chat)', async ({ page }) => {
  await mockCanvasAndHistory(page);
  await page.goto(`${BASE_URL}/domain/domain.html?domain=ai-strategy`);
  await setToken(page);
  await page.reload();

  await expect(page.locator('.canvas-panel')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 5000 });
});

test('FE-WS-015 — domain view renders 5 canvas focus area cards', async ({ page }) => {
  await mockCanvasAndHistory(page);
  await page.goto(`${BASE_URL}/domain/domain.html?domain=ai-strategy`);
  await setToken(page);
  await page.reload();

  await expect(page.locator('.focus-area-card')).toHaveCount(5, { timeout: 5000 });
});

test('FE-WS-016 — domain view renders 4 suggested prompts', async ({ page }) => {
  await mockCanvasAndHistory(page);
  await page.goto(`${BASE_URL}/domain/domain.html?domain=ai-strategy`);
  await setToken(page);
  await page.reload();

  await expect(page.locator('.suggested-prompt-btn')).toHaveCount(4, { timeout: 5000 });
});

test('FE-WS-017 — clicking a suggested prompt populates the chat with a user message', async ({ page }) => {
  await mockCanvasAndHistory(page);
  await page.route('**/api/chat/ai-strategy/message', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ reply: 'Great question! Here is my analysis.', canvasUpdates: [], conversationId: 'conv-123' }),
    }),
  );

  await page.goto(`${BASE_URL}/domain/domain.html?domain=ai-strategy`);
  await setToken(page);
  await page.reload();

  await page.waitForSelector('.suggested-prompt-btn', { timeout: 5000 });
  const promptText = await page.locator('.suggested-prompt-btn').first().textContent();
  await page.locator('.suggested-prompt-btn').first().click();

  // User message should appear in the chat
  await expect(page.locator('.chat-msg--user').first()).toContainText(promptText.trim(), { timeout: 5000 });
});

test('FE-WS-018 — sending a message shows user bubble immediately, then agent reply', async ({ page }) => {
  await mockCanvasAndHistory(page);
  await page.route('**/api/chat/ai-strategy/message', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ reply: 'Here is my strategic advice.', canvasUpdates: [], conversationId: 'conv-123' }),
    }),
  );

  await page.goto(`${BASE_URL}/domain/domain.html?domain=ai-strategy`);
  await setToken(page);
  await page.reload();

  await page.waitForSelector('#chat-input', { timeout: 5000 });
  await page.fill('#chat-input', 'What should our AI strategy focus on?');
  await page.locator('#chat-form').evaluate(f => f.dispatchEvent(new Event('submit', { cancelable: true })));

  await expect(page.locator('.chat-msg--user').first()).toContainText('What should our AI strategy focus on?', { timeout: 5000 });
  await expect(page.locator('.chat-msg--assistant').first()).toContainText('Here is my strategic advice.', { timeout: 5000 });
});

test('FE-WS-019 — canvas focus area description animates on update', async ({ page }) => {
  await mockCanvasAndHistory(page);
  await page.route('**/api/chat/ai-strategy/message', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        reply: 'Your AI vision is now clearer.',
        canvasUpdates: [{ focusAreaId: 'vision-alignment', title: 'AI Vision & Business Alignment', newDescription: 'Vision updated: aligned to $10M revenue impact.' }],
        conversationId: 'conv-123',
      }),
    }),
  );

  await page.goto(`${BASE_URL}/domain/domain.html?domain=ai-strategy`);
  await setToken(page);
  await page.reload();

  await page.waitForSelector('#chat-input', { timeout: 5000 });
  await page.fill('#chat-input', 'Our primary goal is to cut downtime by 20%.');
  await page.locator('#chat-form').evaluate(f => f.dispatchEvent(new Event('submit', { cancelable: true })));

  // Canvas description should update
  await expect(
    page.locator('[data-focus-area-id="vision-alignment"] .focus-area-desc'),
  ).toContainText('Vision updated', { timeout: 5000 });
});

test('FE-WS-020 — chat error banner appears on 503 from the API', async ({ page }) => {
  await mockCanvasAndHistory(page);
  await page.route('**/api/chat/ai-strategy/message', route =>
    route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: "We couldn't process that. Please try again." }),
    }),
  );

  await page.goto(`${BASE_URL}/domain/domain.html?domain=ai-strategy`);
  await setToken(page);
  await page.reload();

  await page.waitForSelector('#chat-input', { timeout: 5000 });
  await page.fill('#chat-input', 'Hello');
  await page.locator('#chat-form').evaluate(f => f.dispatchEvent(new Event('submit', { cancelable: true })));

  await expect(page.locator('#chat-error')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#chat-error-text')).toContainText("couldn't process");
  await expect(page.locator('#chat-retry')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION D — CTA routing update
// ─────────────────────────────────────────────────────────────────────────────

test('FE-WS-021 — landing page CTA routes anonymous user to login with /workspace redirect', async ({ page }) => {
  await clearAuth(page);
  await page.goto(`${BASE_URL}/index.html`);
  await page.reload();

  await page.locator('#cta-generate-roadmap').click();

  await page.waitForURL('**/login/login.html*', { timeout: 5000 });
  expect(page.url()).toContain('redirect=');
  expect(page.url()).toContain('workspace');
  expect(page.url()).not.toContain('/platform/platform.html');
});
