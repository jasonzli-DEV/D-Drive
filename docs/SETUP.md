# D-Drive Setup Guide

## Prerequisites

- Docker and Docker Compose
- Discord Bot Token and OAuth credentials
- PostgreSQL database (included in Docker setup)

## Discord Bot Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "D-Drive" and create

### 2. Configure OAuth

1. Go to "OAuth2" → "General"
2. Add redirect URL: `http://your-domain.com/auth/callback`
3. Copy your **Client ID** and **Client Secret**

### 3. Create Bot

1. Go to "Bot" section
2. Click "Add Bot"
3. Copy the **Bot Token**
4. Enable these **Privileged Gateway Intents**:
   - Server Members Intent
   - Message Content Intent

### 4. Setup Storage Server

1. Create a new Discord server (or use existing)
2. Create a dedicated channel for file storage
3. Invite your bot to the server with these permissions:
   - Send Messages
   - Attach Files
   - Read Message History
   - Manage Messages
4. Copy the **Server (Guild) ID** and **Channel ID**

To get IDs:
- Enable Developer Mode in Discord (Settings → Advanced)
- Right-click server/channel → Copy ID

## Installation

### Option 1: Docker (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/jasonzli-DEV/D-Drive.git
cd D-Drive
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Edit `.env` with your Discord credentials:
```bash
# Discord OAuth
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
DISCORD_BOT_TOKEN=your_bot_token_here

# Discord Storage
DISCORD_GUILD_ID=your_server_id_here
DISCORD_CHANNEL_ID=your_channel_id_here

# Database
POSTGRES_PASSWORD=secure_password_here

# JWT Secret (generate with: openssl rand -hex 32)
JWT_SECRET=your_jwt_secret_here

# URLs
FRONTEND_URL=http://localhost:3000
VITE_API_URL=http://localhost:5000
```

4. Start the application:
```bash
docker-compose up -d
```

5. Access the application:
- Web UI: http://localhost:3000
- API: http://localhost:5000

### Option 2: Manual Installation

#### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npx prisma migrate deploy
npx prisma generate
npm run build
npm start
```

#### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your API URL
npm run build
npm run preview
```

#### CLI Tool

```bash
cd cli
npm install
npm run build
npm link  # Install globally
```

## First-Time Setup

1. Navigate to http://localhost:3000
2. Click "Login with Discord"
3. Authorize the application
4. You'll be redirected to the D-Drive interface

## CLI Setup

1. Generate an API key:
   - Log into web interface
   - Go to Settings → API Keys
   - Create a new API key
   - Copy the key

2. Configure CLI:
```bash
d-drive config --key YOUR_API_KEY
d-drive config --url http://localhost:5000/api
```

3. Test the CLI:
```bash
d-drive list
d-drive upload ./test.txt /
```

## Troubleshooting

### Bot Not Responding

- Verify bot token is correct
- Check bot has proper permissions in Discord server
- Ensure bot is online (check Discord Developer Portal)

### Upload Failures

- Verify channel ID is correct
- Check bot has "Attach Files" permission
- Ensure Discord server has enough space

### Authentication Errors

- Verify OAuth redirect URL matches exactly
- Check client ID and secret are correct
- Clear browser cookies and try again

### Database Connection Issues

- Ensure PostgreSQL is running
- Verify DATABASE_URL in .env
- Check database credentials

## Production Deployment

See [DOCKER.md](DOCKER.md) for production deployment guide.
