import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initDiscordBot } from './services/discord';
import scheduler from './services/scheduler';
import { logger } from './utils/logger';
import path from 'path';

// Load environment variables from /.env (mounted volume)
dotenv.config({ path: path.join('/', '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting removed for local/dev and production

// Middleware
app.use(helmet());

// Configure CORS to support multiple origins
app.use(cors({
  origin: (origin, callback) => {
    // During initial setup (no ALLOWED_ORIGINS configured), allow all origins
    if (!process.env.ALLOWED_ORIGINS) {
      return callback(null, true);
    }
    
    // After setup, enforce configured origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',').map(url => url.trim());
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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

// Setup requirement check middleware - blocks all API routes except /api/setup/* and /api/health
// when Discord is not configured
app.use('/api', (req, res, next) => {
  // Always allow setup routes and health checks
  if (req.path.startsWith('/setup') || req.path === '/health') {
    return next();
  }
  
  // Check if Discord is configured
  const hasDiscordConfig = !!(
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.DISCORD_BOT_TOKEN &&
    process.env.DISCORD_GUILD_ID &&
    process.env.DISCORD_CHANNEL_ID
  );
  
  if (!hasDiscordConfig) {
    return res.status(503).json({
      error: 'Setup required',
      message: 'D-Drive is not configured. Please complete the setup first.',
      setupRequired: true,
    });
  }
  
  next();
});

// Routes
app.use('/api', routes);

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Initialize Discord bot
let discordClient: Client | null = null;

async function startServer() {
  try {
    // Initialize Discord bot (may return null in setup mode)
    discordClient = await initDiscordBot();
    if (discordClient) {
      logger.info('Discord bot initialized successfully');
    } else {
      logger.warn('Running in setup mode - Discord not configured');
    }

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

    // Initialize task scheduler
    await scheduler.initScheduler();
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
