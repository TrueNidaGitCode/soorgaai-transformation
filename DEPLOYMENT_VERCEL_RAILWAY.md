# 🚀 Deploy SOORGA: Vercel + Railway + MongoDB Atlas

**Perfect Stack for Production:**
- ⚡ Vercel → Frontend (Fast CDN, Free)
- 🚂 Railway → Backend API ($5 credit/month)
- 🍃 MongoDB Atlas → Database (Already set up ✓)

**Total Time:** 15-20 minutes

---

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    USERS                            │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  VERCEL (Frontend - CDN)                            │
│  https://soorga.vercel.app                          │
│  - index.html, CSS, JS                              │
│  - Static files                                     │
│  - Edge network (fast globally)                     │
└─────────────────────────────────────────────────────┘
                      │
                      │ API Calls
                      ▼
┌─────────────────────────────────────────────────────┐
│  RAILWAY (Backend API)                              │
│  https://soorga-backend.up.railway.app              │
│  - Node.js + Express                                │
│  - JWT authentication                               │
│  - OpenAI integration                               │
│  - Always on, no cold starts                        │
└─────────────────────────────────────────────────────┘
                      │
                      │ Database queries
                      ▼
┌─────────────────────────────────────────────────────┐
│  MONGODB ATLAS (Database)                           │
│  mongodb+srv://...                                  │
│  - Signals collection                               │
│  - Users collection                                 │
│  - UserSignals collection                           │
│  - Already set up ✓                                 │
└─────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites Checklist

- [x] MongoDB Atlas set up ✓
- [x] GitHub repository pushed ✓
- [ ] Vercel account (sign up with GitHub)
- [ ] Railway account (sign up with GitHub)
- [ ] OpenAI API key

---

## 🚂 PART 1: Deploy Backend to Railway

### Step 1: Sign Up for Railway

1. Go to https://railway.app
2. Click **"Login"**
3. **"Login with GitHub"**
4. Authorize Railway

### Step 2: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose: `TrueNidaGitCode/Truenida_Website`
4. Railway auto-detects Node.js

### Step 3: Configure Build Settings

Railway should auto-detect, but verify in **Settings**:

- **Root Directory:** Leave empty
- **Build Command:**
  ```bash
  cd backend/trunida-backend && npm install
  ```
- **Start Command:**
  ```bash
  cd backend/trunida-backend && npm start
  ```
- **Watch Paths:** `/backend/**`

### Step 4: Add Environment Variables

Click **"Variables"** tab → **"RAW Editor"** → Paste:

```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster.mongodb.net/soorga?retryWrites=true&w=majority
JWT_SECRET=REPLACE_WITH_64_CHAR_SECRET
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_KEY
FRONTEND_URL=https://soorga.vercel.app
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Replace:**
- `MONGO_URI` → Your MongoDB Atlas connection string
- `JWT_SECRET` → Generated secret above
- `OPENAI_API_KEY` → Your OpenAI API key
- `FRONTEND_URL` → Will update after Vercel deployment

### Step 5: Generate Public Domain

1. Go to **"Settings"** tab
2. Scroll to **"Networking"**
3. Click **"Generate Domain"**
4. Copy your URL: `https://YOUR-PROJECT.up.railway.app`

### Step 6: Deploy

Railway auto-deploys! Watch the logs.

**Wait 3-5 minutes** for deployment to complete.

### Step 7: Verify Backend

Test your API:

```bash
# Health check
curl https://YOUR-PROJECT.up.railway.app/

# Get signals
curl https://YOUR-PROJECT.up.railway.app/api/signals
```

Should return JSON with signals array.

✅ **Backend deployed!** Copy your Railway URL for next step.

---

## ⚡ PART 2: Deploy Frontend to Vercel

### Step 1: Update Frontend Configuration

Before deploying, update the API URL.

**Edit `frontend/login/config.js`:**

