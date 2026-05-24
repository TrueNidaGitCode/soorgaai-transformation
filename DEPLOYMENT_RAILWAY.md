# 🚀 Deploy SOORGA to Railway

**Super simple deployment with $5 free credit per month**

Railway offers one-click deploy, automatic SSL, and a great developer experience.

---

## ✅ Prerequisites

- [x] MongoDB Atlas setup complete ✓
- [ ] GitHub repository pushed
- [ ] Railway account (free signup with $5/month credit)
- [ ] OpenAI API key

**Estimated time:** 10 minutes

---

## 📋 Part 1: Prepare Your Repository

### 1. Create Railway Configuration

**Create `railway.json` in project root:**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "cd backend/trunida-backend && npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 2. Create Nixpacks Configuration

**Create `nixpacks.toml` in project root:**

```toml
[phases.setup]
nixPkgs = ['nodejs_18']

[phases.install]
cmds = ['cd backend/trunida-backend && npm install']

[phases.build]
cmds = ['echo "No build needed"']

[start]
cmd = 'cd backend/trunida-backend && npm start'
```

### 3. Verify package.json Start Script

**Ensure `backend/trunida-backend/package.json` has:**

```json
{
  "scripts": {
    "start": "node server.js",
    "seed": "node seedSignals.js"
  }
}
```

### 4. Commit and Push

```bash
git add .
git commit -m "Configure for Railway deployment"
git push origin main
```

---

## 🚂 Part 2: Deploy to Railway

### 1. Sign Up for Railway

1. Go to https://railway.app
2. Click **"Login"**
3. Sign in with GitHub (recommended)
4. Authorize Railway to access your repositories

### 2. Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose `TrueNidaGitCode/Truenida_Website`
4. Railway will detect Node.js and auto-configure

### 3. Configure Service

Railway auto-detects the setup, but verify:

**Settings → Service Settings:**
- **Root Directory:** Leave empty
- **Start Command:** `cd backend/trunida-backend && npm start`
- **Install Command:** `cd backend/trunida-backend && npm install`

### 4. Add Environment Variables

Click **"Variables"** tab and add:

```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/soorga?retryWrites=true&w=majority
JWT_SECRET=<your-64-character-secret>
OPENAI_API_KEY=sk-proj-your-openai-key
FRONTEND_URL=https://your-app.up.railway.app
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Deploy

1. Railway automatically starts deploying
2. Wait 3-5 minutes
3. You'll get a URL like: `https://soorga-backend.up.railway.app`

### 6. Enable Public URL

1. Go to **"Settings"** tab
2. Click **"Generate Domain"** under Networking
3. Copy your public URL
4. Update `FRONTEND_URL` in Variables

---

## 🎨 Part 3: Deploy Frontend

### Option 1: Serve Frontend from Backend (Easiest)

Update `backend/trunida-backend/server.js`:

```javascript
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ... existing middleware ...

// Serve static frontend files
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// API routes
app.use('/api/signals', signalRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Catch-all route for frontend (SPA-like behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ... rest of server code ...
```

**Commit and push:**
```bash
git add .
git commit -m "Serve frontend from backend"
git push origin main
```

Railway will auto-redeploy. Your full app will be at one URL!

### Option 2: Separate Frontend Service (Advanced)

1. Create another Railway service
2. Deploy as static site
3. Point to `frontend` directory
4. Railway serves it automatically

---

## 🔄 Part 4: Update Configuration

### 1. Update Frontend Config

**Update `frontend/login/config.js`:**

```javascript
// Use Railway URL
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://soorga-backend.up.railway.app'; // Your Railway URL

window.CONFIG = {
    API_BASE: API_BASE_URL,
    // ... rest of config
};
```

### 2. Update Backend CORS

**Update `backend/trunida-backend/server.js`:**

```javascript
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://soorga-backend.up.railway.app', // Your Railway URL
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
```

### 3. Commit and Push

```bash
git add .
git commit -m "Update URLs for Railway"
git push origin main
```

Railway auto-redeploys in 2-3 minutes.

---

## 📊 Part 5: Seed Database

### Option 1: Run Locally

```bash
cd backend/trunida-backend
# Update .env with production MONGO_URI
npm run seed
```

### Option 2: Use Railway CLI

Install Railway CLI:
```bash
npm install -g @railway/cli
```

Run seed command:
```bash
railway login
railway link
railway run node backend/trunida-backend/seedSignals.js
```

---

## ✅ Part 6: Testing

### Test Backend

```bash
# Health check
curl https://soorga-backend.up.railway.app/

# Get signals
curl https://soorga-backend.up.railway.app/api/signals
```

### Test Frontend

Open: `https://soorga-backend.up.railway.app`

Test all features:
- ✅ Homepage, Signals, Signup, Login
- ✅ Generate posts and images
- ✅ User dashboard
- ✅ Admin panel

---

## 📝 Monitoring

### View Logs

1. Railway Dashboard
2. Click on your service
3. **"Deployments"** tab → Click latest deployment
4. Logs appear in real-time

### Restart Service

Click **"Redeploy"** button in Railway dashboard

---

## 🌐 Custom Domain

1. Go to **"Settings"** → **"Domains"**
2. Click **"Custom Domain"**
3. Add your domain
4. Update DNS:
   - **Type:** CNAME
   - **Value:** Your Railway URL
5. Railway handles SSL automatically

---

## 🔄 Auto-Deploy

Railway auto-deploys on every push to `main`:

```bash
git push origin main
# Railway deploys automatically
```

### Disable Auto-Deploy (Optional)

Settings → Triggers → Uncheck "GitHub Push"

---

## 💰 Pricing

**Free Plan:**
- ✅ $5 execution credit per month
- ✅ Enough for ~500 hours of runtime
- ✅ No credit card required
- ✅ SSL included
- ✅ Custom domains

**Usage-Based Pricing:**
- $0.000231 per GB-hour
- $0.10 per GB bandwidth
- Most apps use $5-10/month

**Monitor usage:** Dashboard → Usage tab

---

## 🐛 Troubleshooting

### Deployment Failed

**Check build logs:**
- Railway Dashboard → Deployments → Click failed deployment
- Look for errors in logs

**Common fixes:**
- Verify `package.json` has `start` script
- Check environment variables are set
- Ensure MongoDB URI is correct

### App Crashes

**Check logs:**
```bash
# In Railway dashboard, click "View Logs"
```

**Common issues:**
- Missing environment variables
- MongoDB connection timeout
- Port mismatch (use `process.env.PORT`)

### CORS Errors

1. Update CORS origins in `server.js`
2. Include Railway URL
3. Redeploy

---

## 🎯 Quick Commands

```bash
# Deploy updates
git push origin main

# View logs
# Railway Dashboard → Service → Logs

# Restart
# Railway Dashboard → Redeploy button

# Use Railway CLI
railway login
railway link
railway logs
railway run <command>
```

---

## 🎉 Deployment Complete!

**Your app is live at:**
- Main URL: `https://soorga-backend.up.railway.app`
- API: `https://soorga-backend.up.railway.app/api/signals`

**Railway Dashboard:** https://railway.app/dashboard

**Next Steps:**
1. Test all features
2. Create admin user in MongoDB
3. Add custom domain (optional)
4. Monitor usage

**Support:**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway

---

**Enjoy Railway! 🚂**
