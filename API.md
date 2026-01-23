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
Delete a file or folder.

```http
DELETE /files/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Deleted successfully"
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
```

---

## Support

For issues or questions:
- GitHub: [D-Drive Repository](https://github.com/jasonzli-DEV/D-Drive)
- CLI: `d-drive --help`
