# D-Drive

**Discord-Based Cloud Storage System - Like Google Drive, but on Discord**

D-Drive is a developer-friendly cloud storage solution that leverages Discord's infrastructure for file storage, providing a Google Drive-like experience with powerful CLI tools for seamless file backups.

## Features

- 🔐 **Discord Bot OAuth** - Secure authentication using Discord bot
- 🖥️ **Google Drive-Like UI** - Intuitive web interface with drag-and-drop, file previews, and folder management
- 🛠️ **Developer-Friendly CLI** - Command-line tool for automated backups and file management
- 📡 **Streaming Support** - Handle large files (30GB+) with chunked streaming
- 🔑 **API Key Authentication** - Secure API access for developers
- 🐳 **Docker-Ready** - Full Docker support for easy deployment
- 📦 **No Storage Limits** - Leverage Discord's infrastructure for unlimited storage

## Quick Start

### Web Application

```bash
# Using Docker Compose
docker-compose up -d

# Access the web interface at http://localhost:3000
```

### CLI Tool

```bash
# Install CLI globally
npm install -g d-drive-cli

# Configure your API key
d-drive config set-key YOUR_API_KEY

# Backup a file
d-drive upload ./myfile.txt /backups/

# Backup a directory
d-drive upload ./myproject /backups/projects/

# Download a file
d-drive download /backups/myfile.txt ./restored.txt
```

## Architecture

D-Drive consists of three main components:

1. **Frontend** - React-based web UI (similar to Google Drive)
2. **Backend** - Node.js API server with Discord bot integration
3. **CLI** - Command-line tool for developers

## Documentation

- [Setup Guide](docs/SETUP.md)
- [API Documentation](docs/API.md)
- [CLI Reference](docs/CLI.md)
- [Docker Deployment](docs/DOCKER.md)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## License

MIT License - See [LICENSE](LICENSE) for details

## Credits

Inspired by [DisboxApp](https://github.com/DisboxApp/web) - Enhanced with Discord bot authentication, developer tools, and improved UX.
