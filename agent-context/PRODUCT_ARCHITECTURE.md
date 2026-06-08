# SoorgaAI — Product Architecture

> Maintained for agent context continuity. Update when routes, modules, or architectural decisions change.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML / CSS / ES modules (no framework, no build step) |
| Backend | Node.js + Express + MongoDB (Railway) |
| Hosting | Vercel (frontend static) + Railway (API) |
| Auth | JWT stored in `localStorage` |

---

## Frontend Routes

| URL | File | Auth Required |
|-----|------|---------------|
| `/` | `frontend/index.html` | No (fully anonymous) |
| `/framework/framework.html` | `frontend/framework/framework.html` | No |
| `/platform/platform.html` | `frontend/platform/platform.html` | **Yes** — guards via `GET /api/users/me` |
| `/dynamic-assessment/start.html` | `frontend/dynamic-assessment/start.html` | No |
| `/dynamic-assessment/discovery.html` | `frontend/dynamic-assessment/discovery.html` | No |
| `/dynamic-assessment/questions.html` | `frontend/dynamic-assessment/questions.html` | No |
| `/dynamic-assessment/scorecard.html` | `frontend/dynamic-assessment/scorecard.html` | No |
| `/login/login.html` | `frontend/login/login.html` | No |
| `/signup/signup.html` | `frontend/signup/signup.html` | No |
| `/dashboard/signaldashboard.html` | `frontend/dashboard/signaldashboard.html` | Yes |
| `/assessment/assessment.html` | `frontend/assessment/assessment.html` | Yes |
| `/results/results.html` | `frontend/results/results.html` | Yes |
| `/admin/dashboard.html` | `frontend/admin/dashboard.html` | Yes (admin role) |

---

## Shared Utilities

| File | Purpose |
|------|---------|
| `frontend/login/config.js` | Global `window.CONFIG` — API endpoints for all environments |
| `frontend/login/authState.js` | `isAuthenticated()` + `getRoadmapHref()`; sets `window.SoorgaAuth` |
| `frontend/shared/ctaRouter.js` | `CTARouter.routeToWorkspace()` — auth-aware routing for "Generate My AI Roadmap" CTA |
| `frontend/data/maturityStages.js` | ES module; single source of truth for 5 maturity stages (must stay in sync with backend KB JSON) |
| `frontend/navbar/navbar.js` | Fetches + injects `navbar.html`; supports `anonymous` and `authenticated` modes |
| `frontend/index.js` | ES module; hydrates stage list on homepage |

---

## Navbar Mode Flag

The navbar supports two rendering modes controlled by `document.body.dataset.navMode`:

| Mode | Set on | Behavior |
|------|--------|----------|
| `anonymous` | `<body data-nav-mode="anonymous">` | Shows Platform / Framework / Resources / Pricing / Generate Roadmap only. No auth chrome. Generate Roadmap calls `CTARouter.routeToWorkspace()`. |
| *(default)* | All other pages (no attribute) | Existing authenticated chrome: login/logout, My Assessments, admin, username display. |

---

## CTA Router

**File:** `frontend/shared/ctaRouter.js`

```
CTARouter.routeToWorkspace()
  ├── token absent → /login/login.html?redirect=/platform/platform.html
  └── token present → /platform/platform.html
```

Trusts the platform page's own auth guard for expired-token handling. No API call on this path (fast redirect).

---

## Login `?redirect=` Allowlist

`frontend/login/login.js` reads `?redirect=` from the URL on page load and validates with `getValidRedirect()`:

**Accepted:** Strings starting with `/` but NOT starting with `//`.

**Rejected:**
- `//evil.com` — protocol-relative
- `https://evil.com` — absolute URL
- `javascript:...` — script injection
- Missing or empty — falls through to default

The validated redirect target is stored in the module-scoped `pendingRedirect` variable and applied in `redirectAfterLogin()` (highest priority) and `checkExistingAuth()`.

---

## Platform Page Auth Guard

**File:** `frontend/platform/platform.js`

```
DOMContentLoaded
  ├── No token        → /login/login.html?redirect=/platform/platform.html
  ├── 200 from /me    → show workspace, render greeting from user object
  ├── 401 from /me    → clear token → /login/login.html?redirect=/platform/platform.html
  └── Network error   → show content (server-level guard applies)
```

Uses `window.CONFIG.AUTH.VERIFY` (`GET /api/users/me`) — no new backend endpoint.

---

## Backend API Routes (unchanged)

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `/api/users/signup` | Register |
| POST | `/api/users/login` | Authenticate, returns JWT |
| GET | `/api/users/me` | Verify JWT, return user object |
| POST | `/api/assessment/dynamic/sessions` | Start dynamic assessment session |
| POST | `/api/assessment/dynamic/sessions/:id/discover` | Domain discovery |
| POST | `/api/assessment/dynamic/sessions/:id/questions` | Generate questions |
| POST | `/api/assessment/dynamic/sessions/:id/answers` | Submit answer |
| POST | `/api/assessment/dynamic/sessions/:id/score` | Compute scorecard |
| GET | `/api/assessment/dynamic/sessions/:id` | Get session |
| GET | `/api/kb/maturity-stages` | KB: maturity stages |
| GET | `/api/kb/focus-areas` | KB: focus areas |
| GET | `/api/kb/domain-studies/:domain` | KB: domain study |

---

## Knowledge Base Architecture

**Root:** `knowledge_base/automotive/`  
**Purpose:** Enterprise AI transformation intelligence for SoorgaAI agents

### Five-Layer Intelligence Model

```
Core Assets          → enterprise_ai/AI_Strategy/Core/        (universal principles)
Automotive Layer     → enterprise_ai/AI_Strategy/Automotive/  (industry application)
Company Template     → Templates/Company_AI_Strategy_Template.md (CTO customization)
Domain Template      → Templates/Domain_AI_Strategy_Template.md  (execution)
Learning Feedback    → outcomes → Automotive improvements → Core improvements
```

### Folder Map

```
knowledge_base/automotive/
├── enterprise_ai/AI_Strategy/   ← ✓ Fully implemented
│   ├── Core/                    ← 6 universal AI strategy documents
│   ├── Automotive/              ← 6 automotive-specific extensions
│   └── Templates/               ← Company + Domain customization templates
├── enterprise_ai/[6 other domains]/   ← Coming Soon
├── business_domains/[7 domains]/      ← Automotive domain READMEs
├── enterprise_patterns/               ← AI_CoE, Governance, ROI, Operating Model, Change Mgmt
└── shared/                            ← Glossary, Trends, Regulations, Best Practices
```

### Agent Retrieval Order
`Core → Automotive → Business Domain → Enterprise Pattern → Shared → Generate guidance`

### Governance
- Automotive documents reference Core — never duplicate it
- Core documents change only when cross-company patterns mature
- Company and Domain templates are customer-owned

---

## Vercel Routing

`vercel.json` — `outputDirectory: frontend`. Explicit rewrite rules for each subdirectory; catch-all `/(.*) → /$1` at the bottom.

Key routes added for this EPIC:
- `/platform/:path*` — Platform workspace stub
- `/shared/:path*` — Shared JS utilities (ctaRouter.js)

No backend deploy required for the landing page EPIC. Railway is untouched.
