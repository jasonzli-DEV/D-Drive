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

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
fi

# Function to install Docker on Linux
install_docker_linux() {
    echo "🔧 Installing Docker on Linux..."
    
    # Update package index
    sudo apt-get update -y
    
    # Install prerequisites
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    
    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Set up repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Add current user to docker group
    sudo usermod -aG docker $USER
    
    # Start Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    echo "✅ Docker installed successfully"
    echo "⚠️  You may need to log out and back in for group changes to take effect"
}

# Function to install Docker on macOS
install_docker_mac() {
    echo "🔧 Installing Docker Desktop on macOS..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "📦 Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install Docker Desktop via Homebrew
    brew install --cask docker
    
    echo "✅ Docker Desktop installed"
    echo "⚠️  Please start Docker Desktop from Applications, then re-run this script"
    open -a Docker
    exit 0
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo ""
    read -p "Would you like to install Docker automatically? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        case $OS in
            linux)
                install_docker_linux
                echo "🔄 Please log out and back in, then re-run this script"
                exit 0
                ;;
            mac)
                install_docker_mac
                ;;
            *)
                echo "❌ Automatic installation not supported on this OS"
                echo "Please install Docker manually from: https://docs.docker.com/get-docker/"
                exit 1
                ;;
        esac
    else
        echo "Install Docker from: https://docs.docker.com/get-docker/"
        exit 1
    fi
fi

# Check if Docker Compose is available (either as plugin or standalone)
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    echo "Install Docker Compose from: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker is installed"
echo ""

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
if docker compose version &> /dev/null; then
    docker compose down 2>/dev/null || true
else
    docker-compose down 2>/dev/null || true
fi

# Build containers
echo ""
echo "🏗️  Building Docker containers (this may take a few minutes)..."
if docker compose version &> /dev/null; then
    docker compose build
else
    docker-compose build
fi

# Start containers
echo ""
echo "🚀 Starting D-Drive..."
if docker compose version &> /dev/null; then
    docker compose up -d
else
    docker-compose up -d
fi

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check if containers are running
COMPOSE_CMD="docker-compose"
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
fi

if $COMPOSE_CMD ps | grep -q "Up"; then
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
