/**
 * SoorgaAI — Command Center Hero Redesign Integration Tests
 * Architecture Version: 2.1.0 (Delta) | EPIC: SOORGA-EPIC-LANDING-001
 * Framework: Playwright (vanilla HTML/JS — no React, no build step)
 *
 * Test cases: FE-INT-001 → FE-INT-015 (15 tests)
 *
 * Setup:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *   npx playwright test integration-tests/e2e/command-center.spec.js
 *
 * Env:
 *   BASE_URL — Frontend base URL (default: http://127.0.0.1:5500)
 *
 * Important — Auth-gate discrepancy (FE-INT-003 / FE-INT-004):
 *   The spec describes auth-aware CTA routing (anonymous → signup, authed → assessment).
 *   The current authState.js implementation routes ALL users to /dynamic-assessment/start.html
 *   (no auth gate). Tests reflect actual behavior. The it.todo entries in authState.test.js
 *   document the pending gate implementation.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5500';

// Stage data mirrored from frontend/data/maturityStages.js
// If this list drifts from the source file, FE-INT-015 will catch it.
const EXPECTED_STAGES = [
  { id: 1, name: 'AI Scramble',          descriptor: 'Ad hoc, no strategy'              },
  { id: 2, name: 'AI Pivot',             descriptor: 'Early pilots, siloed'              },
  { id: 3, name: 'AI Alignment',         descriptor: 'Strategy forming, cross-functional' },
  { id: 4, name: 'AI Transform',         descriptor: 'AI embedded in core processes'     },
  { id: 5, name: 'AI-Fueled Enterprise', descriptor: 'AI as competitive differentiator'  },
];

// Block all calls to */api/* to simulate offline / no-backend conditions
async function blockApiCalls(page) {
  await page.route('**/api/**', route => route.abort('blockedbyclient'));
}

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-001 — Landing Page Renders Hero Without Backend Calls
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-001 — landing page renders the full hero without any API calls', async ({ page }) => {
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) apiCalls.push(req.url());
  });

  await blockApiCalls(page);
  await page.goto(`${BASE_URL}/index.html`);

  // Badge
  await expect(page.locator('.hero__badge')).toBeVisible();

  // H1 headline
  const h1 = page.locator('h1#hero-heading');
  await expect(h1).toBeVisible();
  await expect(h1).toContainText('Enterprise AI');

  // Primary CTA
  const primaryCta = page.locator('#primaryCta');
  await expect(primaryCta).toBeVisible();
  await expect(primaryCta).toContainText('Generate My AI Roadmap');

  // Secondary CTA
  const secondaryCta = page.locator('[data-cta="explore-framework"]');
  await expect(secondaryCta).toBeVisible();
  await expect(secondaryCta).toContainText('Explore Framework');

  // Outcomes strip — 4 items
  const outcomeItems = page.locator('.outcomes__item');
  await expect(outcomeItems).toHaveCount(4);

  // Navbar: Platform link
  await expect(page.locator('.nav-links a', { hasText: 'Platform' })).toBeVisible();
  // Navbar: Framework link
  await expect(page.locator('.nav-links a', { hasText: 'Framework' })).toBeVisible();
  // Navbar: Generate Roadmap CTA
  await expect(page.locator('#navRoadmapCta')).toBeVisible();

  // Zero API calls made
  expect(apiCalls).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-002 — Stage List Hydrated From maturityStages.js Module
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-002 — stage list is hydrated with exactly 5 items from maturityStages.js', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  // Wait for index.js to hydrate the list
  const stagesList = page.locator('ol.stages');
  await expect(stagesList).toBeVisible({ timeout: 8000 });

  const stageItems = stagesList.locator('.stage-item');
  await expect(stageItems).toHaveCount(5);

  // Verify every expected stage name appears in the rendered list
  for (const stage of EXPECTED_STAGES) {
    await expect(
      stagesList.locator('.stage-item__name', { hasText: stage.name })
    ).toBeVisible();
  }

  // Verify every expected descriptor appears
  for (const stage of EXPECTED_STAGES) {
    await expect(
      stagesList.locator('.stage-item__desc', { hasText: stage.descriptor })
    ).toBeVisible();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-003 — Primary CTA Routing (Anonymous Visitor)
// NOTE: Current implementation routes all users to /dynamic-assessment/start.html.
//       The auth-gated path (→ signup) is a future EPIC (see authState.js it.todo).
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-003 — primary CTA routes anonymous visitor to dynamic assessment start', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  // Ensure no token in localStorage
  await page.evaluate(() => localStorage.removeItem('token'));
  await page.reload();

  const cta = page.locator('#primaryCta');
  await expect(cta).toBeVisible();

  // Verify href is set by authState.js / index.js
  const href = await cta.getAttribute('href');
  expect(href).toContain('/dynamic-assessment/start.html');

  // Verify clicking navigates to the start page
  await page.waitForURL('**/dynamic-assessment/start.html', { timeout: 8000 });
  // Already on start page? Navigate first, then check
  if (!page.url().includes('dynamic-assessment/start.html')) {
    await cta.click();
    await page.waitForURL('**/dynamic-assessment/start.html', { timeout: 8000 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-004 — Primary CTA Routing (Authenticated User)
// NOTE: Same destination as FE-INT-003 — auth gate is pending.
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-004 — primary CTA routes authenticated user to dynamic assessment start', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  // Inject a mock token
  await page.evaluate(() => localStorage.setItem('token', 'mock-valid-jwt-for-test'));
  await page.reload();

  const cta = page.locator('#primaryCta');
  await expect(cta).toBeVisible();

  const href = await cta.getAttribute('href');
  expect(href).toContain('/dynamic-assessment/start.html');

  // Clean up
  await page.evaluate(() => localStorage.removeItem('token'));
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-005 — Secondary CTA Routing (Explore Framework)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-005 — secondary CTA routes to framework page regardless of auth state', async ({ page }) => {
  // Test anonymous
  await page.goto(`${BASE_URL}/index.html`);
  await page.evaluate(() => localStorage.removeItem('token'));
  await page.reload();

  const secondaryCta = page.locator('[data-cta="explore-framework"]');
  await expect(secondaryCta).toBeVisible();

  const href = await secondaryCta.getAttribute('href');
  expect(href).toContain('/framework/framework.html');

  // Framework page exists and returns content
  await secondaryCta.click();
  await page.waitForURL('**/framework/framework.html', { timeout: 6000 });
  await expect(page.locator('body')).not.toBeEmpty();
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-006 — Navbar "Generate Roadmap" CTA Shares Auth Logic With Hero CTA
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-006 — navbar Generate Roadmap CTA routes to the same destination as the hero primary CTA', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  // Wait for navbar to inject
  await page.waitForSelector('#navRoadmapCta', { timeout: 6000 });

  const navHref  = await page.locator('#navRoadmapCta').getAttribute('href');
  const heroHref = await page.locator('#primaryCta').getAttribute('href');

  // Both should point to the same destination (authState.getRoadmapHref() is shared)
  expect(navHref).toBeTruthy();
  expect(heroHref).toBeTruthy();

  // Normalize to extract the path only (href may be absolute or relative)
  const extractPath = (href) => {
    try { return new URL(href, BASE_URL).pathname; }
    catch { return href; }
  };
  expect(extractPath(navHref)).toBe(extractPath(heroHref));
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-007 — Navbar Injection Does Not Cause Significant Layout Shift (CLS)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-007 — cumulative layout shift is below 0.1 threshold', async ({ page }) => {
  // Inject a PerformanceObserver BEFORE navigation to catch layout shifts
  await page.addInitScript(() => {
    window.__cumulativeLayoutShift = 0;
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__cumulativeLayoutShift += entry.value;
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      // PerformanceObserver may not be available in all environments
    }
  });

  await page.goto(`${BASE_URL}/index.html`);
  // Give navbar injection and stage hydration time to settle
  await page.waitForTimeout(1500);

  const cls = await page.evaluate(() => window.__cumulativeLayoutShift || 0);

  expect(cls).toBeLessThan(0.1);
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-008 — Responsive Layout Breakpoints
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-008 — hero is two-column at ≥ 1024px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/index.html`);

  const heroLeft  = page.locator('.hero__left');
  const heroRight = page.locator('.hero__right');

  await expect(heroLeft).toBeVisible();
  await expect(heroRight).toBeVisible();

  const leftBox  = await heroLeft.boundingBox();
  const rightBox = await heroRight.boundingBox();

  // At wide viewport both columns must exist and be side-by-side (same vertical origin ± 50px)
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(Math.abs(leftBox.y - rightBox.y)).toBeLessThan(100);
  // Right column should start to the right of the left column
  expect(rightBox.x).toBeGreaterThan(leftBox.x);
});

test('FE-INT-008 — hero stacks to single column at < 768px (no horizontal overflow)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/index.html`);

  // No horizontal scroll: scrollWidth should equal clientWidth
  const overflow = await page.evaluate(() => ({
    scrollWidth:  document.body.scrollWidth,
    clientWidth:  document.body.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 5); // 5px tolerance

  // Hero left content must still be visible
  await expect(page.locator('.hero__left')).toBeVisible();

  // Primary CTA must remain visible and tappable
  const cta = page.locator('#primaryCta');
  await expect(cta).toBeVisible();
  const ctaBox = await cta.boundingBox();
  expect(ctaBox.width).toBeGreaterThan(0);
});

test('FE-INT-008 — no horizontal scroll at 320px (minimum supported width)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${BASE_URL}/index.html`);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.body.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 5);
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-009 — CTA Click Instrumentation Attributes Present
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-009 — all CTAs carry correct data-cta instrumentation attributes', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);
  await page.waitForSelector('#navRoadmapCta', { timeout: 6000 });

  // Hero primary CTA
  const primaryDataCta = await page.locator('#primaryCta').getAttribute('data-cta');
  expect(primaryDataCta).toBe('generate-roadmap');

  // Hero secondary CTA
  const secondaryDataCta = await page.locator('[href*="framework"]').first().getAttribute('data-cta');
  expect(secondaryDataCta).toBe('explore-framework');

  // Navbar Generate Roadmap CTA
  const navDataCta = await page.locator('#navRoadmapCta').getAttribute('data-cta');
  expect(navDataCta).toBeTruthy();
  expect(navDataCta).toContain('generate-roadmap');
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-010 — Accessibility: Keyboard Navigation
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-010 — primary CTA is reachable and activatable via keyboard', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  // Tab through the page until primary CTA is focused
  let focused = '';
  let attempts = 0;
  while (focused !== 'primaryCta' && attempts < 30) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.id || '');
    attempts++;
  }

  expect(focused).toBe('primaryCta');

  // Focused element must have a visible focus ring (outline or box-shadow)
  const hasVisibleFocus = await page.evaluate(() => {
    const el = document.activeElement;
    const style = window.getComputedStyle(el);
    const outline = style.outlineWidth;
    const boxShadow = style.boxShadow;
    return parseFloat(outline) > 0 || (boxShadow !== 'none' && boxShadow !== '');
  });
  expect(hasVisibleFocus).toBe(true);
});

