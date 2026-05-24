# 🚀 SOORGA Production Deployment Guide

Complete guide to deploy SOORGA to AWS EC2 with MongoDB Atlas.

---

## 📋 Prerequisites

- AWS EC2 instance (Ubuntu 20.04 or later)
- Domain name (optional but recommended)
- MongoDB Atlas account (or self-hosted MongoDB)
- OpenAI API key
- SSH access to EC2 instance

---

## 🔧 Part 1: MongoDB Atlas Setup

### 1. Create MongoDB Atlas Cluster

1. Go to https://cloud.mongodb.com
2. Create a new cluster (Free tier works fine for testing)
3. Set up database user and password
4. Whitelist IP addresses:
   - Add your EC2 instance IP
   - Or use `0.0.0.0/0` for all (less secure but easier)
5. Get your connection string:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/soorga?retryWrites=true&w=majority
   ```

### 2. Seed Initial Data

From your local machine:

```bash
# Update MONGO_URI in backend/.env with Atlas connection string
cd backend/trunida-backend
npm run seed
```

This will populate your Atlas database with initial signals.

---

## 🖥️ Part 2: EC2 Instance Setup

### 1. Connect to EC2

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### 2. Update System & Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3 and pip (for AI service)
sudo apt install -y python3 python3-pip python3-venv

# Install Nginx
sudo apt install -y nginx

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Git (if not already installed)
sudo apt install -y git
```

Verify installations:
```bash
node --version  # Should show v18.x
npm --version
python3 --version
nginx -v
pm2 --version
```

---

## 📦 Part 3: Deploy Application

### 1. Clone Repository

```bash
cd /home/ubuntu
git clone <your-repo-url> soorga
cd soorga
```

Or if already deployed, pull latest changes:
```bash
cd /home/ubuntu/soorga
git pull origin main
```

### 2. Setup Backend (Node.js)

```bash
cd /home/ubuntu/soorga/backend/trunida-backend

# Install dependencies
npm install

# Create production .env file
nano .env
```

**Production .env file:**
```env
# MongoDB Atlas
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/soorga?retryWrites=true&w=majority

# JWT Secret (generate a strong secret)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server
PORT=3000
NODE_ENV=production

# OpenAI API
OPENAI_API_KEY=your-openai-api-key-here

# Frontend URL (for CORS)
FRONTEND_URL=http://your-domain.com
# Or use EC2 IP: http://13.60.229.102
```

**Generate strong JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Save and exit (Ctrl+X, Y, Enter).

### 3. Setup Python AI Service (if needed)

```bash
cd /home/ubuntu/soorga/backend/ai-service

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Deactivate for now
deactivate
```

### 4. Test Backend Locally

```bash
cd /home/ubuntu/soorga/backend/trunida-backend
npm start
```

Should see:
```
✅ MongoDB Connected Successfully!
🚀 Server running on port 3000
```

Press Ctrl+C to stop. Now let's set up PM2 to run it as a service.

---

## 🔄 Part 4: Setup PM2 (Process Manager)

### 1. Create PM2 Ecosystem File

```bash
cd /home/ubuntu/soorga/backend/trunida-backend
nano ecosystem.config.js
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [
    {
      name: 'soorga-backend',
      script: 'server.js',
      cwd: '/home/ubuntu/soorga/backend/trunida-backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/home/ubuntu/logs/soorga-error.log',
      out_file: '/home/ubuntu/logs/soorga-out.log',
      log_file: '/home/ubuntu/logs/soorga-combined.log',
      time: true
    }
  ]
};
```

### 2. Create Log Directory

```bash
mkdir -p /home/ubuntu/logs
```

### 3. Start Application with PM2

```bash
cd /home/ubuntu/soorga/backend/trunida-backend
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Copy the command output by `pm2 startup` and run it (it will look like):
```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 4. Verify Backend is Running

```bash
pm2 status
pm2 logs soorga-backend
curl http://localhost:3000/api/signals
```

---

## 🌐 Part 5: Setup Nginx (Web Server)

