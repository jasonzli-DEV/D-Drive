# D-Drive - Docker Hub Installation Guide

> **Discord-based cloud storage with unlimited space**

Deploy D-Drive using pre-built Docker images from Docker Hub. This guide walks you through every step.

---

## 📦 Docker Images

| Image | Description |
|-------|-------------|
| `jasonzlidev/d-drive:backend-latest` | Backend API server |
| `jasonzlidev/d-drive:frontend-latest` | Web UI (nginx) |
| `jasonzlidev/d-drive:backend-v2.2.0` | Backend (stable v2.2.0) |
| `jasonzlidev/d-drive:frontend-v2.2.0` | Frontend (stable v2.2.0) |

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites

1. **Docker & Docker Compose** installed on your system
   ```bash
   # Check if installed
   docker --version
   docker compose version
   ```

2. **A Discord Account** (to create a Discord Application)

---

## Step 1: Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Name it (e.g., "D-Drive") and click **Create**
4. Go to **OAuth2** tab:
   - Copy the **Client ID** (save this)
   - Click "Reset Secret" and copy the **Client Secret** (save this)
   - Add Redirect URL: `http://YOUR_SERVER_IP/auth/callback`
     - For local: `http://localhost/auth/callback`
5. Go to **Bot** tab:
   - Click **"Add Bot"** → **"Yes, do it!"**
   - Click "Reset Token" and copy the **Bot Token** (save this)
   - Under "Privileged Gateway Intents", enable **Message Content Intent**

---

## Step 2: Set Up Discord Server

1. Create a new Discord server (or use existing one)
2. Enable Developer Mode:
   - User Settings → App Settings → Advanced → Developer Mode: ON
3. Right-click your server name → **Copy Server ID** (this is Guild ID)
4. Create a channel for file storage (e.g., `#d-drive-storage`)
5. Right-click the channel → **Copy Channel ID**
6. Invite your bot to the server:
   - Go to Developer Portal → Your App → OAuth2 → URL Generator
   - Select scopes: `bot`
   - Select permissions: `Send Messages`, `Attach Files`, `Read Message History`
   - Copy the generated URL and open it in browser
   - Select your server and authorize

---

## Step 3: Create Project Directory

```bash
# Create directory
mkdir d-drive && cd d-drive

# Download docker-compose.yml
curl -O https://raw.githubusercontent.com/jasonzli-DEV/D-Drive/main/docker-compose.hub.yml
mv docker-compose.hub.yml docker-compose.yml
```

Or create `docker-compose.yml` manually:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: ddrive-postgres
    environment:
      POSTGRES_USER: ddrive
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ddrive
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - ddrive-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ddrive"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  backend:
    image: jasonzlidev/d-drive:backend-latest
    container_name: ddrive-backend
    environment:
      NODE_ENV: production
      PORT: 5000
      DATABASE_URL: postgresql://ddrive:${POSTGRES_PASSWORD}@postgres:5432/ddrive
      DISCORD_CLIENT_ID: ${DISCORD_CLIENT_ID}
      DISCORD_CLIENT_SECRET: ${DISCORD_CLIENT_SECRET}
      DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN}
      DISCORD_CHANNEL_ID: ${DISCORD_CHANNEL_ID}
      DISCORD_GUILD_ID: ${DISCORD_GUILD_ID}
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_URL: ${FRONTEND_URL:-http://localhost}
    ports:
      - "5001:5000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - ddrive-network
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  frontend:
    image: jasonzlidev/d-drive:frontend-latest
    container_name: ddrive-frontend
    environment:
      VITE_DISCORD_CLIENT_ID: ${DISCORD_CLIENT_ID}
    ports:
      - "${FRONTEND_PORT:-80}:80"
    depends_on:
      - backend
    networks:
      - ddrive-network
    restart: unless-stopped

networks:
  ddrive-network:
    driver: bridge

volumes:
  postgres_data:
```

---

## Step 4: Create Environment File

Create a `.env` file:

```bash
nano .env
```

Add your configuration (replace with your values):

```env
# Database
POSTGRES_PASSWORD=your_secure_database_password

# JWT Secret (generate a random string)
JWT_SECRET=your_random_jwt_secret_at_least_32_characters_long

# Discord Configuration (from Step 1 & 2)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_server_id
DISCORD_CHANNEL_ID=your_channel_id

# Frontend Settings
FRONTEND_URL=http://localhost
FRONTEND_PORT=80

# API URL - IMPORTANT: Use /api for Docker (nginx handles routing)
VITE_API_URL=/api
VITE_DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
```

**Generate secure passwords:**
```bash
# Generate JWT secret
openssl rand -base64 32

# Generate database password
openssl rand -base64 16
```

---

## Step 5: Start D-Drive

```bash
# Pull latest images
docker compose pull

# Start all services
docker compose up -d

# Check status
docker compose ps
```

**Expected output:**
```
NAME               STATUS
ddrive-postgres    running (healthy)
ddrive-backend     running
ddrive-frontend    running
```

---

## Step 6: Access D-Drive

1. Open browser: `http://localhost` (or your server IP)
2. Click **"Login with Discord"**
3. Authorize the application
4. Start uploading files! 🎉

---

## 📋 Useful Commands

```bash
# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend

# Stop services
docker compose down

# Update to latest version
docker compose pull && docker compose up -d

# Restart services
docker compose restart

# Check disk usage
docker system df
```

---

## 🔧 Troubleshooting

### "Network error" or "Failed to connect"
```bash
# Check if containers are running
docker compose ps

# Check backend logs
docker compose logs backend
```

### "Invalid Discord credentials"
- Verify Client ID, Client Secret, and Bot Token in `.env`
- Ensure bot is invited to the server
- Check Channel ID is from the correct server

### Database issues
```bash
# Reset database
docker compose down -v
docker compose up -d
```

### Port 80 already in use
```bash
# Change port in .env
FRONTEND_PORT=3000
# Then restart
docker compose up -d
```

---

## 🔐 Security Notes

1. **Change default passwords** - Never use example passwords in production
2. **Use HTTPS** - Set up a reverse proxy (nginx/Traefik) with SSL for production
3. **Firewall** - Only expose necessary ports (80/443)
4. **Backups** - Regularly backup `postgres_data` volume

---

## 📚 More Resources

- [GitHub Repository](https://github.com/jasonzli-DEV/D-Drive)
- [API Documentation](https://github.com/jasonzli-DEV/D-Drive/blob/main/docs/API.md)
- [CLI Tool](https://github.com/jasonzli-DEV/D-Drive/tree/main/cli)
