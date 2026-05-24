# 🚀 SoorgaAI — Deployment Guide
**Stack:** Railway (backend) · Vercel (frontend) · MongoDB Atlas (database)

---

## Architecture

```
Users → Vercel (frontend CDN)
              ↓ API calls
        Railway (Node/Express backend)
              ↓ DB queries
        MongoDB Atlas
```

---

## Prerequisites — What You Need Before Starting

| What | Where to get it |
|------|----------------|
| MongoDB Atlas URI | Your existing Atlas cluster → Connect → Drivers |
| Anthropic API key | https://console.anthropic.com/api-keys (new key) |
| JWT Secret | Generated below ✅ |

**Your generated JWT Secret (save this):**
```
b1b96c88a368d0f589b29c927b5ec980de0cb05cb162b8103768952d6af0144519c5734391bb9d1e5961db2e69d6eb9ebeb1403baac700abcda26ad90d65bb59
```

---

## Part 1 — Railway (Backend)

### Step 1: Reconnect repo to new project

1. Go to **[railway.app](https://railway.app)** → your existing project
2. Click your backend service → **Settings**
3. Under **Source** → click **"Change Source"**
4. Select: `TrueNidaGitCode/soorgaai-transformation`
5. Branch: `main`

> If you can't change source, create a **New Service** → Deploy from GitHub → select `soorgaai-transformation`

### Step 2: Set build settings

In **Settings → Build**:

| Setting | Value |
|---------|-------|
| Build Command | `cd backend/trunida-backend && npm install` |
| Start Command | `cd backend/trunida-backend && npm start` |
| Watch Paths | `backend/**` |

> ✅ `railway.toml` and `nixpacks.toml` already have these configured — Railway may pick them up automatically.

### Step 3: Set environment variables

Go to **Variables** tab → **RAW Editor** → paste:

```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://<your-atlas-uri>
JWT_SECRET=b1b96c88a368d0f589b29c927b5ec980de0cb05cb162b8103768952d6af0144519c5734391bb9d1e5961db2e69d6eb9ebeb1403baac700abcda26ad90d65bb59
ANTHROPIC_API_KEY=sk-ant-YOUR_NEW_ANTHROPIC_KEY
FRONTEND_URL=https://soorgaai-transformation.vercel.app
```

> Replace `MONGO_URI` with your Atlas string and `ANTHROPIC_API_KEY` with a fresh key.

### Step 4: Verify

After deploy (2–3 min), test:
```
GET https://YOUR-RAILWAY-URL.up.railway.app/
```
Should return:
```json
{ "message": "SoorgaAI Transformation API - Backend is Running!", "version": "2.0.0" }
```

```
GET https://YOUR-RAILWAY-URL.up.railway.app/api/assessment/questions
```
Should return 35 questions across 7 domains.

---

## Part 2 — MongoDB Atlas

### Whitelist Railway IPs

1. Atlas → **Network Access** → **Add IP Address**
2. Add `0.0.0.0/0` (allow all) — fine for MVP
3. Or add Railway's specific egress IPs from Railway dashboard → Settings

### Add new collections

No action needed — Mongoose auto-creates these collections on first use:
- `users`
- `assessmentresponses`
- `assessmentreports`

---

## Part 3 — Vercel (Frontend)

### Step 1: Reconnect repo

1. Go to **[vercel.com](https://vercel.com)** → your existing project
2. **Settings** → **Git** → **"Disconnect"** then **"Connect"**
3. Select: `TrueNidaGitCode/soorgaai-transformation`

> Or create a new Vercel project → Import → `soorgaai-transformation`

### Step 2: Set project settings

| Setting | Value |
|---------|-------|
| Framework Preset | **Other** |
| Root Directory | **`frontend`** |
| Build Command | *(leave empty)* |
| Output Directory | **`.`** |
| Install Command | *(leave empty)* |

### Step 3: Deploy

Click **Deploy** — Vercel serves static files from `frontend/`.

Your URL will be: `https://soorgaai-transformation.vercel.app`

---

## Part 4 — Connect Frontend ↔ Backend

### Step 1: Update config.js with your Railway URL

Edit `frontend/login/config.js` — find this line:

```js
: 'https://jubilant-essence-production-0a8a.up.railway.app';
```

Replace with your actual Railway URL:

```js
: 'https://YOUR-NEW-PROJECT.up.railway.app';
```

### Step 2: Update Railway FRONTEND_URL variable

In Railway → Variables, update:
```
FRONTEND_URL=https://soorgaai-transformation.vercel.app
```

### Step 3: Push changes

```bash
git add frontend/login/config.js
git commit -m "chore: update API URL for production"
git push origin main
```

Both Railway and Vercel auto-deploy on push. ✅

---

## Part 5 — Test End-to-End

| Test | Expected |
|------|----------|
| `GET /` on Railway | SoorgaAI API running message |
| `GET /api/assessment/questions` | 35 questions returned |
| Open Vercel URL | SoorgaAI landing page loads |
| Sign up → Log in | JWT token stored, redirected |
| Start Assessment → Submit | Scores page with maturity stage |
| Generate Report | Claude AI report appears (15–30s) |

---

## Environment Variables Summary

### Railway (Backend)
```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://...
JWT_SECRET=b1b96c88a368d0f589b29c927b5ec980de0cb05cb162b8103768952d6af0144519c5734391bb9d1e5961db2e69d6eb9ebeb1403baac700abcda26ad90d65bb59
ANTHROPIC_API_KEY=sk-ant-...
FRONTEND_URL=https://soorgaai-transformation.vercel.app
```

### Vercel (Frontend)
No environment variables needed — all config is in `frontend/login/config.js`.

---

## Auto-Deploy on Push

Once connected, every `git push origin main` triggers:
- **Railway** redeploys backend (2–3 min)
- **Vercel** redeploys frontend (30–60 sec)

```bash
# Your standard deploy workflow:
git add .
git commit -m "feat: your change"
git push origin main
# ✅ Both services auto-deploy
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS error in browser | Add Vercel URL to `FRONTEND_URL` in Railway vars |
| `Cannot find module './routes/signalRoutes.js'` | Old Railway still running old code — force redeploy |
| MongoDB timeout | Add `0.0.0.0/0` to Atlas Network Access |
| 401 on API calls | Check JWT_SECRET is set in Railway, clear browser localStorage |
| Report generation fails | Check `ANTHROPIC_API_KEY` is valid in Railway vars |
| Vercel 404 on `/assessment/` | Verify Root Directory is set to `frontend` in Vercel settings |

---

## Cost

| Service | Cost |
|---------|------|
| Vercel | **Free** (hobby) |
| Railway | **$5 credit/month** — covers ~40hrs of compute |
| MongoDB Atlas | **Free** M0 tier (512 MB, enough for MVP) |
| Anthropic API | ~$0.003 per report (claude-sonnet-4-6) |
