# SoorgaAI — System Architecture Document
**Version:** 2.0.0  
**Date:** May 2026  
**Product:** SoorgaAI — AI Maturity Assessment Platform

---

## 1. Product Overview

SoorgaAI helps organizations measure their AI readiness across 7 domains and 35 questions. It produces a maturity score (0–100), places the organization on a 5-stage maturity ladder, and generates a Claude-powered AI report with strengths, gaps, priorities, and a 12-month roadmap.

### Core User Journey
```
Land on homepage
    → Sign Up / Log In
    → Complete Assessment (7 domains × 5 questions)
    → View Results (scores + maturity stage)
    → Generate AI Report (Claude-powered)
    → Book Consultation (CTA)
```

---

## 2. System Architecture

### High-Level Deployment
```
┌──────────────────────────────────────────────────────────┐
│                        USERS                             │
└──────────────────────────┬───────────────────────────────┘
                           │  HTTPS
                           ▼
┌──────────────────────────────────────────────────────────┐
│              VERCEL  (Frontend CDN)                      │
│  Static HTML/CSS/JS served from /frontend                │
│  URL: soorgaai-transformation.vercel.app                 │
└──────────────────────────┬───────────────────────────────┘
                           │  REST API calls (HTTPS)
                           ▼
┌──────────────────────────────────────────────────────────┐
│            RAILWAY  (Backend — Node.js/Express)          │
│  URL: truenidawebsite-production.up.railway.app          │
│  Port: auto-assigned by Railway (process.env.PORT)       │
└────────────┬─────────────────────────┬───────────────────┘
             │  MongoDB Driver          │  Anthropic SDK
             ▼                         ▼
┌────────────────────┐     ┌───────────────────────────────┐
│  MongoDB Atlas     │     │  Anthropic API                │
│  Cluster: M0 Free  │     │  Model: claude-sonnet-4-6     │
│  DB: soorgaai      │     │  Used for: AI Report gen only │
└────────────────────┘     └───────────────────────────────┘
```

### Infrastructure Summary
| Layer | Service | Notes |
|-------|---------|-------|
| Frontend | Vercel (Hobby — Free) | Static file CDN |
| Backend | Railway (~$5/month) | Node.js container |
| Database | MongoDB Atlas M0 (Free) | 512MB, shared cluster |
| AI | Anthropic API | Pay-per-use ~$0.003/report |
| Auth | JWT (self-managed) | No third-party auth service |
| CI/CD | Auto-deploy on git push | Both Railway + Vercel |

---

## 3. Backend Architecture

### Technology Stack
- **Runtime:** Node.js 20
- **Framework:** Express.js (ESM modules — `import/export`)
- **Database ORM:** Mongoose 7+
- **Auth:** JWT (`jsonwebtoken`) + `bcryptjs` for password hashing
- **AI:** `@anthropic-ai/sdk`
- **Config:** `dotenv`

### Directory Structure
```
backend/trunida-backend/
├── server.js                    ← Express app entry point
├── package.json                 ← soorgaai-backend v2.0.0
├── .env                         ← Local only (gitignored)
├── .env.example                 ← Template for all env vars
│
├── routes/
│   ├── userRoutes.js            ← /api/users/*
│   └── assessmentRoutes.js      ← /api/assessment/*
│
├── controllers/
│   ├── authController.js        ← signup, login, me, password reset
│   └── assessmentController.js  ← 7 assessment handlers
│
├── models/
│   ├── user.js                  ← User schema
│   ├── AssessmentResponse.js    ← Assessment answers + scores
│   └── AssessmentReport.js      ← Claude-generated report
│
├── middleware/
│   ├── authMiddleware.js        ← protect() — JWT verification
│   └── adminMiddleware.js       ← adminOnly() — role check
│
├── services/
│   ├── scoringEngine.js         ← Domain + overall scoring
│   └── reportGenerationService.js ← Claude AI report generation
│
└── data/
    └── assessmentQuestions.js   ← Question bank (35 questions, 7 domains)
```

