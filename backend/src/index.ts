import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initDiscordBot } from './services/discord';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting removed for local/dev and production

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsers: skip for large streaming upload endpoint to avoid consuming
// the raw multipart stream (Busboy needs the raw stream). Request bodies
// for `/api/files/upload/stream` can be arbitrarily large and are handled
// by the streaming parser in that route, so we bypass express body parsers
// for that path to avoid `413 Payload Too Large` from the JSON/urlencoded
// middleware.
const jsonParser = express.json({ limit: '50mb' });
const urlencParser = express.urlencoded({ extended: true, limit: '50mb' });
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path && req.path.startsWith('/api/files/upload/stream')) {
    return next();
  }
  return jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path && req.path.startsWith('/api/files/upload/stream')) {
    return next();
  }
  return urlencParser(req, res, next);
});

// Rate limiting middleware removed entirely

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', routes);

// Health check - also under /api
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Initialize Discord bot
let discordClient: Client;

async function startServer() {
  try {
    // Initialize Discord bot
    discordClient = await initDiscordBot();
    logger.info('Discord bot initialized successfully');

    // Start Express server and disable the default Node request timeout so
    // long-running streaming uploads aren't cut off with a 408 Request Timeout.
    const server = app.listen(PORT, () => {
      logger.info(`🚀 D-Drive backend running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Remove idle request timeout (0 = disabled). This prevents Node from
    // terminating long uploads mid-stream. Keep headersTimeout at Node's
    // default to avoid abuse during initial headers parsing.
    server.setTimeout(0);
    logger.info('Server request timeout disabled (server.setTimeout(0))');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (discordClient) {
    discordClient.destroy();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (discordClient) {
    discordClient.destroy();
  }
  process.exit(0);
});

startServer();

export default app;
