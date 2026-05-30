# SoorgaAI — Integration Test Suite
### Dynamic Assessment Intelligence Engine (SOORGA-EPIC-ASMT-002)

---

## Overview

This folder contains the complete integration test suite for the **Dynamic AI Maturity Assessment Engine**. It covers two layers:

| Layer | Tool | Test Cases | What Is Tested |
|-------|------|-----------|----------------|
| Backend API | Postman Collection v2.1 | 25 test cases (TC-API-001–025) | All 6 REST endpoints + 3 KB endpoints end-to-end |
| Frontend E2E | Playwright | 15 test cases (TC-FE-001–015) | Full browser flow: start → discovery → questions → scorecard |

---

## Folder Structure

```
integration-tests/
│
├── README.md                          ← This file
├── gap-analysis.md                    ← Spec-vs-actual divergence log
│
└── e2e/
    └── assessment-flow.spec.js        ← 15 Playwright frontend tests
```

The Postman collection lives in the project root:
```
postman/
└── SoorgaAI-Dynamic-Assessment.postman_collection.json
```

---

## Part 1 — Backend API Tests (Postman)

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Postman desktop app | 10+ **or** Newman CLI |
| Running backend | `node server.js` (Railway or localhost:3000) |
| Running MongoDB | Atlas or local (URI set in `.env`) |
| Anthropic API key | Set in `.env` as `ANTHROPIC_API_KEY` |