### Server Bootstrap Sequence
```
1. dotenv.config()                  ← Load env variables
2. express() + cors() + json()      ← Middleware setup
3. connectDB()                      ← MongoDB Atlas connect
4. Register routes                  ← /api/users, /api/assessment
5. app.listen(process.env.PORT)     ← Start server
```

> ⚠️ **Critical:** Do NOT set PORT in Railway Variables. Railway injects PORT automatically. The app uses `process.env.PORT || 3000` — Railway's PORT takes precedence.

---

## 4. API Endpoints

### Base URL
- **Production:** `https://truenidawebsite-production.up.railway.app`
- **Local:** `http://localhost:3000`

### Authentication Routes — `/api/users`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/users/signup` | Public | Register new user |
| POST | `/api/users/login` | Public | Login → returns JWT |
| GET | `/api/users/me` | Bearer token | Get user profile |
| POST | `/api/users/forgot-password` | Public | Request password reset |
| POST | `/api/users/reset-password` | Public | Reset with token |

### Assessment Routes — `/api/assessment`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/assessment/questions` | Public | Returns 35 questions across 7 domains |
| POST | `/api/assessment/submit` | Bearer token | Submit answers → score + stage |
| GET | `/api/assessment/results/:id` | Bearer token | Get scores for one assessment |
| POST | `/api/assessment/report/:id` | Bearer token | Generate AI report (idempotent) |
| GET | `/api/assessment/report/:id` | Bearer token | Fetch existing report |
| GET | `/api/assessment/my-assessments` | Bearer token | User's assessment history |
| GET | `/api/assessment/admin/all` | Admin token | All users' assessments + stats |

### Health Check
| Method | Endpoint | Auth | Response |
|--------|----------|------|----------|
| GET | `/` | Public | `{ message, version, product }` |

---

## 5. Authentication Flow

```
[Sign Up]
  POST /api/users/signup
  Body: { name, email, password }
  → bcrypt.hash(password, 10)
  → Save to MongoDB
  → Return: { msg: "Signup Successful" }

[Login]
  POST /api/users/login
  Body: { email, password }
  → Find user by email
  → bcrypt.compare(password, hash)
  → jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "1h" })
  → Return: { token, username, role }

[Authenticated Requests]
  Header: Authorization: Bearer <token>
  → protect() middleware decodes JWT
  → Attaches req.user = { _id, id, role }
  → Controller runs

[Admin Requests]
  → protect() runs first
  → adminOnly() fetches user from DB, checks role === 'admin'
  → Controller runs
```

### JWT Payload Structure
```json
{
  "userId": "MongoDB ObjectId",
  "role": "user | admin",
  "iat": 1234567890,
  "exp": 1234571490
}
```

---

## 6. Assessment Engine

### Question Bank Structure
```
7 Domains × 5 Questions = 35 Total Questions

Domains:
  1. AI Strategy & Vision
  2. Data Readiness
  3. Technology & Infrastructure
  4. AI Use Cases & Applications
  5. Skills & Workforce
  6. Leadership & Culture
  7. Governance, Ethics & Security

Each question has 5 answer options (Likert scale: value 1–5)
```

### Scoring Formula
```
Domain Score  = (average raw answer / 5) × 100      → 0 to 100
Overall Score = average of all 7 domain scores       → 0 to 100
```

### Maturity Stages
| Stage | Score Range | Description |
|-------|-------------|-------------|
| AI Scramble | 0–20 | Ad hoc, no strategy |
| AI Pivot | 21–40 | Early pilots, siloed |
| AI Alignment | 41–60 | Strategy forming, cross-functional |
| AI Transform | 61–80 | AI embedded in core processes |
| AI-Fueled Enterprise | 81–100 | AI as competitive differentiator |

