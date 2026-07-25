# SoorgaAI — Technology Stack

Code-level stack (frameworks, libraries, providers). For hosting/deploy steps and environment variables, see [DEPLOY_SOORGAAI.md](DEPLOY_SOORGAAI.md).

## Frontend (`frontend/`)

- **Plain HTML/CSS/JavaScript** — no UI framework (no React/Vue/Angular). Pages are static HTML files with ES module `<script type="module">` entry points per page (e.g. `index.js`, `domain/blueprintWorkspace.js`, `login/login.js`).
- **Vitest + jsdom** — unit test suite (`frontend/package.json`, `frontend/__tests__/`).
- Served as static files by **Vercel** — no build step.

## Backend (`backend/trunida-backend/`)

- **Node.js + Express 4** — REST API server (`server.js`).
- **Mongoose 7** — MongoDB ODM.
- **Vitest** — backend test suite.
- ES modules throughout (`"type": "module"`).

## Database

- **MongoDB Atlas** — single cluster. Note: the connection string in use has no db name in the path, so Mongoose defaults to a database named `test` (not `soorgaai`) — this is where all real collections (`users`, `transformationblueprints`, `userprofiles`, etc.) actually live.

## Authentication

Three sign-in paths, all converging on the same `User` model and a shared 30-day JWT:

- **JWT** (`jsonwebtoken`) — session tokens, 30-day expiry.
- **Email/password** — `bcryptjs` for hashing (legacy path, still supported).
- **Google OAuth** — implemented as raw HTTPS calls to Google's OAuth endpoints (no SDK). Gmail addresses typed into the login modal are routed here automatically via `login_hint`.
- **Passwordless email OTP** — 6-digit codes, hashed and stored with a TTL index (`EmailOtp` model), delivered via **Brevo's HTTP API**. `nodemailer` is present as an SMTP fallback but is not viable in production — **Railway blocks outbound SMTP**, so Brevo (HTTPS) is the only working delivery path there.
- Microsoft OAuth exists in the codebase but is **not configured** in production (no client ID set in Railway).

## AI / LLM

- **`@anthropic-ai/sdk`** (Claude) — used for blueprint/capability generation.
- **`@google/generative-ai`** (Gemini) and **`openai`** — additional providers behind a configurable failover chain (`services/llmService.js`). Default order: `gemini → claude → openai`, overridable via the `PROVIDER_CHAIN` env var.
- A separate Python pipeline exists under `knowledge_base/automotive/` (loader → embedding → vector store → hybrid retrieval → context builder → strategy response engine) but is **not wired into** the Node backend — orphaned/parallel scaffolding.
- Blueprint generation is grounded with static-file RAG: capability content from `knowledge_base/automotive/enterprise_ai/` is read directly off disk and injected into the LLM prompt (no embeddings/vector DB in the live path).

## PDF Export

- **`puppeteer-core`** — renders an HTML blueprint layout to PDF via headless Chrome (`services/pdfTemplateService.js` + `services/pdfExportService.js`).
- **`pdfkit`** — present as a dependency; not the primary export path.

## Deployment

| Layer | Host | Notes |
|---|---|---|
| Frontend | **Vercel** | Static files, root directory `frontend/`, no build step |
| Backend | **Railway** | `backend/trunida-backend`, auto-deploys on push to `main` |
| Database | **MongoDB Atlas** | Free M0 tier |
| Email delivery | **Brevo** | HTTP API; required because Railway blocks outbound SMTP |

Full deployment/setup instructions: [DEPLOY_SOORGAAI.md](DEPLOY_SOORGAAI.md).
