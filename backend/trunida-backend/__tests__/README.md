# SoorgaAI — Unit Test Suite
### Dynamic Assessment Intelligence Engine (SOORGA-EPIC-ASMT-002)

---

## Overview

This folder contains the complete unit test suite for the backend services and controller of the **Dynamic AI Maturity Assessment Engine**. All tests are fully isolated — no database, no real Claude API calls, and no filesystem reads occur during a test run.

| Metric | Value |
|--------|-------|
| Test framework | [Vitest](https://vitest.dev/) v4+ |
| Total test files | 5 |
| Total tests | 136 |
| Avg. run time | < 1 second |
| External dependencies mocked | `fs`, `@anthropic-ai/sdk`, `dotenv`, `mongoose` |

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20+ |
| npm | 9+ |

No `.env` file, running MongoDB instance, or Anthropic API key is needed.

---

## Setup

From the backend root directory:

```bash
cd backend/trunida-backend
npm install
```

Vitest is listed under `devDependencies` and is installed automatically.

---

## Running the Tests

### Run all tests once (CI mode)
```bash
npm test
```

### Run in watch mode (development)
```bash
npm run test:watch
```
Vitest re-runs only affected test files when source files change.

### Run with coverage report
```bash
npm run test:coverage
```
Produces a text summary in the terminal and an `lcov.info` file in `coverage/`.

### Run a single test file
```bash
npx vitest run __tests__/kbRetrievalService.test.js
```

### Run tests matching a pattern
```bash
npx vitest run --reporter=verbose -t "computeScore"
```

---

## Folder Structure

```
__tests__/
│
├── README.md                          ← This file
│
├── __fixtures__/                      ← Reusable test data (never write to disk)
│   ├── maturity-stages.json           ← 5-stage KB fixture (mirrors the real KB file)
│   ├── focus-areas.json               ← 7 focus-area KB fixture
│   ├── automotive.md                  ← Sample domain study markdown
│   ├── claude-responses.js            ← Canonical Claude API response shapes
│   └── session-helpers.js             ← Factories: makeSampleSession(), makeReqRes()
│
├── kbRetrievalService.test.js         ← 35 tests
├── discoveryService.test.js           ← 20 tests
├── questionGenerationService.test.js  ← 29 tests
├── dynamicScoringService.test.js      ← 30 tests
└── dynamicAssessmentController.test.js← 42 tests
```

---

## Test Files

### 1. `kbRetrievalService.test.js` — 35 tests

Tests the Knowledge Base Retrieval Service that reads and caches JSON/Markdown KB files.

| Group | What is tested |
|-------|---------------|
| `getMaturityStages()` | Returns 5 stages with correct schema; caches on second call; throws on missing file |
| `getFocusAreas()` | Returns 7 focus areas; validates IDs; caches correctly |
| `getDomainStudy()` | Returns markdown for known domain; falls back to `automotive.md` for unknown domain; handles `null` input |
| `retrieveContext()` | Returns all 4 required fields; filters by `focusArea` and `stageHint`; `contextSummary` contains filter values |
| `warmCache()` | Pre-loads all 3 KB files without throwing; handles file-read errors gracefully |

**Key isolation technique:** `fs` is mocked via `vi.hoisted()` so the same mock function instances are used across module resets. `vi.resetModules()` + dynamic `await import()` in `beforeEach` clears the module-level `_cache` between tests.

---

### 2. `discoveryService.test.js` — 20 tests

Tests the Company Context Discovery Service that classifies a company's industry using Claude.

| Group | What is tested |
|-------|---------------|
| No API key | Returns Automotive fallback (confidence 0.3); does not call Claude |
| Empty/blank company name | Returns fallback without calling Claude |
| Claude success | Returns correct domain, subDomain, confidence; all 5 contract fields present |
| Markdown-fenced response | Strips ` ```json ` fences and parses correctly |
| Low-confidence "Other" | Falls back to Automotive when `confidence < 0.5` |
| Unsupported domain value | Defaults to Automotive for unknown domain strings |
| Claude API throws | Returns fallback without propagating error |
| Malformed JSON response | Returns fallback gracefully |

**Key isolation technique:** `@anthropic-ai/sdk` is mocked as a **class** (not an arrow function) so `new Anthropic()` works correctly. `dotenv` is mocked as a no-op to prevent `.env` files from affecting `process.env.ANTHROPIC_API_KEY` during tests.

---

### 3. `questionGenerationService.test.js` — 29 tests

Tests the Question Generation Service that composes KB context into a Claude prompt and parses the response.

| Group | What is tested |
|-------|---------------|
| No API key | Returns exactly 20 template questions; IDs are unique; all 7 focus areas covered |
| Template questions | Each question has all required fields; option values are numbers 1–5 |
| Claude success | Returns 20 questions; validates shape; caps at 20 even if Claude returns more |
| Invalid focusAreaId | Remapped to first valid focus area ID |
| Prompt composition | Prompt contains: company name, role, domain, all 5 maturity stages, all 7 focus area IDs, domain study excerpt |
| Model used | Asserts `claude-sonnet-4-6` model is specified |
| Claude throws | Falls back to 20 template questions |
| Malformed JSON | Falls back to template questions |
| Too few questions (< 5) | Falls back to template questions |

---

### 4. `dynamicScoringService.test.js` — 30 tests

Tests the Dynamic Scoring Service that converts session answers into focus-area scores and an overall maturity stage.

| Group | What is tested |
|-------|---------------|
| Return shape | All 4 required fields present; correct types |
| Scoring formula | All 5s → 100; all 1s → 20; all 3s → 60; `(rawAverage / 5) × 100` formula verified |
| Weighted scoring | Higher-weight questions have proportionally more influence |
| Decimal rounding | Score rounded to 1 decimal place |
| Stage boundaries (10 tests) | Score 0, 20, 21, 40, 41, 60, 61, 80, 81, 100 each maps to the correct stage |
| Partial answers | Only scored focus areas with ≥ 1 answer; `questionCount` reflects answered questions only |
| No answers | `overallScore = 0`; `focusAreaScores = []`; stage defaults to AI Scramble |
| Empty questions | Handles `{ questions: [], answers: [] }` without throwing |

---

### 5. `dynamicAssessmentController.test.js` — 42 tests

Tests all 6 Express controller functions with mock req/res objects. No HTTP server is started.

| Endpoint | Tests |
|----------|-------|
| `startSession` | Happy path (201); missing name/role/companyName (400 each); anonymous session; logged-in session; DB throws (500) |
| `discoverDomain` | Happy path (200); persists domain + status; 404 (not found); 400 (wrong status); 200 for re-discovery; 500 (service throws) |
| `generateSessionQuestions` | Happy path (200); persists questions; cached (no Claude call); 404; 400 (completed); calls `retrieveContext` with correct domain |
| `submitAnswer` | Happy path (200); persists answer + status; overwrites duplicate; 400 (bad questionId, value 0, value 6, non-integer, missing id); 400 (completed); 404; `complete: true` on final answer |
| `getSession` | 200 with full session; 404; 500 (DB throws) |
| `scoreSession` | 200 with scorecard shape; persists scores + completedAt; sessionId in response; 400 (no answers); 404; 500 (computeScore throws); domain defaults to Automotive |

**Key isolation technique:** All 5 dependencies (`AssessmentSession`, `discoveryService`, `questionGenerationService`, `dynamicScoringService`, `kbRetrievalService`) are mocked using `vi.hoisted()` + `vi.mock()`. The `makeReqRes()` helper creates mock `req`/`res` objects with chainable `status().json()` spies.

---

## Fixtures Reference

### `__fixtures__/session-helpers.js`

| Export | Description |
|--------|-------------|
| `FOCUS_AREA_IDS` | Array of all 7 valid focus area ID strings |
| `makeSampleQuestions(count)` | Returns `count` mock questions cycling through all 7 focus areas |
| `makeAnswers(questions, value)` | Returns answer objects for each question at the given value (1–5) |
| `makeSampleSession(overrides)` | Returns a mock session object with all fields + `save: vi.fn()` |
| `makeReqRes(body, params, user)` | Returns `{ req, res }` with spy `status().json()` chain |

### `__fixtures__/claude-responses.js`

| Export | Simulates |
|--------|-----------|
| `DISCOVERY_RESPONSE_AUTOMOTIVE` | Claude classifies company as Automotive (confidence 0.95) |
| `DISCOVERY_RESPONSE_OTHER_LOW_CONFIDENCE` | Claude returns Other with confidence 0.3 → triggers Automotive fallback |
| `DISCOVERY_RESPONSE_FINANCE` | Finance / Investment Banking |
| `DISCOVERY_RESPONSE_WITH_MARKDOWN_FENCE` | Response wrapped in ` ```json ``` ` |
| `DISCOVERY_RESPONSE_MALFORMED` | Plain text — not valid JSON |
| `QUESTIONS_RESPONSE_VALID` | 20 well-formed questions |
| `QUESTIONS_RESPONSE_TOO_FEW` | 3 questions (below 5-question threshold) |
| `QUESTIONS_RESPONSE_MALFORMED` | Plain text — triggers fallback |
| `QUESTIONS_RESPONSE_INVALID_FOCUS_IDS` | Questions with `focusAreaId: "not-a-valid-focus-area"` |

---

## Mocking Patterns

### Mocking `fs` (used in kbRetrievalService)

```javascript
// Create stable references BEFORE vi.mock() hoisting
const { mockReadFileSync, mockExistsSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockExistsSync:   vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    existsSync:   mockExistsSync,
  },
}));
```

### Mocking `@anthropic-ai/sdk` (used in discoveryService, questionGenerationService)

A **class** is used (not an arrow function) because the service calls `new Anthropic()`:

```javascript
const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: mockMessagesCreate };
    }
  },
}));
```

### Controlling ANTHROPIC_API_KEY per test

```javascript
// Test the Claude path:
vi.resetModules();
process.env.ANTHROPIC_API_KEY = 'test-key';
const { discoverCompany } = await import('../services/discoveryService.js');

