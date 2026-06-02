# SoorgaAI — Frontend Unit Tests
### Command Center (Landing Page) — SOORGA-EPIC-LANDING-001

---

## Overview

| Metric | Value |
|--------|-------|
| Test framework | Vitest v4 + jsdom |
| Total test files | 4 |
| Total tests | 73 (+ 2 `todo` stubs) |
| External dependencies mocked | `localStorage`, `window.location`, `console` |
| Network calls | Zero |

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20+ |
| npm | 9+ |

No `.env` file, running server, or API key is needed.

---

## Setup

```bash
cd frontend
npm install
```

Vitest and jsdom are listed under `devDependencies` and install automatically.

---

## Running the Tests

### Run all tests once
```bash
cd frontend
npm test
```

### Watch mode (re-runs on file save)
```bash
cd frontend
npm run test:watch
```

### With coverage report
```bash
cd frontend
npm run test:coverage
```

Produces a text summary in the terminal and an `lcov.info` file in `frontend/coverage/`.

### Run a single test file
```bash
cd frontend
npx vitest run __tests__/maturityStages.test.js
```

### From the project root (convenience alias)
The root `package.json` exposes:
```bash
npm run test:frontend
```

---

## File Structure

```
frontend/
├── package.json             ← Vitest + jsdom devDependencies
├── vitest.config.js         ← jsdom environment, coverage thresholds
│
├── __tests__/
│   ├── setup.js             ← Global beforeEach: clear localStorage, reset DOM, restore mocks
│   ├── maturityStages.test.js  ← 23 tests (data module + snapshot guard)
│   ├── authState.test.js       ← 17 tests + 2 todo stubs
│   ├── index.test.js           ← 17 tests (renderStages + wirePrimaryCta)
│   └── navbar.test.js          ← 36 tests (getNavbarPath, handlers, toggle, bindBtn, logout)
│
└── TESTING_NOTES.md         ← This file
```

---

## Mocking Strategy

### `localStorage`

jsdom provides a functional `localStorage` implementation. Tests manipulate it directly:

```js
localStorage.setItem('token', 'abc');  // set
localStorage.clear();                  // cleared in setup.js beforeEach
```

To simulate private-browsing where `localStorage` throws:
```js
vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
  throw new Error('SecurityError');
});
```
`vi.restoreAllMocks()` in `setup.js` clears this after each test.

### `window.location`

jsdom's `window.location` does not support direct `href` assignment by default. `setup.js` replaces it:

```js
Object.defineProperty(window, 'location', {
  writable: true,
  value: { href: '', pathname: '/', assign: vi.fn(), replace: vi.fn() },
});
```

Tests then assert:
```js
expect(window.location.href).toBe('/index.html');
```

### `window.SoorgaAuth`

Tests that exercise the auth-aware CTA path inject a mock directly:
```js
window.SoorgaAuth = { getRoadmapHref: () => '/dynamic-assessment/start.html' };
```

Tests that cover the "no SoorgaAuth" fallback simply set it to `undefined`.

### `fetch`

`navbar.js` calls `fetch()` to load `navbar.html` inside a `DOMContentLoaded` listener.
This listener **does not fire during module import** in Vitest (the DOMContentLoaded event
is not re-dispatched), so `fetch` is never called during any test.
Confirmed by grepping the test files — no `fetch(`, `axios`, or `XMLHttpRequest` calls exist.

---

## Stage-Sync Constraint

`frontend/data/maturityStages.js` and
`backend/trunida-backend/knowledge-base/maturity-stages.json` **must stay in sync**.

The snapshot test in `maturityStages.test.js` guards this:

```js
it('matches the canonical stage list snapshot (sync guard with backend KB)', () => {
  expect(MATURITY_STAGES).toMatchSnapshot();
});
```

The snapshot is stored in `frontend/__tests__/__snapshots__/maturityStages.test.js.snap`.

**If this test fails after a merge:**
1. Open `maturity-stages.json` and compare it to `MATURITY_STAGES` in `maturityStages.js`
2. Decide which is the authoritative source
3. Update the other file to match
4. Run `npx vitest run --update-snapshots` to regenerate the snapshot
5. Commit both the source change and the updated `.snap` file together

---

## Coverage Thresholds

Configured in `vitest.config.js`:

| Metric | Threshold |
|--------|-----------|
| Statements | ≥ 90% |
| Branches | ≥ 85% |
| Functions | 100% |

CI will fail if these thresholds are not met.

---

## Uncoverable Items

| Item | Reason |
|------|--------|
| `DOMContentLoaded` auto-run block in `index.js` | Event is not dispatched during module import in Vitest; the functions it calls (`renderStages`, `wirePrimaryCta`) are tested directly via their exports |
| `DOMContentLoaded` auto-run block in `navbar.js` | Same reason |
| `fetch()` call in `navbar.js` | Inside the DOMContentLoaded block; never reached during import |
| `MutationObserver` + `setTimeout` in `navbar.js` | Inside the DOMContentLoaded/fetch callback chain; not reached |
| `getRoadmapHref` auth-gated paths | Not yet implemented; guarded by two `it.todo` tests in `authState.test.js` |

---

## Troubleshooting

### `Cannot find module '../data/maturityStages.js'`
Ensure you run `npm test` from inside the `frontend/` directory, not the project root.

### Snapshot mismatch after a stage change
```bash
cd frontend
npx vitest run --update-snapshots
```
Then verify the backend KB JSON matches before committing.

### `localStorage is not defined`
Ensure `vitest.config.js` has `environment: 'jsdom'`. The `node` environment does not provide browser APIs.

### Tests pass locally but fail in CI
Check that `NODE_ENV` is not set to a value that disables jsdom features. Vitest does not set `NODE_ENV` by default.
