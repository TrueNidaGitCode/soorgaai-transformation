# SoorgaAI — User Journey

What an actual customer experiences, screen by screen, end to end. For the admin-side tooling (Company Research Library, Industry KB), see [ADMIN_JOURNEY.md](ADMIN_JOURNEY.md). For how it's all built, see [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Landing page — try before signup

[`frontend/index.html`](frontend/index.html) (`index.js`) is not a marketing splash page — it **is** the entry point. It shows a ChatGPT-style prompt box ("Describe your project and what you want to improve") with the footer text "Free preview, no signup needed." No login required to submit it.

## 2. Guest mode (try-before-login)

Submitting the prompt with no token calls `POST /api/guest/generate-blueprint` ([`guestRoutes.js`](backend/trunida-backend/routes/guestRoutes.js)). This:
- Creates a `TransformationBlueprint` keyed by a random `guestId` (no `userId` yet), rate-limited to 5 generations/24h per IP.
- Seeds all 6 domains as `pending`, but only actually **generates the AI Use Cases domain** (`GUEST_PREVIEW_DOMAIN_IDS = ['ai-use-cases']`) — the rest stay locked until the guest signs up.
- Stores `guestId` in `localStorage`, redirects to `/domain/domain.html`, which shows a "You're previewing as a guest" banner and polls `GET /api/guest/blueprint/:guestId` for progress.

Logging in from that state calls `POST /api/strategy-canvas/claim-guest-blueprint`, which re-parents the guest blueprint onto the new account (only if the user doesn't already have one of their own).

## 3. Auth

Clicking "Log in" opens an in-page modal with two paths, both converging on the same `User` model and a shared 30-day JWT:
- **Google OAuth** — `GET /api/auth/oauth/google`, raw HTTPS calls to Google (no SDK). Gmail addresses typed into the modal are auto-routed here via `login_hint`.
- **Passwordless email OTP** — `POST /api/users/email-otp/request` → `POST /api/users/email-otp/verify`, 6-digit code hashed with a TTL index (`EmailOtp` model), delivered via **Brevo's HTTP API** (Railway blocks outbound SMTP, so this is the only working delivery path in production).

A legacy email+password form still works (`frontend/login/login.html` → `POST /api/users/login`) but isn't the promoted path anymore.

## 4. Onboarding

First login with no `UserProfile` yet redirects to `frontend/profile-setup/profile.html` — one required field, **Organisation Name**, plus an optional "Connect Confluence" card (GitHub/SharePoint shown as disabled "Coming soon"). Submitting:
- Creates a `UserProfile` (`role`/`industryDomain` are silently defaulted — there's no UI to set or edit them yet) and 7 `DomainCanvas` docs.
- Fire-and-forgets `ensureBlueprint()` ([`enterpriseBlueprintService.js`](backend/trunida-backend/services/enterpriseBlueprintService.js)) to auto-create an empty **Enterprise Blueprint** shell for the org — pre-filled from a matching admin-curated `CompanyResearchLibrary` entry if one exists (see Admin Journey).

## 5. Generation

One business-objective prompt fans out across **all 6 enabled domains at once** — AI Use Cases, AI Strategy, Data Readiness, Technology Infrastructure, Skills & Workforce, Governance & Ethics (`config/domainRegistry.js`'s `enabledDomains()` — nothing is hidden in the UI beyond that list). The user watches a live progress screen (`#screen-progress`) — a grid of domains with per-capability status pills (pending/in-progress/completed), driven by an SSE stream (`GET /api/strategy-canvas/generate-transformation/:id/stream`).

## 6. Workspace

Once any capability finishes, the client moves to the workspace (`blueprintWorkspace.js`, ~7,000 lines):
- Left sidebar: domains grouped "Generated" vs "Not generated/Generating."
- A horizontal capability tab bar within the selected domain ("STEP 1 OF N").
- Each capability renders its own bespoke layout (`renderBlueprintContent` dispatches by section title — `buildVisionLayout`, `buildCriticalDataLayout`, etc.).
- **AI Opportunity Discovery** (AI Use Cases domain, the key-differentiator capability — see Architecture doc for its 2-stage reasoning pipeline) gets `buildOpportunityDiscoveryView`: Business Problem cards → a Current Workflow track flagging high-effort steps → an AI Opportunities grid, each opportunity naming which of the company's own products it strengthens when a Capability Map exists.
- An "AI Assistant" chat panel can open alongside any capability to refine it further.

## 7. Export & other screens

- **Export PDF** — button in the workspace header, `GET /api/strategy-canvas/company-blueprint/export-pdf` (`pdfkit`), downloads the rendered blueprint.
- **Knowledge Sources** — connect/sync Confluence spaces as linked project context.
- **Enterprise Blueprint** — the org-level strategy document, visible to CTO/admin roles only.
- **Pricing** — marketing-only; Free links straight into the workspace, paid tiers have no working checkout yet ("available soon").

## Legacy / not part of the current journey

Still present in the codebase but not linked from the current landing page or workspace: `frontend/dynamic-assessment/`, `frontend/assessment/`, `frontend/results/`, `frontend/dashboard/signaldashboard.html`, `frontend/company-strategy/` (explicitly commented as superseded by the server-backed workspace). These belong to an earlier "AI Maturity Assessment" version of the product. Don't treat them as current when reasoning about the product.
