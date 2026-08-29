# Defect Matching Agent

Retrieval-Augmented Semantic Matching for Defects — describe a new test
failure, get back a suggested root cause plus the historical defect
records it was matched against. Delivered by Svarg's Eame layer as a
real, standalone, deployable project — not a snippet.

## How it works

1. **`services/embeddingService.js`** — embeds text (OpenAI by default,
   or a self-hosted model — see below).
2. **`services/hybridRetrievalService.js`** — embeds the new failure
   description and finds the closest historical `DefectRecord`s in
   MongoDB Atlas Vector Search.
3. **`services/modelSelectionService.js`** + **`config/modelCatalog.js`**
   — picks which LLM answers, by Quality/Cost/Performance tradeoff
   (`frontier` = highest quality cloud model, `open-weight` = a
   self-hosted model, `auto` = the resilient failover chain).
4. **`services/llmService.js`** — calls that model with the retrieved
   matches as context.
5. **`services/defectMatchingService.js`** — ties the above together;
   **`controllers/defectMatchingController.js`** exposes it as
   `POST /api/defect-matching/match`.

## Setup

```bash
npm install
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, and at least one LLM key
npm run seed            # loads 14 synthetic OTA/ECU defect records
npm start
```

Open `frontend/index.html` directly in a browser (or serve it with any
static server), run `npm run mint-token` and paste the token into the
"Dev token" bar at the top of the page — there's no signup/login system
in this starter kit, that's the whole substitute for one.

Test the API directly:

```bash
npm run mint-token   # prints a ready-to-use curl command
```

## Bringing in real defect data

`npm run seed` loads synthetic, representative records so the app is
immediately testable. To pull in real data instead:

- **From Jira** — see [JIRA_INTEGRATION.md](./JIRA_INTEGRATION.md) (real,
  working OAuth integration included in this repo, `services/jira*.js` +
  `controllers/jiraController.js`).
- **From anywhere else** — insert directly into the `DefectRecord`
  collection (see `models/DefectRecord.js` for the shape), then call
  `syncDefectRecordToChunk()` from `services/hybridRetrievalService.js`
  to index it for retrieval. `scripts/seed_defect_records.mjs` is the
  simplest working example of both steps.

## Self-hosted / open-weight models

Both generation and embeddings can point at a self-hosted, Ollama-
compatible endpoint instead of a cloud API — set `EMBEDDING_PROVIDER`,
`SELFHOSTED_BASE_URL`, and add `selfhosted` to `PROVIDER_CHAIN`. See the
comments in `.env.example`.

## Deploy

**Backend (Railway, or any Node host):**

1. Push this repo to GitHub (Eame already did this for you, if you're
   reading this from that repo).
2. Create a new Railway project → **Deploy from GitHub repo**.
3. Railway auto-detects Node.js from `package.json`; if it asks, the
   start command is `npm start`.
4. Add environment variables under the **Variables** tab — same keys as
   `.env.example`.
5. Deploy. You'll get a URL like `https://your-app.up.railway.app`.

**Frontend:** `frontend/` is fully static — drag the folder into any
static host (Vercel, Netlify, GitHub Pages), or serve it from the same
Node process if you prefer (add `express.static('frontend')` to
`server.js`). Update `frontend/config.js`'s `API_BASE` to your deployed
backend URL either way.

**MongoDB:** any MongoDB Atlas cluster with Vector Search enabled — the
free M0 tier works for this. `hybridRetrievalService.js` creates its
Atlas Search index automatically on first use.

## What's deliberately not included

No user signup/login system (see "Setup" above), no admin UI, no
multi-tenant org model — this is the one capability, built to be read,
run, and extended, not a framework. Auth is a single shared JWT secret
(`middleware/authMiddleware.js`) — swap in real user accounts before
using this with more than one person's data.