> **Note:** Newman lets you run the collection from the terminal without the Postman GUI. See [Newman CLI](#running-with-newman-cli) below.

---

### Setup

**Step 1 — Import the collection**

1. Open Postman.
2. Click **Import** → drag and drop `postman/SoorgaAI-Dynamic-Assessment.postman_collection.json`.
3. The collection appears as **"SoorgaAI — Dynamic Assessment API"**.

**Step 2 — Set the base URL**

Open the collection → **Variables** tab → set `baseUrl` to your backend URL:

| Environment | Value |
|-------------|-------|
| Local | `http://localhost:3000` |
| Railway staging | `https://your-app.railway.app` |

No other variables need to be set manually — `sessionId`, `questionId`, and `allQuestionIds` are populated automatically by the test scripts.

---

### Running the Collection

#### Option A — Postman Runner (GUI)

1. Right-click the collection → **Run collection**.
2. Leave all 25 requests selected.
3. Click **Run SoorgaAI**.
4. Results appear in the runner with pass/fail indicators per assertion.

**Important:** Run requests **in order** — later tests depend on `sessionId` set by TC-API-001.

#### Option B — Newman CLI

```bash
# Install Newman globally
npm install -g newman

# Run the full collection
newman run postman/SoorgaAI-Dynamic-Assessment.postman_collection.json \
  --env-var "baseUrl=http://localhost:3000" \
  --reporters cli,json \
  --reporter-json-export integration-tests/newman-results.json
```

```bash
# Run a single folder only
newman run postman/SoorgaAI-Dynamic-Assessment.postman_collection.json \
  --env-var "baseUrl=http://localhost:3000" \
  --folder "01 — Start Session"
```

---

### Collection Variables

| Variable | Set by | Purpose |
|----------|--------|---------|
| `baseUrl` | You (before run) | Backend root URL |
| `sessionId` | TC-API-001 test script | Passed to all subsequent requests |
| `questionId` | TC-API-009 test script | First question ID for single-answer tests |
| `allQuestionIds` | TC-API-009 test script | All 20 question IDs for batch-answer test |
| `emptySessionId` | TC-API-021 test script | Session ID with no answers (for 400 score test) |

---

### Happy-Path Flow

The 25 test cases follow a single chain. Each test builds on the session created in TC-API-001:

```
TC-API-001  POST /sessions               → creates session, saves sessionId
     ↓
TC-API-004  POST /sessions/:id/discover  → runs Claude discovery, saves domain
     ↓
TC-API-009  POST /sessions/:id/questions → generates 20 questions, saves questionIds
     ↓
TC-API-012  POST /sessions/:id/answers   → submits single answer
     ↓
TC-API-016b [pre-request script]         → batch-submits remaining 19 answers
     ↓
TC-API-016  POST /sessions/:id/score     → computes scorecard
```

---

### Test Cases Reference

#### Folder 01 — Start Session

| TC | Request | What Is Verified |
|----|---------|-----------------|
| TC-API-001 | `POST /api/assessment/dynamic/sessions` | 201 status; `sessionId` present; `status: "started"`; saves `sessionId` variable |
| TC-API-002 | Same endpoint — missing `name` | 400 status; `success: false` |
| TC-API-003 | Same endpoint — missing `companyName` | 400 status; `success: false` |

#### Folder 02 — Domain Discovery

| TC | Request | What Is Verified |
|----|---------|-----------------|
| TC-API-004 | `POST /sessions/:id/discover` | 200 status; `domain` is a string; `confidence` is a number; `status` updated to `"discovered"` |
| TC-API-005 | Same — already discovered session | 200 status (re-discovery allowed); `domain` still present |
| TC-API-006 | Same — invalid session ID | 404 status |

#### Folder 03 — Question Generation

| TC | Request | What Is Verified |
|----|---------|-----------------|
| TC-API-009 | `POST /sessions/:id/questions` | 200 status; returns exactly 20 questions; each question has `questionId`, `text`, `options`, `focusAreaId`; saves `questionId` and `allQuestionIds` |
| TC-API-010 | Same request (second call) | 200 status; `cached: true` in response (no second Claude call) |
| TC-API-011 | Same — completed session | 400 status (questions already generated) |

#### Folder 04 — Submit Answers

| TC | Request | What Is Verified |
|----|---------|-----------------|
| TC-API-012 | `POST /sessions/:id/answers` with valid `questionId` + `value: 3` | 200 status; `answered` count increments; `complete: false` |
| TC-API-013 | Same — `value: 0` | 400 status (out of range) |
| TC-API-014 | Same — `value: 6` | 400 status (out of range) |
| TC-API-015 | Same — missing `questionId` | 400 status |

#### Folder 05 — Score Session

| TC | Request | What Is Verified |
|----|---------|-----------------|
| TC-API-016 | `POST /sessions/:id/score` (after pre-request submits all answers) | 200 status; `overallScore` is 0–100; `maturityStage` is a string; `focusAreaScores` is an array of 7 objects; each object has `focusAreaId`, `focusAreaName`, `score`, `questionCount` |
| TC-API-017 | Same — session with no answers | 400 status |
| TC-API-018 | Same — invalid session ID | 404 status |

#### Folder 06 — Get Session

| TC | Request | What Is Verified |
|----|---------|-----------------|
| TC-API-019 | `GET /api/assessment/dynamic/sessions/:id` | 200 status; `session._id` matches; `questions` array present; `answers` array present |
| TC-API-020 | Same — invalid ID | 404 status |

#### Folder 07 — KB Endpoints

| TC | Request | What Is Verified |
|----|---------|-----------------|
| TC-API-022 | `GET /api/kb/maturity-stages` | 200 status; `stages` array has 5 items; each stage has `stage`, `stageNumber`, `minScore`, `maxScore`, `color`, `description` |
| TC-API-023 | `GET /api/kb/focus-areas` | 200 status; `focusAreas` array has 7 items; each has `id`, `name`, `description` |
| TC-API-024 | `GET /api/kb/domain-studies/automotive` | 200 status; `content` is a non-empty string; `domain` field is `"Automotive"` |
| TC-API-025 | `GET /api/kb/domain-studies/unknown-domain` | 404 status; `availableDomains` array present in response |

#### Folder 08 — Edge Cases

| TC | Request | What Is Verified |
|----|---------|-----------------|
| TC-API-021 | Score a session with 0 answers | 400 status |

---

### Interpreting Results

| Indicator | Meaning |
|-----------|---------|
| ✅ Green | All assertions in that request passed |
| ❌ Red | One or more assertions failed — expand to see the failing `pm.expect()` line |
| ⚠️ Yellow | Request completed but collection variable not set (usually TC-API-001 failed upstream) |

**Cascade failures:** If TC-API-001 fails (e.g., MongoDB not connected), all subsequent tests will fail because `sessionId` will be `undefined`. Fix the upstream error first.

---

## Part 2 — Frontend E2E Tests (Playwright)

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20+ |
| npm | 9+ |
| Frontend served on | `http://127.0.0.1:5500` (Live Server) **or** any static server |

> **No live backend required.** All API calls are intercepted by Playwright's `page.route()` and replaced with mock responses. Tests run offline.

---

### Setup

From the **project root**:

```bash
# Install Playwright and the test runner
npm install --save-dev @playwright/test

# Download Chromium browser binaries
npx playwright install chromium
```

> Playwright does **not** need to be installed inside the backend folder — install it at the project root.

---

### Running the Tests

#### Run all 15 E2E tests
```bash
npx playwright test integration-tests/e2e/assessment-flow.spec.js
```

#### Run in headed mode (watch the browser)
```bash
npx playwright test integration-tests/e2e/assessment-flow.spec.js --headed
```

#### Run a single test by name pattern
```bash
npx playwright test integration-tests/e2e/assessment-flow.spec.js -g "TC-FE-011"
```

#### Run with full trace on failure
```bash
npx playwright test integration-tests/e2e/assessment-flow.spec.js --trace on
```

#### Run with HTML report
```bash
npx playwright test integration-tests/e2e/assessment-flow.spec.js --reporter=html
npx playwright show-report
```

---

### Environment Variables

| Variable | Default | Override Example |
|----------|---------|-----------------|
| `BASE_URL` | `http://127.0.0.1:5500` | `BASE_URL=http://localhost:8080` |
| `API_URL` | `http://localhost:3000` | `API_URL=https://your-app.railway.app` |

Set on the command line:
```bash
BASE_URL=http://localhost:8080 npx playwright test integration-tests/e2e/assessment-flow.spec.js
```

> `API_URL` is used to build the `page.route()` intercept glob patterns. Even though tests mock the API, the variable must match the URL your frontend JS calls so Playwright can intercept it.

---

### How the Mock Works

All 15 tests call `mockAllApiRoutes(page)` which registers Playwright route intercepts for every backend endpoint before the page loads:

```
page.route(**/api/assessment/dynamic/sessions)         → returns 201 + mock sessionId
page.route(**/api/assessment/dynamic/sessions/:id/discover) → returns domain = Automotive
page.route(**/api/assessment/dynamic/sessions/:id/questions) → returns 20 mock questions
page.route(**/api/assessment/dynamic/sessions/:id)     → returns session object (GET)
page.route(**/api/assessment/dynamic/sessions/:id/answers)  → returns answered count
page.route(**/api/assessment/dynamic/sessions/:id/score)    → returns mock scorecard
```

The `MOCK_SESSION_ID` constant (`64b1234567890abcdef12345`) is set into `localStorage` via `page.evaluate()` so every page thinks it is resuming an in-progress session.

---

### Test Cases Reference

#### Registration Flow

| TC | File | What Is Verified |
|----|------|-----------------|
| TC-FE-001 | `start.html` | All three form fields (`#name`, `#role`, `#companyName`) and submit button render |
| TC-FE-002 | `start.html` | Filling all fields and clicking Submit: POST fires, `da_sessionId` saved to localStorage, redirects to `discovery.html` |
| TC-FE-003 | `start.html` | Clicking Submit without filling fields: page stays on `start.html`, `da_sessionId` not set (HTML5 required validation) |

#### Discovery Flow

| TC | File | What Is Verified |
|----|------|-----------------|
| TC-FE-004 | `discovery.html` | Page shows loading state then reveals `#welcomeSection` with non-empty text once discovery API resolves |

#### Question Flow

| TC | File | What Is Verified |
|----|------|-----------------|
| TC-FE-005 | `questions.html` | First question renders with text, 5 option labels, and `#progressLabel` showing "Question 1" |
| TC-FE-006 | `questions.html` | Clicking an option card adds `.selected` class; exactly one card is selected |
| TC-FE-007 | `questions.html` | Answering Q1 and clicking Next shows Q2; clicking Back returns to Q1 |
| TC-FE-008 | `questions.html` | Clicking Next without selecting an answer shows `#errorBanner`; stays on Q1 |
| TC-FE-009 | `questions.html` | Back button has `visibility: hidden` on the first question |
| TC-FE-010 | `questions.html` | `#submittingOverlay` has `display: none` on page load (regression guard for overlay bug) |

#### Scorecard Flow

| TC | File | What Is Verified |
|----|------|-----------------|
| TC-FE-011 | `scorecard.html` | Score circle shows `60`, stage name shows "AI Alignment", 7 focus area bars, 5-rung ladder, active rung contains "You are here" |
| TC-FE-012 | `scorecard.html` | Clicking Retake Assessment clears `da_sessionId` and `da_score` from localStorage and redirects to `start.html` |
| TC-FE-013 | `scorecard.html` | Visiting scorecard with no `da_score` in localStorage immediately redirects to `start.html` |

#### Guard / Navbar

| TC | File | What Is Verified |
|----|------|-----------------|
| TC-FE-014 | `questions.html` | Visiting questions page with no `da_sessionId` in localStorage immediately redirects to `start.html` |
| TC-FE-015 | `index.html` | `#myAssessmentsBtn` is hidden when `da_score` not set; visible after `da_score` is set |

---

### Playwright Config

If you want to configure timeouts or multiple browsers, create a `playwright.config.js` at the project root:

```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './integration-tests/e2e',
  timeout: 30000,
  use: {
    headless: true,
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5500',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

Then run with:
```bash
npx playwright test
```

---

## Gap Analysis

The file [`gap-analysis.md`](gap-analysis.md) documents every divergence between the original spec (SOORGA-EPIC-ASMT-002 v1.1) and the live implementation.

### Key Divergences

| # | Area | Spec | Actual |
|---|------|------|--------|
| 1 | URL prefix | `/api/assessment/sessions` | `/api/assessment/dynamic/sessions` |
| 2 | Session body | Nested `{ user: { name }, company: { name } }` | Flat `{ name, role, companyName }` |
| 3 | Status names | `DISCOVERY_PENDING`, `QUESTIONS_READY` | `started`, `questions_generated` |
| 4 | Answer format | `{ response: "Piloting" }` (label string) | `{ value: 3 }` (integer 1–5) |
| 5 | Score field | `overallMaturityStage: 3` (integer) | `maturityStage: "AI Alignment"` (string) |
| 6 | Error codes | `409 Conflict` for state conflicts | `400 Bad Request` |
| 7 | Error body | `{ error, field, details }` | `{ success: false, message }` |

### Features Not Implemented (Spec Only)

- Manual domain override (`source: "manual"`, `confidence: 1.0`)
- `user.email` and `company.website` fields on session
- `discovery.requiresManualOverride: true` fallback flag
- Typed validation errors with `field` and `details` array

### Features Implemented (Not in Spec)

- `GET /api/kb/maturity-stages` — exposes KB stages
- `GET /api/kb/focus-areas` — exposes KB focus areas
- `GET /api/kb/domain-studies/:domain` — exposes domain study content
- `cached: true` on second question-generation call
- `optionalAuth` middleware (anonymous sessions without JWT)

See [`gap-analysis.md`](gap-analysis.md) for full details and P1/P2/P3 recommendations.

---

## Troubleshooting

### Postman — `sessionId` is `undefined` in all tests after TC-API-001

**Cause:** TC-API-001 failed, so the test script that sets `pm.collectionVariables.set("sessionId", ...)` never ran.

**Fix:**
1. Run TC-API-001 alone and inspect the response body.
2. Verify the backend is running and MongoDB is connected (`GET /` returns `{ message: "...Backend is Running!" }`).
3. Re-run the full collection only after fixing the upstream failure.

---

### Postman — TC-API-004 returns `500 Internal Server Error`

**Cause:** `ANTHROPIC_API_KEY` is not set in the backend `.env` file.

**Fix:** Add `ANTHROPIC_API_KEY=sk-ant-...` to `backend/trunida-backend/.env` and restart the server.

> Discovery will still return an Automotive fallback (confidence 0.3) without a key, but if the service throws unexpectedly the controller returns 500.

---

### Playwright — `page.waitForURL('**/discovery.html')` times out in TC-FE-002

**Cause:** The frontend JS is calling the real API (not intercepted) because `mockAllApiRoutes(page)` was not called before `page.goto()`.

**Fix:** Ensure `mockAllApiRoutes(page)` is always called before `page.goto()`. Route intercepts must be registered before navigation.

---

### Playwright — `#mainContent` never becomes visible

**Cause:** The frontend JS couldn't load questions because `da_sessionId` was not in localStorage, or the mock route pattern doesn't match the actual API URL the JS is calling.

**Fix:**
1. Check `API_URL` env var matches what the frontend JS hardcodes in its `fetch()` calls.
2. Use `--headed` mode and open DevTools → Network to see which URL is actually being fetched.
3. Update `page.route()` glob patterns in `assessment-flow.spec.js` accordingly.

---

### Playwright — TC-FE-010 fails (`display` is not `none`)

**Cause:** The `#submittingOverlay` div in `questions.html` is missing `style="display:none"`. The CSS class `.da-overlay` sets `display: flex` by default.

**Fix:** Ensure `questions.html` has:
```html
<div id="submittingOverlay" class="da-overlay" style="display:none">
```

---

### Newman — `Error: collection could not be loaded`

**Cause:** The JSON file path is wrong or the file is not valid Postman Collection v2.1 format.

**Fix:**
```bash
# Check the file exists
ls postman/SoorgaAI-Dynamic-Assessment.postman_collection.json

# Validate format
newman run postman/SoorgaAI-Dynamic-Assessment.postman_collection.json --dry-run
```

---

## Quick Reference

```bash
# ─── Postman / Newman ────────────────────────────────────────────────────────

# Run all 25 API tests
newman run postman/SoorgaAI-Dynamic-Assessment.postman_collection.json \
  --env-var "baseUrl=http://localhost:3000"

# ─── Playwright E2E ──────────────────────────────────────────────────────────

# Install (first time)
npm install --save-dev @playwright/test && npx playwright install chromium

# Run all 15 frontend tests (headless)
npx playwright test integration-tests/e2e/assessment-flow.spec.js

# Run headed (watch the browser)
npx playwright test integration-tests/e2e/assessment-flow.spec.js --headed

# Run a specific test
npx playwright test integration-tests/e2e/assessment-flow.spec.js -g "TC-FE-011"

# Open HTML report after a run
npx playwright show-report
```
