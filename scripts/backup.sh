#!/bin/bash

# Backup script for D-Drive
# Creates database backups and uploads them to D-Drive

set -e

BACKUP_DIR="/tmp/ddrive-backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_BACKUP="$BACKUP_DIR/database_$DATE.sql"

# Create backup directory
mkdir -p $BACKUP_DIR

echo "🗄️  Creating database backup..."

# Backup PostgreSQL database
docker-compose exec -T postgres pg_dump -U ddrive ddrive > "$DB_BACKUP"

echo "✅ Database backup created: $DB_BACKUP"

# Compress backup
echo "📦 Compressing backup..."
gzip "$DB_BACKUP"
DB_BACKUP="$DB_BACKUP.gz"

echo "✅ Backup compressed: $DB_BACKUP"

# Upload to D-Drive (if CLI is configured)
if command -v d-drive &> /dev/null; then
    echo "☁️  Uploading to D-Drive..."
    d-drive upload "$DB_BACKUP" "/backups/database/" || echo "⚠️  Upload failed (CLI not configured?)"
else
    echo "ℹ️  D-Drive CLI not found, skipping upload"
fi

# Clean up old backups (keep last 7 days)
echo "🧹 Cleaning up old backups..."
find $BACKUP_DIR -name "database_*.sql.gz" -mtime +7 -delete

echo "✅ Backup complete!"
