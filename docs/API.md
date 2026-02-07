# D-Drive API Documentation v2.2.2

Base URL: `/api` (relative) or `http://your-server/api`

> **Note:** When using Docker, the frontend proxies `/api` requests to the backend automatically.

---

## Authentication

All API endpoints (except `/setup/*` and `/auth/*`) require authentication.

### Methods

1. **JWT Token** - Obtained through Discord OAuth
   ```
   Authorization: Bearer <jwt_token>
   ```

2. **API Key** - Generated in web interface (Settings → API Keys)
   ```
   Authorization: Bearer dd_<api_key>
   ```

---

## Endpoints Overview

| Category | Endpoints |
|----------|-----------|
| Setup | `/setup/status`, `/setup/configure`, `/setup/validate-discord` |
| Auth | `/auth/discord`, `/auth/discord/callback`, `/auth/logout`, `/auth/me` |
| Files | `/files`, `/files/:id`, `/files/upload`, `/files/directory`, etc. |
| Tasks | `/tasks`, `/tasks/:id`, `/tasks/:id/run`, `/tasks/:id/stop` |
| Shares | `/shares`, `/shares/:id` |
| API Keys | `/api-keys`, `/api-keys/:id` |
| Logs | `/logs` |

---

## Setup Endpoints

### Check Setup Status
```http
GET /setup/status
```

Response:
```json
{
  "setupRequired": false,
  "configured": {
    "database": true,
    "jwt": true,
    "discordClient": true,
    "discordBot": true,
    "discordGuild": true,
    "discordChannel": true
  }
}
```

### Validate Discord Configuration
```http
POST /setup/validate-discord
Content-Type: application/json
```

Body:
```json
{
  "discordBotToken": "your_bot_token",
  "discordGuildId": "guild_id",
  "discordChannelId": "channel_id"
}
```

### Save Configuration
```http
POST /setup/configure
Content-Type: application/json
```

Body:
```json
{
  "discordClientId": "client_id",
  "discordClientSecret": "client_secret",
  "discordBotToken": "bot_token",
  "discordGuildId": "guild_id",
  "discordChannelId": "channel_id"
}
```

---

## Authentication Endpoints

### Login with Discord OAuth
```http
GET /auth/discord
```
Redirects to Discord OAuth page.

### OAuth Callback
```http
GET /auth/discord/callback?code=<oauth_code>
```

Response:
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "username": "username",
    "discriminator": "1234",
    "avatar": "avatar_hash"
  }
}
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "user-id",
  "discordId": "123456789",
  "discordUsername": "username#1234",
  "email": "user@example.com",
  "timezone": "America/New_York",
  "theme": "dark"
}
```

### Update User Settings
```http
PATCH /me
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "timezone": "America/New_York",
  "theme": "dark"
}
```

Response:
```json
{
  "id": "user-id",
  "timezone": "America/New_York",
  "theme": "dark",
  "updatedAt": "2026-02-07T12:00:00.000Z"
}
```

### Logout
```http
POST /auth/logout
Authorization: Bearer <token>
```

---

## Files Endpoints

### List Files
```http
GET /files?parentId=<folder_id>
Authorization: Bearer <token>
```

Query Parameters:
- `parentId` (optional): Filter by parent folder ID (omit for root)
- `path` (optional): Filter by path

Response:
```json
[
  {
    "id": "file_id",
    "name": "file.txt",
    "type": "FILE",
    "size": "1024",
    "path": "/file.txt",
    "parentId": null,
    "mimeType": "text/plain",
    "starred": false,
    "createdAt": "2026-01-24T...",
    "updatedAt": "2026-01-24T..."
  }
]
```

### Get File Details
```http
GET /files/:id
Authorization: Bearer <token>
```

### Upload File (Standard)
```http
POST /files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Form fields:
- `file`: File to upload (required)
- `parentId`: Parent folder ID (optional)
- `encrypt`: `true` to encrypt (optional)

### Upload File (Streaming - Recommended for Large Files)
```http
POST /files/upload/stream
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Form fields:
- `file`: File to upload (required)
- `parentId`: Parent folder ID (optional)
- `encrypt`: `true` to encrypt (optional)

Example (cURL):
```bash
curl -X POST https://your-server/api/files/upload/stream \
  -H "Authorization: Bearer dd_your_api_key" \
  -F "parentId=folder_id" \
  -F "encrypt=true" \
  -F "file=@/path/to/large-file.iso"