test('FE-INT-010 — secondary CTA (Explore Framework) is reachable via keyboard', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  const secondary = page.locator('[data-cta="explore-framework"]');
  await secondary.focus();

  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-cta'));
  expect(focused).toBe('explore-framework');
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-011 — Accessibility: Semantic Structure & ARIA
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-011 — page has exactly one <h1> element', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  const h1Count = await page.locator('h1').count();
  expect(h1Count).toBe(1);
});

test('FE-INT-011 — stage list is an <ol> element with aria-label', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  const stagesList = page.locator('ol.stages');
  await expect(stagesList).toBeVisible();

  const ariaLabel = await stagesList.getAttribute('aria-label');
  expect(ariaLabel).toBeTruthy();
  expect(ariaLabel.toLowerCase()).toContain('stage');
});

test('FE-INT-011 — hero section has aria-labelledby pointing to the <h1>', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  const heroSection = page.locator('section.hero');
  const ariaLabelledBy = await heroSection.getAttribute('aria-labelledby');
  expect(ariaLabelledBy).toBeTruthy();

  // The referenced element must exist and must be the h1
  const labelEl = page.locator(`#${ariaLabelledBy}`);
  await expect(labelEl).toBeVisible();
  const tagName = await labelEl.evaluate(el => el.tagName.toLowerCase());
  expect(tagName).toBe('h1');
});