```javascript
// Dynamic API URL based on environment
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://YOUR-PROJECT.up.railway.app'; // ← REPLACE with your Railway URL

window.CONFIG = {
    API_BASE: API_BASE_URL,

    AUTH: {
        SIGNUP: `${API_BASE_URL}/api/users/signup`,
        LOGIN: `${API_BASE_URL}/api/users/login`,
        PROFILE: `${API_BASE_URL}/api/users/me`,
        FORGOT_PASSWORD: `${API_BASE_URL}/api/users/forgot-password`,
        RESET_PASSWORD: `${API_BASE_URL}/api/users/reset-password`,
    },

    SIGNALS: {
        ALL_SIGNALS: `${API_BASE_URL}/api/signals`,
        SIGNAL_DETAIL: (id) => `${API_BASE_URL}/api/signals/${id}`,
        USER_SIGNALS: `${API_BASE_URL}/api/user/signals`,
        UPDATE_ANALYTICS: (id) => `${API_BASE_URL}/api/user/signals/${id}/analytics`,
        DELETE: (id) => `${API_BASE_URL}/api/user/signals/${id}`,
        USER_SIGNAL_DETAIL: (id) => `${API_BASE_URL}/api/user/signals/${id}`,
    },

    AI: {
        GENERATE_POST: `${API_BASE_URL}/api/signals/generate-post`,
        GENERATE_IMAGE: `${API_BASE_URL}/api/signals/generate-image`
    },

    ADMIN: {
        CREATE_SIGNAL: `${API_BASE_URL}/api/admin/signals`,
        UPDATE_SIGNAL: (id) => `${API_BASE_URL}/api/admin/signals/${id}`,
        DELETE_SIGNAL: (id) => `${API_BASE_URL}/api/admin/signals/${id}`,
        GET_ALL_SIGNALS: `${API_BASE_URL}/api/admin/signals`
    }
};
```

**Commit changes:**
```bash
git add frontend/login/config.js
git commit -m "Update API URL for Railway backend"
git push origin main
```

### Step 2: Create vercel.json Configuration

**Create `vercel.json` in project root:**

```json
{
  "version": 2,
  "name": "soorga-frontend",
  "builds": [
    {
      "src": "frontend/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/frontend/$1"
    },
    {
      "src": "/frontend/(.*)",
      "dest": "/frontend/$1"
    }
  ],
  "headers": [
    {
      "source": "/frontend/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

**Commit:**
```bash
git add vercel.json
git commit -m "Add Vercel configuration"
git push origin main
```

### Step 3: Sign Up for Vercel

1. Go to https://vercel.com
2. Click **"Sign Up"**
3. **"Continue with GitHub"**
4. Authorize Vercel

### Step 4: Import Project

1. Click **"Add New..."** → **"Project"**
2. Import `TrueNidaGitCode/Truenida_Website`
3. Configure:

**Framework Preset:** Other
**Root Directory:** `frontend` (click Edit and set)
**Build Command:** Leave empty (no build needed)
**Output Directory:** `.` (current directory)

### Step 5: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes
3. You'll get a URL like: `https://truenida-website.vercel.app`

✅ **Frontend deployed!**

### Step 6: Test Frontend

Open your Vercel URL: `https://YOUR-APP.vercel.app`

You should see the SOORGA homepage!

---

## 🔗 PART 3: Connect Frontend & Backend

### Step 1: Update Backend CORS

**Edit `backend/trunida-backend/server.js`:**

```javascript
import cors from 'cors';

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://truenida-website.vercel.app',  // ← Add your Vercel URL
    'https://*.vercel.app',  // Allow all Vercel preview deployments
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Step 2: Update Railway Environment Variable

1. Go to Railway Dashboard
2. Click your backend service
3. **"Variables"** tab
4. Update `FRONTEND_URL` to: `https://YOUR-APP.vercel.app`
5. Railway will auto-redeploy

### Step 3: Commit Backend Changes

```bash
git add backend/trunida-backend/server.js
git commit -m "Update CORS for Vercel frontend"
git push origin main
```

Railway auto-redeploys in 2-3 minutes.

---

## 📊 PART 4: Seed Database

### Option 1: Seed Locally

