# D-Drive CLI v3.0.0

Command-line tool for D-Drive cloud storage.

```
╔═══════════════════════════════════════╗
║  D-Drive CLI v3.0.0                   ║
║  Discord-based cloud storage          ║
╚═══════════════════════════════════════╝
```

## Installation

```bash
# Install globally
npm install -g d-drive-cli

# Or use npx
npx d-drive-cli
```

After installation, you can use either command:
- `d-drive` - Full command name
- `drive` - Short alias

## Quick Start

```bash
# Interactive configuration (recommended)
drive config

# Or set API key directly
drive config --key YOUR_API_KEY --url https://your-server/api

# Check connection
drive info

# Upload a file
drive upload ./backup.zip

# List files
drive ls

# Download a file
drive download /backup.zip ./local-backup.zip
```

## Commands

### Configuration

```bash
# Interactive setup
drive config

# Set API key
drive config --key dd_your_api_key

# Set API URL
drive config --url https://your-server/api

# View current config
drive config --list
# or
drive config -l
```

### File Operations

#### Upload

```bash
# Upload single file (encrypted by default)
drive upload ./file.txt

# Upload to specific folder
drive upload ./file.txt /backups/

# Upload directory recursively
drive upload ./myproject /backups/ -r
```

> **Note:** All CLI uploads are **encrypted by default** for security. Files are encrypted server-side using AES-256-GCM encryption before storage.

#### Download

```bash
# Download file (automatically decrypted)
drive download /backups/file.txt

# Download to specific location
drive download /backups/file.txt ./local-file.txt
```

> **Note:** Encrypted files are automatically decrypted during download.

#### List

```bash
# List root directory
drive ls

# List specific directory
drive ls /backups

# Long format with details
drive ls -l
drive ls /backups -l
```

#### Delete
, moves to recycle bin)
drive rm /old-file.txt

# Force delete without confirmation
drive rm /old-file.txt -f
```

> **Note:** Deleted files are moved to the recycle bin and can be restored via the web interface. The `-r` flag is accepted but directory deletion operates the same way (moves entire directory to recycle bin).elete directory recursively
drive rm /old-folder -r
```

#### Copy

```bash
# Create a copy of a file
drive cp /backups/file.txt
# Creates: /backups/file (1).txt
```

### Task Management
 Tasks run on a schedule (cron) to automatically backup files from remote SFTP servers.

```bash
# List all tasks with status
drive tasks ls

# Run a task immediately (ignores schedule)
drive tasks run <task-id>

# Stop a running task
drive tasks stop <task-id>

# Enable a task (allows scheduled runs)
drive tasks enable <task-id>

# Disable a task (prevents scheduled runs)
drive tasks disable <task-id>

# Delete a task (with confirmation)
drive tasks rm <task-id>

# Force delete without confirmation
drive tasks rm <task-id> -f
```

**Task List Output:**
```
📋 SFTP Backup Tasks:
────────────────────────────────────────────────────────
ID: clmxyz123...
Name: Daily Backup
Status: ✓ Running (5m 23s) | ⏸ Stopped | ✓ Enabled
Schedule: 0 2 * * * (daily at 2:00 AM)
SFTP: user@server.example.com:22 → /backups/
Compression: GZIP | Keep: 5 files
────────────────────────────────────────────────────────
```

> **Note:** Tasks can only be created/edited via the web interface. The CLI allows management and execution only.ve tasks rm <task-id> -f  # Force delete
```

### Info & Status

```bash
# Show connection status and user info
drive info
```

Output:
```
Connection Status:
─────────────────────────────────
API URL:   https://your-server/api
API Key:   ✓ Configured
Status:    ✓ Connected
User:      YourUsername
─────────────────────────────────
```

### Interactive Mode

```bash
# Start interactive mode
drive interactive
# or
drive i
```

Interactive mode provides a menu-driven interface for all operations.

## Getting Your API Key

1. Open D-Drive web interface
2. Go to **Settings** (gear icon)
3. Scroll to **API Keys** section
4. Click **Create API Key**
5. Copy the key (starts with `dd_`)
6. Use in CLI: `drive config --key dd_your_key`

## Examples

### Backup a Project

```bash
# Create an encrypted backup of your project
drive upload ./my-project /backups/my-project/ -r

# List backups with details
drive ls /backups/my-project -l
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh - Daily project backup

DATE=$(date +%Y-%m-%d)
PROJECT_NAME="my-app"

echo "Starting backup for $PROJECT_NAME on $DATE..."

# Upload with automatic encryption
drive upload ./ "/backups/$PROJECT_NAME/$DATE/" -r

if [ $? -eq 0 ]; then
  echo "✓ Backup completed successfully: $DATE"
  
  # List to verify
  drive ls "/backups/$PROJECT_NAME/" -l
else
  echo "✗ Backup failed!"
  exit 1
fi
```configure the CLI using environment variables instead of `drive config`:

```bash
# Set in your shell profile (~/.bashrc, ~/.zshrc, etc.)
export DDRIVE_API_KEY=dd_your_api_key_here
export DDRIVE_API_URL=https://your-server/api

