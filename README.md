# D-Drive

**Discord-powered cloud storage with unlimited space.** Store files using Discord's infrastructure with a Google Drive-like interface.

![D-Drive](https://img.shields.io/badge/version-2.2.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Docker](https://img.shields.io/badge/docker-ready-blue)

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/jasonzli-DEV/D-Drive/main/install.sh | bash
```

Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/jasonzli-DEV/D-Drive/main/install.ps1 | iex
```


Then open [http://localhost](http://localhost) and complete the setup wizard.

## Features

| Feature | Description |
|---------|-------------|
| 🔐 **Discord OAuth** | Secure authentication via Discord |
| 🖥️ **Google Drive UI** | Drag-and-drop, previews, folder management |
| 📦 **Unlimited Storage** | Uses Discord as backend storage |
| 🔒 **AES-256 Encryption** | Optional client-side encryption |
| 📁 **30GB+ Files** | Chunked uploads with no size limits |
| ⏰ **Scheduled Backups** | SFTP server backup automation |
| 🛠️ **CLI Tool** | Command-line for automated backups |
| 🔗 **File Sharing** | Shareable links with expiration |
| 🐳 **One-Click Deploy** | Single command Docker setup |

## Requirements

- **Docker** & **Docker Compose**
- **Discord Application** (created during setup)

## Manual Installation

```bash
# Clone the repository
git clone https://github.com/jasonzli-DEV/D-Drive.git
cd D-Drive

# Start with Docker Compose
docker compose up -d

# Open http://localhost and complete setup
```

## CLI Tool

```bash
# Install globally
npm install -g d-drive-cli

# Configure
d-drive config set-key YOUR_API_KEY

# Upload/Download
d-drive upload ./file.txt /backups/
d-drive download /backups/file.txt ./
```

## Documentation

- [Setup Guide](docs/SETUP.md) - Detailed configuration
- [API Reference](docs/API.md) - REST API documentation
- [Docker Guide](docs/DOCKER.md) - Container deployment

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│   Discord   │
│   (React)   │     │  (Node.js)  │     │   Storage   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                    ┌─────▼─────┐
                    │ PostgreSQL │
                    └───────────┘
```

## License

MIT License - See [LICENSE](LICENSE)

---

**Credits:** Inspired by [DisboxApp](https://github.com/DisboxApp/web)
