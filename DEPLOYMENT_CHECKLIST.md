# ✅ Pre-Deployment Checklist

Use this checklist before deploying to production.

---

## 📋 Code Cleanup - COMPLETED ✅

- [x] Removed mock data files (mock-api.js, mock-data.js)
- [x] Removed test files (check-role.html)
- [x] Created proper .gitignore
- [x] Committed all changes to git
- [x] Created deployment documentation

---

## 🔐 Secrets & Environment Variables

### Backend .env (Create on EC2, DO NOT COMMIT)

```env
# MongoDB Atlas (get from MongoDB Atlas dashboard)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/soorga?retryWrites=true&w=majority

# JWT Secret (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=your-64-character-random-secret-key

# Server
PORT=3000
NODE_ENV=production

# OpenAI API (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-proj-your-openai-api-key

# Frontend URL (your EC2 IP or domain)
FRONTEND_URL=http://13.60.229.102
```

### Frontend config.js (Update on EC2)

File: `frontend/login/config.js`

```javascript
// Update this line with your EC2 IP or domain
const API_BASE_URL = 'http://13.60.229.102';
```

---

## 🗄️ MongoDB Atlas Setup

1. [ ] Create MongoDB Atlas account: https://cloud.mongodb.com
2. [ ] Create new cluster (M0 Free tier is fine)
3. [ ] Create database user with password
4. [ ] Network Access → Add IP Address
   - Add your EC2 instance IP
   - Or use `0.0.0.0/0` for all (easier but less secure)
5. [ ] Get connection string
6. [ ] Test connection from local machine
7. [ ] Run seed script: `npm run seed`

---

## 🖥️ EC2 Prerequisites

### EC2 Instance Requirements
- [ ] Ubuntu 20.04 or later
- [ ] At least t2.micro (1 GB RAM)
- [ ] Security Group allows:
  - Port 22 (SSH)
  - Port 80 (HTTP)
  - Port 443 (HTTPS - if using SSL)
- [ ] SSH key pair downloaded

### Your Previous Deployment
- IP: `13.60.229.102`
- If reusing this instance, skip EC2 setup

---

## 🚀 Deployment Steps

### Option 1: Fresh Deployment (First Time)

Follow the complete guide: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

Estimated time: 30-45 minutes

### Option 2: Update Existing Deployment

If you've deployed before:

1. **SSH into EC2:**
   ```bash
   ssh -i your-key.pem ubuntu@13.60.229.102
   ```

2. **Pull latest code:**
   ```bash
   cd /home/ubuntu/soorga
   git pull origin main
   ```

3. **Run deployment script:**
   ```bash
   cd /home/ubuntu
   ./deploy.sh
   ```

Estimated time: 2-3 minutes

---

## 🧪 Pre-Deployment Testing

Before deploying, test locally:

### Backend Test

```bash
cd backend/trunida-backend

# Ensure .env has MongoDB Atlas URI
# Start server
npm start

# Should see:
# ✅ MongoDB Connected Successfully!
# 🚀 Server running on port 3000
```

### Test Endpoints

```bash
# In another terminal
curl http://localhost:3000/api/signals
# Should return JSON with signals array
```

### Frontend Test

1. Open: `http://127.0.0.1:5500/frontend/index.html`
2. Navigate to Signals page
3. Click on a signal
4. Try generating a post (requires login)
5. Check "Your Signals" dashboard

---

## 📦 What Gets Deployed

### Backend (Node.js + Express)
- MongoDB connection
- REST API endpoints
- JWT authentication
- OpenAI integration (posts + images)
- Admin panel APIs

### Frontend (Static HTML/CSS/JS)
- Landing page
- Signals discovery page
- Login/Signup pages
- User dashboard
- Admin dashboard (role-protected)
- About page

### Services
- PM2 process manager (keeps backend running)
- Nginx web server (serves frontend + proxies API)

---

## 🔍 Post-Deployment Verification

After deployment, check:

### 1. Backend Health
```bash
# On EC2
pm2 status
pm2 logs soorga-backend --lines 20
```

Should show:
- Status: `online`
- Uptime: `> 0s`
- No errors in logs