```

### Download File
```http
GET /files/:id/download
Authorization: Bearer <token>
```

Returns file as stream with appropriate Content-Type header.

### Create Directory
```http
POST /files/directory
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "name": "folder-name",
  "parentId": "parent_folder_id"
}
```

### Rename/Update File
```http
PATCH /files/:id
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "name": "new-name.txt"
}
```

### Delete File
```http
DELETE /files/:id
Authorization: Bearer <token>
```

### Copy File
```http
POST /files/:id/copy
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "destinationId": "target_folder_id"
}
```

### Move File
```http
POST /files/:id/move
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "destinationId": "target_folder_id"
}
```

### Toggle Starred
```http
POST /files/:id/star
Authorization: Bearer <token>
```

### List Starred Files
```http
GET /files/starred
Authorization: Bearer <token>
```

### List All Folders
```http
GET /files/folders/all
Authorization: Bearer <token>
```

---

## Recycle Bin Endpoints

### List Deleted Files
```http
GET /files/recycle-bin
Authorization: Bearer <token>
```

### Restore File
```http
POST /files/:id/restore
Authorization: Bearer <token>
```

### Permanently Delete
```http
DELETE /files/:id/permanent
Authorization: Bearer <token>
```

### Empty Recycle Bin
```http
DELETE /files/recycle-bin/empty
Authorization: Bearer <token>
```

---

## Tasks Endpoints (SFTP Backup)

### List Tasks
```http
GET /tasks
Authorization: Bearer <token>
```

### Create Task
```http
POST /tasks
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "name": "Daily Backup",
  "enabled": true,
  "cron": "0 2 * * *",
  "sftpHost": "server.example.com",
  "sftpPort": 22,
  "sftpUser": "backupuser",
  "sftpPrivateKey": "-----BEGIN OPENSSH PRIVATE KEY-----...",
  "sftpRemotePath": "/home/user/data",
  "destinationId": "folder_id",
  "compress": "GZIP",
  "maxFiles": 5
}
```

### Update Task
```http
PATCH /tasks/:id
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "name": "Updated Name",
  "enabled": true,
  "cron": "0 3 * * *"
}
```

### Delete Task
```http
DELETE /tasks/:id
Authorization: Bearer <token>
```

### Run Task Manually
```http
POST /tasks/:id/run
Authorization: Bearer <token>
```

### Stop Running Task
```http
POST /tasks/:id/stop
Authorization: Bearer <token>
```

### Get Task Progress
```http
GET /tasks/running/progress
Authorization: Bearer <token>
```

### Get Queue Status
```http
GET /tasks/queue/status
Authorization: Bearer <token>
```

---

## Shares Endpoints

### List Shared Files
```http
GET /shares
Authorization: Bearer <token>
```

### Share File
```http
POST /shares
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "fileId": "file_id",
  "targetUserId": "user_id",
  "permission": "VIEW"
}
```

### Delete Share
```http
DELETE /shares/:id
Authorization: Bearer <token>
```

---

## API Keys Endpoints

### List API Keys
```http
GET /api-keys
Authorization: Bearer <token>
```

### Create API Key
```http
POST /api-keys
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "name": "CLI Access"
}
```

Response:
```json
{
  "id": "key_id",
  "key": "dd_abc123...",
  "name": "CLI Access",
  "createdAt": "2026-01-24T..."
}
```

> **Important:** The full key is only shown once. Store it securely.

### Delete API Key
```http
DELETE /api-keys/:id
Authorization: Bearer <token>
```

---

## Public Links Endpoints

### Create Public Link
```http
POST /public-links
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "fileId": "file_id",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

Response:
```json
{
  "id": "link_id",
  "slug": "abc123xyz",
  "fileId": "file_id",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "url": "https://your-server/share/abc123xyz"
}
```

### List Public Links
```http
GET /public-links
Authorization: Bearer <token>
```

### Get Public Link (No Auth Required)
```http
GET /public-links/:slug
```

### Download via Public Link (No Auth Required)
```http
GET /public-links/:slug/download
```

### Delete Public Link
```http
DELETE /public-links/:id
Authorization: Bearer <token>
```

---

## Metrics Endpoints

### Get System Metrics
```http
GET /metrics
Authorization: Bearer <token>
```

Response:
```json
{
  "storageUsed": 5368709120,
  "storageUsedFormatted": "5.0 GB",
  "fileCount": 1234,
  "folderCount": 56,
  "encryptedFileCount": 890
}
```

---

## Avatar Endpoints

