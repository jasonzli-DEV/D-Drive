import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const router = Router();

// Path to the .env file - detect project root dynamically
const ENV_FILE_PATH = process.env.ENV_FILE_PATH || path.join(process.cwd(), '..', '.env');
const CONFIG_LOCK_FILE = path.join(process.cwd(), 'data', '.setup-complete');

// Check if setup has been completed
function isSetupComplete(): boolean {
  // NEVER use lock file - always check environment variables
  // This ensures setup status is always accurate even after container restart
  
  // Check if Discord credentials are configured
  const hasDiscordConfig = !!(
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.DISCORD_BOT_TOKEN &&
    process.env.DISCORD_GUILD_ID &&
    process.env.DISCORD_CHANNEL_ID
  );
  
  return hasDiscordConfig;
}

// Mark setup as complete
function markSetupComplete(): void {
  const dataDir = path.dirname(CONFIG_LOCK_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_LOCK_FILE, new Date().toISOString());
}

// GET /api/setup/status - Check if setup is needed
router.get('/status', (req, res) => {
  const setupComplete = isSetupComplete();
  
  res.json({
    setupRequired: !setupComplete,
    configured: {
      database: true, // Always true if server is running
      jwt: !!process.env.JWT_SECRET,
      discordClient: !!process.env.DISCORD_CLIENT_ID,
      discordBot: !!process.env.DISCORD_BOT_TOKEN,
      discordGuild: !!process.env.DISCORD_GUILD_ID,
      discordChannel: !!process.env.DISCORD_CHANNEL_ID,
    },
    clientId: process.env.DISCORD_CLIENT_ID || null, // Return null instead of empty string so frontend can detect missing config
  });
});