### Scoring Pipeline
```
rawAnswers[]
    ↓ validateAndEnrichAnswers()
        → Check: exactly 35 answers
        → Check: all questionIds valid
        → Check: values are integers 1–5
        → Enrich: add domainId, domainName to each answer
    ↓ calculateDomainScores()
        → Group by domain
        → Average raw values per domain
        → Convert to 0–100 score
    ↓ calculateOverallScore()
        → Average of 7 domain scores
    ↓ getMaturityStage()
        → Match score range to stage
    → Save AssessmentResponse to MongoDB
```

---

## 7. AI Report Generation

### Trigger
- User clicks "Generate Report" on results page
- `POST /api/assessment/report/:assessmentId`
- **Idempotent:** If report already exists, returns cached report immediately

### Claude Integration
```
Model:      claude-sonnet-4-6
Max tokens: 3,000
Input:      Organization context + all 7 domain scores
Output:     Structured JSON report
```

### Report Structure (Stored in MongoDB)
```json
{
  "executiveSummary": "3–4 paragraph narrative",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "criticalGaps": ["gap 1", "gap 2", "gap 3"],
  "topPriorities": ["priority 1", "priority 2", "priority 3"],
  "roadmap90Days": [
    { "title": "", "description": "", "domain": "", "priority": "High|Medium|Low" }
  ],
  "roadmap12Months": [
    { "title": "Milestone (Month X–Y)", "description": "", "domain": "", "priority": "" }
  ],
  "modelUsed": "claude-sonnet-4-6",
  "generatedAt": "ISO date"
}
```

### Fallback Behaviour
If `ANTHROPIC_API_KEY` is missing or Claude call fails → auto-generates a **template-based report** using the domain scores. The user always gets a report — never a blank screen.

### Report Generation Flow
```
POST /report/:assessmentId
    ↓ Load AssessmentResponse from DB
    ↓ Check if report already exists → return cached
    ↓ Build prompt (scores + org context)
    ↓ Call Claude API (15–30 seconds)
    ↓ Parse + validate JSON response
    ↓ Save AssessmentReport to MongoDB
    ↓ Update AssessmentResponse.reportGenerated = true
    → Return report to frontend
```

---

## 8. Data Models

### User
```
_id          ObjectId (auto)
name         String (required)
email        String (required, unique)
password     String (bcrypt hash)
role         String (enum: 'user' | 'admin', default: 'user')
resetPasswordToken   String
resetPasswordExpires Date
createdAt    Date (auto)
updatedAt    Date (auto)
```

### AssessmentResponse
```
_id           ObjectId (auto)
userId        ObjectId → ref: User (indexed)
orgName       String
orgSize       String ('1–50' | '51–200' | '201–1000' | '1000+')
industry      String
answers[]     Array of 35 answers
  ├─ questionId  String
  ├─ domainId    String
  ├─ domainName  String
  └─ value       Number (1–5)
domainScores[] Array of 7 scores
  ├─ domainId    String
  ├─ domainName  String
  ├─ score       Number (0–100)
  ├─ rawAverage  Number
  └─ questionCount Number
overallScore  Number (0–100)
maturityStage String (enum: 5 stages)
reportGenerated Boolean (default: false)
reportId      ObjectId → ref: AssessmentReport
completedAt   Date
```
**Indexes:** `{ userId: 1, completedAt: -1 }`

### AssessmentReport
```
_id                  ObjectId (auto)
assessmentResponseId ObjectId → ref: AssessmentResponse (unique)
userId               ObjectId → ref: User (indexed)
overallScore         Number
maturityStage        String
domainScores         Array
executiveSummary     String
strengths[]          String[1–5]
criticalGaps[]       String[1–5]
topPriorities[]      String[1–3]
roadmap90Days[]      RoadmapItem[4]
roadmap12Months[]    RoadmapItem[5]
modelUsed            String (default: 'claude-sonnet-4-6')
generatedAt          Date
```

