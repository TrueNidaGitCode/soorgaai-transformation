# Jira integration (optional)

Pulls issues from a real Jira Cloud project straight into `DefectRecord`s,
instead of (or alongside) `npm run seed`'s synthetic data. Each linked
issue is redacted, LLM-structured, and indexed for retrieval exactly the
same way a seeded record is — the matching endpoint doesn't know the
difference.

Skip this section entirely if you don't need it — the app runs fine
without it configured; `/api/jira/*` routes just return a clear
"not configured" error until you do.

## 1. Register an Atlassian OAuth 2.0 (3LO) app

1. Go to https://developer.atlassian.com/console/myapps/ and create a new
   OAuth 2.0 app.
2. Under **Permissions**, add the **Jira API** and grant the
   `read:jira-work` scope specifically — this is a Jira Cloud "granular"
   scope, not bundled into the default classic scopes, so it has to be
   added explicitly or every Jira call will 403.
3. Under **Authorization**, set the callback URL to
   `{YOUR_API_BASE}/api/jira/callback` (e.g.
   `http://localhost:3000/api/jira/callback` for local dev, or your
   deployed backend's URL in production).
4. Copy the **Client ID** and **Client Secret**.

## 2. Configure environment variables

```
ATLASSIAN_OAUTH_CLIENT_ID=...
ATLASSIAN_OAUTH_CLIENT_SECRET=...
ATLASSIAN_OAUTH_CALLBACK_URL=http://localhost:3000/api/jira/callback
TOKEN_ENCRYPTION_KEY=...   # 32 random bytes, base64 — generate with:
                            # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
FRONTEND_URL=http://localhost:5500
```

Optional — tag linked records with your own org context (defaults shown):

```
DEFECT_ORG_NAME=My Organization
DEFECT_INDUSTRY=General
DEFECT_SYSTEM=
```

## 3. Connect and link issues

1. `GET /api/jira/connect` (with an `Authorization: Bearer <token>` header
   — use `npm run mint-token`) returns `{ url }`. Open that URL in a
   browser to grant access; Atlassian redirects back to
   `/api/jira/callback`, which stores the encrypted token and redirects to
   `FRONTEND_URL`.
2. `GET /api/jira/status` → `{ connected, siteName, jiraScopeGranted }`.
3. `GET /api/jira/projects` → list of Jira projects on that site.
4. `GET /api/jira/projects/:projectKey/issues` → issues in a project.
5. `POST /api/jira/link` with `{ "issues": [{ "issueKey": "PROJ-123" }] }`
   (max 30 per request) — fetches each issue's description + comments,
   redacts obvious PII (emails, phone numbers, IPs, VIN-like strings),
   asks the LLM to structure it into `{title, symptom, rootCause,
   resolution, component, severity, keywords}`, and upserts a
   `DefectRecord`. Re-linking an unchanged issue is a no-op (content-hash
   check) — safe to re-run.

## Known gotcha

Jira Cloud deprecated `GET /rest/api/3/search` in favor of
`POST /rest/api/3/search/jql` (token-based pagination via
`nextPageToken`, not `startAt`/`total`). `services/jiraApiService.js`
already uses the current endpoint — flagging it here in case you extend
this yourself and reach for the old one from older Jira API examples
online.