// POST /api/setup/configure - Save Discord configuration
router.post('/configure', async (req, res) => {
  // CRITICAL: Only allow if setup is not complete
  if (isSetupComplete()) {
    return res.status(403).json({
      error: 'Setup already complete',
      message: 'Configuration cannot be changed via this endpoint. Edit the .env file directly.',
    });
  }
  
  const {
    allowedUrls,
    discordClientId,
    discordClientSecret,
    discordBotToken,
    discordGuildId,
    discordChannelId,
  } = req.body;
  
  // Validate required fields
  if (!allowedUrls || !Array.isArray(allowedUrls) || allowedUrls.length === 0) {
    return res.status(400).json({
      error: 'At least one allowed URL is required',
    });
  }
  
  if (!discordClientId || !discordClientSecret || !discordBotToken || !discordGuildId || !discordChannelId) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['allowedUrls', 'discordClientId', 'discordClientSecret', 'discordBotToken', 'discordGuildId', 'discordChannelId'],
    });
  }
  
  // Validate URLs
  for (const url of allowedUrls) {
    if (!url.match(/^https?:\/\/.+/)) {
      return res.status(400).json({ error: `Invalid URL format: ${url}` });
    }
  }
  
  // Validate Discord credentials format (snowflake IDs are 17-19 digits)
  if (!/^\d{17,19}$/.test(discordClientId)) {
    return res.status(400).json({ error: 'Invalid Discord Client ID format (must be 17-19 digits)' });
  }
  
  if (!/^\d{17,19}$/.test(discordGuildId)) {
    return res.status(400).json({ error: 'Invalid Discord Guild ID format (must be 17-19 digits)' });
  }
  
  if (!/^\d{17,19}$/.test(discordChannelId)) {
    return res.status(400).json({ error: 'Invalid Discord Channel ID format (must be 17-19 digits)' });
  }
  
  try {
    // Ensure parent directory exists and is writable
    const envDir = path.dirname(ENV_FILE_PATH);
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }
    
    // Read existing .env file
    let envContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      envContent = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    }
    
    // Generate JWT secret if not exists
    const jwtSecret = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');
    
    // Update or add Discord configuration
    const envUpdates: Record<string, string> = {
      FRONTEND_URL: allowedUrls[0], // Primary URL
      ALLOWED_ORIGINS: allowedUrls.join(','), // All allowed origins for CORS
      JWT_SECRET: jwtSecret,
      DISCORD_CLIENT_ID: discordClientId,
      DISCORD_CLIENT_SECRET: discordClientSecret,
      DISCORD_BOT_TOKEN: discordBotToken,
      DISCORD_GUILD_ID: discordGuildId,
      DISCORD_CHANNEL_ID: discordChannelId,
      VITE_DISCORD_CLIENT_ID: discordClientId, // For frontend OAuth redirect
    };
    
    // Parse and update env content
    const lines = envContent.split('\n');
    const existingKeys = new Set<string>();
    
    const updatedLines = lines.map(line => {
      const match = line.match(/^([A-Z_]+)=/);
      if (match && envUpdates[match[1]]) {
        existingKeys.add(match[1]);
        return `${match[1]}=${envUpdates[match[1]]}`;
      }
      return line;
    });
    
    // Add any keys that weren't in the file
    for (const [key, value] of Object.entries(envUpdates)) {
      if (!existingKeys.has(key)) {
        updatedLines.push(`${key}=${value}`);
      }
    }
    
    // Write updated .env file with error handling
    try {
      fs.writeFileSync(ENV_FILE_PATH, updatedLines.join('\n'));
      logger.info(`Discord configuration saved to .env file at ${ENV_FILE_PATH}`);
    } catch (writeError) {
      logger.error(`Failed to write .env file to ${ENV_FILE_PATH}:`, writeError);
      // Try fallback location
      const fallbackPath = path.join('/tmp', '.env');
      fs.writeFileSync(fallbackPath, updatedLines.join('\n'));
      logger.warn(`Wrote .env to fallback location: ${fallbackPath}`);
    }
    
    // CRITICAL: Update process.env immediately so isSetupComplete() returns true
    Object.entries(envUpdates).forEach(([key, value]) => {
      process.env[key] = value;
    });
    logger.info('Environment variables updated in current process');
    
    // Initialize Discord bot now that credentials are configured
    try {
      const { initDiscordBot } = await import('../services/discord');
      await initDiscordBot();
      logger.info('Discord bot initialized after setup');
    } catch (discordError) {
      logger.error('Failed to initialize Discord bot after setup:', discordError);
      // Don't fail the setup - bot can be initialized on next request
    }
    
    // Mark setup as complete (create lock file)
    markSetupComplete();
    logger.info('Setup marked as complete');
    
    res.json({
      success: true,
      message: 'Configuration saved successfully.',
      restartRequired: false, // No restart needed since we updated process.env
    });
  } catch (error) {
    logger.error('Failed to save configuration:', error);
    res.status(500).json({
      error: 'Failed to save configuration',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/setup/validate-discord - Validate Discord credentials without saving
router.post('/validate-discord', async (req, res) => {
  const { discordBotToken, discordGuildId, discordChannelId } = req.body;
  
  if (!discordBotToken) {
    return res.status(400).json({ error: 'Bot token is required' });
  }
  
  try {
    // Try to validate the bot token by making a request to Discord API
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bot ${discordBotToken}`,
      },
    });
    
    if (!response.ok) {
      return res.json({
        valid: false,
        error: 'Invalid bot token',
      });
    }
    
    const botUser = await response.json() as { username: string; id: string };
    
    // If guild ID provided, check bot has access
    let guildValid = true;
    let channelValid = true;
    
    if (discordGuildId) {
      const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${discordGuildId}`, {
        headers: {
          Authorization: `Bot ${discordBotToken}`,
        },
      });
      guildValid = guildResponse.ok;
    }
    
    if (discordChannelId && guildValid) {
      const channelResponse = await fetch(`https://discord.com/api/v10/channels/${discordChannelId}`, {
        headers: {
          Authorization: `Bot ${discordBotToken}`,
        },
      });
      channelValid = channelResponse.ok;
    }
    
    res.json({
      valid: guildValid && channelValid,
      bot: {
        username: botUser.username,
        id: botUser.id,
      },
      guildAccess: guildValid,
      channelAccess: channelValid,
    });
  } catch (error) {
    logger.error('Discord validation error:', error);
    res.json({
      valid: false,
      error: 'Failed to validate Discord credentials',
    });
  }
});

export default router;