---

## 9. Frontend Architecture

### Technology
- **Pure vanilla HTML / CSS / JavaScript** — no framework, no build step
- Served as static files from Vercel
- Auth state: JWT stored in `localStorage`

### Page Structure
```
frontend/
├── index.html              ← Landing page (public)
├── home.css
│
├── login/
│   ├── login.html          ← Login page
│   ├── signup.html         ← Signup page
│   ├── login.css
│   └── config.js           ← ⭐ Central API config (all endpoints here)
│
├── navbar/
│   ├── navbar.html         ← Injected into all pages
│   └── navbar.js           ← Auth-aware navigation
│
├── assessment/
│   ├── assessment.html     ← Multi-step form (9 steps)
│   ├── assessment.css
│   └── assessment.js       ← Form logic, validation, localStorage save
│
└── results/
    ├── results.html        ← Results dashboard
    ├── results.css
    └── results.js          ← Load results + trigger/render AI report
```

### config.js — Central API Configuration
All API endpoints are defined in one place: `frontend/login/config.js`

```javascript
const API_BASE_URL = isLocalhost
  ? 'http://localhost:3000'
  : 'https://truenidawebsite-production.up.railway.app';

window.CONFIG = {
  AUTH: { REGISTER, LOGIN, VERIFY, FORGOT_PASSWORD, RESET_PASSWORD },
  ASSESSMENT: { QUESTIONS, SUBMIT, MY_ASSESSMENTS, RESULTS(id), GEN_REPORT(id), GET_REPORT(id), ADMIN_ALL }
}
```

### Assessment Form — 9 Steps
```
Step 0: Organisation context (name, size, industry)
Steps 1–7: One domain per step (5 questions each)
Step 8: Review and submit
```
- Auto-saves to `localStorage` on each step
- Validates all 5 questions answered before allowing next step
- On submit: calls `POST /api/assessment/submit` → redirects to `/results/results.html?id=<assessmentId>`

### Results Page
- Loads assessment by `?id=` URL parameter (or fetches latest if no ID)
- Displays: overall score, maturity stage badge, 7 domain score bars
- "Generate AI Report" button → calls `POST /api/assessment/report/:id` → renders report sections
- "Book Consultation" button → opens `mailto:` link

---

## 10. Environment Variables

### Railway (Backend — Production)
```env
NODE_ENV=production
# ⚠️ Do NOT set PORT — Railway injects it automatically
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/soorgaai?retryWrites=true&w=majority&appName=<AppName>
JWT_SECRET=<64-char random hex>
ANTHROPIC_API_KEY=sk-ant-...
FRONTEND_URL=https://soorgaai-transformation.vercel.app
```

### Local Development (.env — gitignored)
```env
NODE_ENV=development
PORT=3000
MONGO_URI=<same Atlas URI or local mongo>
JWT_SECRET=<same secret>
ANTHROPIC_API_KEY=sk-ant-...
FRONTEND_URL=http://localhost:5500
```

### Vercel (Frontend)
No environment variables needed — all config lives in `frontend/login/config.js`.

---

## 11. Security

| Concern | Implementation |
|---------|----------------|
| Password storage | bcrypt hash (salt rounds: 10) |
| Auth tokens | JWT, 1-hour expiry |
| Route protection | `protect` middleware on all private routes |
| Admin routes | `protect` + `adminOnly` (checks DB role) |
| CORS | Whitelist: Vercel URL + localhost only |
| Secrets | `.env` gitignored; Railway Variables for production |
| Data isolation | Users can only access their own assessments |
| API key | ANTHROPIC_API_KEY never sent to frontend |

---

## 12. CORS Configuration

Allowed origins (defined in `server.js`):
```javascript
origin: [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://soorgaai.com',
  'https://www.soorgaai.com',
  'https://*.vercel.app',
  process.env.FRONTEND_URL        // ← Railway variable
]
```

---

