# Docker Deployment Guide

## Production Deployment

### Server Requirements

- Docker 20.10+
- Docker Compose 2.0+
- 2GB+ RAM
- 10GB+ storage

### Deployment Steps

#### 1. Server Setup

SSH into your server:
```bash
ssh jasonzli@pi.local
```

Install Docker (if not installed):
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

#### 2. Clone Repository

```bash
git clone https://github.com/jasonzli-DEV/D-Drive.git
cd D-Drive
```

#### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

Update with production values:
```bash
# Use your domain name
FRONTEND_URL=https://ddrive.yourdomain.com
VITE_API_URL=https://api.ddrive.yourdomain.com

# Strong passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -hex 32)

# Discord credentials
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_CHANNEL_ID=...
```

#### 4. Build and Start

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### 5. Setup Reverse Proxy (Nginx)

Create nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/ddrive
```

```nginx
server {
    listen 80;
    server_name ddrive.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name api.ddrive.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for large file uploads
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/ddrive /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. Setup SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d ddrive.yourdomain.com -d api.ddrive.yourdomain.com
```

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Service Status

```bash
docker-compose ps
```

### Resource Usage

```bash
docker stats
```

## Maintenance

### Backup Database

```bash
docker-compose exec postgres pg_dump -U ddrive ddrive > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker-compose exec -T postgres psql -U ddrive ddrive
```

### Update Application

```bash
git pull
docker-compose build
docker-compose up -d
```

### Restart Services

```bash
docker-compose restart
```

### Clean Up

```bash
# Remove stopped containers
docker-compose down

# Remove everything including volumes
docker-compose down -v
```

## Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  backend:
    restart: always
    environment:
      NODE_ENV: production
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    restart: always
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Security Best Practices

1. **Use Strong Secrets**
   - Generate random JWT_SECRET
   - Use complex database passwords

2. **Firewall Configuration**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 22/tcp
   sudo ufw enable
   ```

3. **Regular Updates**
   ```bash
   sudo apt update && sudo apt upgrade -y
   docker-compose pull
   docker-compose up -d
   ```

4. **Automated Backups**
   Create backup script:
   ```bash
   #!/bin/bash
   DATE=$(date +%Y%m%d_%H%M%S)
   docker-compose exec -T postgres pg_dump -U ddrive ddrive > /backups/ddrive_$DATE.sql
   find /backups -name "ddrive_*.sql" -mtime +7 -delete
   ```

   Add to crontab:
   ```bash
   0 2 * * * /path/to/backup.sh
   ```

## Troubleshooting

### Container Won't Start

```bash
docker-compose logs backend
docker-compose exec backend sh  # Access container shell
```

### Database Connection Issues

```bash
docker-compose exec postgres psql -U ddrive -d ddrive
```

### High Memory Usage

```bash
# Set memory limits in docker-compose.yml
services:
  backend:
    mem_limit: 512m
```

### Port Conflicts

```bash
# Check what's using ports
sudo lsof -i :3000
sudo lsof -i :5000
sudo lsof -i :5432
```
