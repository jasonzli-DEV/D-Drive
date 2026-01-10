# D-Drive API Documentation

Base URL: `http://localhost:5000/api` (or your configured URL)

## Authentication

All API endpoints except `/auth/*` require authentication.

### Methods

1. **JWT Token** - Obtained through Discord OAuth
   ```
   Authorization: Bearer <jwt_token>
   ```

2. **API Key** - Generated in web interface
   ```
   Authorization: Bearer dd_<api_key>
   ```

## Endpoints

### Authentication

#### Login with Discord OAuth
```
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

#### Get Current User
```
GET /auth/me
Authorization: Bearer <token>
```

#### Logout
```
POST /auth/logout
Authorization: Bearer <token>
```

### Files

#### List Files
```
GET /files?path=/folder&parentId=folder_id
Authorization: Bearer <token>
```

Query Parameters:
- `path` (optional): Filter by path
- `parentId` (optional): Filter by parent folder ID

Response:
```json
[
  {
    "id": "file_id",
    "name": "file.txt",
    "type": "FILE",
    "size": 1024,
    "mimeType": "text/plain",
    "createdAt": "2024-01-09T...",
    "updatedAt": "2024-01-09T..."
  }
]
```

#### Get File Details
```
GET /files/:id
Authorization: Bearer <token>
```

Response:
```json
{
  "id": "file_id",
  "name": "file.txt",
  "type": "FILE",
  "size": 1024,
  "mimeType": "text/plain",
  "chunks": [
    {
      "id": "chunk_id",
      "chunkIndex": 0,
      "messageId": "discord_message_id",
      "channelId": "discord_channel_id"
    }
  ]
}
```

#### Upload File
```
POST /files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Body:
- `file`: File to upload (required)
- `path`: Destination path (optional, defaults to `/<filename>`)
- `parentId`: Parent folder ID (optional)

Response:
```json
{
  "file": {
    "id": "file_id",
    "name": "file.txt",
    "path": "/file.txt",
    "size": 1024
  },
  "chunks": 3
}
```

#### Download File
```
GET /files/:id/download
Authorization: Bearer <token>
```

Returns file content as stream.

#### Create Directory
```
POST /files/directory
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "name": "folder-name",
  "path": "/folder-name",
  "parentId": "parent_folder_id" // optional
}
```

#### Rename File
```
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

#### Delete File
```
DELETE /files/:id
Authorization: Bearer <token>
```

### API Keys

#### List API Keys
```
GET /api-keys
Authorization: Bearer <token>
```

#### Create API Key
```
POST /api-keys
Authorization: Bearer <token>
Content-Type: application/json
```

Body:
```json
{
  "name": "My API Key"
}
```

Response:
```json
{
  "id": "key_id",
  "key": "dd_....",
  "name": "My API Key",
  "createdAt": "2024-01-09T..."
}
```

#### Delete API Key
```
DELETE /api-keys/:id
Authorization: Bearer <token>
```

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "Error message here"
}
```

Common status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limits

No rate limits currently implemented, but recommended for production:
- 100 requests per minute per user
- 10 GB per hour upload limit

## Examples

### cURL

#### Upload File
```bash
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer dd_your_api_key" \
  -F "file=@/path/to/file.txt" \
  -F "path=/backups/file.txt"
```

#### List Files
```bash
curl -X GET http://localhost:5000/api/files \
  -H "Authorization: Bearer dd_your_api_key"
```

#### Download File
```bash
curl -X GET http://localhost:5000/api/files/FILE_ID/download \
  -H "Authorization: Bearer dd_your_api_key" \
  -o downloaded_file.txt
```

### Python

```python
import requests

API_URL = "http://localhost:5000/api"
API_KEY = "dd_your_api_key"

headers = {"Authorization": f"Bearer {API_KEY}"}

# Upload file
with open("file.txt", "rb") as f:
    files = {"file": f}
    data = {"path": "/backups/file.txt"}
    response = requests.post(
        f"{API_URL}/files/upload",
        headers=headers,
        files=files,
        data=data
    )
    print(response.json())

# List files
response = requests.get(f"{API_URL}/files", headers=headers)
print(response.json())

# Download file
response = requests.get(
    f"{API_URL}/files/FILE_ID/download",
    headers=headers,
    stream=True
)
with open("downloaded.txt", "wb") as f:
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)
```

### JavaScript/Node.js

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const API_URL = 'http://localhost:5000/api';
const API_KEY = 'dd_your_api_key';

const headers = { Authorization: `Bearer ${API_KEY}` };

// Upload file
async function uploadFile() {
  const form = new FormData();
  form.append('file', fs.createReadStream('file.txt'));
  form.append('path', '/backups/file.txt');

  const response = await axios.post(
    `${API_URL}/files/upload`,
    form,
    { headers: { ...headers, ...form.getHeaders() } }
  );
  console.log(response.data);
}

// List files
async function listFiles() {
  const response = await axios.get(`${API_URL}/files`, { headers });
  console.log(response.data);
}

// Download file
async function downloadFile(fileId) {
  const response = await axios.get(
    `${API_URL}/files/${fileId}/download`,
    { headers, responseType: 'stream' }
  );
  response.data.pipe(fs.createWriteStream('downloaded.txt'));
}
```