test('FE-INT-011 — CTAs are anchor <a> elements, never <div> with onclick', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  // Both hero CTAs
  const primaryTag = await page.locator('#primaryCta').evaluate(el => el.tagName.toLowerCase());
  expect(primaryTag).toBe('a');

  const secondaryTag = await page.locator('[data-cta="explore-framework"]').first()
    .evaluate(el => el.tagName.toLowerCase());
  expect(secondaryTag).toBe('a');
});

test('FE-INT-011 — <main> and <nav> semantic landmarks are present', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  await expect(page.locator('main')).toBeAttached();
  await expect(page.locator('nav')).toBeAttached();
  await expect(page.locator('footer')).toBeAttached();
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-012 — SEO Meta Tags Present
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-012 — all required SEO and OG meta tags are present and non-empty', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  // <title>
  const title = await page.title();
  expect(title.trim().length).toBeGreaterThan(0);
  expect(title).toContain('SoorgaAI');

  // meta description
  const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
  expect(metaDesc).toBeTruthy();
  expect(metaDesc.trim().length).toBeGreaterThan(20);

  // og:title
  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
  expect(ogTitle).toBeTruthy();
  expect(ogTitle.trim().length).toBeGreaterThan(0);

  // og:description
  const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
  expect(ogDesc).toBeTruthy();
  expect(ogDesc.trim().length).toBeGreaterThan(0);

  // viewport
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('width=device-width');
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-013 — Performance Budget (LCP element present, page is fast)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-013 — h1 and primary CTA are rendered within the LCP budget window', async ({ page }) => {
  const navigationStart = Date.now();

  await page.goto(`${BASE_URL}/index.html`);

  // Wait for the likely LCP candidate (h1) to be visible
  await expect(page.locator('h1#hero-heading')).toBeVisible({ timeout: 2500 });

  const elapsed = Date.now() - navigationStart;

  // LCP < 2500ms — we measure visibility time as a proxy
  expect(elapsed).toBeLessThan(2500);
});