## 13. CI/CD — Auto-Deploy Pipeline

```
Developer pushes to main branch on GitHub
    ↓
    ├── Railway detects push
    │     → Runs: cd backend/trunida-backend && npm install
    │     → Runs: cd backend/trunida-backend && npm start
    │     → Deploy time: 2–3 minutes
    │
    └── Vercel detects push
          → Serves static files from /frontend
          → Deploy time: 30–60 seconds
```

**Config files:**
- `railway.toml` — Build + start commands, restart policy
- `nixpacks.toml` — Node.js 20 runtime spec
- `vercel.json` — Output directory, rewrites, security headers

---

## 14. Known Constraints & Current Limitations

| Area | Current State | Notes |
|------|--------------|-------|
| Assessment retake | Unlimited retakes allowed | No cooldown period |
| Report generation | One report per assessment (idempotent) | Re-generates if DB record missing |
| Email | Password reset token returned in API response (dev mode) | No email sending yet |
| Assessment history | Capped at 20 most recent per user | Admin view: 100 |
| AI report time | 15–30 seconds | Claude API latency |
| Auth token expiry | 1 hour | No refresh token |
| Multi-tenancy | Single tenant | No org-level accounts |
| Payments | None | No paywall on assessment |

---

## 15. Suggested Areas for New Requirements

The following are natural extension points for the next version:

1. **Multi-tenancy** — Organisation accounts, team assessments, aggregate org-level scoring
2. **Retake comparisons** — Track score progression over time, delta charts
3. **Email delivery** — Send PDF report via email (nodemailer already scaffolded)
4. **Payment gate** — Stripe paywall before generating AI report
5. **Benchmark data** — Compare scores against industry averages
6. **Admin dashboard** — UI for viewing all assessments, stage distribution charts
7. **Custom domains** — soorgaai.com pointing to Vercel
8. **Refresh tokens** — Extend 1-hour JWT session
9. **Assessment versioning** — Track when question bank changes
10. **Webhooks / CRM** — Push completed assessments to HubSpot/Salesforce

---

*Document generated from live codebase — May 2026*

---

## 16. Knowledge Base Architecture (SoorgaAI Intelligence Platform)

**Added:** June 2026  
**Scope:** Persistent enterprise AI transformation knowledge powering SoorgaAI agents

---

### 16.1 Overview

The Knowledge Base is SoorgaAI's intelligence backbone. It provides structured,
reusable knowledge that AI agents use to generate enterprise AI transformation guidance.

It is distinct from the assessment engine knowledge base (`backend/trunida-backend/knowledge-base/`),
which serves the dynamic assessment flow. The enterprise KB is a strategic intelligence layer
designed for long-term reuse across multiple automotive organizations.

**Root path:** `knowledge_base/automotive/`

---

### 16.2 Five-Layer Intelligence Architecture

```
Layer 1 — Core Assets
│   Universal AI transformation principles.
│   Industry-agnostic. Owned by SoorgaAI. Updated rarely.
│   Path: enterprise_ai/AI_Strategy/Core/
│
Layer 2 — Industry Templates (Automotive)
│   Automotive-specific application of Core principles.
│   Owned by SoorgaAI. Updated periodically.
│   Path: enterprise_ai/AI_Strategy/Automotive/
│
Layer 3 — Company Customization
│   CTO adapts Automotive guidance to organization priorities.
│   Owned by customer CTO. Per-company instance.
│   Path: enterprise_ai/AI_Strategy/Templates/Company_AI_Strategy_Template.md
│
Layer 4 — Domain Consumption
│   Engineering and business leaders execute company strategy.
│   Owned by domain leaders. Per-domain instance.
│   Path: enterprise_ai/AI_Strategy/Templates/Domain_AI_Strategy_Template.md
│
Layer 5 — Learning Feedback
    Outcomes from company implementations inform Automotive document improvements.
    Only mature cross-company patterns influence Core Assets.
```

