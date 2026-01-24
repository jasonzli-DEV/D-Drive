import { Router } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const router = Router();

// Helper function to get JWT secret - throws if not set
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured. Complete setup at /setup');
  }
  return secret;
}

// JWT_SECRET check at startup (warning only)
if (!process.env.JWT_SECRET) {
  console.error('WARNING: JWT_SECRET environment variable is not set. Auth will fail until setup is complete.');
}

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost';
const AVATAR_DIR = process.env.AVATAR_DIR || path.join(process.cwd(), 'data', 'avatars');

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
  logger.warn('DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET not set - running in setup mode');
}

// Ensure avatar directory exists
try {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
} catch (err) {
  logger.error('Failed to create avatar directory', err);
}

// Discord OAuth callback
router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID!,
        client_secret: DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: `${FRONTEND_URL}/auth/callback`,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token } = tokenResponse.data;

    // Get user info from Discord
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const discordUser = userResponse.data;

    // Handle discriminator - Discord removed discriminators for new users
    // Default to "0" if not provided
    const discriminator = discordUser.discriminator || '0';

    // Create or update user in database
    let user = await prisma.user.findUnique({
      where: { discordId: discordUser.id },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          discordId: discordUser.id,
          username: discordUser.username,
          discriminator: discriminator,
          avatar: discordUser.avatar,
          email: discordUser.email,
        },
      });
      logger.info(`New user created: ${user.username}`);
    } else {
      user = await prisma.user.update({
        where: { discordId: discordUser.id },
        data: {
          username: discordUser.username,
          discriminator: discriminator,
          avatar: discordUser.avatar,
          email: discordUser.email,
        },
      });
    }

    // Attempt to fetch and cache the user's Discord avatar locally so
    // the frontend can always use a stable URL under our domain.
    try {
      if (discordUser.avatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`;
        const resp = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
        const avatarPath = path.join(AVATAR_DIR, `${user.id}.png`);
        await fs.promises.writeFile(avatarPath, Buffer.from(resp.data), { flag: 'w' });
        logger.info(`Cached avatar for user ${user.id} at ${avatarPath}`);
      }
    } catch (err) {
      logger.warn('Failed to fetch or cache Discord avatar', err);
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, discordId: user.discordId },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    // Create session
    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        avatarUrl: `/api/avatars/${user.id}`,
      },
    });
  } catch (error) {
    logger.error('OAuth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as unknown as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        discriminator: true,
        avatar: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Always return an avatarUrl that points at our avatars endpoint. The
    // endpoint will serve a cached local file if available or fall back to
    // Discord's CDN if not.
    res.json({ ...user, avatarUrl: `/api/avatars/${user.id}` });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      await prisma.session.deleteMany({
        where: { token },
      });
    } catch (error) {
      logger.error('Logout error:', error);
    }
  }

  res.json({ message: 'Logged out successfully' });
});

export default router;
