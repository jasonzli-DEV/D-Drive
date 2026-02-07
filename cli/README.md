# D-Drive CLI v2.2.2

Command-line tool for D-Drive cloud storage.

```
╔═══════════════════════════════════════╗
║  D-Drive CLI v2.2.2                   ║
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
# Upload single file
drive upload ./file.txt

# Upload to specific folder
drive upload ./file.txt /backups/

# Upload directory recursively
drive upload ./myproject /backups/ -r

# Upload with encryption
drive upload ./sensitive.txt -e
```

#### Download

```bash
# Download file
drive download /backups/file.txt

# Download to specific location
drive download /backups/file.txt ./local-file.txt
```

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

```bash
# Delete file (with confirmation)
drive rm /old-file.txt

# Force delete without confirmation
drive rm /old-file.txt -f

# Delete directory recursively
drive rm /old-folder -r
```

#### Copy

```bash
# Create a copy of a file
drive cp /backups/file.txt
# Creates: /backups/file (1).txt
```

### Task Management

D-Drive supports SFTP backup tasks that can be managed via CLI.

```bash
# List all tasks
drive tasks ls

# Run a task immediately
drive tasks run <task-id>

# Stop a running task
drive tasks stop <task-id>

# Enable/disable a task
drive tasks enable <task-id>
drive tasks disable <task-id>

# Delete a task
drive tasks rm <task-id>
drive tasks rm <task-id> -f  # Force delete
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
# Create a backup of your project
drive upload ./my-project /backups/my-project/ -r

# List backups
drive ls /backups/my-project -l
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y-%m-%d)
drive upload ./data "/backups/$DATE/"
echo "Backup completed: $DATE"
```

### Download and Restore

```bash
# Download latest backup
drive download /backups/2026-01-24/data.tar.gz ./restore/

# Extract
tar -xzf ./restore/data.tar.gz
```

## Environment Variables

You can also configure the CLI using environment variables:

```bash
export DDRIVE_API_KEY=dd_your_api_key
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
