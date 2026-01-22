# D-Drive API Documentation

## Base URL
```
http://your-server:5000/api
```

## Authentication

All API requests (except health check) require authentication using either:
- **JWT Token**: `Authorization: Bearer <jwt_token>`
- **API Key**: `Authorization: Bearer dd_<api_key>`

### Get API Key
1. Log in via Discord OAuth at `/login`
2. Go to Settings and create an API key
3. Copy the key (shown only once)

---

## Endpoints

### Health Check
Check if the API is running.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-10T12:00:00.000Z"
}
```

---

### Authentication

#### Get Current User
Get information about the authenticated user.

```http
GET /auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "discordId": "123456789",
    "discordUsername": "username#1234",
    "email": "user@example.com"
  }
}
```

#### Logout
Invalidate the current session.

```http
POST /auth/logout
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

---

### Files & Folders

#### List Files
List files and folders in a directory.

```http
GET /files?parentId=<folder-id>
Authorization: Bearer <token>
```

**Query Parameters:**
- `parentId` (optional): Parent folder ID. Omit for root directory.

**Response:**
```json
[
  {
    "id": "file-id",
    "name": "document.pdf",
    "type": "FILE",
    "size": 1024000,
    "mimeType": "application/pdf",
    "encrypted": false,
    "createdAt": "2026-01-10T12:00:00.000Z",
    "updatedAt": "2026-01-10T12:00:00.000Z"
  },
  {
    "id": "folder-id",
    "name": "My Folder",
    "type": "DIRECTORY",
    "size": 0,
    "createdAt": "2026-01-10T12:00:00.000Z",
    "updatedAt": "2026-01-10T12:00:00.000Z"
  }
]
```

#### Get File Details
Get details of a specific file or folder.

```http
GET /files/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "file-id",
  "name": "document.pdf",
  "type": "FILE",
  "size": 1024000,
  "mimeType": "application/pdf",
  "encrypted": false,
  "parentId": null,
  "path": "/document.pdf",
  "createdAt": "2026-01-10T12:00:00.000Z",
  "updatedAt": "2026-01-10T12:00:00.000Z"
}
```

#### Upload File
Upload a file to D-Drive.

```http
POST /files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file` (required): The file to upload
- `parentId` (optional): Parent folder ID
- `path` (required): File path (e.g., `/documents/file.pdf`)
- `encrypt` (optional): Set to `"true"` to encrypt with AES-256-GCM

**Response:**
```json
{
  "id": "file-id",
  "name": "document.pdf",
  "type": "FILE",
  "size": 1024000,
  "mimeType": "application/pdf",
  "encrypted": true,
  "createdAt": "2026-01-10T12:00:00.000Z"
}
```

**Example with cURL:**
```bash
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer dd_your_api_key" \
  -F "file=@/path/to/file.pdf" \
  -F "path=/documents/file.pdf" \
  -F "encrypt=true"
```

#### Download File
Download a file from D-Drive.

```http
GET /files/:id/download
Authorization: Bearer <token>
```

**Response:**
- Binary file content
- Headers:
  - `Content-Type`: File MIME type
  - `Content-Disposition`: `attachment; filename="<filename>"`
  - `Content-Length`: File size in bytes

**Example with cURL:**
```bash
curl -X GET http://localhost:5000/api/files/:id/download \
  -H "Authorization: Bearer dd_your_api_key" \
  -o downloaded_file.pdf
```

#### Create Folder
Create a new folder.

```http
POST /files/directory
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Folder",
  "parentId": null,
  "path": "/My Folder"
}
```

**Response:**
```json
{
  "id": "folder-id",
  "name": "My Folder",
  "type": "DIRECTORY",
  "createdAt": "2026-01-10T12:00:00.000Z"
}
```

#### Update File/Folder
Update file or folder name.

```http
PATCH /files/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "New Name.pdf"
}
```

**Response:**
```json
{
  "id": "file-id",
  "name": "New Name.pdf",
  "updatedAt": "2026-01-10T12:00:00.000Z"
}
```

#### Move File/Folder
Move a file or folder to a different parent folder.

```http
PATCH /files/:id/move
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "targetFolderId": "folder-id"
}
```

**Response:**
```json
{
  "id": "file-id",
  "name": "document.pdf",
  "parentId": "folder-id",
  "updatedAt": "2026-01-10T12:00:00.000Z"
}
```

#### Delete File/Folder
Delete a file or folder. Files are moved to recycle bin by default.