### 1. Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/soorga
```

**Nginx config for IP-based deployment:**
```nginx
server {
    listen 80;
    server_name your-ec2-ip;  # e.g., 13.60.229.102

    # Frontend (static files)
    location / {
        root /home/ubuntu/soorga/frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Increase max upload size
    client_max_body_size 10M;
}
```

**Or for domain-based deployment:**
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Frontend (static files)
    location / {
        root /home/ubuntu/soorga/frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 10M;
}
```

### 2. Enable Configuration

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/soorga /etc/nginx/sites-enabled/

# Remove default config
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 3. Update Frontend Configuration

```bash
nano /home/ubuntu/soorga/frontend/login/config.js
```

Update API_BASE_URL:
```javascript
// For domain deployment
const API_BASE_URL = 'http://your-domain.com';

// For IP-based deployment
const API_BASE_URL = 'http://13.60.229.102';
```

---

## 🔒 Part 6: Setup SSL (HTTPS) - Optional but Recommended

### 1. Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Get SSL Certificate

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Follow the prompts. Certbot will automatically update your Nginx config.

### 3. Update Frontend Config

```bash
nano /home/ubuntu/soorga/frontend/login/config.js
```

Change to HTTPS:
```javascript
const API_BASE_URL = 'https://your-domain.com';
```

### 4. Test Auto-Renewal

```bash
sudo certbot renew --dry-run
```

---

## ✅ Part 7: Verification & Testing

### 1. Check All Services

```bash
# PM2 status
pm2 status

# Nginx status
sudo systemctl status nginx

# Backend logs
pm2 logs soorga-backend --lines 50

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### 2. Test Endpoints

```bash
# Health check
curl http://your-ec2-ip/

# Get signals
curl http://your-ec2-ip/api/signals

# Test from browser
# Open: http://your-ec2-ip
```

### 3. Test from Browser

1. Open `http://your-ec2-ip` (or `https://your-domain.com`)
2. Signup for an account
3. Login
4. Navigate to Signals page
5. Generate a LinkedIn post
6. Check "Your Signals" dashboard

---

## 🔄 Part 8: Deployment Updates

### Quick Update Script

Create a deployment script:

```bash
nano /home/ubuntu/deploy.sh
```

**deploy.sh:**
```bash
#!/bin/bash

echo "🚀 Deploying SOORGA updates..."

cd /home/ubuntu/soorga

# Pull latest changes
echo "📥 Pulling latest code..."
git pull origin main

# Update backend dependencies (if package.json changed)
cd backend/trunida-backend
npm install

# Restart backend
echo "🔄 Restarting backend..."
pm2 restart soorga-backend

# Reload Nginx (if config changed)
echo "🌐 Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Deployment complete!"
echo "📊 PM2 Status:"
pm2 status

echo "📝 Recent logs:"
pm2 logs soorga-backend --lines 10 --nostream
```

Make it executable:
```bash
chmod +x /home/ubuntu/deploy.sh
```

**To deploy updates:**
```bash
cd /home/ubuntu
./deploy.sh
```

---

## 🐛 Troubleshooting

### Backend Not Starting

```bash
# Check logs
pm2 logs soorga-backend

# Check if port is in use
sudo lsof -i :3000

# Restart PM2
pm2 restart soorga-backend
```

### MongoDB Connection Issues

```bash
# Test connection from EC2
mongo "mongodb+srv://username:password@cluster.mongodb.net/test"

# Check if IP is whitelisted in MongoDB Atlas
# Go to Network Access in Atlas dashboard
```

### Nginx Errors

```bash
# Check error logs
sudo tail -f /var/log/nginx/error.log

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### CORS Errors

Ensure `FRONTEND_URL` in backend `.env` matches your deployment URL.

### 502 Bad Gateway

Backend is not running:
```bash
pm2 restart soorga-backend
pm2 logs soorga-backend
```

---

## 📊 Monitoring & Maintenance

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Status
pm2 status

# Logs
pm2 logs soorga-backend

# Resource usage
pm2 list
```

### Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### Disk Space

```bash
df -h
du -sh /home/ubuntu/logs/*
```

### Clear Old Logs

```bash
pm2 flush  # Clear PM2 logs
sudo truncate -s 0 /var/log/nginx/*.log  # Clear Nginx logs
```

---

## 🔐 Security Checklist

- [ ] Strong JWT_SECRET in production .env
- [ ] MongoDB IP whitelist configured
- [ ] SSH key-based authentication enabled
- [ ] Firewall configured (UFW)
- [ ] SSL/HTTPS enabled
- [ ] Regular backups of MongoDB
- [ ] PM2 auto-restart enabled
- [ ] Latest security updates installed

### Setup UFW Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 📝 Environment Variables Reference

**Backend (.env):**
```env
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
PORT=3000
NODE_ENV=production
OPENAI_API_KEY=sk-...
FRONTEND_URL=http://your-domain.com
```

**Frontend (config.js):**
```javascript
API_BASE_URL = 'http://your-domain.com'
```

---

## 🎯 Quick Deployment Checklist

1. [ ] MongoDB Atlas cluster created and seeded
2. [ ] EC2 instance running (Ubuntu 20.04+)
3. [ ] Node.js 18+ installed
4. [ ] Repository cloned to `/home/ubuntu/soorga`
5. [ ] Backend `.env` file created with production values
6. [ ] Dependencies installed (`npm install`)
7. [ ] PM2 configured and running
8. [ ] Nginx installed and configured
9. [ ] Frontend `config.js` updated with production URL
10. [ ] Services tested and verified
11. [ ] SSL certificate installed (if using domain)
12. [ ] Firewall configured

---

## 📞 Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs soorga-backend`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify all services are running: `pm2 status && sudo systemctl status nginx`

---

**Deployment completed! 🎉**

Access your application at: `http://your-ec2-ip` or `https://your-domain.com`