```bash
cd backend/trunida-backend

# Create temporary .env with production MONGO_URI
cat > .env.production << EOF
MONGO_URI=YOUR_MONGODB_ATLAS_URI
EOF

# Run seed
MONGO_URI=$(grep MONGO_URI .env.production | cut -d '=' -f2-) node seedSignals.js

# Clean up
rm .env.production
```

### Option 2: Use Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Run seed
railway run node backend/trunida-backend/seedSignals.js
```

---

## ✅ PART 5: Testing Everything

### Test Backend (Railway)

```bash
# Health check
curl https://YOUR-PROJECT.up.railway.app/

# Get signals
curl https://YOUR-PROJECT.up.railway.app/api/signals

# Should return JSON with signals
```

### Test Frontend (Vercel)

Open: `https://YOUR-APP.vercel.app`

**Test these features:**

1. **Homepage** ✅
   - Loads correctly
   - Navigation works

2. **Signals Page** ✅
   - Shows all signals from database
   - Click on signal → Details modal opens

3. **Authentication** ✅
   - Click "Signup" → Create account
   - Login → Redirects to signals page

4. **Generate Post** ✅
   - Select a signal
   - Click "Create LinkedIn Post"
   - See generated text

5. **Generate Visual** ✅
   - Click "Generate Visual (Optional)"
   - Wait ~15 seconds
   - AI image appears

6. **User Dashboard** ✅
   - Click "Your Signals"
   - See all generated posts
   - Images display correctly

7. **Admin Panel** ✅ (if admin user created)
   - Login as admin
   - "Admin Dashboard" button appears
   - Can create new signals

### Test API from Frontend

Open browser console (F12) and check:
- No CORS errors
- API calls succeed
- JWT tokens work

---

## 🌐 PART 6: Custom Domain (Optional)

### For Vercel (Frontend)

1. Go to Vercel Dashboard → Your project
2. **"Settings"** → **"Domains"**
3. Add your domain (e.g., `soorga.com`)
4. Update DNS:
   - **Type:** CNAME (or A record)
   - **Name:** `@` or `www`
   - **Value:** `cname.vercel-dns.com`
5. Vercel handles SSL automatically

### For Railway (Backend)

1. Railway Dashboard → Your service
2. **"Settings"** → **"Domains"**
3. Add custom domain (e.g., `api.soorga.com`)
4. Update DNS:
   - **Type:** CNAME
   - **Name:** `api`
   - **Value:** Your Railway URL
5. Update `FRONTEND_URL` env variable

---

## 🔄 PART 7: Auto-Deploy Setup

### Vercel Auto-Deploy

✅ **Already configured!** Vercel auto-deploys on every push to `main`.

```bash
git push origin main
# Vercel deploys automatically (1-2 minutes)
```

### Railway Auto-Deploy

✅ **Already configured!** Railway auto-deploys on every push to `main`.

```bash
git push origin main
# Railway deploys automatically (2-3 minutes)
```