```http
DELETE /files/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (optional):**
```json
{
  "recursive": true,
  "permanent": false
}
```

- `recursive`: Required for non-empty directories
- `permanent`: Skip recycle bin and delete permanently

**Response:**
```json
{
  "message": "Moved to recycle bin",
  "recycleBin": true
}
```

---

### Recycle Bin

#### List Recycle Bin
Get all files in the recycle bin.

```http
GET /files/recycle-bin
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "file-id",
    "name": "deleted-file.pdf",
    "type": "FILE",
    "size": "1048576",
    "deletedAt": "2026-01-10T12:00:00.000Z",
    "originalPath": "/documents/deleted-file.pdf"
  }
]
```

#### Restore from Recycle Bin
Restore a file to its original location.

```http
POST /files/recycle-bin/:id/restore
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "File restored successfully",
  "filesRestored": 1
}
```

#### Permanently Delete from Recycle Bin
Permanently delete a file from the recycle bin.

```http
DELETE /files/recycle-bin/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "File permanently deleted",
  "filesDeleted": 1
}
```

#### Empty Recycle Bin
Permanently delete all files in the recycle bin.

```http
DELETE /files/recycle-bin
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Recycle bin emptied",
  "filesDeleted": 5
}
```

---

### Sharing

#### Share a File
Share a file or folder with another user.

```http
POST /shares
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fileId": "file-id",
  "username": "targetuser",
  "permission": "VIEW"
}
```

**Permissions:**
- `VIEW`: Can view and download
- `EDIT`: Can view, download, and rename
- `ADMIN`: Full control including delete and reshare

**Response:**
```json
{
  "message": "File shared successfully",
  "share": {
    "id": "share-id",
    "permission": "VIEW",
    "sharedWith": {
      "id": "user-id",
      "username": "targetuser"
    }
  }
}
```

#### List Shares Created by Me
Get all files I've shared with others.

```http
GET /shares/by-me
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "share-id",
    "permission": "VIEW",
    "file": {
      "id": "file-id",
      "name": "shared-doc.pdf"
    },
    "sharedWith": {
      "username": "otheruser"
    }
  }
]
```

#### List Files Shared with Me
Get all files others have shared with me.

```http
GET /shares/with-me
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "share-id",
    "permission": "VIEW",
    "file": {
      "id": "file-id",
      "name": "shared-doc.pdf"
    },
    "owner": {
      "username": "fileowner"
    }
  }
]
```

#### Remove Share
Remove a share (as owner) or remove yourself from a share (as recipient).

```http
DELETE /shares/:shareId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Share removed successfully"
}
```

#### List All Folders
Get a flat list of all folders (for move operations).

```http
GET /files/folders/all
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "folder-1",
    "name": "Documents",
    "type": "DIRECTORY"
  },
  {
    "id": "folder-2",
    "name": "Photos",
    "type": "DIRECTORY"
  }
]
```

---

### Tasks

Tasks are automated SFTP backup jobs that run on a schedule (cron expression).

#### List Tasks
Get all tasks for the authenticated user.

```http
GET /tasks
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "task-id",
    "name": "Daily Server Backup",
    "enabled": true,
    "cron": "0 2 * * *",
    "sftpHost": "backup.example.com",
    "sftpPort": 22,
    "sftpUser": "backupuser",
    "sftpPath": "/backups",
    "destinationId": "folder-id",
    "destinationPath": "/backups/server",
    "compress": "TAR_GZ",
    "maxFiles": 7,
    "lastRun": "2026-01-10T02:00:00.000Z",
    "lastStarted": "2026-01-10T02:00:00.000Z",
    "lastRuntime": 125,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

#### Create Task
Create a new backup task.

```http
POST /tasks
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Daily Server Backup",
  "enabled": true,
  "cron": "0 2 * * *",
  "sftpHost": "backup.example.com",
  "sftpPort": 22,
  "sftpUser": "backupuser",
  "sftpPath": "/backups",
  "authPassword": true,
  "authPrivateKey": false,
  "sftpPassword": "secure_password",
  "destinationId": "folder-id",
  "compress": "TAR_GZ",
  "maxFiles": 7
}
```

**Response:**
```json
{
  "id": "task-id",
  "name": "Daily Server Backup",
  "enabled": true,
  "cron": "0 2 * * *",
  "destinationPath": "/backups/server",
  "createdAt": "2026-01-10T12:00:00.000Z"
}
```

#### Update Task
Update an existing task.

