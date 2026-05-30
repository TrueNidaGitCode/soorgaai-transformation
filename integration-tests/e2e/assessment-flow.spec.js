/**
 * SoorgaAI — Frontend E2E Integration Tests
 * Framework: Playwright (works with vanilla HTML/JS — no React needed)
 *
 * Covers the complete assessment flow:
 *   start.html → discovery.html → questions.html → scorecard.html
 *
 * Mapped test cases:
 *   TC-FE-001  Render registration form
 *   TC-FE-002  Submit registration — happy path
 *   TC-FE-003  Registration validation (empty required fields)
 *   TC-FE-004  Discovery loading screen and transition
 *   TC-FE-005  Question rendering and navigation
 *   TC-FE-006  Answer selection (visual feedback)
 *   TC-FE-007  Back navigation
 *   TC-FE-008  Cannot advance without selecting an answer
 *   TC-FE-009  Final question submit triggers scoring overlay
 *   TC-FE-010  Scorecard renders with score, stage, and focus area bars
 *   TC-FE-011  Retake assessment resets localStorage
 *   TC-FE-012  My Assessments navbar link shows scorecard after completion
 *
 * Setup:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *   npx playwright test integration-tests/e2e/assessment-flow.spec.js
 *
 * Env:
 *   BASE_URL  — Frontend base URL (default: http://127.0.0.1:5500)
 *   API_URL   — Backend base URL (default: http://localhost:3000)
 *
 * Tests mock the backend API via Playwright's route interception so
 * they run without a live Railway deployment.
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5500';
const API_URL  = process.env.API_URL  || 'http://localhost:3000';

// ── Shared mock data ──────────────────────────────────────────────────────────

const MOCK_SESSION_ID = '64b1234567890abcdef12345';

const MOCK_QUESTIONS = Array.from({ length: 20 }, (_, i) => ({
  questionId:  `q${i + 1}`,
  text:        `Sample question ${i + 1}: How mature is your AI capability in this domain?`,
  focusAreaId: ['ai-strategy','leadership','ai-use-cases','data-readiness','technology','skills-workforce','governance'][i % 7],
  stageHint:   'AI Alignment',
  options: [
    { value: 1, label: 'Not at all' },
    { value: 2, label: 'Minimally' },
    { value: 3, label: 'Partially' },
    { value: 4, label: 'Mostly' },
    { value: 5, label: 'Fully' },
  ],
  weight: 1,
}));

const MOCK_SCORE = {
  success:   true,
  sessionId: MOCK_SESSION_ID,
  overallScore:  60,
  maturityStage: 'AI Alignment',
  maturityStageDetails: {
    stage: 'AI Alignment',
    stageNumber: 3,
    minScore: 41,
    maxScore: 60,
    color:   '#F1C40F',
    description: 'AI initiatives are increasingly aligned with business strategy.',
  },
  focusAreaScores: [
    { focusAreaId: 'ai-strategy',     focusAreaName: 'AI Strategy & Vision',        score: 60, rawAverage: 3, questionCount: 3 },
    { focusAreaId: 'leadership',      focusAreaName: 'Leadership & Culture',         score: 60, rawAverage: 3, questionCount: 3 },
    { focusAreaId: 'ai-use-cases',    focusAreaName: 'AI Use Cases & Applications',  score: 60, rawAverage: 3, questionCount: 3 },
    { focusAreaId: 'data-readiness',  focusAreaName: 'Data Readiness',               score: 60, rawAverage: 3, questionCount: 3 },
    { focusAreaId: 'technology',      focusAreaName: 'Technology & Infrastructure',  score: 60, rawAverage: 3, questionCount: 2 },
    { focusAreaId: 'skills-workforce',focusAreaName: 'Skills & Workforce',           score: 60, rawAverage: 3, questionCount: 3 },
    { focusAreaId: 'governance',      focusAreaName: 'Governance, Ethics & Security',score: 60, rawAverage: 3, questionCount: 2 },
  ],
  companyName: 'Acme Motors',
  domain:      'Automotive',
};

// ── Helper: set up API route mocks ───────────────────────────────────────────

async function mockAllApiRoutes(page) {
  // POST /sessions → start session
  await page.route('**/api/assessment/dynamic/sessions', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status:  201,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ success: true, sessionId: MOCK_SESSION_ID, message: 'Session created.' }),
      });
    } else {
      await route.continue();
    }
  });

  // POST /sessions/:id/discover
  await page.route(`**/api/assessment/dynamic/sessions/${MOCK_SESSION_ID}/discover`, async route => {
    await route.fulfill({
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success:        true,
        sessionId:      MOCK_SESSION_ID,
        domain:         'Automotive',
        subDomain:      'Tier-1 Supplier',
        summary:        'Acme Motors is a leading Tier-1 automotive supplier.',
        confidence:     0.92,
        welcomeMessage: 'Welcome! Acme Motors operates in the automotive industry. This assessment will generate 20 personalized questions.',
      }),
    });
  });

  // POST /sessions/:id/questions
  await page.route(`**/api/assessment/dynamic/sessions/${MOCK_SESSION_ID}/questions`, async route => {
    await route.fulfill({
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success:        true,
        sessionId:      MOCK_SESSION_ID,
        totalQuestions: 20,
        questions:      MOCK_QUESTIONS,
      }),
    });
  });

  // GET /sessions/:id
  await page.route(`**/api/assessment/dynamic/sessions/${MOCK_SESSION_ID}`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status:  200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          session: {
            _id:         MOCK_SESSION_ID,
            name:        'Jane Doe',
            role:        'CTO / CIO',
            companyName: 'Acme Motors',
            status:      'questions_generated',
            discoveredDomain: { domain: 'Automotive', subDomain: 'Tier-1 Supplier', summary: '', confidence: 0.92 },
            questions:   MOCK_QUESTIONS,
            answers:     [],
          },
        }),
      });
    } else {
      await route.continue();
    }
  });

  // POST /sessions/:id/answers
  await page.route(`**/api/assessment/dynamic/sessions/${MOCK_SESSION_ID}/answers`, async route => {
    await route.fulfill({
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, answered: 1, total: 20, remaining: 19, complete: false }),
    });
  });

  // POST /sessions/:id/score
  await page.route(`**/api/assessment/dynamic/sessions/${MOCK_SESSION_ID}/score`, async route => {
    await route.fulfill({
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MOCK_SCORE),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-001 — Registration Form Renders Correctly
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-001 — Registration form renders all required fields', async ({ page }) => {
  await page.goto(`${BASE_URL}/dynamic-assessment/start.html`);

  await expect(page.locator('#name')).toBeVisible();
  await expect(page.locator('#role')).toBeVisible();
  await expect(page.locator('#companyName')).toBeVisible();
  await expect(page.locator('#submitBtn')).toBeVisible();
  await expect(page.locator('#submitBtn')).toContainText('Start My Assessment');
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-002 — Registration Submit — Happy Path
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-002 — Registration submit calls API and redirects to discovery', async ({ page }) => {
  await mockAllApiRoutes(page);
  await page.goto(`${BASE_URL}/dynamic-assessment/start.html`);

  await page.fill('#name', 'Jane Doe');
  await page.selectOption('#role', 'CTO / CIO');
  await page.fill('#companyName', 'Acme Motors');
  await page.click('#submitBtn');

  // Should redirect to discovery.html
  await page.waitForURL('**/discovery.html', { timeout: 8000 });

  // Check localStorage was populated
  const sessionId = await page.evaluate(() => localStorage.getItem('da_sessionId'));
  expect(sessionId).toBe(MOCK_SESSION_ID);

  const company = await page.evaluate(() => localStorage.getItem('da_companyName'));
  expect(company).toBe('Acme Motors');
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-003 — Registration Validation — Required Fields
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-003 — Registration form blocks submit when required fields empty', async ({ page }) => {
  await page.goto(`${BASE_URL}/dynamic-assessment/start.html`);

  // Try submitting without filling anything — HTML5 required validation
  await page.click('#submitBtn');

  // Should still be on start.html
  expect(page.url()).toContain('start.html');
  const sessionId = await page.evaluate(() => localStorage.getItem('da_sessionId'));
  expect(sessionId).toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-004 — Discovery Page — Loading Animation Visible, Then Welcome Shown
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-004 — Discovery page shows loading then welcome message', async ({ page }) => {
  await mockAllApiRoutes(page);

  // Pre-set localStorage so discovery.html thinks session exists
  await page.goto(`${BASE_URL}/dynamic-assessment/discovery.html`);
  await page.evaluate((sid) => {
    localStorage.setItem('da_sessionId', sid);
    localStorage.setItem('da_companyName', 'Acme Motors');
    localStorage.setItem('da_domain', 'Automotive');
  }, MOCK_SESSION_ID);

  // Reload with session in place
  await page.reload();

  // Welcome section should appear after loading completes
  await page.waitForSelector('#welcomeSection', { state: 'visible', timeout: 10000 });
  await expect(page.locator('#welcomeSection')).toBeVisible();

  const welcomeText = await page.locator('#welcomeSection').innerText();
  expect(welcomeText.length).toBeGreaterThan(10);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-005 — Questions Page — First Question Renders
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-005 — Questions page renders first question with 5 options', async ({ page }) => {
  await mockAllApiRoutes(page);

  await page.goto(`${BASE_URL}/dynamic-assessment/questions.html`);
  await page.evaluate((sid) => {
    localStorage.setItem('da_sessionId', sid);
    localStorage.setItem('da_companyName', 'Acme Motors');
    localStorage.setItem('da_domain', 'Automotive');
  }, MOCK_SESSION_ID);

  await page.reload();

  // Wait for main content to show
  await page.waitForSelector('#mainContent', { state: 'visible', timeout: 10000 });

  // Question text should be visible
  await expect(page.locator('#questionText')).toBeVisible();
  const questionText = await page.locator('#questionText').innerText();
  expect(questionText.length).toBeGreaterThan(10);

  // 5 option labels should be visible
  const options = await page.locator('.option-label').count();
  expect(options).toBe(5);

  // Progress label should show question 1 of N
  const progressLabel = await page.locator('#progressLabel').innerText();
  expect(progressLabel).toContain('Question 1');
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-006 — Answer Selection — Option Gets Selected Class
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-006 — Selecting an option highlights it visually', async ({ page }) => {
  await mockAllApiRoutes(page);

  await page.goto(`${BASE_URL}/dynamic-assessment/questions.html`);
  await page.evaluate((sid) => {
    localStorage.setItem('da_sessionId', sid);
    localStorage.setItem('da_companyName', 'Acme Motors');
  }, MOCK_SESSION_ID);
  await page.reload();

  await page.waitForSelector('#mainContent', { state: 'visible', timeout: 10000 });

  // Click the third option
  await page.locator('.option-label').nth(2).click();

  // That card should now have the 'selected' class
  const selectedCards = await page.locator('.option-card.selected').count();
  expect(selectedCards).toBe(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-007 — Back Navigation — Returns to Previous Question
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-007 — Back button returns to previous question', async ({ page }) => {
  await mockAllApiRoutes(page);

  await page.goto(`${BASE_URL}/dynamic-assessment/questions.html`);
  await page.evaluate((sid) => {
    localStorage.setItem('da_sessionId', sid);
    localStorage.setItem('da_companyName', 'Acme Motors');
  }, MOCK_SESSION_ID);
  await page.reload();

  await page.waitForSelector('#mainContent', { state: 'visible', timeout: 10000 });

  // Answer question 1 and go to question 2
  await page.locator('.option-label').nth(2).click();
  await page.click('#btnNext');
  await expect(page.locator('#progressLabel')).toContainText('Question 2');

  // Go back
  await page.click('#btnBack');
  await expect(page.locator('#progressLabel')).toContainText('Question 1');
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-008 — Cannot Advance Without Answering
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-008 — Next button blocked when no answer selected', async ({ page }) => {
  await mockAllApiRoutes(page);

  await page.goto(`${BASE_URL}/dynamic-assessment/questions.html`);
  await page.evaluate((sid) => {
    localStorage.setItem('da_sessionId', sid);
    localStorage.setItem('da_companyName', 'Acme Motors');
  }, MOCK_SESSION_ID);
  await page.reload();

  await page.waitForSelector('#mainContent', { state: 'visible', timeout: 10000 });

  // Click Next without selecting an answer
  await page.click('#btnNext');

  // Error banner should appear
  await expect(page.locator('#errorBanner')).toBeVisible();
  const errorText = await page.locator('#errorBanner').innerText();
  expect(errorText.length).toBeGreaterThan(5);

  // Still on question 1
  await expect(page.locator('#progressLabel')).toContainText('Question 1');
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-009 — Back Button Hidden on First Question
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-009 — Back button is hidden on the first question', async ({ page }) => {
  await mockAllApiRoutes(page);

  await page.goto(`${BASE_URL}/dynamic-assessment/questions.html`);
  await page.evaluate((sid) => {
    localStorage.setItem('da_sessionId', sid);
    localStorage.setItem('da_companyName', 'Acme Motors');
  }, MOCK_SESSION_ID);
  await page.reload();

  await page.waitForSelector('#mainContent', { state: 'visible', timeout: 10000 });

  // Back button should be invisible on question 1
  const backBtn = page.locator('#btnBack');
  await expect(backBtn).toHaveCSS('visibility', 'hidden');
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-010 — Submitting Overlay Only Shows After Final Submit
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-010 — Submitting overlay is hidden on page load', async ({ page }) => {
  await mockAllApiRoutes(page);

  await page.goto(`${BASE_URL}/dynamic-assessment/questions.html`);
  await page.evaluate((sid) => {
    localStorage.setItem('da_sessionId', sid);
    localStorage.setItem('da_companyName', 'Acme Motors');
  }, MOCK_SESSION_ID);
  await page.reload();

  // Overlay must NOT be visible immediately on load (regression guard for overlay bug)
  const overlay = page.locator('#submittingOverlay');
  await expect(overlay).toHaveCSS('display', 'none');
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-011 — Scorecard Renders Score Circle, Stage, Focus Area Bars
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-011 — Scorecard renders all required sections', async ({ page }) => {
  // Pre-populate da_score in localStorage (simulates completed assessment)
  await page.goto(`${BASE_URL}/dynamic-assessment/scorecard.html`);
  await page.evaluate((score) => {
    localStorage.setItem('da_score', JSON.stringify(score));
    localStorage.setItem('da_companyName', 'Acme Motors');
    localStorage.setItem('da_domain', 'Automotive');
  }, MOCK_SCORE);
  await page.reload();

  // Main content should be visible (not loading)
  await page.waitForSelector('#mainContent', { state: 'visible', timeout: 8000 });

  // Score circle
  const scoreNumber = await page.locator('#scoreNumber').innerText();
  expect(Number(scoreNumber)).toBe(60);

  // Maturity stage name
  await expect(page.locator('#stageName')).toContainText('AI Alignment');

  // Focus area bars
  const bars = await page.locator('.fa-bar-row').count();
  expect(bars).toBe(7);

  // Stage ladder
  const ladder = await page.locator('.ladder-rung').count();
  expect(ladder).toBe(5);

  // Active stage marker
  const activeRung = await page.locator('.ladder-active').innerText();
  expect(activeRung).toContain('AI Alignment');
  expect(activeRung).toContain('You are here');
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-012 — Retake Assessment Clears localStorage and Redirects
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-012 — Retake assessment clears session data and redirects to start', async ({ page }) => {
  await page.goto(`${BASE_URL}/dynamic-assessment/scorecard.html`);
  await page.evaluate((score) => {
    localStorage.setItem('da_score', JSON.stringify(score));
    localStorage.setItem('da_sessionId', 'old-session-id');
    localStorage.setItem('da_companyName', 'Acme Motors');
  }, MOCK_SCORE);
  await page.reload();

  await page.waitForSelector('#mainContent', { state: 'visible', timeout: 8000 });

  // Click retake
  await page.click('button[onclick="retakeAssessment()"]');

  // Should redirect to start.html
  await page.waitForURL('**/start.html', { timeout: 5000 });

  // localStorage should be cleared
  const sessionId = await page.evaluate(() => localStorage.getItem('da_sessionId'));
  const score     = await page.evaluate(() => localStorage.getItem('da_score'));
  expect(sessionId).toBeNull();
  expect(score).toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-013 — Scorecard Redirects to Start if No Score in localStorage
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-013 — Scorecard redirects to start.html if da_score not set', async ({ page }) => {
  await page.goto(`${BASE_URL}/dynamic-assessment/scorecard.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Should redirect to start.html
  await page.waitForURL('**/start.html', { timeout: 5000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-014 — Questions Page Redirects to Start if No Session
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-014 — Questions page redirects to start.html if no sessionId', async ({ page }) => {
  await page.goto(`${BASE_URL}/dynamic-assessment/questions.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.waitForURL('**/start.html', { timeout: 5000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-FE-015 — Navbar Shows My Assessments After Score is Set
// ─────────────────────────────────────────────────────────────────────────────

test('TC-FE-015 — My Assessments link appears in navbar after assessment completion', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  // Without a score — My Assessments should be hidden
  await page.evaluate(() => localStorage.removeItem('da_score'));
  await page.reload();
  // Wait for navbar to load
  await page.waitForTimeout(600);
  const myAssessmentsBefore = await page.locator('#myAssessmentsBtn').isVisible();
  expect(myAssessmentsBefore).toBe(false);

  // With a score — My Assessments should appear
  await page.evaluate((score) => localStorage.setItem('da_score', JSON.stringify(score)), MOCK_SCORE);
  await page.reload();
  await page.waitForTimeout(600);
  const myAssessmentsAfter = await page.locator('#myAssessmentsBtn').isVisible();
  expect(myAssessmentsAfter).toBe(true);
});