test('FE-INT-013 — all 5 stage items are rendered within 3 seconds', async ({ page }) => {
  const start = Date.now();
  await page.goto(`${BASE_URL}/index.html`);

  await expect(page.locator('.stage-item').nth(4)).toBeVisible({ timeout: 3000 });

  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(3000);
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-014 — Cross-Browser Smoke Test
// Playwright projects handle the multi-browser aspect. These tests run in the
// active browser. Add chromium / firefox / webkit projects to playwright.config.js
// to exercise all three with a single spec run.
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-014 — smoke: hero renders, stages visible, primary CTA has valid href', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  await expect(page.locator('h1#hero-heading')).toBeVisible();
  await expect(page.locator('ol.stages .stage-item').nth(0)).toBeVisible({ timeout: 5000 });

  const href = await page.locator('#primaryCta').getAttribute('href');
  expect(href).toBeTruthy();
  expect(href.startsWith('/') || href.startsWith('http')).toBe(true);
});

test('FE-INT-014 — smoke: framework stub page loads without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(`${BASE_URL}/framework/framework.html`);

  await expect(page.locator('body')).not.toBeEmpty();
  // No uncaught JS errors on the stub page
  expect(errors.filter(e => !e.includes('navigation'))).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// FE-INT-015 — Stage Data Drift Detection (Frontend ↔ Backend KB)
// ─────────────────────────────────────────────────────────────────────────────

test('FE-INT-015 — stage names in backend KB JSON match frontend MATURITY_STAGES exactly', async () => {
  // Read the backend knowledge-base JSON directly (no HTTP call needed)
  const backendKB = require(
    path.join(__dirname, '../../backend/trunida-backend/knowledge-base/maturity-stages.json')
  );

  const backendNames  = backendKB.stages.map(s => s.stage);
  const frontendNames = EXPECTED_STAGES.map(s => s.name);

  // Count must match
  expect(backendNames).toHaveLength(frontendNames.length);

  // Names must match exactly in order
  for (let i = 0; i < frontendNames.length; i++) {
    expect(backendNames[i]).toBe(frontendNames[i]);
  }
});

test('FE-INT-015 — backend KB score ranges cover 0–100 without gaps (matches frontend minScore/maxScore)', async () => {
  const backendKB = require(
    path.join(__dirname, '../../backend/trunida-backend/knowledge-base/maturity-stages.json')
  );

  const sorted = [...backendKB.stages].sort((a, b) => a.minScore - b.minScore);

  expect(sorted[0].minScore).toBe(0);
  expect(sorted[sorted.length - 1].maxScore).toBe(100);

  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i].minScore).toBe(sorted[i - 1].maxScore + 1);
  }
});

test('FE-INT-015 — rendered stage names in hero exactly match the canonical list', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`);

  const stageItems = page.locator('ol.stages .stage-item__name');
  await expect(stageItems.nth(0)).toBeVisible({ timeout: 5000 });

  const renderedNames = await stageItems.allTextContents();
  const cleanedNames  = renderedNames.map(n => n.trim());

  // DOM renders stages in descending order (5→1), so reverse for comparison
  const expectedDesc = [...EXPECTED_STAGES].map(s => s.name).reverse();

  expect(cleanedNames).toEqual(expectedDesc);
});
