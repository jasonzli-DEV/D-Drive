import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initDiscordBot } from './services/discord';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per windowMs
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Apply rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

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

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`🚀 D-Drive backend running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
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