// Test the no-key fallback:
vi.resetModules();
delete process.env.ANTHROPIC_API_KEY;
const { discoverCompany } = await import('../services/discoveryService.js');
```

### Resetting module-level cache (kbRetrievalService)

```javascript
beforeEach(async () => {
  vi.clearAllMocks();   // Clear call counts and implementations
  vi.resetModules();    // Clear module registry → fresh _cache on next import
  service = await import('../services/kbRetrievalService.js');
});
```

---

## Testability Notes

These items cannot be tested without modifying the source code. No source files were changed.

| Item | File | Note |
|------|------|------|
| `buildDiscoveryPrompt()` | `discoveryService.js` | Private function — not exported. Covered indirectly via `discoverCompany()`. |
| `buildWelcomeMessage()` | `discoveryService.js` | Private function — not exported. |
| `buildFallbackResult()` | `discoveryService.js` | Private function — not exported. |
| `buildQuestionPrompt()` | `questionGenerationService.js` | Private. Prompt content is verified by inspecting `mockMessagesCreate.mock.calls[0]`. |
| `parseQuestions()` | `questionGenerationService.js` | Private. Covered via `generateQuestions()` output shape. |
| `buildFallbackQuestions()` | `questionGenerationService.js` | Private. Covered via no-API-key path. |
| Module-level Anthropic client | `discoveryService.js`, `questionGenerationService.js` | Instantiated at import time. Requires `vi.resetModules()` + dynamic import to switch paths. **Recommendation:** inject the client as a parameter to improve testability. |

---

## Troubleshooting

### `TypeError: () => ({...}) is not a constructor`
The `@anthropic-ai/sdk` mock must use a `class`, not an arrow function, because the service calls `new Anthropic()`. Make sure the mock is:
```javascript
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() { this.messages = { create: mockFn }; }
  }
}));
```

### Cache not resetting between tests
Call `vi.resetModules()` in `beforeEach` AND re-import the service dynamically:
```javascript
beforeEach(async () => {
  vi.resetModules();
  service = await import('../services/kbRetrievalService.js');
});
```

### `process.env.ANTHROPIC_API_KEY` leaking between tests
Mock `dotenv` as a no-op and set/delete the env var explicitly in each test:
```javascript
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
```

### Tests pass locally but fail in CI
Ensure `NODE_ENV` is not set to `production` in CI — some services skip Claude and use fallbacks based on environment. Vitest does not set `NODE_ENV` by default.
