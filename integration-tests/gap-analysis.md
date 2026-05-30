# Integration Test Gap Analysis
## Spec (SOORGA-EPIC-ASMT-002 v1.1) vs Actual Implementation

> **Purpose:** Documents every divergence between the integration test spec and the live API.
> Feed this into the Architecture Agent before closing the epic.

---

## 1. URL Prefix Mismatch

| Spec URL | Actual URL | Impact |
|----------|-----------|--------|
| `POST /api/assessment/sessions` | `POST /api/assessment/dynamic/sessions` | All session endpoints differ by `/dynamic` segment |
| `POST /api/assessment/sessions/:id/questions/generate` | `POST /api/assessment/dynamic/sessions/:id/questions` | Path and trailing segment differ |

**Resolution:** Postman collection uses actual paths. Spec should be updated to reflect `/dynamic` prefix, or an alias route added.

---

## 2. Request Body Format — Start Session

| Field | Spec | Actual | Notes |
|-------|------|--------|-------|
| User name | `user.name` | `name` | Flat object, not nested |
| User role | `user.role` | `role` | Flat |
| User email | `user.email` | ❌ Not accepted | Email not in schema |
| Company name | `company.name` | `companyName` | Flat, renamed |
| Company website | `company.website` | ❌ Not accepted | Website not in schema |

**Spec expects:**
```json
{ "user": { "name": "Jane", "role": "CTO", "email": "jane@acme.com" },
  "company": { "name": "Acme", "website": "https://acme.com" } }
```
**Actual accepts:**
```json
{ "name": "Jane", "role": "CTO / CIO", "companyName": "Acme" }
```

---

## 3. Session Status Values

| Spec | Actual | Notes |
|------|--------|-------|
| `DISCOVERY_PENDING` | `started` | After session creation |
| `DISCOVERY_COMPLETE` | `discovered` | After discovery |
| `DISCOVERY_NEEDS_INPUT` | *(not implemented)* | No fallback-needs-input state |
| `QUESTIONS_READY` | `questions_generated` | After question generation |
| `SCORE_COMPLETE` | `completed` | After scoring |

---

## 4. Answer Format

| Spec | Actual | Notes |
|------|--------|-------|
| `{ "questionId": "q1", "response": "Piloting" }` | `{ "questionId": "q1", "value": 3 }` | Spec uses labelled strings; actual uses integers 1–5 |

The spec assumes Likert labels are stored as strings. The actual implementation normalises to integers, which is correct for scoring math.

---

## 5. Score Response Format

| Spec field | Actual field | Notes |
|-----------|-------------|-------|
| `overallMaturityStage: 3` (integer) | `maturityStage: "AI Alignment"` (string name) | Spec uses stage number; actual uses stage name |
| `overallStageLabel: "Operational"` | *(inside `maturityStageDetails.stage`)* | Different label vocabulary |
| `focusAreaScores[].focusArea` | `focusAreaScores[].focusAreaId` / `focusAreaName` | Field name differs |
| `computedAt` | ❌ Not in response | Timestamp not returned |
| `status: "SCORE_COMPLETE"` | Not in score response | Status only on session object |

---

## 6. Error Response Format

| Spec | Actual | Notes |
|------|--------|-------|
| `{ "error": "ValidationError", "field": "user.name" }` | `{ "success": false, "message": "..." }` | Spec uses typed error objects; actual uses simple message |
| `409 Conflict` for wrong session state | `400 Bad Request` | HTTP code differs |
| `409 Conflict` for incomplete answers | `400 Bad Request` | HTTP code differs |

---

## 7. Features in Spec NOT Implemented

| Feature | TC | Status |
|---------|----|--------|
| Manual domain override in discovery | TC-API-007 | ❌ Not implemented |
| `discovery.requiresManualOverride: true` in Claude fallback | TC-API-008 | ❌ Not implemented |
| `source: "manual"` and `confidence: 1.0` in override response | TC-API-007 | ❌ Not implemented |
| `user.email` field on session | TC-API-001 | ❌ Not in Mongoose schema |
| `company.website` field on session | TC-API-001 | ❌ Not in Mongoose schema |
| Validation error with `field` and `details` array | TC-API-002/003 | ❌ Not implemented |

---

## 8. Features Implemented NOT in Spec

| Feature | Notes |
|---------|-------|
| `GET /api/kb/maturity-stages` | Added to support TC-API-022 |
| `GET /api/kb/focus-areas` | Added to support TC-API-023 |
| `GET /api/kb/domain-studies/:domain` | Added to support TC-API-024/025 |
| Question caching (`cached: true`) | TC-API-010 validates this |
| `optionalAuth` middleware | Anonymous sessions allowed without JWT |

---

## 9. Frontend Test Framework Mismatch

The spec assumes **React + React Testing Library + MSW** or **Cypress**.

The actual frontend is **vanilla HTML / CSS / JS** (no build step, no React).

**Mapping:**
| Spec assumption | Actual equivalent |
|-----------------|-------------------|
| React Testing Library | ❌ Not applicable |
| MSW (Mock Service Worker) | Playwright `page.route()` intercept |
| Component isolation tests | ❌ Pages are HTML files, not components |
| Cypress E2E | ✅ Playwright E2E (see `e2e/assessment-flow.spec.js`) |

---

## 10. Recommended Actions for Architecture Agent

1. **P1 — Flatten vs nest:** Decide on the session creation body schema (flat vs nested `user`/`company`). Update either the spec or the model + controller.
2. **P1 — Status vocabulary:** Adopt one set of status strings (SCREAMING_SNAKE_CASE or snake_case) across spec, code, and frontend.
3. **P2 — Answer format:** The spec's `response: "Piloting"` (label) approach requires a mapping table. The current `value: 3` (integer) approach is simpler for scoring. Confirm with product team.
4. **P2 — Error objects:** Implement typed error responses with `error`, `field`, and `details` to match spec if frontend/clients depend on them.
5. **P3 — Manual override:** If manual domain override is needed for low-confidence cases, implement `manualOverride` support in discovery controller.
6. **P3 — 409 vs 400:** Align HTTP codes for state-conflict errors.