---

### 16.3 Folder Structure

```
knowledge_base/
└── automotive/
    ├── README.md                          ← Navigation map + retrieval sequence
    │
    ├── enterprise_ai/                     ← Seven SoorgaAI transformation domains
    │   ├── README.md
    │   ├── AI_Strategy/                   ← ✓ Fully implemented (v1.0)
    │   │   ├── README.md                  ← Architecture map + governance rules
    │   │   ├── Core/                      ← Universal principles (6 documents)
    │   │   │   ├── AI_Strategy_Intelligence_Specification.md
    │   │   │   ├── AI_Initiative_Leadership.md
    │   │   │   ├── Business_Strategy_Alignment.md
    │   │   │   ├── AI_Center_of_Excellence.md
    │   │   │   ├── AI_Performance_Management.md
    │   │   │   └── AI_Governance_Ethics.md
    │   │   ├── Automotive/                ← Industry applications (6 documents)
    │   │   │   ├── Automotive_AI_Strategy_Intelligence_Specification.md
    │   │   │   ├── Automotive_AI_Initiative_Leadership.md
    │   │   │   ├── Automotive_Business_Strategy_Alignment.md
    │   │   │   ├── Automotive_AI_Center_of_Excellence.md
    │   │   │   ├── Automotive_AI_Performance_Management.md
    │   │   │   └── Automotive_AI_Governance_Ethics.md
    │   │   └── Templates/                 ← Customization layer (2 documents)
    │   │       ├── Company_AI_Strategy_Template.md
    │   │       └── Domain_AI_Strategy_Template.md
    │   ├── Leadership/README.md           ← Coming Soon
    │   ├── AI_Use_Cases/README.md         ← Coming Soon
    │   ├── Data_Readiness/README.md       ← Coming Soon
    │   ├── Technology_Infrastructure/README.md  ← Coming Soon
    │   ├── Skills_Workforce/README.md     ← Coming Soon
    │   └── Governance_Security/README.md  ← Coming Soon
    │
    ├── business_domains/                  ← Automotive domain adaptations
    │   ├── README.md
    │   ├── Diagnostics/README.md
    │   ├── ADAS/README.md
    │   ├── Connectivity/README.md
    │   ├── Infotainment/README.md
    │   ├── Validation/README.md
    │   ├── Manufacturing/README.md
    │   └── SDV/README.md
    │
    ├── enterprise_patterns/               ← Reusable enterprise AI concepts
    │   ├── README.md
    │   ├── AI_CoE.md
    │   ├── AI_Governance.md
    │   ├── AI_ROI.md
    │   ├── AI_Operating_Model.md
    │   └── Change_Management.md
    │
    └── shared/                            ← Common automotive AI reference
        ├── README.md
        ├── Automotive_AI_Glossary.md
        ├── Automotive_AI_Trends.md
        ├── Regulations.md
        └── Best_Practices.md
```

---

### 16.4 AI Agent Retrieval Sequence

```
Query enters SoorgaAI AI Strategy agent
        ↓
1. Enterprise AI Domain intelligence
   → enterprise_ai/AI_Strategy/Core/
   → enterprise_ai/AI_Strategy/Automotive/
        ↓
2. Automotive Business Domain context
   → business_domains/[relevant domain]/
        ↓
3. Enterprise Pattern
   → enterprise_patterns/
        ↓
4. Shared Context
   → shared/
        ↓
5. Generate organization-specific guidance
   combining all retrieved context layers
```

---

### 16.5 Knowledge Base Governance Rules

| Rule | Description |
|------|-------------|
| No duplication | Automotive documents reference Core — never copy Core content |
| Stable Core | Core documents change only when cross-company patterns mature |
| Template ownership | Company and Domain templates are customer-owned, not SoorgaAI-owned |
| Versioning | All documents carry a version number and layer declaration |
| Retrieval order | Core → Automotive → Company → Domain (never reversed) |
| Feedback loop | Company outcomes inform Automotive improvements; Automotive learnings inform Core |

