# 🚀 Deploy SOORGA to Render (FREE)

**Easiest deployment option - No server management needed!**

Render automatically deploys from GitHub, provides free SSL, and handles all infrastructure.

---

## ✅ Prerequisites

- [x] MongoDB Atlas setup complete (you have this ✓)
- [ ] GitHub repository pushed (https://github.com/TrueNidaGitCode/Truenida_Website)
- [ ] Render account (free signup)
- [ ] OpenAI API key

**Estimated time:** 10-15 minutes

---

## 📋 Part 1: Prepare Your Repository

### 1. Create Render Configuration Files

We need to tell Render how to build and start your app.

**Create `render.yaml` in project root:**

```yaml
services:
  # Backend API
  - type: web
    name: soorga-backend
    runtime: node
    plan: free
    buildCommand: cd backend/trunida-backend && npm install
    startCommand: cd backend/trunida-backend && npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: MONGO_URI
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: FRONTEND_URL
        sync: false

  # Frontend Static Site
  - type: static
    name: soorga-frontend
    buildCommand: echo "No build needed"
    staticPublishPath: ./frontend
    routes:
      - type: rewrite
        source: /api/*
        destination: https://soorga-backend.onrender.com/api/*
```

**Create `backend/trunida-backend/package.json` start script (already exists, verify):**

```json
{
  "scripts": {
    "start": "node server.js",
    "seed": "node seedSignals.js"
  }
}
```

### 2. Update Frontend Config

**Update `frontend/login/config.js` to use environment-based URLs:**

```javascript
// Auto-detect API URL based on environment
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://soorga-backend.onrender.com'; // Update after deployment

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

### 3. Update Backend CORS

**Update `backend/trunida-backend/server.js` CORS configuration:**

```javascript
// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://soorga-frontend.onrender.com', // Update after deployment
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 4. Commit and Push

```bash
git add .
git commit -m "Configure for Render deployment"
git push origin main
```

---

## 🌐 Part 2: Deploy Backend to Render

### 1. Sign Up for Render

1. Go to https://render.com
2. Sign up with GitHub (easiest)
3. Authorize Render to access your repository

### 2. Create New Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `TrueNidaGitCode/Truenida_Website`
3. Configure:

**Basic Settings:**
- **Name:** `soorga-backend`
- **Runtime:** `Node`
- **Region:** Choose closest to your users
- **Branch:** `main`

**Build & Deploy:**
- **Root Directory:** Leave empty (or `.`)
- **Build Command:**
  ```bash
  cd backend/trunida-backend && npm install
  ```
- **Start Command:**
  ```bash
  cd backend/trunida-backend && npm start
  ```

**Plan:**
- Select **"Free"** (0 USD/month)

### 3. Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"** for each:

```env
NODE_ENV=production
PORT=10000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/soorga?retryWrites=true&w=majority
JWT_SECRET=<your-64-character-secret>
OPENAI_API_KEY=sk-proj-your-openai-key
FRONTEND_URL=https://soorga-frontend.onrender.com
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Install dependencies
   - Start your backend
   - Provide a URL like: `https://soorga-backend.onrender.com`

**Wait 5-10 minutes** for deployment to complete.

### 5. Verify Backend

Once deployed, test your API:

```bash
curl https://soorga-backend.onrender.com/api/signals
```

Should return JSON with signals array.

---

## 🎨 Part 3: Deploy Frontend to Render

### 1. Create Static Site

1. Click **"New +"** → **"Static Site"**
2. Connect same repository: `TrueNidaGitCode/Truenida_Website`
3. Configure:

**Basic Settings:**
- **Name:** `soorga-frontend`
- **Branch:** `main`

**Build Settings:**
- **Build Command:** Leave empty (no build needed)
- **Publish Directory:** `frontend`

**Plan:**
- Select **"Free"**

### 2. Add Environment Variable (Optional)

If you want to use environment variables in frontend:

```env
API_URL=https://soorga-backend.onrender.com
```

### 3. Deploy

1. Click **"Create Static Site"**
2. Render will deploy your frontend
3. You'll get a URL like: `https://soorga-frontend.onrender.com`

---

## 🔄 Part 4: Connect Frontend & Backend

### 1. Update Frontend Config

**Update `frontend/login/config.js` with your actual Render URLs:**

```javascript
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://soorga-backend.onrender.com'; // Your actual backend URL
```

### 2. Update Backend CORS

**Update `backend/trunida-backend/server.js`:**

```javascript
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://soorga-frontend.onrender.com', // Your actual frontend URL
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));
```

### 3. Update Backend Environment Variable

In Render backend service:
1. Go to **Environment** tab
2. Update `FRONTEND_URL` to: `https://soorga-frontend.onrender.com`
3. Click **"Save Changes"** (will auto-redeploy)

### 4. Commit & Push

```bash
git add .
git commit -m "Update URLs for Render deployment"
git push origin main
```

Render will automatically redeploy both services.

---

## 📊 Part 5: Seed Database

### Option 1: Run Locally

```bash
cd backend/trunida-backend
# Update .env with production MONGO_URI
npm run seed
```

### Option 2: Use Render Shell

1. Go to Render Dashboard → `soorga-backend`
2. Click **"Shell"** tab
3. Run:
   ```bash
   cd backend/trunida-backend
   node seedSignals.js
   ```

---

## ✅ Part 6: Testing

### 1. Test Backend API

```bash
# Health check
curl https://soorga-backend.onrender.com/

# Get signals
curl https://soorga-backend.onrender.com/api/signals

# Should return JSON with signals
```

### 2. Test Frontend

Open: `https://soorga-frontend.onrender.com`

**Test these features:**
1. ✅ Homepage loads
2. ✅ Navigate to Signals page
3. ✅ Click on a signal → Details show
4. ✅ Signup → Creates account
5. ✅ Login → Redirects to signals
6. ✅ Generate LinkedIn post → Shows generated text
7. ✅ Generate visual → Shows AI image
8. ✅ "Your Signals" dashboard → Shows posts
9. ✅ Admin login → Admin dashboard appears (if admin user)

---

## 🚨 Important Notes

### Free Tier Limitations

**Backend (Free Web Service):**
- ⚠️ **Sleeps after 15 minutes of inactivity**
- ⚠️ Cold start takes 30-60 seconds on first request
- ✅ 750 hours/month free
- ✅ Automatic SSL/HTTPS
- ✅ Custom domains supported

**Solution for cold starts:**
- Upgrade to paid plan ($7/month) for always-on
- Or use a service like UptimeRobot to ping every 10 minutes

**Frontend (Static Site):**
- ✅ Always on (no sleep)
- ✅ Free forever
- ✅ CDN included
- ✅ Automatic SSL

---

## 🔄 Auto-Deploy from GitHub

Render automatically deploys when you push to `main`:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Render auto-deploys in 2-3 minutes
```

---

## 📝 Monitoring & Logs

### View Logs

1. Go to Render Dashboard
2. Select your service (`soorga-backend` or `soorga-frontend`)
3. Click **"Logs"** tab
4. Real-time logs appear here

### Restart Service

1. Go to service dashboard
2. Click **"Manual Deploy"** → **"Deploy latest commit"**

---

## 🌐 Custom Domain (Optional)

### Add Custom Domain

1. Go to service settings
2. Click **"Custom Domains"**
3. Add your domain (e.g., `soorga.com`)
4. Update DNS:
   - **Type:** CNAME
   - **Name:** `@` or `www`
   - **Value:** Your Render URL

Render handles SSL automatically!

---

## 🎯 Quick Commands Reference

```bash
# Deploy updates
git push origin main  # Auto-deploys

# View backend logs
# Go to Render Dashboard → soorga-backend → Logs

# Restart backend
# Render Dashboard → soorga-backend → Manual Deploy

# Seed database
# Render Dashboard → soorga-backend → Shell
cd backend/trunida-backend && node seedSignals.js
```

---

## 🐛 Troubleshooting

### Backend Not Starting

**Check logs:**
1. Render Dashboard → `soorga-backend` → Logs
2. Look for errors

**Common issues:**
- ❌ Missing environment variables → Add in Environment tab
- ❌ Wrong build command → Update in Settings
- ❌ MongoDB connection failed → Check MONGO_URI

### Frontend Not Loading

**Check:**
1. Publish directory is `frontend`
2. No build command needed
3. Check browser console for errors

### CORS Errors

**Fix:**
1. Update backend CORS to include frontend URL
2. Update `FRONTEND_URL` environment variable
3. Redeploy backend

### 502 Bad Gateway

**Cause:** Backend is sleeping (free tier)

**Solutions:**
- Wait 30-60 seconds for cold start
- Upgrade to paid plan ($7/month)
- Use UptimeRobot to keep alive

---

## 💰 Pricing

**Free Tier (What you get):**
- ✅ Backend: 750 hours/month (enough for development)
- ✅ Frontend: Unlimited, free forever
- ✅ SSL/HTTPS included
- ✅ Auto-deploy from Git
- ⚠️ Backend sleeps after 15 min inactivity

**Paid Tier ($7/month per service):**
- ✅ Always on (no sleep)
- ✅ Faster cold starts
- ✅ More resources

---

## 🎉 Deployment Complete!

Your SOORGA platform is now live on Render:

- **Frontend:** `https://soorga-frontend.onrender.com`
- **Backend:** `https://soorga-backend.onrender.com`
- **MongoDB:** Hosted on Atlas

**Next Steps:**
1. Test all features
2. Create admin user in MongoDB
3. Consider custom domain
4. Upgrade to paid if you need always-on

**Support:**
- Render Docs: https://render.com/docs
- Render Community: https://community.render.com

---

**Enjoy your deployment! 🚀**
