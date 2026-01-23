import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initDiscordBot } from './services/discord';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
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