```http
PATCH /tasks/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** Same as create, all fields optional.

**Response:**
```json
{
  "id": "task-id",
  "name": "Updated Task Name",
  "enabled": false,
  "updatedAt": "2026-01-10T12:00:00.000Z"
}
```

#### Delete Task
Delete a task.

```http
DELETE /tasks/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Task deleted successfully"
}
```

#### Run Task Now
Manually trigger a task to run immediately.

```http
POST /tasks/:id/run
Authorization: Bearer <token>
```

**Response (Success):**
```json
{
  "ok": true,
  "task": {
    "id": "task-id",
    "lastRun": "2026-01-10T12:00:00.000Z"
  }
}
```

**Response (409 - Already Running):**
```json
{
  "error": "This task is already running. Please wait for it to complete or stop it first."
}
```

#### Stop Running Task
Stop a currently running task.

```http
POST /tasks/:id/stop
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true
}
```

**Error Response:**
```json
{
  "error": "Task is not currently running"
}
```

**Task Fields:**
- `cron`: Cron expression (e.g., "0 2 * * *" = daily at 2 AM)
- `compress`: Compression format - "NONE", "ZIP", or "TAR_GZ"
- `maxFiles`: Max backup files to keep (0 = unlimited)
- `lastRuntime`: Runtime in seconds of last completed task
- `authPassword`: Enable password authentication
- `authPrivateKey`: Enable SSH key authentication

---

### API Keys

#### List API Keys
Get all API keys for the current user.

```http
GET /api-keys
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "key-id",
    "name": "My CLI Key",
    "key": "dd_*********************abcd",
    "createdAt": "2026-01-10T12:00:00.000Z",
    "lastUsed": "2026-01-10T12:30:00.000Z"
  }
]
```

**Note:** Keys are masked in list responses. Full key is only shown once during creation.

#### Create API Key
Create a new API key.

```http
POST /api-keys
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My CLI Key"
}
```

**Response:**
```json
{
  "id": "key-id",
  "name": "My CLI Key",
  "key": "dd_1234567890abcdef1234567890abcdef",
  "createdAt": "2026-01-10T12:00:00.000Z"
}
```

**⚠️ Important:** Save the key immediately. It cannot be retrieved again.

#### Delete API Key
Delete an API key.

```http
DELETE /api-keys/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "API key deleted successfully"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

- `200 OK`: Request succeeded
- `401 Unauthorized`: Invalid or missing authentication
- `403 Forbidden`: Not authorized to access resource
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., task already running)
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### Rate Limits

- General API: 100 requests per 15 minutes
- Authentication endpoints: 10 requests per 15 minutes

---

## File Encryption

D-Drive supports client-side AES-256-GCM encryption:

1. When uploading, set `encrypt=true`
2. Server generates or uses your encryption key (stored securely)
3. File is encrypted before being split into chunks
4. Chunks are uploaded to Discord
5. On download, file is automatically decrypted

**Encryption Details:**
- Algorithm: AES-256-GCM (authenticated encryption)
- Key Derivation: PBKDF2 with 100,000 iterations
- IV: 12 bytes (randomly generated per file)
- Auth Tag: 16 bytes for integrity verification

---

## Python Example

```python
import requests

API_URL = "http://localhost:5000/api"
API_KEY = "dd_your_api_key_here"

headers = {
    "Authorization": f"Bearer {API_KEY}"
}

# List files
response = requests.get(f"{API_URL}/files", headers=headers)
files = response.json()
print(files)

# Upload file
with open("document.pdf", "rb") as f:
    files_data = {
        "file": f,
        "path": (None, "/documents/document.pdf"),
        "encrypt": (None, "true")
    }
    response = requests.post(
        f"{API_URL}/files/upload",
        headers=headers,
        files=files_data
    )
    print(response.json())

# Download file
file_id = "your-file-id"
response = requests.get(
    f"{API_URL}/files/{file_id}/download",
    headers=headers
)
with open("downloaded.pdf", "wb") as f:
    f.write(response.content)
```

---

## JavaScript/Node.js Example

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const API_URL = 'http://localhost:5000/api';
const API_KEY = 'dd_your_api_key_here';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`
  }
});

// List files
async function listFiles() {
  const response = await client.get('/files');
  console.log(response.data);
}

// Upload file
async function uploadFile(filePath) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));
  formData.append('path', `/${path.basename(filePath)}`);
  formData.append('encrypt', 'true');

  const response = await client.post('/files/upload', formData, {
    headers: formData.getHeaders()
  });
  console.log(response.data);
}

// Download file
async function downloadFile(fileId, outputPath) {
  const response = await client.get(`/files/${fileId}/download`, {
    responseType: 'stream'
  });
  response.data.pipe(fs.createWriteStream(outputPath));
}

// List tasks
async function listTasks() {
  const response = await client.get('/tasks');
  console.log(response.data);
}

// Run task
async function runTask(taskId) {
  const response = await client.post(`/tasks/${taskId}/run`);
  console.log(response.data);
}

// Stop task
async function stopTask(taskId) {
  const response = await client.post(`/tasks/${taskId}/stop`);
  console.log(response.data);
}
```

---

## CLI Examples

The D-Drive CLI (v2.1.0 LTS) provides easy command-line access:

```bash
# Configure
d-drive config --key YOUR_API_KEY

# File operations
d-drive upload ./file.txt /backups/
d-drive download /backups/file.txt ./restored.txt
d-drive list /backups
d-drive delete /backups/old-file.txt

# Task management
d-drive tasks list              # List all backup tasks
d-drive tasks run <taskId>      # Run task immediately
d-drive tasks stop <taskId>     # Stop running task
d-drive tasks enable <taskId>   # Enable a task
d-drive tasks disable <taskId>  # Disable a task
d-drive tasks delete <taskId>   # Delete a task
```

Install CLI: `npm install -g d-drive-cli`

---

## Support

For issues or questions:
- GitHub: [D-Drive Repository](https://github.com/jasonzli-DEV/D-Drive)
- CLI: `d-drive --help`