# Or use inline for single commands
DDRIVE_API_KEY=dd_key123 drive ls /
```

**Variables:**
- `DDRIVE_API_KEY` - Your D-Drive API key (starts with `dd_`)
- `DDRIVE_API_URL` - API base URL (default: `https://localhost/api`)

**Priority:**
1. Environment variables (highest)
2. Config file (`~/.ddrive-cli-config`)
3. Default values (lowest)

**View current configuration:**
```bash
drive config --list
# List available backups
drive ls /backups/ -l

# Download latest backup
drive download /backups/2026-01-24/data.tar.gz ./restore/

# Extract
tar -xzf ./restore/data.tar.gz -C ./restore/

echo "Restore complete!"
```

### Monitor Task Status

```bash
#!/bin/bash
# check-tasks.sh - Monitor backup task status

echo "Checking SFTP backup tasks..."
drive tasks ls

# Run a specific task
TASK_ID="clmxyz123..."
echo "Running task $TASK_ID..."
drive tasks run $TASK_ID
**Causes:**
- Server is not running
- Incorrect API URL
- Network/firewall issues
- SSL/TLS certificate problems

**Solutions:**
```bash
# Check your configuration
drive config --list

# Test with correct URL (include /api path)
drive config --url https://your-server/api

# Verify server is accessible
curl https://your-server/api/setup/status

# For local development with self-signed certs
export NODE_TLS_REJECT_UNAUTHORIZED=0  # Not recommended for production!
```

### "Invalid API key"
**Causes:**
- API key is incorrect or expired
- Missing `dd_` prefix
- Extra spaces or characters

**Solutions:**
```bash
# Generate a new API key:
# 1. Open D-Drive web interface
# 2. Go to Settings → API Keys
# 3. Click "Create API Key"
# 4. Copy the full key (including dd_ prefix)

# Configure with new key
drive config --key dd_your_new_key_here

# Verify it works
drive info
```

### "Permission denied"
**Causes:**
- Using wrong account/API key
- File/folder doesn't belong to you
- Insufficient permissions

**Solutions:**
```bash
# Check which user you're authenticated as
drive info

# Ensure you're using the correct API key
drive config --list
```

### "File not found" when listing nested folders
**Causes:**
- Folder path typo
- Folder doesn't exist
- Path should start with /

**Solutions:**
```bash
# List root to see available folders
drive ls /

# Use absolute paths
drive ls /backups/subfolder

# Use long format to see full paths
drive ls / -l
```

### Upload/Download Progress Not Showing
**Causes:**
- File is too small (progress skipped)
- Terminal doesn't support progress bars

**Solutions:**
- Progress bars automatically appear for larger files
- Check that your terminal supports ANSI escape codes
- Try in a different terminal (iTerm2, gnome-terminal, etc.)

### Task Won't Run
**Causes:**
- Task is disabled
- Another task instance is already running
- SFTP credentials are invalid
- Network connectivity issues

**Solutions:**
```bash
# Check task status
drive tasks ls

# Enable if disabled
drive tasks enable <task-id>

# If shows "Running" but stuck, stop and restart
drive tasks stop <task-id>
drive tasks run <task-id>

# Check server logs for detailed errors
```

### npm Installation Issues
**MacOS/Linux:**
```bash
# Permission errors - use one of these methods:

# Method 1: Install globally with correct permissions
sudo npm install -g d-drive-cli

# Method 2: Use npx (no installation needed)
npx d-drive-cli ls /

# Method 3: Configure npm to use different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g d-drive-cli
```

**Windows:**
```powershell
# Run PowerShell as Administrator
npm install -g d-drive-cli

# Or use npx
npx d-drive-cli ls /
```
export DDRIVE_API_URL=https://your-server/api
```

## Troubleshooting

### "Cannot connect to server"
- Check your API URL is correct
- Ensure the server is running
- Verify network connectivity

### "Invalid API key"
- Generate a new API key in Settings
- Ensure the key starts with `dd_`
- Check for extra spaces or characters

### "Permission denied"
- Verify you're logged in with the correct account
- Check file/folder permissions in D-Drive

## Changelog

### v2.2.3
- **Bug fixes:**
  - Fixed nested folder path resolution in `list` command
  - Improved API key validation (now uses `/auth/me` endpoint)
  - Added directory deletion warning message
  - Better error messages for directory download attempts
- **Documentation:** Enhanced CLI README and API docs

### v2.2.2
- **ACTUALLY** fixed double output issue (previous v2.2.1 had wrong fix)
- Added `process.exit(0)` after help display to prevent Commander.js duplicate
- Both `d-drive` and `drive` aliases work correctly

### v2.2.1 (deprecated)
- Incorrectly removed `drive` alias thinking it caused double output

### v2.2.0
- Added `drive` command alias for easier use
- Interactive mode with menu-driven interface
- `drive info` command for connection status
- Interactive configuration wizard
- Better error messages
- Colorized output
- Added `cp` alias for copy command
- Added `up` and `dl` aliases

### v2.1.0
- Task management commands
- Encryption support
- Progress bars

### v2.0.0
- Initial release with upload/download/list/delete

## License

MIT
