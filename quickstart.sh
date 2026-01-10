#!/bin/bash

# Quick Start Script for D-Drive
# This helps you get up and running quickly

set -e

echo "╔═══════════════════════════════════════╗"
echo "║       D-Drive Quick Start             ║"
echo "║  Discord-based Cloud Storage          ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Please run this script from the D-Drive root directory"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  IMPORTANT: Edit .env with your Discord credentials before proceeding!"
    echo ""
    echo "You need:"
    echo "  1. Discord Client ID and Secret (OAuth)"
    echo "  2. Discord Bot Token"
    echo "  3. Discord Server ID and Channel ID"
    echo ""
    read -p "Press Enter when you've configured .env, or Ctrl+C to exit..."
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "Install Docker from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    echo "Install Docker Compose from: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker is installed"
echo ""

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
docker-compose down 2>/dev/null || true

# Build containers
echo ""
echo "🏗️  Building Docker containers (this may take a few minutes)..."
docker-compose build

# Start containers
echo ""
echo "🚀 Starting D-Drive..."
docker-compose up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "✅ D-Drive is running!"
    echo ""
    echo "╔═══════════════════════════════════════╗"
    echo "║          Access Points                ║"
    echo "╠═══════════════════════════════════════╣"
    echo "║  Web UI:  http://localhost:3000      ║"
    echo "║  API:     http://localhost:5000      ║"
    echo "║  Health:  http://localhost:5000/health║"
    echo "╚═══════════════════════════════════════╝"
    echo ""
    echo "📋 Next Steps:"
    echo "  1. Open http://localhost:3000 in your browser"
    echo "  2. Click 'Login with Discord'"
    echo "  3. Start uploading files!"
    echo ""
    echo "🔧 Useful Commands:"
    echo "  View logs:     docker-compose logs -f"
    echo "  Stop:          docker-compose down"
    echo "  Restart:       docker-compose restart"
    echo "  Status:        docker-compose ps"
    echo ""
    echo "📚 Documentation:"
    echo "  Setup:         docs/SETUP.md"
    echo "  API:           docs/API.md"
    echo "  Deployment:    DEPLOYMENT.md"
    echo ""
else
    echo ""
    echo "❌ Failed to start containers"
    echo "Check logs with: docker-compose logs"
    exit 1
fi