### Upload Avatar
```http
POST /avatars/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Form fields:
- `avatar`: Image file (PNG, JPG, GIF, max 5MB)

### Get Avatar
```http
GET /avatars/:userId
```

Returns image file (no authentication required).

---

## Logs Endpoints

### Get Logs
```http
GET /logs?page=1&limit=50
Authorization: Bearer <token>
```

Query Parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)

---

## Error Responses

All errors return JSON:

```json
{
  "error": "Error message here"
}
```

| Status Code | Meaning |
|-------------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid token |
| 403 | Forbidden - No permission |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Examples

### Python

```python
import requests

API_URL = "https://your-server/api"
API_KEY = "dd_your_api_key"

headers = {"Authorization": f"Bearer {API_KEY}"}

# Upload file
with open("backup.zip", "rb") as f:
    response = requests.post(
        f"{API_URL}/files/upload/stream",
        headers=headers,
        files={"file": f},
        data={"encrypt": "true"}
    )
    print(response.json())

# List files
response = requests.get(f"{API_URL}/files", headers=headers)
for file in response.json():
    print(f"{file['name']} - {file['size']} bytes")

# Download file
file_id = "abc123"
response = requests.get(
    f"{API_URL}/files/{file_id}/download",
    headers=headers,
    stream=True
)
with open("downloaded.zip", "wb") as f:
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)
```

### JavaScript/Node.js

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const API_URL = 'https://your-server/api';
const API_KEY = 'dd_your_api_key';
const headers = { Authorization: `Bearer ${API_KEY}` };

// Upload file
async function upload() {
  const form = new FormData();
  form.append('file', fs.createReadStream('backup.zip'));
  form.append('encrypt', 'true');

  const res = await axios.post(`${API_URL}/files/upload/stream`, form, {
    headers: { ...headers, ...form.getHeaders() }
  });
  console.log('Uploaded:', res.data);
}

// List files
async function list() {
  const res = await axios.get(`${API_URL}/files`, { headers });
  res.data.forEach(f => console.log(`${f.name} - ${f.size} bytes`));
}

// Download file
async function download(fileId) {
  const res = await axios.get(`${API_URL}/files/${fileId}/download`, {
    headers,
    responseType: 'stream'
  });
  res.data.pipe(fs.createWriteStream('downloaded.zip'));
}
```

### cURL

```bash
# Upload file (encrypted by default when using CLI)
curl -X POST https://your-server/api/files/upload/stream \
  -H "Authorization: Bearer dd_your_api_key" \
  -F "file=@backup.zip" \
  -F "encrypt=true"

# List files
curl https://your-server/api/files \
  -H "Authorization: Bearer dd_your_api_key"

# Download file
curl https://your-server/api/files/FILE_ID/download \
  -H "Authorization: Bearer dd_your_api_key" \
  -o downloaded.zip

# Create folder
curl -X POST https://your-server/api/files/directory \
  -H "Authorization: Bearer dd_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "backups", "path": "/backups"}'

# Delete file (moves to recycle bin)
curl -X DELETE https://your-server/api/files/FILE_ID \
  -H "Authorization: Bearer dd_your_api_key"

# Update user timezone
curl -X PATCH https://your-server/api/me \
  -H "Authorization: Bearer dd_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"timezone": "America/New_York"}'

# Create public link
curl -X POST https://your-server/api/public-links \
  -H "Authorization: Bearer dd_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"fileId": "FILE_ID", "expiresAt": "2026-12-31T23:59:59.000Z"}'

# Run SFTP backup task
curl -X POST https://your-server/api/tasks/TASK_ID/run \
  -H "Authorization: Bearer dd_your_api_key"
```

---

## CLI Usage

D-Drive CLI v2.2.2 provides command-line access:

```bash
# Install
npm install -g d-drive-cli

# Configure
drive config --key dd_your_api_key
drive config --url https://your-server/api

# File operations (encrypted by default)
drive upload ./file.txt /backups/
drive upload ./myproject /backups/ -r    # Recursive
drive download /backups/file.txt ./restored.txt
drive ls /backups -l                     # Long format
drive rm /backups/old.txt -f             # Force delete
drive cp /backups/file.txt               # Create copy

# Tasks
drive tasks ls
drive tasks run <task-id>
drive tasks stop <task-id>
drive tasks enable <task-id>
drive tasks disable <task-id>

# Interactive mode
drive interactive

# Connection status
drive info
```

**Aliases:** `d-drive` = `drive`, and command shortcuts (`ls`, `rm`, `cp`, `up`, `dl`, `i`)

**Environment Variables:**
```bash
export DDRIVE_API_KEY=dd_your_key
export DDRIVE_API_URL=https://your-server/api
```
