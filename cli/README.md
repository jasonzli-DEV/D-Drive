# D-Drive CLI v2.2.1

Command-line tool for D-Drive cloud storage.

```
╔═══════════════════════════════════════╗
║  D-Drive CLI v2.2.1                   ║
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

After installation, use the `d-drive` command:

## Quick Start

```bash
# Interactive configuration (recommended)
d-drive config

# Or set API key directly
d-drive config --key YOUR_API_KEY --url https://your-server/api

# Check connection
d-drive info

# Upload a file
d-drive upload ./backup.zip

# List files
d-drive ls

# Download a file
d-drive download /backup.zip ./local-backup.zip
```

## Commands

### Configuration

```bash
# Interactive setup
d-drive config

# Set API key
d-drive config --key dd_your_api_key

# Set API URL
d-drive config --url https://your-server/api

# View current config
d-drive config --list
# or
d-drive config -l
```

### File Operations

#### Upload

```bash
# Upload single file
d-drive upload ./file.txt

# Upload to specific folder
d-drive upload ./file.txt /backups/

# Upload directory recursively
d-drive upload ./myproject /backups/ -r

# Upload with encryption
d-drive upload ./sensitive.txt -e
```

#### Download

```bash
# Download file
d-drive download /backups/file.txt

# Download to specific location
d-drive download /backups/file.txt ./local-file.txt
```

#### List

```bash
# List root directory
d-drive ls

# List specific directory
d-drive ls /backups

# Long format with details
d-drive ls -l
d-drive ls /backups -l
```

#### Delete

```bash
# Delete file (with confirmation)
d-drive rm /old-file.txt

# Force delete without confirmation
d-drive rm /old-file.txt -f

# Delete directory recursively
d-drive rm /old-folder -r
```

#### Copy

```bash
# Create a copy of a file
d-drive cp /backups/file.txt
# Creates: /backups/file (1).txt
```

### Task Management

D-Drive supports SFTP backup tasks that can be managed via CLI.

```bash
# List all tasks
d-drive tasks ls

# Run a task immediately
d-drive tasks run <task-id>

# Stop a running task
d-drive tasks stop <task-id>

# Enable/disable a task
d-drive tasks enable <task-id>
d-drive tasks disable <task-id>

# Delete a task
d-drive tasks rm <task-id>
d-drive tasks rm <task-id> -f  # Force delete
```

### Info & Status

```bash
# Show connection status and user info
d-drive info
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
d-drive interactive
# or
d-drive i
```

Interactive mode provides a menu-driven interface for all operations.

## Getting Your API Key

1. Open D-Drive web interface
2. Go to **Settings** (gear icon)
3. Scroll to **API Keys** section
4. Click **Create API Key**
5. Copy the key (starts with `dd_`)
6. Use in CLI: `d-drive config --key dd_your_key`

## Examples

### Backup a Project

```bash
# Create a backup of your project
d-drive upload ./my-project /backups/my-project/ -r

# List backups
d-drive ls /backups/my-project -l
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y-%m-%d)
d-drive upload ./data "/backups/$DATE/"
echo "Backup completed: $DATE"
```

### Download and Restore

```bash
# Download latest backup
d-drive download /backups/2026-01-24/data.tar.gz ./restore/

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

### v2.2.1
- Fixed double output issue by removing `drive` alias
- Use `d-drive` as the single command name
- Improved consistency across documentation

### v2.2.0
- Interactive mode with menu-driven interface
- `info` command for connection status
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
