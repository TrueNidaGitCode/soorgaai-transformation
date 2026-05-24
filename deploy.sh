#!/bin/bash

# SOORGA Deployment Script
# Run this on your EC2 instance after initial setup

echo "🚀 Starting SOORGA deployment..."

# Configuration
PROJECT_DIR="/home/ubuntu/soorga"
BACKEND_DIR="$PROJECT_DIR/backend/trunida-backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on EC2
if [ ! -d "$PROJECT_DIR" ]; then
    print_error "Project directory not found: $PROJECT_DIR"
    print_error "Please clone the repository first:"
    echo "cd /home/ubuntu && git clone <your-repo-url> soorga"
    exit 1
fi

# Navigate to project directory
cd $PROJECT_DIR || exit

# Pull latest changes
print_status "Pulling latest code from repository..."
git pull origin main

if [ $? -ne 0 ]; then
    print_error "Git pull failed!"
    exit 1
fi
print_success "Code updated successfully"

# Update backend dependencies
print_status "Updating backend dependencies..."
cd $BACKEND_DIR || exit

if [ -f "package.json" ]; then
    npm install
    if [ $? -ne 0 ]; then
        print_error "NPM install failed!"
        exit 1
    fi
    print_success "Backend dependencies updated"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found!"
    print_error "Please create .env file with production configuration"
    exit 1
fi

# Restart backend with PM2
print_status "Restarting backend service..."
pm2 restart soorga-backend

if [ $? -ne 0 ]; then
    print_error "PM2 restart failed!"
    print_error "Backend might not be set up yet. Run: pm2 start ecosystem.config.js"
    exit 1
fi
print_success "Backend restarted successfully"

# Reload Nginx
print_status "Reloading Nginx..."
sudo systemctl reload nginx

if [ $? -ne 0 ]; then
    print_error "Nginx reload failed!"
    exit 1
fi
print_success "Nginx reloaded successfully"

# Save PM2 configuration
pm2 save

# Show status
echo ""
echo "======================================"
print_success "Deployment completed successfully! 🎉"
echo "======================================"
echo ""

print_status "Service Status:"
pm2 status

echo ""
print_status "Recent Backend Logs:"
pm2 logs soorga-backend --lines 15 --nostream

echo ""
print_status "Application URLs:"
echo "  Frontend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "  Backend API: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/api/signals"

echo ""
print_status "To view live logs, run:"
echo "  pm2 logs soorga-backend"

echo ""