### Deploy Workflow

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Both Vercel and Railway deploy automatically!
# Vercel: 1-2 minutes
# Railway: 2-3 minutes
```

---

## 📝 Monitoring & Logs

### View Railway Logs (Backend)

1. Railway Dashboard
2. Click your service
3. **"Deployments"** tab
4. Real-time logs appear

### View Vercel Logs (Frontend)

1. Vercel Dashboard
2. Click your project
3. **"Deployments"** tab
4. Click deployment → View logs

### Monitor Errors

**Backend errors:**
- Check Railway logs
- Look for MongoDB connection issues
- Verify environment variables

**Frontend errors:**
- Open browser console (F12)
- Check for CORS errors
- Verify API URLs

---

## 💰 Pricing Breakdown

### Vercel (Frontend)
- ✅ **FREE** for hobby/personal projects
- ✅ 100 GB bandwidth/month
- ✅ Unlimited deployments
- ✅ Auto SSL/HTTPS
- ✅ Global CDN

**Paid:** $20/month (only if you need Pro features)

### Railway (Backend)
- ✅ **$5 credit/month** (free to start)
- Usage: ~$0.000231 per GB-hour
- Typical usage: **$5-10/month**
- ✅ No cold starts
- ✅ Always on

**Monitor usage:** Railway Dashboard → Usage tab

### MongoDB Atlas (Database)
- ✅ **FREE** M0 tier (512 MB)
- Perfect for development/small production
- Can upgrade to M10 ($0.08/hour) when needed

### Total Monthly Cost
- **Development:** $0 (Vercel free + Railway $5 credit + Atlas free)
- **Production:** ~$10-15/month (Railway usage after credit)

---

## 🐛 Troubleshooting

### CORS Errors

**Symptom:** Browser console shows CORS error

**Fix:**
1. Verify Railway backend includes Vercel URL in CORS
2. Check `FRONTEND_URL` environment variable
3. Redeploy Railway backend

```javascript
// backend/trunida-backend/server.js
app.use(cors({
  origin: [
    'https://YOUR-APP.vercel.app',
    'https://*.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));
```

### Backend Not Responding

**Check Railway logs:**
1. Railway Dashboard → Service → Logs
2. Look for errors

**Common issues:**
- MongoDB connection timeout → Check MONGO_URI
- Missing environment variables → Add in Railway dashboard
- Port mismatch → Ensure using `process.env.PORT || 3000`

### Frontend Shows Blank Page

**Check:**
1. Vercel deployment succeeded (Dashboard → Deployments)
2. Browser console for JavaScript errors (F12)
3. Verify `vercel.json` routes are correct
4. Check if API calls are failing (Network tab)

### MongoDB Connection Error

**Verify:**
1. MongoDB Atlas IP whitelist includes `0.0.0.0/0` (or Railway IPs)
2. `MONGO_URI` is correct in Railway variables
3. Database user has read/write permissions

**Test connection from Railway:**
```bash
# Railway Dashboard → Service → Shell
node -e "require('mongoose').connect(process.env.MONGO_URI).then(() => console.log('Connected!')).catch(e => console.error(e))"
```

### Vercel Build Failed

**Check:**
1. `vercel.json` syntax is correct
2. `frontend` directory exists
3. No build command needed (static files only)

### API Calls Return 401 Unauthorized

**Check:**
1. JWT token is being sent (Browser DevTools → Network → Headers)
2. `JWT_SECRET` matches in Railway
3. Token hasn't expired (check localStorage in browser)

---

## 🎯 Quick Reference

### URLs

```bash
# Frontend (Vercel)
https://YOUR-APP.vercel.app

# Backend (Railway)
https://YOUR-PROJECT.up.railway.app

# API Endpoints
https://YOUR-PROJECT.up.railway.app/api/signals
https://YOUR-PROJECT.up.railway.app/api/users/login
```

### Environment Variables

**Railway (Backend):**
```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://...
JWT_SECRET=<64-char-secret>
OPENAI_API_KEY=sk-proj-...
FRONTEND_URL=https://YOUR-APP.vercel.app
```

**Vercel (Frontend):**
No environment variables needed (hardcoded in config.js)

### Common Commands

```bash
# Deploy both
git push origin main

# View Railway logs
railway logs --follow

# View Vercel logs
vercel logs

# Seed database
railway run node backend/trunida-backend/seedSignals.js
```

---

## 🎉 Deployment Complete!

**Your SOORGA platform is now live:**

- ⚡ **Frontend:** `https://YOUR-APP.vercel.app`
- 🚂 **Backend:** `https://YOUR-PROJECT.up.railway.app`
- 🍃 **Database:** MongoDB Atlas

**Next Steps:**
1. ✅ Test all features
2. ✅ Create admin user in MongoDB
3. ✅ Add custom domain (optional)
4. ✅ Monitor Railway usage
5. ✅ Share with users!

**Support:**
- Vercel Docs: https://vercel.com/docs
- Railway Docs: https://docs.railway.app
- MongoDB Atlas: https://docs.atlas.mongodb.com

---

**Congratulations! Your app is production-ready! 🎉🚀**
