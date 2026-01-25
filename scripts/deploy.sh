#!/bin/bash

# D-Drive Deployment Script
# Deploys D-Drive to a remote server via SSH

set -e

# Configuration
REMOTE_USER="${DEPLOY_USER:-jasonzli}"
REMOTE_HOST="${DEPLOY_HOST:-pi.local}"
REMOTE_DIR="${DEPLOY_DIR:-/home/jasonzli/D-Drive}"
GIT_REPO="https://github.com/jasonzli-DEV/D-Drive.git"

echo "🚀 D-Drive Deployment Script"
echo "=============================="
echo "Remote: $REMOTE_USER@$REMOTE_HOST"
echo "Directory: $REMOTE_DIR"
echo ""

# Check SSH connection
echo "📡 Checking SSH connection..."
if ! ssh -q $REMOTE_USER@$REMOTE_HOST exit; then
    echo "❌ Cannot connect to $REMOTE_HOST"
    exit 1
fi
echo "✅ SSH connection successful"

# Deploy application
echo ""
echo "📦 Deploying application..."

ssh $REMOTE_USER@$REMOTE_HOST << 'ENDSSH'
set -e

# Navigate to deployment directory
cd ~/D-Drive 2>/dev/null || {
    echo "📥 Cloning repository..."
    git clone https://github.com/jasonzli-DEV/D-Drive.git ~/D-Drive
    cd ~/D-Drive
}

# Pull latest changes
echo "🔄 Pulling latest changes..."
git pull origin main

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found!"
    echo "Please create .env file with your configuration"
    echo "See .env.example for required variables"
    exit 1
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose down || true

# Build and start containers
echo "🏗️  Building containers..."
docker compose build --no-cache

echo "▶️  Starting containers..."
docker compose up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Check if containers are running
if docker compose ps | grep -q "Up\|running"; then
    echo "✅ Containers are running!"
    docker compose ps
else
    echo "❌ Failed to start containers"
    docker compose logs
    exit 1
fi

echo ""
echo "✨ Deployment complete!"
echo ""
echo "Access your application at:"
echo "  Web: http://$(hostname -I | awk '{print $1}'):3000"
echo "  API: http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "View logs with: docker compose logs -f"
ENDSSH

echo ""
echo "🎉 Deployment finished successfully!"