---

### 16.6 Relationship to Assessment Engine KB

| | Assessment Engine KB | Enterprise Intelligence KB |
|-|---------------------|---------------------------|
| **Path** | `backend/trunida-backend/knowledge-base/` | `knowledge_base/automotive/` |
| **Format** | JSON + Markdown | Markdown only |
| **Purpose** | Dynamic assessment question generation and scoring | Enterprise AI transformation strategy guidance |
| **Consumer** | `kbRetrievalService.js` (RAG) | AI Strategy agent (future) |
| **Scope** | AI maturity stages + focus areas | Full 7-domain enterprise transformation |
| **Lifecycle** | Tied to assessment session | Long-lived, multi-company reuse |


---

## v1.1 Addition: Dynamic Assessment Intelligence Engine (SOORGA-EPIC-ASMT-002)

### New Backend Components

#### Knowledge Base (backend/trunida-backend/knowledge-base/)
- maturity-stages.json     -- 5 AI maturity stages with descriptions, score bands, characteristics
- focus-areas.json         -- 7 capability domains with executive focus and probe areas
- domain-studies/automotive.md -- Automotive AI transformation study (sub-domains, pain points, benchmarks)

#### New Mongoose Model
- models/AssessmentSession.js  -- Full session lifecycle: registration, discovery, questions, answers, scores

#### New Services
- services/kbRetrievalService.js        -- File-based KB loader with in-memory cache; retrieveContext() RAG interface
- services/discoveryService.js          -- Claude-powered company -> domain classification with fallback
- services/questionGenerationService.js -- Claude-powered question generation (up to 20); template fallback
- services/dynamicScoringService.js     -- Focus-area and overall scoring using KB stage bands

#### New Controller
- controllers/dynamicAssessmentController.js -- 6 handlers: startSession, discoverDomain, generateSessionQuestions, submitAnswer, getSession, scoreSession

#### New Routes
- routes/dynamicAssessmentRoutes.js -- Mounted at /api/assessment/dynamic

#### Modified
- middleware/authMiddleware.js -- Added optionalAuth() for anonymous-friendly routes
- server.js                   -- Mounts dynamic routes + warmCache() on startup

### New API Routes (/api/assessment/dynamic)

POST   /sessions                    -- Start session (name, role, companyName)
POST   /sessions/:id/discover       -- Claude domain discovery
POST   /sessions/:id/questions      -- KB + Claude question generation
POST   /sessions/:id/answers        -- Submit one answer
GET    /sessions/:id                -- Get session state (resume support)
POST   /sessions/:id/score          -- Compute final scorecard

### New Frontend (frontend/dynamic-assessment/)

- start.html        -- Registration (name, role, company)
- discovery.html    -- Loading animation + personalized welcome
- questions.html    -- One-question-at-a-time with progress bar
- scorecard.html    -- Score hero, focus area bars, stage ladder, CTA
- dynamic-assessment.css -- Shared styles (matches existing design system)
- dynamic-assessment.js  -- Shared utilities (error, auth, session guard)

### Updated
- frontend/login/config.js  -- Added CONFIG.DYNAMIC.* endpoints
- frontend/index.html       -- Added Personalized Assessment CTA button
- frontend/style.css        -- Added .cta-button--primary / --secondary variants

### Architecture Notes

- Parallel to v1: existing /api/assessment/* and /assessment/* are untouched
- Anonymous flow: no login required (JWT linked if present)
- Extensible KB: add Healthcare/Finance/Manufacturing/Retail by dropping new files into domain-studies/
- All Claude calls have deterministic fallbacks (no blocking failures)
- Session state persisted to MongoDB (AssessmentSession) for resume support
- localStorage keys: da_sessionId, da_companyName, da_name, da_role, da_domain, da_totalQuestions, da_answers, da_score
