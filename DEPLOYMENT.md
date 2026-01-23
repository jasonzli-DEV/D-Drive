# D-Drive Deployment Instructions

## Prerequisites Completed ✅

- ✅ Full-stack application created
- ✅ Discord bot authentication system
- ✅ Google Drive-like web interface
- ✅ REST API with streaming support
- ✅ Developer CLI tool
- ✅ Docker configuration
- ✅ Git repository initialized

## Next Steps

### 1. Push to GitHub

```bash
cd /Users/zhixiangli/Desktop/GitHub/D-Drive
git push -u origin main
```

If the repository doesn't exist on GitHub yet, create it first at:
https://github.com/new

Then push:
```bash
git push -u origin main
```

### 2. Setup Discord Bot

Before deploying, you need to:

1. **Create Discord Application**
   - Go to: https://discord.com/developers/applications
   - Click "New Application"
   - Name it "D-Drive"

2. **Get OAuth Credentials**
   - Go to OAuth2 → General
   - Copy Client ID
   - Copy Client Secret
   - Add redirect URL: `http://pi.local:3000/auth/callback`

3. **Create Bot**
   - Go to Bot section
   - Click "Add Bot"
   - Copy Bot Token
   - Enable required intents:
     - Server Members Intent
     - Message Content Intent

4. **Setup Storage Server**
   - Create a new Discord server (just for storage)
   - Create a channel called "d-drive-storage"
   - Invite bot with permissions:
     - Send Messages
     - Attach Files
     - Read Message History
     - Manage Messages
   - Copy Server ID and Channel ID (enable Developer Mode in Discord first)

### 3. Deploy to Server (pi.local)

#### Option A: Automated Deployment

```bash
# Set your credentials
export DEPLOY_USER=jasonzli
export DEPLOY_HOST=pi.local

# Run deployment script
./scripts/deploy.sh
```

The script will:
- SSH into your server
- Clone the repository
- Setup Docker containers
- Start all services

#### Option B: Manual Deployment

```bash
# SSH into server
ssh jasonzli@pi.local

# Clone repository
git clone https://github.com/jasonzli-DEV/D-Drive.git
cd D-Drive

# Create .env file
cp .env.example .env
nano .env
```

Edit `.env` with your Discord credentials:
```bash
# Discord OAuth
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token

# Discord Storage
DISCORD_GUILD_ID=your_server_id
DISCORD_CHANNEL_ID=your_channel_id

# Database
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# JWT Secret
JWT_SECRET=$(openssl rand -hex 32)

# URLs
FRONTEND_URL=http://pi.local:3000
VITE_API_URL=http://pi.local:5000
```

Start the application:
```bash
docker-compose up -d
```

### 4. Verify Deployment

Check if containers are running:
```bash
ssh jasonzli@pi.local "cd D-Drive && docker-compose ps"
```

View logs:
```bash
ssh jasonzli@pi.local "cd D-Drive && docker-compose logs -f"
```

### 5. Access the Application

Once deployed, access:
- **Web UI**: http://pi.local:3000
- **API**: http://pi.local:5000
- **Health Check**: http://pi.local:5000/health

### 6. Setup CLI Tool (Local Machine)

```bash
# Install CLI globally
cd cli
npm install
npm run build
npm link

# Configure with API key (get from web UI Settings)
d-drive config --key YOUR_API_KEY
d-drive config --url http://pi.local:5000/api

# Test CLI
d-drive list
```

## Troubleshooting

### Cannot SSH to server
```bash
# Test SSH connection
ssh jasonzli@pi.local

# If fails, check:
# 1. Server is powered on
# 2. You're on the same network
# 3. SSH is enabled on server
```

### Docker not installed on server
```bash
ssh jasonzli@pi.local
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in
```

### Port conflicts
```bash
# Check what's using ports
ssh jasonzli@pi.local "sudo lsof -i :3000"
ssh jasonzli@pi.local "sudo lsof -i :5000"
ssh jasonzli@pi.local "sudo lsof -i :5432"

# Stop conflicting services or change ports in docker-compose.yml
```

### Database migration issues
```bash
ssh jasonzli@pi.local "cd D-Drive && docker-compose exec backend npx prisma migrate deploy"
```

### Discord bot not responding
- Verify bot token is correct
- Check bot is online in Discord Developer Portal
- Ensure bot has permissions in storage server
- Check channel ID is correct

## Maintenance

### View Logs
```bash
ssh jasonzli@pi.local "cd D-Drive && docker-compose logs -f"
```

### Restart Services
```bash
ssh jasonzli@pi.local "cd D-Drive && docker-compose restart"
```

### Update Application
```bash
ssh jasonzli@pi.local "cd D-Drive && git pull && docker-compose up -d --build"
```

### Backup Database
```bash
ssh jasonzli@pi.local "cd D-Drive && ./scripts/backup.sh"
```

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │  (React + Vite)
│   Port: 3000    │  - Google Drive-like UI
└────────┬────────┘  - Drag & drop uploads
         │           - File management
         ▼
┌─────────────────┐
│   Backend API   │  (Node.js + Express)
│   Port: 5000    │  - Discord bot integration
└────────┬────────┘  - File chunking & streaming
         │           - JWT & API key auth
         ▼
┌─────────────────┐
│   PostgreSQL    │  - File metadata
│   Port: 5432    │  - User data
└─────────────────┘  - API keys

         │
         ▼
┌─────────────────┐
│  Discord Bot    │  - File storage
│                 │  - 25MB chunks
└─────────────────┘  - Unlimited space
```

## Features Implemented

### Web Interface ✅
- Discord OAuth login
- Google Drive-like file browser
- Drag & drop file upload
- Progress bars for uploads
- File/folder management (create, delete, rename)
- API key management

### Backend ✅
- Discord bot for file storage
- Chunked file uploads (24MB chunks)
- Streaming downloads for large files
- REST API with JWT & API key auth
- PostgreSQL database
- File metadata tracking

### CLI Tool ✅
- Upload files/directories
- Download files
- List files
- Delete files
- Progress bars
- Configuration management

### DevOps ✅
- Docker Compose setup
- Automated deployment script
- Backup script
- Documentation (Setup, API, Docker)
- Production-ready configuration

## Performance Notes

- Supports files up to 30GB+ via streaming
- 24MB chunk size (Discord's 25MB limit with buffer)
- Concurrent chunk uploads for faster performance
- Streaming downloads to handle large files efficiently

## Security

- Discord bot token (keep secret!)
- JWT for web authentication
- API keys for CLI/programmatic access
- All passwords hashed
- Rate limiting ready (commented out)

## Credits

Based on [DisboxApp](https://github.com/DisboxApp/web) with major enhancements:
- Discord bot instead of webhooks
- Full authentication system
- Developer-friendly CLI
- Modern React UI
- Docker deployment
- Production-ready architecture

Enjoy your D-Drive! 🚀
