# SoorgaAI — Product Context

> This file is maintained for agent context continuity. Update it when product positioning, user flows, or major features change.

---

## Product Summary

SoorgaAI is an Enterprise AI Transformation Platform that helps organizations assess their AI maturity, benchmark against a 5-stage framework, and generate personalized AI transformation roadmaps.

**Target users:** Founders, CTOs, Engineering Heads at 50–500 person tech / IT services companies.

---

## Core Value Proposition

1. **Assess** — Evaluate AI maturity across 7 critical domains in under 10 minutes.
2. **Benchmark** — See where the organization stands on the 5-Stage AI Transformation Framework.
3. **Roadmap** — Receive a personalized AI transformation action plan (90-day + 12-month).

---

## User Flows

### Primary CTA Flow (Homepage → Workspace)

```
Landing page (/)
  └── "Generate My AI Roadmap" button
        ├── Anonymous user  → /login/login.html?redirect=/platform/platform.html
        │                       └── After login → /platform/platform.html
        └── Logged-in user  → /platform/platform.html
```

### Assessment Flow (existing)

```
/dynamic-assessment/start.html → discovery.html → questions.html → scorecard.html
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Landing page is fully anonymous | Homepage must render identically for all visitors — no auth chrome |
| `CTARouter` is the entry point | Single auth-aware routing utility; platform page itself guards against expired tokens |
| `?redirect=` in login URL | Safe post-login redirect pattern; strict allowlist prevents open-redirect |
| Platform page as stub | Scaffolded for future Assessments / Roadmaps / Benchmark / AI Recommendations features |

---

## Recent Changes

### Landing Page Refactored to Fully-Anonymous Marketing Surface (EPIC: SOORGA-EPIC-LANDING-001)

- Landing page (`frontend/index.html`) redesigned as a fully-anonymous marketing surface.
- Hero title updated to: _"Assess. Benchmark. Transform. Build Your AI Transformation Roadmap."_
- Benefits mini cards (Assess / Benchmark / Roadmap) inserted between description and primary CTA.
- Framework section header updated to _"5-Stage AI Transformation Framework"_ with a supporting description.
- All auth-state chrome (My Assessments, user avatar, login/logout) removed from the homepage navbar.
- New auth-aware `CTARouter` (`frontend/shared/ctaRouter.js`) drives users to `/platform/` via login when needed.
- New **Platform Workspace** stub at `frontend/platform/` — auth-guarded, shows 4 placeholder cards.
- `login.js` enhanced with `?redirect=` query-param support (same-origin, strict allowlist).
- Navbar supports `data-nav-mode="anonymous"` flag for homepage; all other pages unchanged.
