# D-Drive CLI

Command-line tool for D-Drive cloud storage.

**Version: 2.0.0 LTS**

## Installation

```bash
npm install -g d-drive-cli
```

## Configuration

First, configure your API key:

```bash
d-drive config --key YOUR_API_KEY
```

You can get an API key from the D-Drive web interface at Settings → API Keys.

Optional: Set a custom API URL:

```bash
d-drive config --url https://your-ddrive-instance.com/api
```

View current configuration:

```bash
d-drive config --list
```

## Usage

### Upload Files

Upload a single file:

```bash
d-drive upload ./myfile.txt /backups/
```

Note: For very large files the server exposes a streaming upload endpoint (`POST /api/files/upload/stream`) that accepts multipart uploads and streams chunks directly to the storage backend without full buffering. Use the API streaming endpoint (see `docs/API.md`) for multi-GB uploads or when you need more robust handling for long uploads.

Upload a directory recursively:

```bash
d-drive upload ./myproject /backups/projects/ -r
```

### Download Files

Download a file:

```bash
d-drive download /backups/myfile.txt ./restored.txt
```

### List Files

List files in root:

```bash
d-drive list
# or
d-drive ls
```

List files in a directory:

```bash
d-drive list /backups
```

Long format with details:

```bash
d-drive list /backups -l
```

### Delete Files

Delete a file:

```bash
d-drive delete /backups/old-file.txt
```

Force delete without confirmation:

```bash
d-drive delete /backups/old-file.txt -f
```

## Examples

### Automated Backups

Create a backup script:

```bash
#!/bin/bash
# backup.sh

# Backup database
pg_dump mydb > /tmp/backup.sql
d-drive upload /tmp/backup.sql /backups/database/backup-$(date +%Y%m%d).sql

# Backup config files
d-drive upload /etc/myapp /backups/config/ -r

# Cleanup
rm /tmp/backup.sql
```

Add to crontab for daily backups:

```bash
0 2 * * * /path/to/backup.sh
```

### Continuous Integration

Upload build artifacts from CI/CD:

```yaml
# .github/workflows/deploy.yml
- name: Upload build artifacts
  run: |
    npm run build
    d-drive upload ./dist /releases/${{ github.sha }}/ -r
```

## Options

### Global Options

- `--version` - Show version number
- `--help` - Show help

### Upload Options

- `-r, --recursive` - Upload directory recursively
- `--no-progress` - Disable progress bar

### Download Options

- `--no-progress` - Disable progress bar

### List Options

- `-l, --long` - Use long listing format

### Delete Options

- `-f, --force` - Force deletion without confirmation
- `-r, --recursive` - Delete directory recursively

---

## Task Management

D-Drive supports automated SFTP backup tasks. Use the CLI to manage them:

### List Tasks

```bash
d-drive tasks list
# or
d-drive tasks ls
```

### Run a Task Immediately

```bash
d-drive tasks run <taskId>
```

### Stop a Running Task

```bash
d-drive tasks stop <taskId>
```

### Enable/Disable a Task

```bash
d-drive tasks enable <taskId>
d-drive tasks disable <taskId>
```

### Delete a Task

```bash
d-drive tasks delete <taskId>

# Force delete without confirmation
d-drive tasks delete <taskId> -f
```

### Task Examples

```bash
# List all tasks with status
$ d-drive tasks list
● Daily Server Backup [RUNNING]
  ID: abc123
  Schedule: 0 2 * * *
  SFTP: backupuser@backup.example.com:22/backups
  Destination: /backups/server
  Last Run: 1/20/2026, 2:00:00 AM (2m 15s)

# Run a backup task manually
$ d-drive tasks run abc123

# Stop a running task
$ d-drive tasks stop abc123
```

---

## License

MIT