### 2. API Endpoints
```bash
curl http://YOUR_EC2_IP/api/signals
```

Should return JSON with signals.

### 3. Frontend Access

Open in browser: `http://YOUR_EC2_IP`

Should see SOORGA homepage.

### 4. Full User Flow
1. [ ] Homepage loads correctly
2. [ ] Click "Signals" → Shows all signals
3. [ ] Click on a signal → Shows details
4. [ ] Click "Create LinkedIn Post" → Redirects to login
5. [ ] Signup → Creates account
6. [ ] Login → Redirects to signals
7. [ ] Generate post → Shows generated text
8. [ ] Generate visual → Shows AI image (costs $0.04)
9. [ ] "Your Signals" → Shows dashboard with post
10. [ ] Download image → Works

### 5. Admin Flow (if admin user created)
1. [ ] Login as admin
2. [ ] "Admin Dashboard" button visible in navbar
3. [ ] Can access `/admin/dashboard.html`
4. [ ] Can create new signals
5. [ ] Regular users cannot access admin pages

---

## 🔒 Security Checklist

- [ ] Strong JWT_SECRET (64+ characters)
- [ ] MongoDB IP whitelist configured (not 0.0.0.0/0 in production)
- [ ] .env file not committed to git
- [ ] SSH key-based authentication enabled
- [ ] Firewall (UFW) configured
- [ ] SSL/HTTPS enabled (for production)
- [ ] Regular security updates: `sudo apt update && sudo apt upgrade`

---

## 🐛 Common Issues & Solutions

### "502 Bad Gateway"
**Cause:** Backend not running
**Fix:**
```bash
pm2 restart soorga-backend
pm2 logs soorga-backend
```

### "MongoNetworkError"
**Cause:** EC2 IP not whitelisted in MongoDB Atlas
**Fix:** Add EC2 IP to Network Access in MongoDB Atlas

### "CORS Error"
**Cause:** FRONTEND_URL mismatch
**Fix:** Update `FRONTEND_URL` in backend `.env` to match your deployment URL

### Changes Not Reflecting
**Fix:**
```bash
# On EC2
cd /home/ubuntu/soorga
git pull origin main
pm2 restart soorga-backend
sudo systemctl reload nginx

# In browser: Hard refresh (Ctrl+Shift+R)
```

### Port 3000 Already in Use
**Fix:**
```bash
# Find process
sudo lsof -i :3000
# Kill it
pm2 stop all
# Restart
pm2 start soorga-backend
```

---

## 📞 Need Help?

1. **Check logs first:**
   ```bash
   pm2 logs soorga-backend
   sudo tail -f /var/log/nginx/error.log
   ```

2. **Review guides:**
   - Full deployment: [DEPLOYMENT.md](./DEPLOYMENT.md)
   - Quick start: [QUICK_START.md](./QUICK_START.md)

3. **Common commands:**
   ```bash
   pm2 status          # Check status
   pm2 restart all     # Restart all services
   pm2 logs            # View logs
   sudo systemctl status nginx  # Nginx status
   ```

---

## 🎯 Quick Deploy Command

For returning deployments:

```bash
ssh -i your-key.pem ubuntu@13.60.229.102 "cd /home/ubuntu && ./deploy.sh"
```

One command to deploy from your local machine! 🚀

---

## ✅ Deployment Complete!

After successful deployment:

1. **Access your app:** `http://YOUR_EC2_IP`
2. **Create admin user:** Run MongoDB command to set role to 'admin'
3. **Test all features:** Signup, login, generate posts, admin panel
4. **Setup monitoring:** Check PM2 logs regularly
5. **Plan for SSL:** Use Let's Encrypt for HTTPS (see DEPLOYMENT.md)

**Next Steps:**
- [ ] Setup domain name (optional)
- [ ] Configure SSL/HTTPS
- [ ] Setup automated backups for MongoDB
- [ ] Configure monitoring/alerts
- [ ] Document any custom configurations

---

**Last Updated:** 2026-02-08
**Version:** 1.0.0
**Deployment Target:** AWS EC2 + MongoDB Atlas
